import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { transporter, mailOptions } from '@/lib/mailer';
import LeaveTransaction from '@/models/LeaveTransaction';
import { isAttendanceDatePartnerOnlyIst } from '@/lib/attendanceRequestApprovalWindow';
import { sendPartnerRequestDecisionEmail } from '@/lib/attendanceRequestNotifications';
import { requireEmployeeOrHrSession } from '@/lib/employeeRouteAuth';
import {
  applyExtraWorkSlotsToRecord,
  isExtraWorkRequest,
  normalizeExtraWorkSlotsFromRequest,
} from '@/lib/extraWorkRequest';
import { isArticleEmployee } from '@/lib/isArticleEmployee';
import { calculateSummary } from '@/lib/attendanceSummaryCalculation';
import { applyDayExcessToRecord } from '@/lib/calculateDayExcessHour';
import { calculateTotalHours as calculateDuration } from '@/lib/attendanceHours';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEmployeeOrHrSession(request);
    if (auth instanceof NextResponse) return auth;

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

    const isHr = approvedBy === 'HR';
    if (isHr) {
      if (attendanceRequest.status !== 'Pending' && attendanceRequest.status !== 'PendingHr') {
        return NextResponse.json(
          { success: false, error: `Request already ${attendanceRequest.status}` },
          { status: 400 }
        );
      }
    } else if (attendanceRequest.status !== 'Pending') {
      return NextResponse.json(
        { success: false, error: `Request already ${attendanceRequest.status}` },
        { status: 400 }
      );
    }

    // Partner cannot finalize without HR for stale dates (should be PendingHr, not Pending)
    if (!isHr && attendanceRequest.status === 'Pending' && !isAttendanceDatePartnerOnlyIst(attendanceRequest.date)) {
      return NextResponse.json(
        {
          success: false,
          error: 'This request must be approved by your partner first; it then requires HR approval.',
        },
        { status: 400 }
      );
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
              try {
                await LeaveTransaction.create({
                  userId: userForLeave._id,
                  date: new Date().toISOString().split('T')[0],
                  monthYear: attendanceRequest.monthYear,
                  type: 'earned',
                  amount: increment,
                  source: 'attendance-create-increment',
                  reference: attendanceRequest._id?.toString()
                });
              } catch (e) {
                console.error('Failed to write LeaveTransaction for attendance-create increment', e);
              }
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

      // If this date was previously counted as a paid leave and is now being
      // changed to a non-leave status, remove prior paid-leave transactions
      // so the ledger and snapshots reflect the correction.
      try {
        const wasOnLeave = existingRec && (String(existingRec.typeOfPresence || '').toLowerCase().includes('leave') || Number(existingRec.value || 0) >= 1);
        const newIsLeave = (attendanceRequest.requestedStatus || '').toLowerCase().includes('leave') || (attendanceRequest.requestedStatus || '').toLowerCase().includes('absent') || attendanceRequest.requestedStatus === 'On leave';
        if (wasOnLeave && !newIsLeave) {
          try {
            const lm = await import('@/lib/leaveManagement');
            await lm.removePaidLeaveForDate(attendanceRequest.userId, attendanceRequest.date);
            console.log(`[LEAVE DEBUG] Removed prior paid-leave transactions for ${attendanceRequest.userId} on ${attendanceRequest.date}`);
          } catch (e) {
            console.error('Failed to remove prior paid-leave transactions on approval:', e);
          }
        }
      } catch (e) {
        console.error('Error while checking/removing prior leave transactions:', e);
      }

      if (isExtraWorkRequest(attendanceRequest)) {
        const slots = normalizeExtraWorkSlotsFromRequest(attendanceRequest);
        if (slots.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Extra work request is missing valid time slots.' },
            { status: 400 }
          );
        }
        try {
          applyExtraWorkSlotsToRecord(rec, slots, String(attendanceRequest._id));
        } catch (err) {
          return NextResponse.json(
            { success: false, error: err instanceof Error ? err.message : 'Invalid extra work hours' },
            { status: 400 }
          );
        }

        attendanceRecord.records.set(attendanceRequest.date, rec);
        attendanceRecord.markModified('records');
        const userForSummary = await User.findById(attendanceRequest.userId);
        attendanceRecord.summary = calculateSummary(attendanceRecord.records, userForSummary);
        await attendanceRecord.save();
      } else {
      // Update the attendance record with the requested status
      rec.typeOfPresence = attendanceRequest.requestedStatus;


      // Fetch user and schedule early so mapping logic can use it
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

      // If the requested status is a generic "Present" or "Present - in office" (without weekday/weekoff
      // qualifier), map it to the correct detailed type based on whether the date is a weekoff (Sunday/holiday)
      try {
        const reqLower = (attendanceRequest.requestedStatus || '').toLowerCase();
        const alreadyQualified = /weekoff|weekday|week-off|weekdays|week day/i.test(attendanceRequest.requestedStatus || '');
        if (reqLower.includes('present') && !alreadyQualified) {
          const d = new Date(attendanceRequest.date);
          const isSunday = d.getDay() === 0;
          let isHolidaySchedule = false;
          if (userObj) {
            const sched = getScheduledTimes(userObj, attendanceRequest.date);
            isHolidaySchedule = !!sched.isHoliday;
          }
          const useWeekoff = isSunday || isHolidaySchedule;
          rec.typeOfPresence = useWeekoff ? 'Present - in office - weekoff' : 'Present - in office - weekdays';
        }
      } catch (e) {
        // defensive: if anything goes wrong, keep original requestedStatus
        console.error('Failed to map generic Present to detailed type:', e);
      }

      // Update editedCheckin/editedCheckout if times provided (never modify original checkin/checkout)
      if (attendanceRequest.startTime && attendanceRequest.startTime !== '00:00') {
        rec.editedCheckin = attendanceRequest.startTime;
      }
      if (attendanceRequest.endTime && attendanceRequest.endTime !== '00:00') {
        rec.editedCheckout = attendanceRequest.endTime;
      }

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

      const hasCustomTimes =
        attendanceRequest.startTime &&
        attendanceRequest.endTime &&
        attendanceRequest.startTime !== '00:00' &&
        attendanceRequest.endTime !== '00:00';

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
        if (hasCustomTimes) {
          rec.totalHour = calculateDuration(
            String(attendanceRequest.startTime),
            String(attendanceRequest.endTime),
            {
              scheduledIn: effectiveScheduledInTime,
              scheduledOut: effectiveScheduledOutTime,
            }
          );
          applyDayExcessToRecord(
            rec,
            userObj,
            attendanceRequest.date,
            effectiveScheduledInTime,
            effectiveScheduledOutTime
          );
        } else {
          rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
          rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
          if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
          if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
        }
      } else if (
        isType('Present - Outstation (Weekoff)') ||
        isType('Present - ClientPlace (Weekoff)')
      ) {
        rec.totalHour = 0;
        if (hasCustomTimes) {
          applyDayExcessToRecord(
            rec,
            userObj,
            attendanceRequest.date,
            effectiveScheduledInTime,
            effectiveScheduledOutTime
          );
        } else {
          rec.excessHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
        }
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

        applyDayExcessToRecord(
          rec,
          userObj,
          attendanceRequest.date,
          effectiveScheduledInTime,
          effectiveScheduledOutTime
        );
        
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
        const isArticleship = isArticleEmployee(userObj);
        
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

        // If approved status is Present - Outstation or Present - ClientPlace (weekday or weekoff),
        // adjust leaveBalance.remaining by the fractional component of the value.
        // Example: value=1.1 => add 0.1; value=1.2 => add 0.2; value=0.8 => subtract 0.2
        try {
          const statusLower = (attendanceRequest.requestedStatus || '').toLowerCase();
          if (statusLower.includes('outstation') || statusLower.includes('client place') || statusLower.includes('clientplace')) {
            const recValue = typeof rec.value === 'number' ? rec.value : (rec.value ? Number(rec.value) : 1);
            const delta = Number((recValue - 1).toFixed(3));
            if (Math.abs(delta) > 0) {
              const u = await User.findById(attendanceRequest.userId);
              if (u) {
                // Skip adjustment for article trainees
                const isArticle = isArticleEmployee(u);
                if (isArticle) {
                  // Do not modify leave balance for articles
                } else {
                  // Ensure leaveBalance object exists; operate on a local copy to satisfy TS
                  const leaveBalance = u.leaveBalance ?? ({
                    remaining: 0,
                    monthlyEarned: 0,
                    earned: 0,
                    balanceAsOfJan26: 0,
                    used: 0,
                    usedAfterJan26: 0,
                    lastUpdated: new Date()
                  } as any);
                  const prev = Number(leaveBalance.remaining ?? 0);
                  const prevEarned = Number(leaveBalance.earned ?? 0);
                  const updated = Number((prev + delta).toFixed(3));
                  // Debug logging to trace unexpected double increments
                  console.log(`[LEAVE DEBUG] Applying delta ${delta} for user ${attendanceRequest.userId} month ${attendanceRequest.monthYear}. Prev remaining: ${prev}, Prev earned: ${prevEarned}`);
                  leaveBalance.remaining = updated;

                  // If this approval belongs to month >= Jan 2026, also increment the earned amount
                  try {
                    if (attendanceRequest.monthYear && attendanceRequest.monthYear >= '2026-01') {
                      const newEarned = Number(((leaveBalance.earned ?? 0) + delta).toFixed(3));
                      leaveBalance.earned = newEarned;
                      console.log(`[LEAVE DEBUG] Updated earned for user ${attendanceRequest.userId}: ${prevEarned} -> ${newEarned}`);
                      // Do not change monthlyEarned here; monthlyEarned is used for scheduled monthly increments elsewhere
                    }
                  } catch (e) {
                    // defensive: ignore any comparison issues
                  }

                  leaveBalance.lastUpdated = new Date();
                  u.leaveBalance = leaveBalance;
                  await u.save();
                  try {
                    // record fractional delta transaction (adjust remaining)
                    await LeaveTransaction.create({
                      userId: u._id,
                      date: attendanceRequest.date,
                      monthYear: attendanceRequest.monthYear,
                      type: 'adjust',
                      amount: delta,
                      source: 'outstation-delta',
                      reference: attendanceRequest._id?.toString()
                    });

                    // if earned was incremented for month >= 2026-01, also record earned transaction
                    try {
                      if (attendanceRequest.monthYear && attendanceRequest.monthYear >= '2026-01') {
                        await LeaveTransaction.create({
                          userId: u._id,
                          date: attendanceRequest.date,
                          monthYear: attendanceRequest.monthYear,
                          type: 'earned',
                          amount: delta,
                          source: 'outstation-earned',
                          reference: attendanceRequest._id?.toString()
                        });
                      }
                    } catch (e) {
                      console.error('Failed to write earned LeaveTransaction for outstation delta', e);
                    }
                  } catch (e) {
                    console.error('Failed to write LeaveTransaction for outstation/clientplace adjustment', e);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error('Failed to adjust leave balance for outstation/clientplace approval', e);
        }
      }
    }

    // Send email notification
    try {
      const user = await User.findById(attendanceRequest.userId);
      if (user && (user.attendanceEmail || user.email)) {
        const subject = `Attendance Request ${action === 'approve' ? 'Approved' : 'Rejected'}`;
        
        // Format dates and times
        const formattedDate = new Date(attendanceRequest.date).toLocaleDateString('en-GB');
        const now = new Date();
        const istDate = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
        const istTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: true });
        const processingTime = `${istDate} ${istTime} (IST)`;

        const html = `
          <div style="background-color: #f5f5f7; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1d1d1f; line-height: 1.5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
              <!-- Header -->
              <div style="padding: 40px 40px 20px; text-align: center;">
                <img src="https://attendance.asija.in/lg.png" alt="Asija Logo" style="width: 56px; height: 56px; margin-bottom: 24px;">
                <h1 style="font-size: 26px; font-weight: 600; margin: 0; color: #1d1d1f; letter-spacing: -0.02em;">Attendance Correction</h1>
                <div style="margin-top: 16px; display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; background-color: ${action === 'approve' ? '#e6f4ea' : '#fce8e6'}; color: ${action === 'approve' ? '#008040' : '#d21a0c'}; text-transform: uppercase; letter-spacing: 0.05em;">
                  ${action === 'approve' ? 'Approved' : 'Rejected'}
                </div>
              </div>

              <!-- Content -->
              <div style="padding: 0 40px 40px;">
                <p style="font-size: 17px; color: #424245; margin-bottom: 32px; text-align: center;">
                  Hello ${attendanceRequest.userName},<br>Your attendance correction request has been ${action === 'approve' ? 'successfully approved' : 'rejected'}.
                </p>

                <div style="background-color: #fbfbfd; border-radius: 14px; padding: 24px; border: 1px solid #d2d2d7;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding-bottom: 12px; font-size: 14px; color: #86868b; width: 40%;">Request Date</td>
                      <td style="padding-bottom: 12px; font-size: 14px; font-weight: 500; text-align: right; color: #1d1d1f;">${formattedDate}</td>
                    </tr>
                    <tr>
                      <td style="padding-bottom: 12px; font-size: 14px; color: #86868b;">Requested Status</td>
                      <td style="padding-bottom: 12px; font-size: 14px; font-weight: 500; text-align: right; color: #1d1d1f;">${attendanceRequest.requestedStatus}</td>
                    </tr>
                    ${attendanceRequest.startTime && attendanceRequest.endTime ? `
                    <tr>
                      <td style="padding-bottom: 12px; font-size: 14px; color: #86868b;">Time Range</td>
                      <td style="padding-bottom: 12px; font-size: 14px; font-weight: 500; text-align: right; color: #1d1d1f;">${attendanceRequest.startTime} - ${attendanceRequest.endTime}</td>
                    </tr>` : ''}
                    <tr>
                      <td style="padding-bottom: 12px; font-size: 14px; color: #86868b;">Employee Reason</td>
                      <td style="padding-bottom: 12px; font-size: 14px; font-weight: 500; text-align: right; color: #1d1d1f;">${attendanceRequest.reason || 'N/A'}</td>
                    </tr>
                    ${remarks ? `
                    <tr style="border-top: 1px solid #e5e5e7;">
                      <td style="padding-top: 12px; padding-bottom: 12px; font-size: 14px; color: #86868b;">Approver Remarks</td>
                      <td style="padding-top: 12px; padding-bottom: 12px; font-size: 14px; font-weight: 600; text-align: right; color: ${action === 'approve' ? '#008040' : '#d21a0c'};">${remarks}</td>
                    </tr>` : ''}
                    <tr style="border-top: 1px solid #e5e5e7;">
                      <td style="padding-top: 12px; font-size: 14px; color: #86868b;">Processed By</td>
                      <td style="padding-top: 12px; font-size: 14px; font-weight: 500; text-align: right; color: #1d1d1f;">${approvedBy}</td>
                    </tr>
                    <tr>
                      <td style="padding-top: 4px; font-size: 12px; color: #86868b;">Processed On</td>
                      <td style="padding-top: 4px; font-size: 12px; color: #86868b; text-align: right;">${processingTime}</td>
                    </tr>
                  </table>
                </div>

                <div style="margin-top: 40px; text-align: center;">
                  <a href="https://attendance.asija.in/employee/dashboard" style="display: inline-block; background-color: #0071e3; color: #ffffff; padding: 12px 32px; border-radius: 980px; font-size: 17px; font-weight: 500; text-decoration: none; transition: background-color 0.2s;">View Dashboard</a>
                </div>
              </div>

              <!-- Footer -->
              <div style="background-color: #f5f5f7; padding: 32px 40px; text-align: center; border-top: 1px solid #d2d2d7;">
                <p style="font-size: 12px; color: #86868b; margin: 0; line-height: 1.4;">This is an automated notification from Asija and Associates LLP Attendance System.</p>
                <p style="font-size: 12px; color: #86868b; margin: 8px 0 0;">Please do not reply to this email. For assistance, contact HR.</p>
              </div>
            </div>
          </div>
        `;

        const employeeTo = user.attendanceEmail || user.email;
        await transporter.sendMail({
          ...mailOptions,
          to: employeeTo,
          subject,
          html
        });

        const finalStatus = action === 'approve' ? 'Approved' : 'Rejected';
        try {
          await sendPartnerRequestDecisionEmail({
            partnerName: attendanceRequest.partnerName,
            employeeUser: user,
            action,
            rows: [
              {
                employeeName: attendanceRequest.userName,
                date: attendanceRequest.date,
                requestedStatus: attendanceRequest.requestedStatus,
                requestState: finalStatus,
                reason: attendanceRequest.reason,
              },
            ],
            processedBy: approvedBy,
            remarks,
            skipIfSameAs: user.email || null,
          });
        } catch (partnerEmailError) {
          console.error('Partner decision email failed:', partnerEmailError);
        }
      }
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
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