import { isSinglePunch } from '@/lib/attendanceHours';
import {
  excessHoursForGroup,
  halfDayScheduledShareOf,
  policyForDate,
  type AttendanceCalcPolicy,
} from '@/lib/attendanceCalcPolicy';
import { sumExtraWorkEntryHours } from '@/lib/extraWorkRequest';
import {
  ArticleEmployeeLike,
  usesArticleCalculationRules,
} from '@/lib/isArticleEmployee';
export type DayExcessRecordLike = {
  checkin?: string;
  checkout?: string;
  editedCheckin?: string;
  editedCheckout?: string;
  totalHour?: number;
  typeOfPresence?: string;
  halfDay?: boolean;
  extraWorkEntries?: Array<{ hours?: number; startTime?: string; endTime?: string }> | null;
};

/** Prefer edited punch; empty string means “not edited”, so fall back to raw. */
function pickEditedOrRaw(edited: string | undefined, raw: string | undefined): string {
  const e = String(edited ?? '').trim();
  if (e) return e;
  return String(raw ?? '').trim();
}

function effectiveInOut(record: DayExcessRecordLike) {
  return {
    inTime: pickEditedOrRaw(record.editedCheckin, record.checkin),
    outTime: pickEditedOrRaw(record.editedCheckout, record.checkout),
  };
}

export function scheduledMinutesBetween(scheduledInTime: string, scheduledOutTime: string): number {
  const [schInH, schInM] = scheduledInTime.split(':').map(Number);
  const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
  const schInMin = schInH * 60 + schInM;
  const schOutMin = schOutH * 60 + schOutM;
  return schOutMin - schInMin >= 0
    ? schOutMin - schInMin
    : 24 * 60 + schOutMin - schInMin;
}

/** True when the day is treated as half-day attendance (HD). */
export function isHalfDayAttendanceRecord(
  record: { halfDay?: boolean; typeOfPresence?: string; status?: string } | null | undefined
): boolean {
  if (!record) return false;
  if (record.halfDay === true) return true;
  const t = String(record.typeOfPresence || record.status || '')
    .trim()
    .toLowerCase();
  if (!t) return false;
  return t.includes('half day') || t.includes('halfday') || t === 'hd';
}

/**
 * Auto half-day from worked hours (fulltime/article).
 * Does NOT use a flat 6h cutoff alone — short scheduled days (e.g. Saturday
 * 10:45–16:15 = 5.5h) are full days when the employee works the schedule.
 * If the schedule slot is already marked isHalfDay, hour-based HD is skipped
 * (shorter in/out already encode the half day).
 */
export function shouldAutoMarkAttendanceHalfDayByHours(options: {
  totalHour: number;
  scheduledInTime: string;
  scheduledOutTime: string;
  scheduleIsHalfDay: boolean;
  employmentType: string;
  isArticle: boolean;
  inTime: string;
  date?: string;
  policy?: AttendanceCalcPolicy | null;
}): boolean {
  const {
    totalHour,
    scheduledInTime,
    scheduledOutTime,
    scheduleIsHalfDay,
    employmentType,
    isArticle,
    inTime,
    date,
    policy,
  } = options;
  const rules = policy ?? policyForDate(date);

  if (scheduleIsHalfDay && rules.skipScheduledHalfDay) return false;

  const emp = String(employmentType || 'fulltime').toLowerCase();
  if (emp === 'fulltime' && !isArticle) {
    const byTime =
      rules.fulltimeAlsoAfterCheckin && Boolean(inTime && inTime >= rules.fulltimeAutoHalfDayFrom);
    if (!rules.fulltimeAutoHalfDayEnabled) return byTime;
    const rawMins =
      scheduledInTime &&
      scheduledOutTime &&
      scheduledInTime !== '00:00' &&
      scheduledOutTime !== '00:00'
        ? scheduledMinutesBetween(scheduledInTime, scheduledOutTime)
        : 0;
    const scheduledHours = rawMins > 0 ? rawMins / 60 : rules.fulltimeAutoHalfDayHours;
    const threshold = rules.fulltimeCapAtSchedule
      ? Math.min(rules.fulltimeAutoHalfDayHours, scheduledHours)
      : rules.fulltimeAutoHalfDayHours;
    return totalHour < threshold || byTime;
  }

  if (isArticle) {
    const byTime = rules.articleAutoHalfDayByTime && Boolean(inTime && inTime >= rules.articleAutoHalfDayFrom);
    const byHours = rules.articleAutoHalfDayByHours && totalHour < rules.articleAutoHalfDayBelowHours;
    return byTime || byHours;
  }

  return false;
}

