import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';
import { calculateLeaveUsage, updateLeaveBalanceOnApproval } from '@/lib/leaveManagement';

function calculateDuration(start: string, end: string): number {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    return Math.max(0, Math.round((totalMinutes / 60) * 100) / 100);
}

// Helper found in other files, duplicated here for standalone execution
function calculateSummary(
    records: Map<string, any>,
    user?: any | null
  ) {
    let totalHour = 0;
    let totalLateArrival = 0;
    let excessHour = 0;
    let totalHalfDay = 0;
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLeave = 0;
  
    records.forEach((record, dateStr) => {
      // Determine if this is an articleship employee
      const isArticleship = user && user.designation && user.designation.toLowerCase() === 'article';

      // Determine half-day based on user type and check-in time
      let isHalfDay = false;
      if (record.checkin) {
        const checkinTime = record.checkin;
        const isAfter1PM = checkinTime >= '13:00';
        
        if (isArticleship) {
          // For articleship: half-day if arrive after 1 PM
          isHalfDay = isAfter1PM;
        } else {
          // For others: half-day if arrive after 1 PM AND less than 6 hours worked
          isHalfDay = isAfter1PM && (record.totalHour < 6);
        }
      }

      // Update the record's halfDay flag
      record.halfDay = isHalfDay;

      totalHour += record.totalHour || 0;
      excessHour += record.excessHour || 0;

      if (isHalfDay) totalHalfDay++;
      let scheduledIn = '10:00'; 
      if (user) {
         const d = new Date(dateStr);
         const dow = d.getDay();
         const m = d.getMonth() + 1;
         
         if (m === 12 || m === 1) scheduledIn = user.scheduleInOutTimeMonth?.inTime || '09:00';
         else if (dow === 6) scheduledIn = user.scheduleInOutTimeSat?.inTime || '09:00';
         else if (dow !== 0) scheduledIn = user.scheduleInOutTime?.inTime || '09:00';
         if (dow === 0) scheduledIn = user.scheduleInOutTime?.inTime || '09:00';
      }
      
      if (record.checkin && record.checkin > scheduledIn) totalLateArrival++;
  
        switch (record.typeOfPresence) {
             case 'ThumbMachine':
             case 'Manual':
             case 'Remote':
             case 'Weekly Off - Present (WO-Present)':
             case 'Half Day (HD)':
             case 'Work From Home (WFH)':
             case 'Weekly Off - Work From Home (WO-WFH)':
             case 'Onsite Presence (OS-P)':
             case 'Present - in office':
             case 'Present - client place':
             case 'Present - outstation':
             case 'Present - weekoff':
             case 'WFH - weekdays':
             case 'WFH - weekoff':
                // Align with main attendance summary logic:
                // these types count as Present only if totalHour > 0,
                // otherwise they are treated as Absent.
                if (record.totalHour > 0) {
                    totalPresent++;
                } else {
                    totalAbsent++;
                }
                break;
          case 'Half Day - weekdays':
          case 'Half Day - weekoff':
             totalHalfDay++;
             totalPresent++;
             break;
          case 'On leave':
             totalLeave++;
             break;
          case 'Holiday':
          case 'Weekoff - special allowance':
             break;
          default:
             totalAbsent++;
      }
    });
  
    return { totalHour, totalLateArrival, excessHour, totalHalfDay, totalPresent, totalAbsent, totalLeave };
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action');

    if (!id) return new NextResponse('Missing id parameter', { status: 400 });

    const reqRecord = await AttendanceRequest.findById(id).populate('userId', 'name email designation');
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
          partnerRemarks: reqRecord.partnerRemarks
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
        return new NextResponse(`
            <html><body style="font-family:sans-serif; text-align:center; padding:40px;">
                <h1 style="color:red">Rejected</h1>
                <p>You have rejected the attendance correction for ${reqRecord.userName} on ${reqRecord.date}.</p>
            </body></html>
        `, { headers: { 'Content-Type': 'text/html' }});
    }

    if (action === 'approve') {
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


        // Update times if provided
        if (startTime && endTime) {
                rec.checkin = startTime;
                rec.checkout = endTime;
                rec.totalHour = calculateDuration(startTime, endTime);
                // Assuming 9 hours standard for excess calculation logic roughly
                rec.excessHour = rec.totalHour > 9 ? parseFloat((rec.totalHour - 9).toFixed(2)) : 0;
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

    const { id, action, remarks, attendanceValue } = await request.json();

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

    if (reqRecord.status !== 'Pending') {
      return NextResponse.json({ success: false, error: `Request already ${reqRecord.status}` }, { status: 400 });
    }

    // Update request status and remarks
    reqRecord.status = action === 'approve' ? 'Approved' : 'Rejected';
    reqRecord.partnerRemarks = remarks || null;
    await reqRecord.save();

    // If approved, update the actual attendance record
    if (action === 'approve') {
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
      if (attendanceValue !== undefined) {
        rec.value = attendanceValue;
      } else {
        // Fallback auto-calculation if no value provided
        if (requestedStatus.includes('Half Day')) {
          rec.value = 0.75;
          rec.halfDay = true;
        } else if (requestedStatus === 'Absent' || requestedStatus === 'On leave') {
          // Use leave management to determine if paid or unpaid leave
          const leaveUsage = await calculateLeaveUsage(userId, date, requestedStatus);
          rec.value = leaveUsage.value;
          rec.halfDay = false;
        } else if (requestedStatus === 'Holiday' || requestedStatus === 'Weekoff - special allowance') {
          rec.value = 0;
          rec.halfDay = false;
        } else if (requestedStatus.includes('outstation')) {
          rec.value = 1.2;
          rec.halfDay = false;
        } else {
          rec.value = 1;
          rec.halfDay = false;
        }
      }

      // Set halfDay flag based on value if not already set
      if (rec.value === 0.75) {
        rec.halfDay = true;
      }

      // Update times if provided
      if (startTime && endTime) {
        rec.checkin = startTime;
        rec.checkout = endTime;
        rec.totalHour = calculateDuration(startTime, endTime);
        // Assuming 9 hours standard for excess calculation logic roughly
        rec.excessHour = rec.totalHour > 9 ? parseFloat((rec.totalHour - 9).toFixed(2)) : 0;
      }

      attendance.records.set(date, rec);

      // Recalculate summary
      const user = await User.findById(userId);
      attendance.summary = calculateSummary(attendance.records, user);

      await attendance.save();
    }

    // Send email notification to employee
    try {
      const employeeEmail = (reqRecord.userId as any).email;
      const statusText = action === 'approve' ? 'Approved' : 'Rejected';
      const statusColor = action === 'approve' ? '#10b981' : '#ef4444';

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
            <strong>Your attendance correction request has been ${statusText.toLowerCase()}.</strong>
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
            <strong>📋 Next Steps:</strong> ${action === 'approve' ? 'Your attendance record has been updated accordingly.' : 'Please contact your partner for further clarification if needed.'}
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

    return NextResponse.json({
      success: true,
      message: `Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`
    });

  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process request' }, { status: 500 });
  }
}
