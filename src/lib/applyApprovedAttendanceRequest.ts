import mongoose from 'mongoose';
import Attendance from '@/models/Attendance';
import { isHrModifiedAttendanceRecord, pickLatestApprovedRequestPerDate } from '@/lib/attendanceRequestDayDisplay';
import AttendanceRequest from '@/models/AttendanceRequest';
import User from '@/models/User';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { calculateLeaveUsage, updateLeaveBalanceOnApproval } from '@/lib/leaveManagement';
import { calculateTotalHours as calculateDuration } from '@/lib/attendanceHours';
import { calculateSummary, type AttendanceRecordForSummary } from '@/lib/attendanceSummaryCalculation';
import { applyDayExcessToRecord } from '@/lib/calculateDayExcessHour';
import { getDefaultNumericValueForType, isLeaveRequestType } from '@/lib/attendanceRequestValues';
import { hasPhysicalAttendancePresence } from '@/lib/attendancePhysicalPresence';
import { invalidateApprovedLeaveIfSuperseded, invalidateSupersededLeaveRequest } from '@/lib/invalidateSupersededLeaveRequest';
import {
  EXTRA_WORK_REQUEST_STATUS,
  applyExtraWorkSlotsToRecord,
  type ExtraWorkEntry,
  extraWorkRequestAppliedToRecord,
  isExtraWorkRequest,
  normalizeExtraWorkSlotsFromRequest,
} from '@/lib/extraWorkRequest';

type DayRecord = Record<string, unknown>;
type RecordsMap = Map<string, DayRecord> | Record<string, DayRecord> | any;

function getDayRecord(records: RecordsMap, date: string): DayRecord | undefined {
  if (!records) return undefined;
  if (typeof records.get === 'function') {
    return records.get(date) as DayRecord | undefined;
  }
  return records[date] as DayRecord | undefined;
}

function setDayRecord(
  attendance: { records: RecordsMap; markModified?: (path: string) => void },
  date: string,
  rec: DayRecord
): void {
  if (typeof attendance.records?.set === 'function') {
    attendance.records.set(date, rec);
  } else if (attendance.records) {
    (attendance.records as Record<string, DayRecord>)[date] = rec;
  }
  attendance.markModified?.('records');
}

function cloneDayRecord(rec: DayRecord): DayRecord {
  if (rec && typeof (rec as { toObject?: () => DayRecord }).toObject === 'function') {
    return (rec as { toObject: () => DayRecord }).toObject();
  }
  return { ...rec };
}

function effectivePunchIn(rec: DayRecord | undefined): string {
  return String(rec?.editedCheckin || rec?.checkin || '').trim();
}

function effectivePunchOut(rec: DayRecord | undefined): string {
  return String(rec?.editedCheckout || rec?.checkout || '').trim();
}

type ApprovedRequestLike = {
  _id?: unknown;
  requestedStatus?: string;
  requestType?: string;
  startTime?: string;
  endTime?: string;
  originalStatus?: string;
  extraWorkSlots?: { startTime: string; endTime: string; reason: string }[];
};

/** Undo mistaken correction-style apply that overwrote punch fields for extra work. */
function repairCorruptedExtraWorkAttendanceFields(
  rec: DayRecord,
  req: ApprovedRequestLike
): boolean {
  let changed = false;
  const type = String(rec.typeOfPresence || '').trim();
  if (type === EXTRA_WORK_REQUEST_STATUS && req.originalStatus) {
    rec.typeOfPresence = req.originalStatus;
    changed = true;
  }

  const reqIn = String(req.startTime || '').trim();
  const reqOut = String(req.endTime || '').trim();
  const editedIn = String(rec.editedCheckin || '').trim();
  const editedOut = String(rec.editedCheckout || '').trim();
  if (reqIn && reqOut && editedIn === reqIn && editedOut === reqOut) {
    rec.editedCheckin = '';
    rec.editedCheckout = '';
    changed = true;
  }

  return changed;
}

