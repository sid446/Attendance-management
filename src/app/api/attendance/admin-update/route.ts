import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { calculateLeaveUsage, updateLeaveBalanceOnApproval } from '@/lib/leaveManagement';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { reapplyExtraWorkEntriesToRecord } from '@/lib/extraWorkRequest';

function calculateDuration(start: string, end: string): number {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    return Math.max(0, Math.round((totalMinutes / 60) * 100) / 100);
}

// Lightweight summary calculation re-used from approval flow
function calculateSummary(
  records: Map<string, any> | Record<string, any>,
  user?: any | null
) {
  // Convert to Map if plain object
  const map = records instanceof Map ? records : new Map(Object.entries(records));

  let totalHour = 0;
  let totalLateArrival = 0;
  let excessHour = 0;
  let totalHalfDay = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLeave = 0;

  map.forEach((record: any, dateStr: string) => {
    // get scheduled times
    let scheduledInTime = '';
    let scheduledOutTime = '';
    if (user) {
      const s = getScheduledTimes(user, dateStr);
      scheduledInTime = s.inTime;
      scheduledOutTime = s.outTime;
    }

    const inTime = String(record.editedCheckin ?? record.checkin ?? '').trim();
    const outTime = String(record.editedCheckout ?? record.checkout ?? '').trim();
    const isSundayDate = new Date(dateStr).getDay() === 0;
    const isNonWorkingDayRecord =
      record.typeOfPresence === 'Holiday' ||
      record.typeOfPresence === 'Sunday' ||
      record.typeOfPresence === 'Weekoff' ||
      record.typeOfPresence === 'Weekoff - special allowance' ||
      isSundayDate;

    // compute totalHour and default present/absent
    record.totalHour = calculateDuration(inTime, outTime);

    // compute dayExcess similar to existing logic (simplified)
    let dayExcess = 0;
    if (isNonWorkingDayRecord) {
      dayExcess = 0;
    } else if (scheduledInTime && scheduledOutTime && inTime && outTime && inTime !== '00:00' && outTime !== '00:00') {
      const [schInH, schInM] = scheduledInTime.split(':').map(Number);
      const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
      const [actInH, actInM] = inTime.split(':').map(Number);
      const [actOutH, actOutM] = outTime.split(':').map(Number);
      const schInMin = schInH * 60 + schInM;
      const schOutMin = schOutH * 60 + schOutM;
      const actInMin = actInH * 60 + actInM;
      const actOutMin = actOutH * 60 + actOutM;
      const scheduledMinutes = schOutMin - schInMin >= 0 ? schOutMin - schInMin : (24 * 60 + schOutMin - schInMin);
      const actualMinutes = actOutMin - actInMin >= 0 ? actOutMin - actInMin : (24 * 60 + actOutMin - actInMin);
      if (actualMinutes < scheduledMinutes) {
        dayExcess = -(scheduledMinutes - actualMinutes) / 60;
      } else {
        dayExcess = (actualMinutes - scheduledMinutes) / 60;
      }
    } else {
      dayExcess = 0;
    }

    record.excessHour = Number(dayExcess.toFixed(2));

    totalHour += record.totalHour || 0;
    excessHour += record.excessHour || 0;

    // half day and present/absent/leave counting (simplified to match existing rules)
    const isSunday = new Date(dateStr).getDay() === 0;
    let calculatedHalf = record.halfDay || false;
    if (!calculatedHalf && !isNonWorkingDayRecord) {
      if ((inTime === '00:00' && outTime !== '00:00' && record.totalHour > 0)) {
        calculatedHalf = true;
      } else {
        const isArticle = user && user.designation && String(user.designation).toLowerCase() === 'article';
        if (isArticle) {
          const isAfter1PM = inTime ? inTime >= '13:00' : false;
          calculatedHalf = isAfter1PM || record.totalHour < 3.5;
        } else {
          // Non-article employees can come anytime; half-day only depends on total hours.
          calculatedHalf = record.totalHour > 0 && record.totalHour < 6;
        }
      }
    }
    if (isNonWorkingDayRecord) {
      calculatedHalf = false;
      record.excessHour = 0;
    }
    reapplyExtraWorkEntriesToRecord(record);

    if (calculatedHalf) totalHalfDay++;

    if (['On leave', 'Leave'].includes(record.typeOfPresence)) {
      totalLeave++;
    } else if (record.typeOfPresence === 'Holiday' || record.typeOfPresence === 'Sunday' || record.typeOfPresence === 'Weekoff' || isSunday) {
      // ignore
    } else if (record.totalHour > 0 || (record.excessHour && record.excessHour > 0)) {
      totalPresent++;
    } else {
      totalAbsent++;
    }
  });

  return { totalHour, totalLateArrival, excessHour, totalHalfDay, totalPresent, totalAbsent, totalLeave };
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { userId, date, monthYear, requestedStatus, startTime, endTime, attendanceValue, remarks, updatedBy, updatedByEmail } = body;

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
    if (!rec) {
      rec = { checkin: '', checkout: '', editedCheckin: '', editedCheckout: '', totalHour: 0, excessHour: 0, typeOfPresence: 'Absent', halfDay: false, value: 0, remarks: '' };
    }

    // Update presence type
    rec.typeOfPresence = requestedStatus;

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
        rec.value = 1.2;
        rec.halfDay = false;
      } else {
        rec.value = 1;
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

    // Use provided times for edited checkin/checkout
    if (startTime && startTime !== '00:00') rec.editedCheckin = startTime;
    if (endTime && endTime !== '00:00') rec.editedCheckout = endTime;

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
      rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
      rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
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
      rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
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

    // Add HR remark
    const hrRemark = `Updated by HR${updatedBy ? `: ${updatedBy}` : ''}${remarks ? ` - ${remarks}` : ''}`;
    rec.remarks = rec.remarks ? `${rec.remarks} | ${hrRemark}` : hrRemark;

    attendance.records.set(date, rec);

    // Recalculate monthly summary
    const user = await User.findById(userId);
    attendance.summary = calculateSummary(attendance.records, user);
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