/**
 * Scheduled minutes for excess / scheduled-hours totals.
 * Half-day (HD) days use half of the day's scheduled duration.
 */
export function effectiveScheduledMinutesForDay(
  scheduledInTime: string,
  scheduledOutTime: string,
  record?: { halfDay?: boolean; typeOfPresence?: string; status?: string } | null,
  policy?: Pick<AttendanceCalcPolicy, 'halfDayScheduledShare' | 'halfDayUsesHalfSchedule'> | null
): number {
  if (
    !scheduledInTime ||
    !scheduledOutTime ||
    scheduledInTime === '00:00' ||
    scheduledOutTime === '00:00'
  ) {
    return 0;
  }
  let mins = scheduledMinutesBetween(scheduledInTime, scheduledOutTime);
  if (mins > 0 && isHalfDayAttendanceRecord(record)) {
    mins = Math.round(mins * halfDayScheduledShareOf(policy));
  }
  return mins;
}

function actualMinutesBetween(inTime: string, outTime: string): number {
  const [actInH, actInM] = inTime.split(':').map(Number);
  const [actOutH, actOutM] = outTime.split(':').map(Number);
  const actInMin = actInH * 60 + actInM;
  const actOutMin = actOutH * 60 + actOutM;
  return actOutMin - actInMin >= 0
    ? actOutMin - actInMin
    : 24 * 60 + actOutMin - actInMin;
}

export function isNonWorkingDayRecord(
  typeOfPresence: string,
  dateStr: string
): boolean {
  const isSundayDate = new Date(`${dateStr}T12:00:00`).getDay() === 0;
  return (
    typeOfPresence === 'Holiday' ||
    typeOfPresence === 'Sunday' ||
    typeOfPresence === 'Weekoff' ||
    typeOfPresence === 'Weekoff - special allowance' ||
    isSundayDate
  );
}

/**
 * Day-credit / remote presence types must not get a full-day deficit when
 * punches are empty (CP-P / OS-P / WFH). They use day value, not hour shortfall.
 */
function presenceKindForExcess(record: DayExcessRecordLike): 'wfh' | 'osp' | null {
  const t = String(record.typeOfPresence || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!t) return null;
  if (t.includes('wfh') || t.includes('work from home')) return 'wfh';
  if (
    t.includes('outstation') ||
    t.includes('onsite presence') ||
    t === 'os-p' ||
    t.includes('(os-p)')
  ) {
    return 'osp';
  }
  return null;
}

function isValueBasedPresentForExcess(record: DayExcessRecordLike): boolean {
  return presenceKindForExcess(record) != null;
}

function isPresentForExcess(
  record: DayExcessRecordLike,
  inTime: string,
  outTime: string
): boolean {
  if (isValueBasedPresentForExcess(record)) return true;
  return inTime !== '00:00' && outTime !== '00:00' && !!inTime && !!outTime;
}

export type CalculateDayExcessOptions = {
  /**
   * Company holiday (weekday). Punch excess/deficit is 0 — same as daywise
   * “worked on holiday”. Approved extra-work hours are still added.
   */
  isCompanyHoliday?: boolean;
  /** Rules in force for this date. Omitted uses the loaded policy, or the original numbers. */
  policy?: AttendanceCalcPolicy | null;
};

function approvedExtraWorkHours(record: DayExcessRecordLike): number {
  const hours = sumExtraWorkEntryHours(record.extraWorkEntries);
  return hours > 0 ? hours : 0;
}

/** Punch excess plus approved extra-work hours, counted once. */
function withApprovedExtraWork(punchExcess: number, record: DayExcessRecordLike): number {
  return Number((punchExcess + approvedExtraWorkHours(record)).toFixed(2));
}

function isLeaveOrAbsentForExcess(typeOfPresence: string): boolean {
  const typeLower = typeOfPresence.toLowerCase();
  return (
    typeOfPresence === 'Absent' ||
    typeOfPresence === 'On leave' ||
    typeOfPresence === 'Leave' ||
    typeLower.includes('on leave')
  );
}

