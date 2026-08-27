import { IUser } from '@/models/User';
import { calculateTotalHours, isLaterThanScheduledIn, isSinglePunch } from '@/lib/attendanceHours';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { reapplyExtraWorkEntriesToRecord } from '@/lib/extraWorkRequest';
import { isArticleEmployee } from '@/lib/isArticleEmployee';
import {
  calculateDayExcessHour,
  effectiveScheduledMinutesForDay,
  isHalfDayAttendanceRecord,
  isNonWorkingDayRecord,
  shouldAutoMarkAttendanceHalfDayByHours,
} from '@/lib/calculateDayExcessHour';
import { applyLateCheckinAbsentRule, applyLateCheckinHalfDayRule } from '@/lib/lateCheckinAbsentRule';
import {
  isHalftimeEmployeeForDate,
  normalizeHalftimeDayRecord,
} from '@/lib/halftimeAttendance';

import { isValueBasedPresenceHoursType } from '@/lib/resolveDayWorkedHours';

export type AttendanceRecordForSummary = {
  checkin: string;
  checkout: string;
  editedCheckin?: string;
  editedCheckout?: string;
  totalHour: number;
  excessHour: number;
  typeOfPresence: string;
  halfDay: boolean;
  value?: number;
  remarks?: string;
};

export function shouldExcludeFromSummaryHours(
  typeOfPresence: string,
  dateStr: string
): boolean {
  const day = new Date(dateStr).getDay();
  if (day === 0) return true;

  const excluded = new Set<string>([
    'Holiday',
    'Sunday',
    'Weekoff',
    'Absent',
    'On leave',
    'Leave',
    'WFH - weekdays',
    'WFH - weekoff',
    'Work From Home (WFH)',
    'Weekly Off - Work From Home (WO-WFH)',
    'Onsite Presence (OS-P)',
    'Present - ClientPlace (Weekdays)',
    'Present - ClientPlace (Weekoff)',
    'Present - client place',
    'Present - outstation',
    'Present - Outstation (Weekdays)',
    'Present - Outstation (Weekoff)',
    'Present - in office - weekoff',
    'Present - weekoff',
    'Weekly Off - Present (WO-Present)',
    'Half Day - weekoff',
    'Weekoff - special allowance',
  ]);

  return excluded.has(typeOfPresence);
}

