import { isSinglePunch } from '@/lib/attendanceHours';
import {
  ArticleEmployeeLike,
  calculateArticleDayExcessMinutes,
  isArticleEmployee,
} from '@/lib/isArticleEmployee';
import { typeIncludesClientPlace } from '@/lib/resolveDayWorkedHours';

export type DayExcessRecordLike = {
  checkin?: string;
  checkout?: string;
  editedCheckin?: string;
  editedCheckout?: string;
  totalHour?: number;
  typeOfPresence?: string;
  halfDay?: boolean;
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
}): boolean {
  const {
    totalHour,
    scheduledInTime,
    scheduledOutTime,
    scheduleIsHalfDay,
    employmentType,
    isArticle,
    inTime,
  } = options;

  if (scheduleIsHalfDay) return false;

  const emp = String(employmentType || 'fulltime').toLowerCase();
  if (emp === 'fulltime' && !isArticle) {
    const rawMins =
      scheduledInTime &&
      scheduledOutTime &&
      scheduledInTime !== '00:00' &&
      scheduledOutTime !== '00:00'
        ? scheduledMinutesBetween(scheduledInTime, scheduledOutTime)
        : 0;
    const scheduledHours = rawMins > 0 ? rawMins / 60 : 6;
    // Cap at 6h legacy threshold, but never above the day's scheduled length
    const threshold = Math.min(6, scheduledHours);
    return totalHour < threshold;
  }

  if (isArticle) {
    const isAfter1PM = Boolean(inTime && inTime >= '13:00');
    return isAfter1PM || totalHour < 3.5;
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
  record?: { halfDay?: boolean; typeOfPresence?: string; status?: string } | null
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
    mins = Math.round(mins / 2);
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
function isValueBasedPresentForExcess(record: DayExcessRecordLike): boolean {
  const t = String(record.typeOfPresence || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!t) return false;
  if (typeIncludesClientPlace(t)) return true;
  if (
    t.includes('outstation') ||
    t.includes('onsite presence') ||
    t === 'os-p' ||
    t.includes('(os-p)')
  ) {
    return true;
  }
  if (t.includes('wfh') || t.includes('work from home')) return true;
  return false;
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
   * Company holiday (weekday). Excess/deficit is 0 — same as daywise
   * “worked on holiday” (schedule matched to work / no day excess).
   */
  isCompanyHoliday?: boolean;
};

/** Per-day excess hours from schedule vs punch times (article rules when applicable). */
export function calculateDayExcessHour(
  user: ArticleEmployeeLike,
  dateStr: string,
  record: DayExcessRecordLike,
  scheduledInTime: string,
  scheduledOutTime: string,
  options?: CalculateDayExcessOptions
): number {
  const typeOfPresence = String(record.typeOfPresence || '');
  if (options?.isCompanyHoliday || isNonWorkingDayRecord(typeOfPresence, dateStr)) {
    return 0;
  }
  const typeLower = typeOfPresence.toLowerCase();
  if (
    typeOfPresence === 'Absent' ||
    typeOfPresence === 'On leave' ||
    typeOfPresence === 'Leave' ||
    typeLower.includes('on leave')
  ) {
    return 0;
  }

  const { inTime, outTime } = effectiveInOut(record);
  const hasSchedule =
    scheduledInTime &&
    scheduledOutTime &&
    scheduledInTime !== '00:00' &&
    scheduledOutTime !== '00:00';

  if (!hasSchedule) {
    return 0;
  }

  const scheduledMinutes = effectiveScheduledMinutesForDay(
    scheduledInTime,
    scheduledOutTime,
    record
  );
  const dayScheduledHours = Number((scheduledMinutes / 60).toFixed(2));

  if (!isPresentForExcess(record, inTime, outTime)) {
    return -dayScheduledHours;
  }

  // CP-P / OS-P / WFH with no punches: day credit only — zero hour excess/deficit.
  if (!inTime || !outTime || inTime === '00:00' || outTime === '00:00') {
    return 0;
  }

  const actualMinutes = actualMinutesBetween(inTime, outTime);
  let dayExcess = 0;

  if (actualMinutes < scheduledMinutes) {
    dayExcess = -(scheduledMinutes - actualMinutes) / 60;
  } else if (actualMinutes > scheduledMinutes) {
    if (isArticleEmployee(user)) {
      const excessMinutes = calculateArticleDayExcessMinutes(
        scheduledInTime,
        scheduledOutTime,
        inTime,
        outTime
      );
      dayExcess = excessMinutes > 0 ? excessMinutes / 60 : 0;
    } else {
      dayExcess = (actualMinutes - scheduledMinutes) / 60;
    }
  }

  if (isSinglePunch(inTime, outTime) && dayScheduledHours > 0) {
    dayExcess = Number(((record.totalHour ?? 0) - dayScheduledHours).toFixed(2));
  }

  return Number(dayExcess.toFixed(2));
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