function extraWorkNeedsApplyOrRepair(
  rec: DayRecord | undefined,
  req: ApprovedRequestLike
): boolean {
  if (!rec) return false;
  const requestId = req._id != null ? String(req._id) : undefined;
  if (!extraWorkRequestAppliedToRecord(rec as { extraWorkEntries?: ExtraWorkEntry[] | null }, requestId)) {
    return true;
  }
  const type = String(rec.typeOfPresence || '').trim();
  if (type === EXTRA_WORK_REQUEST_STATUS && req.originalStatus) return true;
  const reqIn = String(req.startTime || '').trim();
  const reqOut = String(req.endTime || '').trim();
  const editedIn = String(rec.editedCheckin || '').trim();
  const editedOut = String(rec.editedCheckout || '').trim();
  return !!(reqIn && reqOut && editedIn === reqIn && editedOut === reqOut);
}

/** True when an approved request is not yet reflected on the attendance day record. */
export function approvedRequestNeedsAttendanceApply(
  rec: DayRecord | undefined,
  req: ApprovedRequestLike
): boolean {
  const requestedStatus = String(req.requestedStatus || '').trim();
  if (!requestedStatus) return false;

  if (isExtraWorkRequest(req)) {
    return extraWorkNeedsApplyOrRepair(rec, req);
  }

  if (!rec) return true;

  // HR admin edit is authoritative — do not overwrite with an approved request on reconcile.
  if (isHrModifiedAttendanceRecord(rec as { remarks?: string })) {
    return false;
  }

  if (isLeaveRequestType(requestedStatus) && hasPhysicalAttendancePresence(rec)) {
    return false;
  }

  const currentType = String(rec.typeOfPresence || '').trim();
  if (currentType !== requestedStatus) {
    return true;
  }

  const reqIn = String(req.startTime || '').trim();
  const reqOut = String(req.endTime || '').trim();
  if (reqIn && reqOut && reqIn !== '00:00' && reqOut !== '00:00') {
    if (effectivePunchIn(rec) !== reqIn || effectivePunchOut(rec) !== reqOut) {
      return true;
    }
  }

  const reqLower = requestedStatus.toLowerCase();
  if (
    (reqLower.includes('present') || reqLower.includes('wfh') || reqLower.includes('client')) &&
    Number(rec.value || 0) <= 0
  ) {
    return true;
  }

  return false;
}

/**
 * Apply an approved extra-work request — additive only; punch in/out are not changed.
 */
export async function applyApprovedExtraWorkRequestToAttendance(
  reqRecord: ApprovedRequestLike & {
    userId: mongoose.Types.ObjectId | string;
    date: string;
    monthYear: string;
  }
): Promise<boolean> {
  const { userId, date, monthYear } = reqRecord;
  const requestId = reqRecord._id != null ? String(reqRecord._id) : undefined;
  const userObjectId =
    userId instanceof mongoose.Types.ObjectId
      ? userId
      : new mongoose.Types.ObjectId(String(userId));

  const attendance = await Attendance.findOne({ userId: userObjectId, monthYear });
  if (!attendance) return false;

  const existingRec = getDayRecord(attendance.records, date);
  if (!existingRec) return false;

  const rec = cloneDayRecord(existingRec);
  let changed = repairCorruptedExtraWorkAttendanceFields(rec, reqRecord);

  if (!extraWorkRequestAppliedToRecord(rec as { extraWorkEntries?: ExtraWorkEntry[] | null }, requestId)) {
    const slots = normalizeExtraWorkSlotsFromRequest(reqRecord);
    if (slots.length === 0) return changed;

    applyExtraWorkSlotsToRecord(rec, slots, requestId);
    changed = true;
  }

  if (!changed) return false;

  setDayRecord(attendance, date, rec);
  const userObj = await User.findById(userObjectId);
  const recordsMap =
    attendance.records instanceof Map
      ? attendance.records
      : new Map(Object.entries(attendance.records || {}));
  attendance.summary = calculateSummary(
    recordsMap as Map<string, AttendanceRecordForSummary>,
    userObj
  );
  await attendance.save();
  return true;
}

/**
 * Apply an approved attendance request onto the user's monthly attendance record.
 * Returns true when the attendance document was modified and saved.
 */