/** Per-day excess hours from schedule vs punch times (article rules when applicable). */
export function calculateDayExcessHour(
  user: ArticleEmployeeLike,
  dateStr: string,
  record: DayExcessRecordLike,
  scheduledInTime: string,
  scheduledOutTime: string,
  options?: CalculateDayExcessOptions
): number {
  const policy = options?.policy ?? policyForDate(dateStr);
  const typeOfPresence = String(record.typeOfPresence || '');
  const typeLower = typeOfPresence.toLowerCase();
  if (policy.zeroExcessOnLeave && isLeaveOrAbsentForExcess(typeOfPresence) && typeLower !== 'absent') {
    return 0;
  }
  if (policy.zeroExcessOnAbsent && (typeOfPresence === 'Absent' || typeLower === 'absent')) {
    return 0;
  }
  const isSundayDate = new Date(`${dateStr}T12:00:00`).getDay() === 0 || typeLower === 'sunday';
  const isHoliday = Boolean(options?.isCompanyHoliday) || typeOfPresence === 'Holiday';
  const isWeekoff =
    !isSundayDate &&
    !isHoliday &&
    (typeLower === 'weekoff' ||
      typeLower === 'weekoff - special allowance' ||
      typeLower.includes('weekoff') ||
      typeLower.includes('week off'));
  const zeroOffDay =
    (isSundayDate && policy.zeroExcessOnSunday) ||
    (isHoliday && policy.zeroExcessOnHoliday) ||
    (isWeekoff && policy.zeroExcessOnWeekoff);
  if (zeroOffDay) {
    return policy.countApprovedExtraOnOffDays ? withApprovedExtraWork(0, record) : 0;
  }

  const remote = presenceKindForExcess(record);
  if ((remote === 'wfh' && policy.zeroExcessOnWfh) || (remote === 'osp' && policy.zeroExcessOnOsp)) {
    return withApprovedExtraWork(0, record);
  }

  const { inTime, outTime } = effectiveInOut(record);
  const hasSchedule =
    scheduledInTime &&
    scheduledOutTime &&
    scheduledInTime !== '00:00' &&
    scheduledOutTime !== '00:00';

  if (!hasSchedule) {
    return withApprovedExtraWork(0, record);
  }

  const scheduledMinutes = effectiveScheduledMinutesForDay(
    scheduledInTime,
    scheduledOutTime,
    record,
    policy
  );
  const dayScheduledHours = Number((scheduledMinutes / 60).toFixed(2));

  if (!isPresentForExcess(record, inTime, outTime)) {
    return withApprovedExtraWork(-dayScheduledHours, record);
  }

  // CP-P / OS-P / WFH with no punches: day credit only — zero hour excess/deficit.
  if (!inTime || !outTime || inTime === '00:00' || outTime === '00:00') {
    return withApprovedExtraWork(0, record);
  }

  const actualMinutes = actualMinutesBetween(inTime, outTime);
  const articleRules = usesArticleCalculationRules(user, policy);
  let dayExcess = excessHoursForGroup(
    articleRules ? 'article' : 'staff',
    policy,
    scheduledInTime,
    scheduledOutTime,
    inTime,
    outTime,
    actualMinutes,
    scheduledMinutes
  );

  if (isSinglePunch(inTime, outTime) && dayScheduledHours > 0) {
    const extraAlreadyInTotal = approvedExtraWorkHours(record);
    const punchOnlyHours = Math.max(0, Number(record.totalHour ?? 0) - extraAlreadyInTotal);
    dayExcess = Number((punchOnlyHours - dayScheduledHours).toFixed(2));
    if (!articleRules && Math.abs(dayExcess) * 60 <= policy.staffGraceMinutes) {
      dayExcess = 0;
    }
  }

  return withApprovedExtraWork(dayExcess, record);
}

export function applyDayExcessToRecord(
  record: DayExcessRecordLike & { excessHour?: number },
  user: ArticleEmployeeLike,
  dateStr: string,
  scheduledInTime: string,
  scheduledOutTime: string
): void {
  record.excessHour = calculateDayExcessHour(
    user,
    dateStr,
    record,
    scheduledInTime,
    scheduledOutTime
  );
}
