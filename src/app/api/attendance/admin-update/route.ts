import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { calculateLeaveUsage, updateLeaveBalanceOnApproval } from '@/lib/leaveManagement';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { calculateSummary } from '@/lib/attendanceSummaryCalculation';
import { applyDayExcessToRecord } from '@/lib/calculateDayExcessHour';
import { requireEmployeeOrHrSession } from '@/lib/employeeRouteAuth';
import { getDefaultNumericValueForType } from '@/lib/attendanceRequestValues';
import {
  captureAttendanceSnapshot,
  recordHrAttendanceEditRequest,
} from '@/lib/recordHrAttendanceEditRequest';
import { applyAttendanceEditSource } from '@/lib/daywiseAttendanceSource';
import { normalizeTimeToHHmm } from '@/lib/attendanceHours';

function calculateDuration(start: string, end: string): number {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    return Math.max(0, Math.round((totalMinutes / 60) * 100) / 100);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEmployeeOrHrSession(request);
    if (auth instanceof NextResponse) return auth;
    if (auth.type !== 'hr') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const editorEmail = auth.email;

    await dbConnect();

    const body = await request.json();
    const { userId, date, monthYear, requestedStatus, startTime, endTime, attendanceValue, remarks } = body;

    if (!userId || !date || !monthYear || !requestedStatus) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Find or create attendance doc
    let attendance = await Attendance.findOne({ userId, monthYear });
    if (!attendance) {
      attendance = new Attendance({ userId, monthYear, records: new Map(), summary: { totalHour: 0, totalLateArrival: 0, excessHour: 0, totalHalfDay: 0, totalPresent: 0, totalAbsent: 0, totalLeave: 0 } });
    }

    // Get or create record for date
    let rec = attendance.records.get(date);
    const beforeSnapshot = captureAttendanceSnapshot(
      (rec ?? null) as Record<string, unknown> | null
    );
    if (!rec) {
      rec = { checkin: '', checkout: '', editedCheckin: '', editedCheckout: '', totalHour: 0, excessHour: 0, typeOfPresence: 'Absent', halfDay: false, value: 0, remarks: '' };
    }

    // Update presence type
    rec.typeOfPresence = requestedStatus;

    const userObj = await User.findById(userId);

    // Set attendance value
    if (typeof requestedStatus === 'string' && requestedStatus.includes('Half Day')) {
      rec.value = 0.5;
      rec.halfDay = true;
    } else if (attendanceValue !== undefined) {
      rec.value = attendanceValue;
      rec.halfDay = false;
    } else {
      if (requestedStatus === 'Absent' || requestedStatus === 'On leave') {
        const leaveUsage = await calculateLeaveUsage(userId, date, requestedStatus);
        rec.value = leaveUsage.value;
        rec.halfDay = false;
      } else if (requestedStatus === 'Holiday' || requestedStatus === 'Weekoff - special allowance') {
        rec.value = 0;
        rec.halfDay = false;
      } else if (typeof requestedStatus === 'string' && requestedStatus.toLowerCase().includes('outstation')) {
        rec.value = getDefaultNumericValueForType(requestedStatus, { employee: userObj }) ?? 1;
        rec.halfDay = false;
      } else {
        rec.value = 1;
        rec.halfDay = false;
      }
    }

    // Fetch user schedule for the day
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

    // Weekoff handling: use Monday schedule for calculations when needed
    let isWeekoff = /weekoff|week-off|week off/i.test(requestedStatus);
    let effectiveScheduledInTime = scheduledInTime;
    let effectiveScheduledOutTime = scheduledOutTime;
    let effectiveScheduledMinutes = scheduledMinutes;
    if (isWeekoff && userObj) {
      const mondayDate = new Date(date);
      const dayOfWeek = mondayDate.getDay();
      const daysUntilMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
      mondayDate.setDate(mondayDate.getDate() + daysUntilMonday);
      const mondayStr = mondayDate.toISOString().split('T')[0];
      const mondaySchedule = getScheduledTimes(userObj, mondayStr);
      if (mondaySchedule.inTime && mondaySchedule.outTime) {
        effectiveScheduledInTime = mondaySchedule.inTime;
        effectiveScheduledOutTime = mondaySchedule.outTime;
        const [mInH, mInM] = mondaySchedule.inTime.split(':').map(Number);
        const [mOutH, mOutM] = mondaySchedule.outTime.split(':').map(Number);
        effectiveScheduledMinutes = (mOutH * 60 + mOutM) - (mInH * 60 + mInM);
      }
    }

    // Use provided times for edited checkin/checkout (always store HH:MM)
    if (startTime && startTime !== '00:00') {
      rec.editedCheckin = normalizeTimeToHHmm(startTime) || startTime;
    }
    if (endTime && endTime !== '00:00') {
      rec.editedCheckout = normalizeTimeToHHmm(endTime) || endTime;
    }

    // Calculate totalHour and excessHour depending on type
    const isType = (type: string) => typeof requestedStatus === 'string' && requestedStatus.toLowerCase().includes(type.toLowerCase());

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
    } else if (isType('Half Day - weekdays')) {
      rec.totalHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
      rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
      if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
      if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
    } else if (isType('Half Day - weekoff')) {
      rec.totalHour = 0;
      rec.excessHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
      if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
      if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
    } else if (isType('Present - Outstation (Weekdays)') || isType('Present - Outstation')) {
      if (startTime && endTime && startTime !== '00:00' && endTime !== '00:00') {
        rec.totalHour = calculateDuration(startTime, endTime);
        applyDayExcessToRecord(
          rec,
          userObj,
          date,
          effectiveScheduledInTime,
          effectiveScheduledOutTime
        );
      } else {
        rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
        rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
        if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
        if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
      }
    } else if (isType('Present - ClientPlace') || isType('Present - ClientPlace (Weekdays)')) {
      rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
      rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
    } else if (isType('Present - in office - weekdays') || isType('Present - in office')) {
      rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
      rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
      if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
      if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
    } else if (startTime && endTime && startTime !== '00:00' && endTime !== '00:00') {
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

    // Add HR remark on attendance record (short stamp; full audit lives on AttendanceRequest)
    const hrRemark = `Updated by HR: ${editorEmail}${remarks ? ` - ${remarks}` : ''}`;
    rec.remarks = rec.remarks ? `${rec.remarks} | ${hrRemark}` : hrRemark;

    applyAttendanceEditSource(rec as any, {
      approvedBy: 'HR',
      approvedByEmail: editorEmail || null,
    });

    attendance.records.set(date, rec);

    const afterSnapshot = {
      status: requestedStatus,
      startTime: startTime && startTime !== '00:00' ? startTime : rec.editedCheckin || rec.checkin || '',
      endTime: endTime && endTime !== '00:00' ? endTime : rec.editedCheckout || rec.checkout || '',
      value: typeof rec.value === 'number' ? rec.value : undefined,
    };

    try {
      await recordHrAttendanceEditRequest({
        userId,
        date,
        monthYear,
        before: beforeSnapshot,
        after: afterSnapshot,
        editorEmail,
        remarks,
      });
    } catch (auditErr) {
      console.error('Failed to record HR edit on AttendanceRequest:', auditErr);
    }

    // Recalculate monthly summary
    attendance.summary = calculateSummary(attendance.records, userObj);
    await attendance.save();

    // Update leave balance if On leave or Absent and is paid leave
    if (['On leave', 'Absent'].includes(requestedStatus)) {
      try {
        const leaveUsage = await calculateLeaveUsage(userId, date, requestedStatus);
        if (leaveUsage.isPaidLeave) {
          await updateLeaveBalanceOnApproval(userId, date, true);
        }
      } catch (e) {
        console.error('Leave update failed during admin update:', e);
      }
    }

    return NextResponse.json({ success: true, message: 'Attendance updated by HR', data: { date, userId, monthYear } });
  } catch (error) {
    console.error('Admin update error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update attendance' }, { status: 500 });
  }
}