export async function applyApprovedRequestToAttendance(
  reqRecord: ApprovedRequestLike & {
    userId: mongoose.Types.ObjectId | string;
    date: string;
    monthYear: string;
    requestedStatus: string;
    startTime?: string;
    endTime?: string;
  },
  options?: { attendanceValue?: number }
): Promise<boolean> {
  if (isExtraWorkRequest(reqRecord)) {
    return applyApprovedExtraWorkRequestToAttendance(reqRecord);
  }

  const { userId, date, monthYear, requestedStatus, startTime, endTime } = reqRecord;
  const attendanceValue = options?.attendanceValue;
  const userObjectId =
    userId instanceof mongoose.Types.ObjectId
      ? userId
      : new mongoose.Types.ObjectId(String(userId));

  let attendance = await Attendance.findOne({ userId: userObjectId, monthYear });
  if (!attendance) {
    attendance = new Attendance({
      userId: userObjectId,
      monthYear,
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

  let rec = getDayRecord(attendance.records, date);
  if (!rec) {
    rec = {
      checkin: '',
      checkout: '',
      totalHour: 0,
      excessHour: 0,
      typeOfPresence: 'Absent',
      halfDay: false,
      value: 0,
    };
  } else {
    rec = cloneDayRecord(rec);
  }

  if (isLeaveRequestType(requestedStatus) && hasPhysicalAttendancePresence(rec)) {
    await invalidateApprovedLeaveIfSuperseded(userObjectId, date);
    return false;
  }

  rec.typeOfPresence = requestedStatus;

  const userObj = await User.findById(userObjectId);

  if (requestedStatus.includes('Half Day')) {
    rec.value = 0.5;
    rec.halfDay = true;
  } else if (attendanceValue !== undefined) {
    rec.value = attendanceValue;
    rec.halfDay = false;
  } else if (requestedStatus === 'Absent' || requestedStatus === 'On leave') {
    const leaveUsage = await calculateLeaveUsage(userObjectId, date, requestedStatus);
    rec.value = leaveUsage.value;
    rec.halfDay = false;
  } else if (requestedStatus === 'Holiday' || requestedStatus === 'Weekoff - special allowance') {
    rec.value = 0;
    rec.halfDay = false;
  } else {
    rec.value = getDefaultNumericValueForType(requestedStatus, { employee: userObj }) ?? 1;
    rec.halfDay = false;
  }

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

  const isType = (type: string) => requestedStatus.toLowerCase().includes(type.toLowerCase());
  const isWeekoff = /weekoff|week-off|week off/i.test(requestedStatus);
  let effectiveScheduledMinutes = scheduledMinutes;
  let effectiveScheduledInTime = scheduledInTime;
  let effectiveScheduledOutTime = scheduledOutTime;

  if (isWeekoff && userObj) {
    const mondayDate = new Date(`${date}T12:00:00`);
    const dayOfWeek = mondayDate.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
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

  const hasCustomTimes =
    startTime && endTime && startTime !== '00:00' && endTime !== '00:00';

  if (hasCustomTimes) {
    rec.editedCheckin = startTime;
    rec.editedCheckout = endTime;
  }

  if (isType('WFH - weekdays')) {
    rec.totalHour = Number((Number(rec.value) * (effectiveScheduledMinutes / 60)).toFixed(2));
    rec.excessHour = Number((Number(rec.totalHour) - effectiveScheduledMinutes / 60).toFixed(2));
    if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
    if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
  } else if (isType('WFH - weekoff')) {
    rec.totalHour = 0;
    rec.excessHour = Number((Number(rec.value) * (effectiveScheduledMinutes / 60)).toFixed(2));
    if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
    if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
  } else if (isType('Half Day - weekdays')) {
    rec.totalHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
    rec.excessHour = Number((Number(rec.totalHour) - effectiveScheduledMinutes / 60).toFixed(2));
    if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
    if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
  } else if (isType('Half Day - weekoff')) {
    rec.totalHour = 0;
    rec.excessHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
    if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
    if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
  } else if (
    isType('Present - Outstation (Weekdays)') ||
    isType('Present - ClientPlace (Weekdays)')
  ) {
    if (hasCustomTimes) {
      rec.totalHour = calculateDuration(String(startTime), String(endTime), {
        scheduledIn: effectiveScheduledInTime,
        scheduledOut: effectiveScheduledOutTime,
      });
      applyDayExcessToRecord(
        rec,
        userObj,
        date,
        effectiveScheduledInTime,
        effectiveScheduledOutTime
      );
    } else {
      rec.totalHour = Number((Number(rec.value) * (effectiveScheduledMinutes / 60)).toFixed(2));
      rec.excessHour = Number((Number(rec.totalHour) - effectiveScheduledMinutes / 60).toFixed(2));
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
        date,
        effectiveScheduledInTime,
        effectiveScheduledOutTime
      );
    } else {
      rec.excessHour = Number((Number(rec.value) * (effectiveScheduledMinutes / 60)).toFixed(2));
    }
  } else if (isType('Present - in office - weekdays') || isType('Present - in office - weekoff')) {
    if (hasCustomTimes) {
      rec.totalHour = calculateDuration(String(startTime), String(endTime), {
        scheduledIn: effectiveScheduledInTime,
        scheduledOut: effectiveScheduledOutTime,
      });
      applyDayExcessToRecord(
        rec,
        userObj,
        date,
        effectiveScheduledInTime,
        effectiveScheduledOutTime
      );
    } else {
      rec.totalHour = Number((Number(rec.value) * (effectiveScheduledMinutes / 60)).toFixed(2));
      rec.excessHour = Number((Number(rec.totalHour) - effectiveScheduledMinutes / 60).toFixed(2));
      if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
      if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
    }
  } else if (hasCustomTimes) {
    rec.totalHour = calculateDuration(String(startTime), String(endTime), {
      scheduledIn: effectiveScheduledInTime,
      scheduledOut: effectiveScheduledOutTime,
    });
    applyDayExcessToRecord(
      rec,
      userObj,
      date,
      effectiveScheduledInTime,
      effectiveScheduledOutTime
    );
  }

  const isSundayDate = new Date(`${date}T12:00:00`).getDay() === 0;
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

  setDayRecord(attendance, date, rec);
  const recordsMap =
    attendance.records instanceof Map
      ? attendance.records
      : new Map(Object.entries(attendance.records || {}));
  attendance.summary = calculateSummary(
    recordsMap as Map<string, AttendanceRecordForSummary>,
    userObj
  );
  await attendance.save();

  if (requestedStatus === 'On leave' || requestedStatus === 'Absent') {
    const leaveUsage = await calculateLeaveUsage(userObjectId, date, requestedStatus);
    if (leaveUsage.isPaidLeave) {
      await updateLeaveBalanceOnApproval(userObjectId, date, true);
    }
  }

  return true;
}

/** Re-apply approved requests that were not written to attendance (repair stale approvals). */
export async function reconcileApprovedRequestsForMonth(
  userId: string,
  monthYear: string
): Promise<number> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const approved = await AttendanceRequest.find({
    userId: userObjectId,
    monthYear,
    status: 'Approved',
  }).lean();

  if (approved.length === 0) return 0;

  const latestPerDate = pickLatestApprovedRequestPerDate(approved);
  let repaired = 0;

  for (const req of latestPerDate) {
    try {
      const attendance = await Attendance.findOne({ userId: userObjectId, monthYear });
      const rec = attendance ? getDayRecord(attendance.records, req.date) : undefined;

      if (
        isLeaveRequestType(String(req.requestedStatus || '')) &&
        hasPhysicalAttendancePresence(rec)
      ) {
        await invalidateSupersededLeaveRequest(req._id);
        continue;
      }

      if (!approvedRequestNeedsAttendanceApply(rec, req)) continue;

      const valueRaw = req.hrValue ?? req.partnerProposedValue;
      const attendanceValue =
        valueRaw != null && String(valueRaw).trim() !== ''
          ? parseFloat(String(valueRaw))
          : undefined;

      const applied = await applyApprovedRequestToAttendance(req, {
        attendanceValue: Number.isNaN(attendanceValue as number) ? undefined : attendanceValue,
      });
      if (applied) repaired++;
    } catch (error) {
      console.error(
        `[reconcileApprovedRequestsForMonth] Failed user=${userId} date=${req.date} request=${req._id}:`,
        error
      );
    }
  }

  if (repaired > 0) {
    console.log(
      `[reconcileApprovedRequestsForMonth] Repaired ${repaired} day(s) for user=${userId} month=${monthYear}`
    );
  }

  return repaired;
}
