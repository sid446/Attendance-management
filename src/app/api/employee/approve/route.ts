import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { transporter, mailOptions } from '@/lib/mailer';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { requestId, action, remarks, value, approvedBy, approvedByEmail } = await request.json();

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
      updateData.approvedByEmail = approvedByEmail || null;
      updateData.approvedAt = new Date();
      if (approvedBy === 'HR') {
        if (remarks) updateData.hrRemarks = remarks;
        if (value) updateData.hrValue = value;
      } else {
        if (remarks) updateData.partnerRemarks = remarks;
      }
    } else {
      updateData.rejectedBy = approvedBy;
      updateData.rejectedByEmail = approvedByEmail || null;
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

      const isNewAttendanceRecord = !attendanceRecord;
      console.log(`[LEAVE DEBUG] Approval for user ${attendanceRequest.userId}, month ${attendanceRequest.monthYear}`);
      console.log(`[LEAVE DEBUG] Attendance record exists: ${!isNewAttendanceRecord}`);

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
        console.log(`[LEAVE DEBUG] Created new attendance record for ${attendanceRequest.monthYear}`);

        // Increment leave balance for non-articles if this is a new attendance record for month >= Jan 2026
        console.log(`[LEAVE DEBUG] Month check: ${attendanceRequest.monthYear} >= 2026-01: ${attendanceRequest.monthYear >= '2026-01'}`);
        if (attendanceRequest.monthYear >= '2026-01') {
          const userForLeave = await User.findById(attendanceRequest.userId);
          console.log(`[LEAVE DEBUG] User found: ${!!userForLeave}, isActive: ${userForLeave?.isActive}`);
          if (userForLeave && userForLeave.isActive) {
            const designationLower = (userForLeave.designation || '').toLowerCase();
            const employmentTypeLower = (userForLeave.employmentType || '').toLowerCase();
            const isArticle = employmentTypeLower.includes('article') || designationLower.includes('article');
            console.log(`[LEAVE DEBUG] Designation: ${userForLeave.designation}, EmploymentType: ${userForLeave.employmentType}, isArticle: ${isArticle}`);
            
            if (!isArticle) {
              const currentEarned = userForLeave.leaveBalance?.earned || 0;
              const currentUsed = userForLeave.leaveBalance?.used || 0;
              const currentUsedAfterJan26 = userForLeave.leaveBalance?.usedAfterJan26 || 0;
              const currentBalanceAsOfJan26 = userForLeave.leaveBalance?.balanceAsOfJan26 || 0;
              
              const increment = 2;
              const newEarned = currentEarned + increment;
              const newRemaining = currentBalanceAsOfJan26 + newEarned - currentUsed - currentUsedAfterJan26;
              
              console.log(`[LEAVE DEBUG] Current earned: ${currentEarned}, New earned: ${newEarned}`);
              
              await User.findByIdAndUpdate(userForLeave._id, {
                'leaveBalance.earned': newEarned,
                'leaveBalance.remaining': newRemaining,
                'leaveBalance.lastUpdated': new Date(),
                'leaveBalance.monthlyEarned': 2,
              });
              console.log(`[LEAVE DEBUG] Leave balance incremented for user ${userForLeave.name} (new attendance record for ${attendanceRequest.monthYear})`);
            } else {
              console.log(`[LEAVE DEBUG] Skipped increment - user is an article`);
            }
          }
        } else {
          console.log(`[LEAVE DEBUG] Skipped increment - month ${attendanceRequest.monthYear} is before 2026-01`);
        }
      } else {
        console.log(`[LEAVE DEBUG] Attendance record already exists for ${attendanceRequest.monthYear} - no increment`);
      }

      // Get existing record for the date or create new (matching bulk-action pattern)
      const existingRec = attendanceRecord.records.get(attendanceRequest.date);
      const rec: any = existingRec || {
        checkin: '',
        checkout: '',
        totalHour: 0,
        excessHour: 0,
        typeOfPresence: 'Absent',
        halfDay: false,
        value: 0
      };

      // Update the attendance record with the requested status
      rec.typeOfPresence = attendanceRequest.requestedStatus;

      // Update editedCheckin/editedCheckout if times provided (never modify original checkin/checkout)
      if (attendanceRequest.startTime && attendanceRequest.startTime !== '00:00') {
        rec.editedCheckin = attendanceRequest.startTime;
      }
      if (attendanceRequest.endTime && attendanceRequest.endTime !== '00:00') {
        rec.editedCheckout = attendanceRequest.endTime;
      }

      // Fetch user schedule for the day
      const userObj = await User.findById(attendanceRequest.userId);
      let scheduledInTime = '';
      let scheduledOutTime = '';
      let scheduledMinutes = 0;
      if (userObj) {
        const schedule = getScheduledTimes(userObj, attendanceRequest.date);
        scheduledInTime = schedule.inTime;
        scheduledOutTime = schedule.outTime;
        if (scheduledInTime && scheduledOutTime) {
          const [schInH, schInM] = scheduledInTime.split(':').map(Number);
          const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
          const schInMin = schInH * 60 + schInM;
          const schOutMin = schOutH * 60 + schOutM;
          scheduledMinutes = schOutMin - schInMin >= 0 ? schOutMin - schInMin : (24 * 60 + schOutMin - schInMin);
        }
      }
      // Set value and halfDay based on approver and request type BEFORE hour calculations
      const isLeaveRequest = attendanceRequest.requestedStatus.toLowerCase().includes('leave') ||
                            attendanceRequest.requestedStatus.toLowerCase().includes('absent') ||
                            attendanceRequest.requestedStatus === 'On leave';

      if (isLeaveRequest) {
        // For leave requests, determine paid/unpaid based on available balance
        const { calculateLeaveUsage } = await import('@/lib/leaveManagement');
        const leaveUsage = await calculateLeaveUsage(attendanceRequest.userId, attendanceRequest.date, attendanceRequest.requestedStatus);
        rec.value = leaveUsage.value; // 1 for paid, 0 for unpaid
        rec.halfDay = false; // Leave is either full day paid or unpaid
      } else if (value !== undefined && value !== null && value !== '') {
        // Use provided value (from HR or partner)
        rec.value = parseFloat(value);
        // Only Half Day types should have halfDay=true, not based on value
        rec.halfDay = false;
      } else {
        // Default to 1 for non-leave requests when no value specified
        rec.value = 1;
        rec.halfDay = false;
      }

      // Now calculate totalHour and excessHour using new rules for special types
      const isType = (type: string) => attendanceRequest.requestedStatus && attendanceRequest.requestedStatus.toLowerCase().includes(type.toLowerCase());
      let isWeekoff = /weekoff|week-off|week off/i.test(attendanceRequest.requestedStatus || '');
      let isWeekdays = /weekday|weekdays/i.test(attendanceRequest.requestedStatus || '');
      
      // For weekoff types, use weekday (Monday) schedule instead of actual day schedule
      let effectiveScheduledMinutes = scheduledMinutes;
      let effectiveScheduledInTime = scheduledInTime;
      let effectiveScheduledOutTime = scheduledOutTime;
      if (isWeekoff && userObj) {
        // Get Monday schedule for weekoff calculations
        const mondayDate = new Date(attendanceRequest.date);
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
          const mInMin = mInH * 60 + mInM;
          const mOutMin = mOutH * 60 + mOutM;
          effectiveScheduledMinutes = mOutMin - mInMin >= 0 ? mOutMin - mInMin : (24 * 60 + mOutMin - mInMin);
        }
      }
      
      // WFH
      if (isType('WFH - weekdays')) {
        rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
        rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
        // Set editedCheckin/editedCheckout based on schedule if not already set
        if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
        if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
      } else if (isType('WFH - weekoff')) {
        rec.totalHour = 0;
        rec.excessHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
        // Set editedCheckin/editedCheckout based on weekday schedule
        if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
        if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
      }
      // Half Day
      else if (isType('Half Day - weekdays')) {
        rec.value = 0.5;
        rec.halfDay = true;
        rec.totalHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
        rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
        // Set editedCheckin/editedCheckout based on schedule
        if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
        if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
      } else if (isType('Half Day - weekoff')) {
        rec.value = 0.5;
        rec.halfDay = true;
        rec.totalHour = 0;
        rec.excessHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
        // Set editedCheckin/editedCheckout based on weekday schedule
        if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
        if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
      }
      // Present - Outstation & ClientPlace (Weekdays/Weekoff)
      else if (
        isType('Present - Outstation (Weekdays)') ||
        isType('Present - ClientPlace (Weekdays)')
      ) {
        // Always use scheduled hour * value for totalHour, ignore edited times
        rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
        rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
      } else if (
        isType('Present - Outstation (Weekoff)') ||
        isType('Present - ClientPlace (Weekoff)')
      ) {
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
      // Default: use time if provided (time corrections)
      else if (attendanceRequest.startTime && attendanceRequest.endTime) {
        // Use editedCheckin/editedCheckout for corrections (never modify original checkin/checkout)
        rec.editedCheckin = attendanceRequest.startTime;
        rec.editedCheckout = attendanceRequest.endTime;
        // Calculate totalHour
        const [inH, inM] = attendanceRequest.startTime.split(':').map(Number);
        const [outH, outM] = attendanceRequest.endTime.split(':').map(Number);
        const inMin = inH * 60 + inM;
        const outMin = outH * 60 + outM;
        let diffMinutes = outMin - inMin;
        if (diffMinutes < 0) diffMinutes += 24 * 60;
        rec.totalHour = Math.max(0, diffMinutes / 60);
        
        // Calculate excessHour
        let dayExcess = 0;
        if (scheduledInTime && scheduledOutTime && attendanceRequest.startTime !== '00:00' && attendanceRequest.endTime !== '00:00') {
          const [schInH, schInM] = scheduledInTime.split(':').map(Number);
          const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
          const schInMin = schInH * 60 + schInM;
          const schOutMin = schOutH * 60 + schOutM;
          const scheduledMinutes = schOutMin - schInMin >= 0 ? schOutMin - schInMin : (24 * 60 + schOutMin - schInMin);
          const actualMinutes = outMin - inMin >= 0 ? outMin - inMin : (24 * 60 + outMin - inMin);
          if (actualMinutes < scheduledMinutes) {
            dayExcess = -(scheduledMinutes - actualMinutes) / 60;
          } else {
            dayExcess = (actualMinutes - scheduledMinutes) / 60;
          }
        }
        rec.excessHour = Number(dayExcess.toFixed(2));
        
        // Recalculate halfDay based on corrected times
        // Default to false, but set true if rules are violated
        rec.halfDay = false;
        rec.value = 1;
        
        // Check halfDay rules:
        // 1. If checkin is 00:00 but checkout is valid - mark as half day
        // 2. For article employees: half-day if arrive after 1 PM
        // 3. For others: half-day if arrive after 1 PM AND less than 6 hours worked
        const checkinTime = attendanceRequest.startTime;
        const checkoutTime = attendanceRequest.endTime;
        const isArticleship = userObj && userObj.designation && userObj.designation.toLowerCase() === 'article';
        
        if (checkinTime === '00:00' && checkoutTime !== '00:00' && checkoutTime !== '' && rec.totalHour > 0) {
          // Missing check-in but has valid checkout
          rec.halfDay = true;
          rec.value = 0.5;
        } else if (checkinTime !== '00:00') {
          const isAfter1PM = checkinTime >= '13:00';
          
          if (isArticleship) {
            // For articleship: half-day if arrive after 1 PM
            if (isAfter1PM) {
              rec.halfDay = true;
              rec.value = 0.5;
            }
          } else {
            // For others: half-day if arrive after 1 PM AND less than 6 hours worked
            if (isAfter1PM && rec.totalHour < 6) {
              rec.halfDay = true;
              rec.value = 0.5;
            }
          }
        }
      }

      // ...existing code...

      // Update the records map
      attendanceRecord.records.set(attendanceRequest.date, rec);
      
      // Mark records as modified so Mongoose saves changes to existing Map entries
      attendanceRecord.markModified('records');
      
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
          to: user.attendanceEmail || user.email,
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
    
    // Special case: if checkin is 00:00 but checkout is valid, mark as half day
    if (record.checkin === '00:00' && record.checkout !== '00:00' && record.checkout !== '' && record.totalHour > 0) {
      isHalfDay = true;
    } else if (record.checkin) {
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
      case 'Leave':
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