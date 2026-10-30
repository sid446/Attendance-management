import { policyForDate, type AttendanceCalcPolicy } from '@/lib/attendanceCalcPolicy';
import { isNonWorkingDayRecord } from '@/lib/calculateDayExcessHour';
import { usesArticleCalculationRules } from '@/lib/isArticleEmployee';
import { normalizeTimeToHHmm } from '@/lib/attendanceHours';
import {
  getEmploymentTypeForDate,
  isHalftimeEmploymentType,
} from '@/lib/attendanceSummaryMetrics';
import type { IUser } from '@/models/User';

const LATE_CHECKIN_ABSENT_REMARK = 'Marked absent: check-in at or after 3:00 PM';
const LATE_CHECKIN_HALFDAY_REMARK = 'Marked half day: check-in between 1:00 PM and 2:59 PM';

export type LateCheckinAbsentRecord = {
  checkin?: string;
  checkout?: string;
  editedCheckin?: string;
  editedCheckout?: string;
  typeOfPresence?: string;
  halfDay?: boolean;
  value?: number;
  totalHour?: number;
  excessHour?: number;
  remarks?: string;
};

export function getEffectiveCheckinTime(record: {
  checkin?: string;
  editedCheckin?: string;
}): string {
  return normalizeTimeToHHmm(record.editedCheckin ?? record.checkin ?? '');
}

function isExemptPresenceType(typeOfPresence: string): boolean {
  const t = typeOfPresence.toLowerCase();
  if (t === 'holiday' || t === 'sunday' || t === 'weekoff') return true;
  if (t.includes('weekoff') || t.includes('week off')) return true;
  if (t === 'leave' || t === 'on leave' || t.includes('on leave')) return true;
  if (t === 'absent') return true;
  return false;
}

function resolveEmploymentType(
  user: IUser | null | undefined,
  dateStr: string
): string | undefined {
  if (!user) return undefined;
  return getEmploymentTypeForDate(
    user as unknown as Parameters<typeof getEmploymentTypeForDate>[0],
    new Date(`${dateStr}T12:00:00`)
  );
}

function isLateCheckinRuleEligible(
  inTime: string,
  options: {
    employmentType?: string;
    typeOfPresence?: string;
    dateStr?: string;
    policy?: AttendanceCalcPolicy | null;
  }
): boolean {
  if (!inTime || inTime === '00:00') return false;
  const rules = latePolicy(options.dateStr, options.policy);
  if (isHalftimeEmploymentType(options.employmentType) && !rules.lateRulesForHalftime) return false;

  const type = String(options.typeOfPresence || '');
  if (options.dateStr && isNonWorkingDayRecord(type, options.dateStr)) return false;
  if (isExemptPresenceType(type)) return false;

  return true;
}

function latePolicy(dateStr?: string, policy?: AttendanceCalcPolicy | null): AttendanceCalcPolicy {
  return policy ?? policyForDate(dateStr);
}

function lateWindow(rules: AttendanceCalcPolicy, isArticle?: boolean): { start: string; absent: string } {
  if (isArticle && rules.separateArticleLateWindow) {
    return { start: rules.articleLateCheckinHalfDayStart, absent: rules.articleLateCheckinAbsentFrom };
  }
  return { start: rules.lateCheckinHalfDayStart, absent: rules.lateCheckinAbsentFrom };
}

export function shouldMarkHalfDayForLateCheckin(
  inTime: string,
  options: {
    employmentType?: string;
    typeOfPresence?: string;
    dateStr?: string;
    outTime?: string;
    policy?: AttendanceCalcPolicy | null;
    isArticle?: boolean;
  }
): boolean {
  const rules = latePolicy(options.dateStr, options.policy);
  if (!rules.lateHalfDayEnabled) return false;
  if (!isLateCheckinRuleEligible(inTime, options)) return false;
  const out = normalizeTimeToHHmm(options.outTime || '');
  if (out && out !== '00:00' && out === inTime) return false;
  const window = lateWindow(rules, options.isArticle);
  return inTime >= window.start && inTime < window.absent;
}