export function calculateSummary(
  records: Map<string, AttendanceRecordForSummary>,
  user?: IUser | null
) {
  let totalHour = 0;
  let totalLateArrival = 0;
  let excessHour = 0;
  let totalScheduledHour = 0;
  let totalHalfDay = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLeave = 0;

  records.forEach((record, dateStr) => {
    if (applyLateCheckinAbsentRule(record, user, dateStr)) {
      totalAbsent++;
      return;
    }

    let scheduledInTime = '';
    let scheduledOutTime = '';
    let scheduleIsHalfDay = false;
    if (user) {
      const schedule = getScheduledTimes(user, dateStr);
      scheduledInTime = schedule.inTime;
      scheduledOutTime = schedule.outTime;
      scheduleIsHalfDay = !!schedule.isHalfDay;
    }

    const inTime = String(record.editedCheckin || record.checkin || '').trim();
    const outTime = String(record.editedCheckout || record.checkout || '').trim();

    let dayScheduledHours = 0;
    if (
      scheduledInTime &&
      scheduledOutTime &&
      scheduledInTime !== '00:00' &&
      scheduledOutTime !== '00:00'
    ) {
      const scheduledMinutes = effectiveScheduledMinutesForDay(
        scheduledInTime,
        scheduledOutTime,
        record
      );
      dayScheduledHours = Number((scheduledMinutes / 60).toFixed(2));
    }

    const isNonWorking = isNonWorkingDayRecord(record.typeOfPresence, dateStr);

    const punchHours = calculateTotalHours(inTime, outTime, {
      scheduledIn: scheduledInTime,
      scheduledOut: scheduledOutTime,
    });

    // Prefer real punches. For CP-P / OS-P / WFH with 00:00 punches, do not invent
    // value×schedule hours here (that skewed summary HR +/-). Only preserve an
    // already-stored positive totalHour so approve/admin writes are not wiped.
    if (punchHours > 0) {
      record.totalHour = punchHours;
    } else if (
      isValueBasedPresenceHoursType(record.typeOfPresence) &&
      Number(record.totalHour || 0) > 0
    ) {
      // keep stored totalHour
    } else {
      record.totalHour = 0;
    }

    record.excessHour = isNonWorking
      ? 0
      : calculateDayExcessHour(
          user,
          dateStr,
          record,
          scheduledInTime,
          scheduledOutTime
        );
    reapplyExtraWorkEntriesToRecord(record);

    const includeInHoursSummary = !shouldExcludeFromSummaryHours(
      record.typeOfPresence,
      dateStr
    );

    if (isNonWorking) {
      record.halfDay = false;
    }

    const employmentType = String(user?.employmentType || 'fulltime').toLowerCase();
    const isHalftime = isHalftimeEmployeeForDate(user, dateStr);
    const typeIsExplicitHalfDay = isHalfDayAttendanceRecord({
      typeOfPresence: record.typeOfPresence,
    });

    // Always recompute hour-based HD (do not sticky-keep a prior wrong halfDay).
    // Explicit Half Day* types stay HD; late-checkin rule may set HD after this.
    let calculatedHalfDay = typeIsExplicitHalfDay;

    if (isHalftime || isNonWorking) {
      calculatedHalfDay = false;
    } else if (!typeIsExplicitHalfDay) {
      if (isSinglePunch(inTime, outTime)) {
        calculatedHalfDay = true;
      } else if (
        (inTime === '00:00' && outTime === '00:00') ||
        (record.editedCheckin === '' && record.editedCheckout === '')
      ) {
        calculatedHalfDay = false;
      } else {
        calculatedHalfDay = shouldAutoMarkAttendanceHalfDayByHours({
          totalHour: record.totalHour,
          scheduledInTime,
          scheduledOutTime,
          scheduleIsHalfDay,
          employmentType,
          isArticle: isArticleEmployee(user),
          inTime,
        });
      }
    }

    record.halfDay = calculatedHalfDay;
    applyLateCheckinHalfDayRule(record, user, dateStr);
    normalizeHalftimeDayRecord(record, user, dateStr);

    // Recompute scheduled hours + excess after final halfDay flag (HD → half schedule)
    if (
      scheduledInTime &&
      scheduledOutTime &&
      scheduledInTime !== '00:00' &&
      scheduledOutTime !== '00:00'
    ) {
      const scheduledMinutes = effectiveScheduledMinutesForDay(
        scheduledInTime,
        scheduledOutTime,
        record
      );
      dayScheduledHours = Number((scheduledMinutes / 60).toFixed(2));
    }
    if (!isNonWorking) {
      record.excessHour = calculateDayExcessHour(
        user,
        dateStr,
        record,
        scheduledInTime,
        scheduledOutTime
      );
      reapplyExtraWorkEntriesToRecord(record);
    }

    if (includeInHoursSummary) {
      totalHour += record.totalHour;
      totalScheduledHour += dayScheduledHours;
    }

    if (record.halfDay) {
      totalHalfDay++;
    }

    if (
      inTime &&
      scheduledInTime &&
      isLaterThanScheduledIn(inTime, scheduledInTime) &&
      !(
        user?.category === 'Partner' ||
        !!(user?.designation && user.designation.toLowerCase().includes('partner'))
      )
    ) {
      totalLateArrival++;
    }

    const t = String(record.typeOfPresence || '').toLowerCase();
    if (t === 'leave' || t === 'on leave') {
      totalLeave++;
    } else if (t === 'holiday' || t === 'sunday' || t.includes('weekoff')) {
      // Holidays/Weekoffs don't count as present/absent for the 1.0/0.5 metrics
    } else if (t === 'absent') {
      totalAbsent++;
    } else if (record.totalHour > 0 || (record.value && record.value > 0)) {
      totalPresent++;
    } else {
      totalAbsent++;
    }
  });

  // Month excess = sum of per-day excess (same as Summary / Daywise), not
  // totalHour − totalScheduledHour (which excluded CP-P and diverged).
  excessHour = 0;
  records.forEach((record) => {
    excessHour += Number(record.excessHour || 0);
  });
  excessHour = Number(excessHour.toFixed(2));

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
