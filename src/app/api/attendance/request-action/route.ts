import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';
import { calculateLeaveUsage, updateLeaveBalanceOnApproval } from '@/lib/leaveManagement';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { isAttendanceDatePartnerOnlyIst } from '@/lib/attendanceRequestApprovalWindow';
import { sendPartnerRequestDecisionEmail } from '@/lib/attendanceRequestNotifications';
import { calculateSummary } from '@/lib/attendanceSummaryCalculation';
import { applyDayExcessToRecord } from '@/lib/calculateDayExcessHour';
import { getDefaultNumericValueForType } from '@/lib/attendanceRequestValues';
import { isArticleEmployee } from '@/lib/isArticleEmployee';

function calculateDuration(start: string, end: string): number {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    return Math.max(0, Math.round((totalMinutes / 60) * 100) / 100);
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action');

    if (!id) return new NextResponse('Missing id parameter', { status: 400 });

    const reqRecord = await AttendanceRequest.findById(id).populate(
      'userId',
      'name email designation employmentType category'
    );
    if (!reqRecord) return new NextResponse('Request not found', { status: 404 });

    // If no action provided, return request details as JSON (for partner review page)
    if (!action) {
      return NextResponse.json({
        success: true,
        data: {
          _id: reqRecord._id,
          userName: reqRecord.userName,
          partnerName: reqRecord.partnerName,
          date: reqRecord.date,
          requestedStatus: reqRecord.requestedStatus,
          originalStatus: reqRecord.originalStatus,
          reason: reqRecord.reason,
          startTime: reqRecord.startTime,
          endTime: reqRecord.endTime,
          status: reqRecord.status,
          partnerRemarks: reqRecord.partnerRemarks,
          isArticleEmployee: isArticleEmployee(
            reqRecord.userId as { employmentType?: unknown; designation?: unknown; category?: unknown }
          ),
        }
      });
    }

    // Handle direct action from email links
    if (reqRecord.status !== 'Pending') {
        return new NextResponse(`Request already ${reqRecord.status}`, { status: 200 });
    }

    if (action === 'reject') {
        reqRecord.status = 'Rejected';
        await reqRecord.save();
        try {
          const employee = await User.findById(reqRecord.userId).select('email attendanceEmail').lean();
          await sendPartnerRequestDecisionEmail({
            partnerName: reqRecord.partnerName,
            employeeUser: employee,
            action: 'reject',
            rows: [
              {
                employeeName: reqRecord.userName,
                date: reqRecord.date,
                requestedStatus: reqRecord.requestedStatus,
                requestState: 'Rejected',
                reason: reqRecord.reason,
              },
            ],
            processedBy: 'Partner',
            remarks: reqRecord.partnerRemarks || undefined,
            skipIfSameAs: employee?.email || null,
          });
        } catch (emailErr) {
          console.error('Partner reject notification (GET) failed:', emailErr);
        }
        return new NextResponse(`
            <html><body style="font-family:sans-serif; text-align:center; padding:40px;">
                <h1 style="color:red">Rejected</h1>
                <p>You have rejected the attendance correction for ${reqRecord.userName} on ${reqRecord.date}.</p>
            </body></html>
        `, { headers: { 'Content-Type': 'text/html' }});
    }

    if (action === 'approve') {
        if (!isAttendanceDatePartnerOnlyIst(reqRecord.date)) {
          reqRecord.status = 'PendingHr';
          reqRecord.partnerRemarks = 'Approved via email link (awaiting HR)';
          reqRecord.partnerApprovedAt = new Date();
          await reqRecord.save();
          try {
            const employee = await User.findById(reqRecord.userId).select('email attendanceEmail').lean();
            await sendPartnerRequestDecisionEmail({
              partnerName: reqRecord.partnerName,
              employeeUser: employee,
              action: 'approve',
              rows: [
                {
                  employeeName: reqRecord.userName,
                  date: reqRecord.date,
                  requestedStatus: reqRecord.requestedStatus,
                  requestState: 'PendingHr',
                  reason: reqRecord.reason,
                },
              ],
              processedBy: 'Partner',
              remarks: reqRecord.partnerRemarks || undefined,
              skipIfSameAs: employee?.email || null,
            });
          } catch (emailErr) {
            console.error('Partner PendingHr notification (GET) failed:', emailErr);
          }
          return new NextResponse(
            `
            <html><body style="font-family:sans-serif; text-align:center; padding:40px;">
                <h1 style="color:#b45309">Partner approved</h1>
                <p>This request is outside the current/previous calendar month (IST) and requires <strong>HR final approval</strong> before attendance is updated.</p>
            </body></html>
        `,
            { headers: { 'Content-Type': 'text/html' } }
          );
        }

        reqRecord.status = 'Approved';
        await reqRecord.save();

        // Update Attendance
        const { userId, date, requestedStatus, monthYear, startTime, endTime } = reqRecord;
        
        // Find attendance doc
        let attendance = await Attendance.findOne({ userId, monthYear });
        
        if (!attendance) {
            attendance = new Attendance({
                userId,
                monthYear,
                records: {},
                summary: {
                    totalHour: 0, totalLateArrival: 0, excessHour: 0, 
                    totalHalfDay: 0, totalPresent: 0, totalAbsent: 0, totalLeave: 0
                }
            });
        }

        // Get or create record for date
        let rec = attendance.records.get(date);

      if (!rec) { // If undefined, create new object
        rec = {
          checkin: '', checkout: '', totalHour: 0, excessHour: 0,
          typeOfPresence: 'Absent', halfDay: false, value: 0
        };
      }


        // Update times if provided - use editedCheckin/editedCheckout for corrections (never modify original checkin/checkout)
        if (startTime && endTime && startTime !== '00:00' && endTime !== '00:00') {
                rec.editedCheckin = startTime;
                rec.editedCheckout = endTime;
                rec.totalHour = calculateDuration(startTime, endTime);
                // Assuming 9 hours standard for excess calculation logic roughly
                rec.excessHour = rec.totalHour > 9 ? parseFloat((rec.totalHour - 9).toFixed(2)) : 0;
        }

        const isSundayDate = new Date(date).getDay() === 0;
        const isNonWorkingDayRecord =
          requestedStatus === 'Holiday' ||
          requestedStatus === 'Sunday' ||
          requestedStatus === 'Weekoff' ||
          requestedStatus === 'Weekoff - special allowance' ||
          rec.typeOfPresence === 'Holiday' ||
          rec.typeOfPresence === 'Sunday' ||
          rec.typeOfPresence === 'Weekoff' ||
          rec.typeOfPresence === 'Weekoff - special allowance' ||
          isSundayDate;
        if (isNonWorkingDayRecord) {
          rec.halfDay = false;
          rec.excessHour = 0;
        }

        attendance.records.set(date, rec);
        

        // Recalculate summary
        const user = await User.findById(userId);
        attendance.summary = calculateSummary(attendance.records, user);
        
        await attendance.save();

        // Update leave balance if it's a paid leave
        if (requestedStatus === 'On leave' || requestedStatus === 'Absent') {
          const leaveUsage = await calculateLeaveUsage(userId, date, requestedStatus);
          if (leaveUsage.isPaidLeave) {
            await updateLeaveBalanceOnApproval(userId, date, true);
          }
        }

        try {
          const employee = await User.findById(reqRecord.userId).select('email attendanceEmail').lean();
          await sendPartnerRequestDecisionEmail({
            partnerName: reqRecord.partnerName,
            employeeUser: employee,
            action: 'approve',
            rows: [
              {
                employeeName: reqRecord.userName,
                date: reqRecord.date,
                requestedStatus: reqRecord.requestedStatus,
                requestState: 'Approved',
                reason: reqRecord.reason,
              },
            ],
            processedBy: 'Partner',
            remarks: reqRecord.partnerRemarks || undefined,
            skipIfSameAs: employee?.email || null,
          });
        } catch (emailErr) {
          console.error('Partner approve notification (GET) failed:', emailErr);
        }

        return new NextResponse(`
            <html><body style="font-family:sans-serif; text-align:center; padding:40px;">
                <h1 style="color:green">Approved</h1>
                <p>Attendance for ${reqRecord.userName} on ${reqRecord.date} updated to <strong>${reqRecord.requestedStatus}</strong>.</p>
            </body></html>
        `, { headers: { 'Content-Type': 'text/html' }});
    }

    return new NextResponse('Invalid action', { status: 400 });

  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { id, action, remarks, attendanceValue, approvedBy, approvedByEmail } = await request.json();

    if (!id || !action) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    const reqRecord = await AttendanceRequest.findById(id).populate('userId', 'name email');
    if (!reqRecord) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    }

    const actorIsHr = (approvedBy || '') === 'HR';
    if (!actorIsHr && reqRecord.status !== 'Pending') {
      return NextResponse.json({ success: false, error: `Request already ${reqRecord.status}` }, { status: 400 });
    }
    if (actorIsHr && reqRecord.status !== 'Pending' && reqRecord.status !== 'PendingHr') {
      return NextResponse.json({ success: false, error: `Request already ${reqRecord.status}` }, { status: 400 });
    }

    let deferredToHrOnly = false;

    if (action === 'approve') {
      if (!actorIsHr && !isAttendanceDatePartnerOnlyIst(reqRecord.date)) {
        reqRecord.status = 'PendingHr';
        reqRecord.partnerRemarks = remarks || null;
        reqRecord.partnerApprovedAt = new Date();
        if (attendanceValue !== undefined && attendanceValue !== null) {
          reqRecord.partnerProposedValue = String(attendanceValue);
        }
        deferredToHrOnly = true;
      } else {
        reqRecord.status = 'Approved';
        if (actorIsHr) {
          if (remarks) reqRecord.hrRemarks = remarks;
          if (attendanceValue !== undefined && attendanceValue !== null) {
            reqRecord.hrValue = String(attendanceValue);
          }
        } else {
          reqRecord.partnerRemarks = remarks || null;
        }
        reqRecord.approvedBy = approvedBy || (actorIsHr ? 'HR' : 'Partner');
        reqRecord.approvedByEmail = approvedByEmail || null;
        reqRecord.approvedAt = new Date();
      }
    } else {
      reqRecord.status = 'Rejected';
      if (actorIsHr) {
        if (remarks) reqRecord.hrRemarks = remarks;
      } else {
        reqRecord.partnerRemarks = remarks || null;
      }
      reqRecord.rejectedBy = approvedBy || (actorIsHr ? 'HR' : 'Partner');
      reqRecord.rejectedByEmail = approvedByEmail || null;
      reqRecord.rejectedAt = new Date();
    }

    await reqRecord.save();

    // If approved, update the actual attendance record
    if (action === 'approve' && !deferredToHrOnly) {
      const { userId, date, requestedStatus, monthYear, startTime, endTime } = reqRecord;

      // Find attendance doc
      let attendance = await Attendance.findOne({ userId, monthYear });

      if (!attendance) {
        attendance = new Attendance({
          userId,
          monthYear,
          records: {},
          summary: {
            totalHour: 0, totalLateArrival: 0, excessHour: 0,
            totalHalfDay: 0, totalPresent: 0, totalAbsent: 0, totalLeave: 0
          }
        });
      }

      // Get or create record for date
      let rec = attendance.records.get(date);

      if (!rec) { // If undefined, create new object
        rec = {
          checkin: '', checkout: '', totalHour: 0, excessHour: 0,
          typeOfPresence: 'Absent', halfDay: false, value: 0
        };
      }

      // Update presence type
      rec.typeOfPresence = requestedStatus as any;

      // Set attendance value - use provided value or default based on type
      // Half Day types ALWAYS get value 0.5 regardless of what was provided
      if (requestedStatus.includes('Half Day')) {
        rec.value = 0.5;
        rec.halfDay = true;
      } else if (attendanceValue !== undefined) {
        rec.value = attendanceValue;
        // Only Half Day types should have halfDay=true, not based on value
        rec.halfDay = false;
      } else {
        // Fallback auto-calculation if no value provided
        if (requestedStatus === 'Absent' || requestedStatus === 'On leave') {
          // Use leave management to determine if paid or unpaid leave
          const leaveUsage = await calculateLeaveUsage(userId, date, requestedStatus);
          rec.value = leaveUsage.value;
          rec.halfDay = false;
        } else if (requestedStatus === 'Holiday' || requestedStatus === 'Weekoff - special allowance') {
          rec.value = 0;
          rec.halfDay = false;
        } else {
          const userForValue = await User.findById(userId);
          rec.value =
            getDefaultNumericValueForType(requestedStatus, { employee: userForValue }) ?? 1;
          rec.halfDay = false;
        }
      }

      // Fetch user schedule for the day
      const userObj = await User.findById(userId);
      let scheduledInTime = '';
      let scheduledOutTime = '';
      let scheduledMinutes = 0;
      if (userObj) {
        const schedule = getScheduledTimes(userObj, date);
        scheduledInTime = schedule.inTime;
        scheduledOutTime = schedule.outTime;
        if (scheduledInTime && scheduledOutTime) {
          const [inH, inM] = scheduledInTime.split(':').map(Number);
          const [outH, outM] = scheduledOutTime.split(':').map(Number);
          scheduledMinutes = (outH * 60 + outM) - (inH * 60 + inM);
        }
      }
      
      // Helper to check type
      const isType = (type: string) => requestedStatus.toLowerCase().includes(type.toLowerCase());
      
      // For weekoff types, use weekday (Monday) schedule instead of actual day schedule
      let isWeekoff = /weekoff|week-off|week off/i.test(requestedStatus);
      let effectiveScheduledMinutes = scheduledMinutes;
      let effectiveScheduledInTime = scheduledInTime;
      let effectiveScheduledOutTime = scheduledOutTime;
      if (isWeekoff && userObj) {
        // Get Monday schedule for weekoff calculations
        const mondayDate = new Date(date);
        const dayOfWeek = mondayDate.getDay();
        const daysUntilMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
        mondayDate.setDate(mondayDate.getDate() + daysUntilMonday);
        const mondayDateStr = mondayDate.toISOString().split('T')[0];
        const mondaySchedule = getScheduledTimes(userObj, mondayDateStr);
        if (mondaySchedule.inTime && mondaySchedule.outTime) {
          effectiveScheduledInTime = mondaySchedule.inTime;
          effectiveScheduledOutTime = mondaySchedule.outTime;
          const [mInH, mInM] = mondaySchedule.inTime.split(':').map(Number);
          const [mOutH, mOutM] = mondaySchedule.outTime.split(':').map(Number);
          effectiveScheduledMinutes = (mOutH * 60 + mOutM) - (mInH * 60 + mInM);
        }
      }
      
      // If request provides startTime/endTime, use those for editedCheckin/editedCheckout
      if (startTime && startTime !== '00:00') {
        rec.editedCheckin = startTime;
      }
      if (endTime && endTime !== '00:00') {
        rec.editedCheckout = endTime;
      }
      
      // Calculate totalHour and excessHour based on request type
      // WFH
      if (isType('WFH - weekdays')) {
        rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
        rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
        if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
        if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
      } else if (isType('WFH - weekoff')) {
        rec.totalHour = 0;
        rec.excessHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
        if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
        if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
      }
      // Half Day
      else if (isType('Half Day - weekdays')) {
        rec.totalHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
        rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
        if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
        if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
      } else if (isType('Half Day - weekoff')) {
        rec.totalHour = 0;
        rec.excessHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
        if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
        if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
      }
      // Present - Outstation
      else if (isType('Present - Outstation (Weekdays)')) {
        rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
        rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
      } else if (isType('Present - Outstation (Weekoff)')) {
        rec.totalHour = 0;
        rec.excessHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
      }
      // Present - ClientPlace
      else if (isType('Present - ClientPlace (Weekdays)')) {
        rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
        rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
      } else if (isType('Present - ClientPlace (Weekoff)')) {
        rec.totalHour = 0;
        rec.excessHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
      }
      // Present - in office
      else if (isType('Present - in office - weekdays')) {
        rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
        rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
        if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
        if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
      } else if (isType('Present - in office - weekoff')) {
        rec.totalHour = 0;
        rec.excessHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
        if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
        if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
      }
      // Default: use provided times if available
      else if (startTime && endTime && startTime !== '00:00' && endTime !== '00:00') {
        rec.totalHour = calculateDuration(startTime, endTime);
        applyDayExcessToRecord(
          rec,
          userObj,
          date,
          effectiveScheduledInTime,
          effectiveScheduledOutTime
        );
      }

      const isSundayDate = new Date(date).getDay() === 0;
      const isNonWorkingDayRecord =
        rec.typeOfPresence === 'Holiday' ||
        rec.typeOfPresence === 'Sunday' ||
        rec.typeOfPresence === 'Weekoff' ||
        rec.typeOfPresence === 'Weekoff - special allowance' ||
        isSundayDate;
      if (isNonWorkingDayRecord) {
        rec.halfDay = false;
        rec.excessHour = 0;
      }

      attendance.records.set(date, rec);

      // Recalculate summary
      const user = await User.findById(userId);
      attendance.summary = calculateSummary(attendance.records, user);

      await attendance.save();
    }

    // Send email notification to employee
    try {
      const employeeEmail = (reqRecord.userId as any).attendanceEmail || (reqRecord.userId as any).email;
      const statusText =
        action === 'approve' ? (deferredToHrOnly ? 'Partner approved — HR pending' : 'Approved') : 'Rejected';
      const statusColor = action === 'approve' ? (deferredToHrOnly ? '#d97706' : '#10b981') : '#ef4444';

      await transporter.sendMail({
        ...mailOptions,
        to: employeeEmail,
        subject: `Attendance Correction Request ${statusText}`,
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Attendance Request ${statusText}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
      
      <div style="background: linear-gradient(135deg, ${statusColor} 0%, ${action === 'approve' ? '#059669' : '#dc2626'} 100%); padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">
          Request ${statusText}
        </h1>
      </div>

      <div style="padding: 24px;">
        
        <div style="background-color: #f9fafb; border-left: 4px solid ${statusColor}; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
          <p style="margin: 0; font-size: 15px; color: #374151; line-height:1.5;">
            <strong>${
              deferredToHrOnly
                ? 'Your partner has approved this request. HR must still approve it before your attendance is updated.'
                : action === 'approve'
                  ? 'Your attendance correction request has been approved.'
                  : 'Your attendance correction request has been rejected.'
            }</strong>
          </p>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">Request Details:</div>
          <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-weight: 500; color: #374151;">Date:</span>
              <span style="color: #111827;">${reqRecord.date}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-weight: 500; color: #374151;">Requested Status:</span>
              <span style="color: #111827;">${reqRecord.requestedStatus}</span>
            </div>
            ${reqRecord.startTime && reqRecord.endTime ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="font-weight: 500; color: #374151;">Time Range:</span>
              <span style="color: #111827;">${reqRecord.startTime} - ${reqRecord.endTime}</span>
            </div>
            ` : ''}
          </div>
        </div>

        ${remarks ? `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">Partner Remarks:</div>
          <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #6366f1;">
            <p style="margin: 0; color: #374151; line-height: 1.5;">${remarks}</p>
          </div>
        </div>
        ` : ''}

        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 16px;">
          <p style="margin: 0; font-size: 14px; color: #1e40af; line-height: 1.5;">
            <strong>📋 Next Steps:</strong> ${
              action === 'approve'
                ? deferredToHrOnly
                  ? 'Wait for HR final approval. You will receive another email when processing is complete.'
                  : 'Your attendance record has been updated accordingly.'
                : 'Please contact your partner for further clarification if needed.'
            }
          </p>
        </div>

      </div>

      <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 13px; color: #6b7280;">
          This is an automated email. Please do not reply to this message.
        </p>
      </div>

    </div>
  </div>
</body>
</html>
        `
      });
    } catch (emailError) {
      console.error('Email notification failed:', emailError);
      // Don't fail the request if email fails
    }

    try {
      const employeeDoc =
        reqRecord.userId && typeof reqRecord.userId === 'object'
          ? (reqRecord.userId as { email?: string; attendanceEmail?: string })
          : await User.findById(reqRecord.userId).select('email attendanceEmail').lean();
      const processedBy =
        approvedBy || (actorIsHr ? 'HR' : 'Partner');
      await sendPartnerRequestDecisionEmail({
        partnerName: reqRecord.partnerName,
        employeeUser: employeeDoc,
        action,
        rows: [
          {
            employeeName: reqRecord.userName,
            date: reqRecord.date,
            requestedStatus: reqRecord.requestedStatus,
            requestState: reqRecord.status,
            reason: reqRecord.reason,
          },
        ],
        processedBy,
        remarks,
        skipIfSameAs:
          employeeDoc && typeof employeeDoc === 'object' && 'email' in employeeDoc
            ? employeeDoc.email || null
            : null,
      });
    } catch (partnerEmailError) {
      console.error('Partner decision email failed:', partnerEmailError);
    }

    return NextResponse.json({
      success: true,
      message: `Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`
    });

  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process request' }, { status: 500 });
  }
}