export function shouldMarkAbsentForLateCheckin(
  inTime: string,
  options: {
    employmentType?: string;
    typeOfPresence?: string;
    dateStr?: string;
    /** When in and out are the same punch, this is exit/entry-only — not a late arrival. */
    outTime?: string;
    policy?: AttendanceCalcPolicy | null;
    isArticle?: boolean;
  }
): boolean {
  if (!inTime || inTime === '00:00') return false;
  const rules = latePolicy(options.dateStr, options.policy);
  if (!rules.lateAbsentEnabled) return false;
  const window = lateWindow(rules, options.isArticle);
  if (inTime < window.absent) return false;
  const out = normalizeTimeToHHmm(options.outTime || '');
  if (out && out !== '00:00' && out === inTime) return false;
  return isLateCheckinRuleEligible(inTime, options);
}

function appendRemark(record: LateCheckinAbsentRecord, remark: string): void {
  const remarks = String(record.remarks || '');
  if (!remarks.includes(remark)) {
    record.remarks = remarks ? `${remarks} | ${remark}` : remark;
  }
}

function normalizeHalfDayPresenceType(
  record: LateCheckinAbsentRecord,
  dateStr: string
): void {
  const type = String(record.typeOfPresence || '');
  const t = type.toLowerCase();
  if (t.includes('half day')) return;

  const isSunday = new Date(`${dateStr}T12:00:00`).getDay() === 0;
  const isWeekoffType =
    t.includes('weekoff') ||
    t.includes('week off') ||
    t === 'sunday' ||
    type === 'Present - in office - weekoff' ||
    type === 'Present - ClientPlace (Weekoff)' ||
    type === 'Present - Outstation (Weekoff)' ||
    type === 'WFH - weekoff';

  if (isSunday || isWeekoffType) {
    record.typeOfPresence = 'Half Day - weekoff';
  } else {
    record.typeOfPresence = 'Half Day - weekdays';
  }
}

/**
 * If check-in is between 1:00 PM and 2:59 PM, mark half day (halftime employees exempt).
 * Returns true when the record was changed.
 */
export function applyLateCheckinHalfDayRule(
  record: LateCheckinAbsentRecord,
  user: IUser | null | undefined,
  dateStr: string,
  policy?: AttendanceCalcPolicy | null
): boolean {
  const inTime = getEffectiveCheckinTime(record);
  const employmentType = resolveEmploymentType(user, dateStr);
  const rules = policy ?? policyForDate(dateStr);

  if (
    !shouldMarkHalfDayForLateCheckin(inTime, {
      employmentType,
      typeOfPresence: record.typeOfPresence,
      dateStr,
      outTime: record.editedCheckout ?? record.checkout,
      policy: rules,
      isArticle: usesArticleCalculationRules(user, rules),
    })
  ) {
    return false;
  }

  const alreadyApplied =
    record.halfDay === true &&
    Number(record.value) === 0.5 &&
    String(record.typeOfPresence || '').toLowerCase().includes('half day') &&
    String(record.remarks || '').includes(LATE_CHECKIN_HALFDAY_REMARK);
  if (alreadyApplied) return false;

  normalizeHalfDayPresenceType(record, dateStr);
  record.halfDay = true;
  record.value = 0.5;
  appendRemark(record, LATE_CHECKIN_HALFDAY_REMARK);

  return true;
}

/**
 * If check-in is at or after 3:00 PM, mark the day absent (halftime employees exempt).
 * Returns true when the record was changed.
 */
export function applyLateCheckinAbsentRule(
  record: LateCheckinAbsentRecord,
  user: IUser | null | undefined,
  dateStr: string,
  policy?: AttendanceCalcPolicy | null
): boolean {
  const inTime = getEffectiveCheckinTime(record);
  const employmentType = resolveEmploymentType(user, dateStr);
  const rules = policy ?? policyForDate(dateStr);

  if (
    !shouldMarkAbsentForLateCheckin(inTime, {
      employmentType,
      typeOfPresence: record.typeOfPresence,
      dateStr,
      outTime: record.editedCheckout ?? record.checkout,
      policy: rules,
      isArticle: usesArticleCalculationRules(user, rules),
    })
  ) {
    return false;
  }

  const alreadyApplied =
    record.typeOfPresence === 'Absent' &&
    Number(record.value) === 0 &&
    record.halfDay === false &&
    String(record.remarks || '').includes(LATE_CHECKIN_ABSENT_REMARK);
  if (alreadyApplied) return false;

  record.typeOfPresence = 'Absent';
  record.value = 0;
  record.halfDay = false;
  record.totalHour = 0;
  record.excessHour = 0;
  appendRemark(record, LATE_CHECKIN_ABSENT_REMARK);

  return true;
}
