import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { requestId, action, remarks, value, approvedBy } = await request.json();

    if (!requestId || !action || !approvedBy) {
      return NextResponse.json({
        success: false,
        error: 'Request ID, action, and approver are required'
      }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({
        success: false,
        error: 'Action must be either "approve" or "reject"'
      }, { status: 400 });
    }

    // Find the request
    const attendanceRequest = await AttendanceRequest.findById(requestId);
    if (!attendanceRequest) {
      return NextResponse.json({
        success: false,
        error: 'Request not found'
      }, { status: 404 });
    }

    // Update the request
    const updateData: any = {
      status: action === 'approve' ? 'Approved' : 'Rejected',
      updatedAt: new Date()
    };

    if (action === 'approve') {
      updateData.approvedBy = approvedBy;
      updateData.approvedAt = new Date();
      if (approvedBy === 'HR') {
        if (remarks) updateData.hrRemarks = remarks;
        if (value) updateData.hrValue = value;
      } else {
        if (remarks) updateData.partnerRemarks = remarks;
      }
    } else {
      updateData.rejectedBy = approvedBy;
      updateData.rejectedAt = new Date();
      if (approvedBy === 'HR') {
        if (remarks) updateData.hrRemarks = remarks;
      } else {
        if (remarks) updateData.partnerRemarks = remarks;
      }
    }

    await AttendanceRequest.findByIdAndUpdate(requestId, updateData);

    // If approved, update the actual attendance record
    if (action === 'approve') {
      // Find the attendance record for this month or create if it doesn't exist
      let attendanceRecord = await Attendance.findOne({
        userId: attendanceRequest.userId,
        monthYear: attendanceRequest.monthYear
      });

      if (!attendanceRecord) {
        // Create new attendance record for future requests
        attendanceRecord = await Attendance.create({
          userId: attendanceRequest.userId,
          monthYear: attendanceRequest.monthYear,
          records: new Map(),
          summary: {
            totalHour: 0,
            totalLateArrival: 0,
            excessHour: 0,
            totalHalfDay: 0,
            totalPresent: 0,
            totalAbsent: 0,
            totalLeave: 0,
          },
        });
      }

      // Get existing record for the date or create new
      const existingRecord = attendanceRecord.records.get(attendanceRequest.date) || {};

      // Update the attendance record with the requested status
      const updateFields: any = {
        ...existingRecord,
        typeOfPresence: attendanceRequest.requestedStatus,
        updatedAt: new Date()
      };

      // Update times if provided
      if (attendanceRequest.startTime) {
        updateFields.checkin = attendanceRequest.startTime;
      }
      if (attendanceRequest.endTime) {
        updateFields.checkout = attendanceRequest.endTime;
      }

      // Calculate total hours if both times are provided
      if (attendanceRequest.startTime && attendanceRequest.endTime) {
        const start = new Date(`2000-01-01T${attendanceRequest.startTime}`);
        const end = new Date(`2000-01-01T${attendanceRequest.endTime}`);
        const diffMs = end.getTime() - start.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        updateFields.totalHour = Math.max(0, diffHours);
      }

      // Set value and halfDay based on approver and request type
      const isLeaveRequest = attendanceRequest.requestedStatus.toLowerCase().includes('leave') ||
                            attendanceRequest.requestedStatus.toLowerCase().includes('absent') ||
                            attendanceRequest.requestedStatus === 'On leave';

      if (isLeaveRequest) {
        // For leave requests, determine paid/unpaid based on available balance
        const { calculateLeaveUsage } = await import('@/lib/leaveManagement');
        const leaveUsage = await calculateLeaveUsage(attendanceRequest.userId, attendanceRequest.date, attendanceRequest.requestedStatus);
        updateFields.value = leaveUsage.value; // 1 for paid, 0 for unpaid
        updateFields.halfDay = false; // Leave is either full day paid or unpaid
      } else if (approvedBy === 'HR' && value) {
        updateFields.value = parseFloat(value);
        updateFields.halfDay = parseFloat(value) > 0 && parseFloat(value) < 1;
      } else if (approvedBy !== 'HR') {
        // For partner approval, default to 1 for non-leave requests
        updateFields.value = 1;
        updateFields.halfDay = false;
      }

      // Update the records map
      attendanceRecord.records.set(attendanceRequest.date, updateFields);
      
      // Recalculate summary
      const user = await User.findById(attendanceRequest.userId);
      attendanceRecord.summary = calculateSummary(attendanceRecord.records, user);
      
      await attendanceRecord.save();

      // Update leave balance if this is a leave request
      if (isLeaveRequest) {
        const { calculateLeaveUsage, updateLeaveBalanceOnApproval } = await import('@/lib/leaveManagement');
        const leaveUsage = await calculateLeaveUsage(attendanceRequest.userId, attendanceRequest.date, attendanceRequest.requestedStatus);
        
        if (leaveUsage.isPaidLeave) {
          await updateLeaveBalanceOnApproval(attendanceRequest.userId, attendanceRequest.date, true);
        }
      }
    }

    // Send email notification
    try {
      const user = await User.findById(attendanceRequest.userId);
      if (user && user.email) {
        const subject = `Attendance Request ${action === 'approve' ? 'Approved' : 'Rejected'}`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${action === 'approve' ? '#10b981' : '#ef4444'};">${subject}</h2>
            <p>Dear ${attendanceRequest.userName},</p>
            <p>Your attendance correction request has been <strong>${action === 'approve' ? 'approved' : 'rejected'}</strong>.</p>

            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Date:</strong> ${new Date(attendanceRequest.date).toLocaleDateString()}</p>
              <p><strong>Requested Status:</strong> ${attendanceRequest.requestedStatus}</p>
              <p><strong>Reason:</strong> ${attendanceRequest.reason || 'N/A'}</p>
              ${remarks ? `<p><strong>Remarks:</strong> ${remarks}</p>` : ''}
              <p><strong>Approved/Rejected by:</strong> ${approvedBy}</p>
              <p><strong>Action taken on:</strong> ${new Date().toLocaleString()}</p>
            </div>

            <p>If you have any questions, please contact your supervisor or HR department.</p>
            <p>Best regards,<br>Attendance Management System</p>
          </div>
        `;

        await transporter.sendMail({
          ...mailOptions,
          to: user.email,
          subject,
          html
        });
      }
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      success: true,
      message: `Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`
    });

  } catch (error) {
    console.error('Approve/Reject Request Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process request'
    }, { status: 500 });
  }
}

function calculateSummary(
  records: Map<string, {
    checkin: string;
    checkout: string;
    totalHour: number;
    excessHour: number;
    typeOfPresence: string;
    halfDay: boolean;
    remarks?: string;
  }>,
  user?: any
) {
  let totalHour = 0;
  let totalLateArrival = 0;
  let excessHour = 0;
  let totalHalfDay = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLeave = 0;

  records.forEach((record, dateStr) => {
    totalHour += record.totalHour || 0;
    excessHour += record.excessHour || 0;

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

    if (isHalfDay) {
      totalHalfDay++;
    }

    // Determine scheduled in-time for this specific date
    let scheduledIn = '10:00'; // Default fallback
    
    if (user) {
      const dateDate = new Date(dateStr);
      // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
      const dayOfWeek = dateDate.getDay(); 
      const month = dateDate.getMonth() + 1; // 1-12

      // "Sch-Out (Dec- Jan)" logic: Special schedule for Dec (12) and Jan (1)
      if (month === 12 || month === 1) {
         scheduledIn = user.scheduleInOutTimeMonth?.inTime || '09:00';
      } else if (dayOfWeek === 6) { // Saturday
         scheduledIn = user.scheduleInOutTimeSat?.inTime || '09:00';
      } else if (dayOfWeek !== 0) { // Regular (Mon-Fri)
         scheduledIn = user.scheduleInOutTime?.inTime || '09:00';
      }
      // Sunday (0) usually doesn't have late arrival, but if record exists, use regular or ignore?
      // Assuming no late arrival calc for Sunday usually, but let's stick to Regular if present
      if (dayOfWeek === 0) scheduledIn = user.scheduleInOutTime?.inTime || '09:00';
    }

    if (record.checkin && record.checkin > scheduledIn) {
      totalLateArrival++;
    }

    switch (record.typeOfPresence) {
      case 'ThumbMachine':
      case 'Manual':
      case 'Remote':
      case 'Weekly Off - Present (WO-Present)':
      case 'Half Day (HD)':
      case 'Work From Home (WFH)':
      case 'Weekly Off - Work From Home (WO-WFH)':
      case 'Onsite Presence (OS-P)':
        // If hours are > 0, they are present. If 0, they are Absent (but source was Machine/Manual)
        if (record.totalHour > 0) {
           totalPresent++;
        } else {
           totalAbsent++;
        }
        break;
      case 'On leave':
        totalLeave++;
        break;
      case 'Holiday':
        // Holidays don't count as present/absent
        break;
      default:
        totalAbsent++;
    }
  });

  return {
    totalHour,
    totalLateArrival,
    excessHour,
    totalHalfDay,
    totalPresent,
    totalAbsent,
    totalLeave,
  };
}