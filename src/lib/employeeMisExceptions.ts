import { getScheduledTimes } from '@/lib/scheduleUtils';
import { toYmd, isDateOnOrAfterInactive } from '@/lib/attendanceInactiveFilter';
import { getManagedFieldValueForDate } from '@/lib/userFieldHistory';

export type MisExceptionType =
  | 'missing-biometric'
  | 'no-schedule'
  | 'no-pl-partner'
  | 'approver-same-as-employee';

export const MIS_EXCEPTION_LABELS: Record<MisExceptionType, string> = {
  'missing-biometric': 'Biometric not uploaded (past dates)',
  'no-schedule': 'Attendance timing schedule not defined',
  'no-pl-partner': 'PL partner not defined (registered or working under partner missing)',
  'approver-same-as-employee': 'Employee email same as attendance email',
};

export type MisExceptionRow = {
  userId: string;
  odId: string;
  name: string;
  email: string;
  designation: string;
  workingUnderPartner: string;
  registeredUnderPartner: string;
  attendanceEmail: string;
  exceptions: MisExceptionType[];
  missingBiometricDates?: string[];
};

function normalizeStr(v: unknown): string {
  return String(v ?? '').trim();
}

function normalizeEmail(v: unknown): string {
  return normalizeStr(v).toLowerCase();
}

/** Employee is in master as active and not yet on/after inactive cutoff for the given day. */
export function isEmployeeActiveOnDate(user: any, dateKey: string): boolean {
  if (!user?.isActive) return false;
  const day = dateKey.slice(0, 10);
  if (user.inactiveAsOf && isDateOnOrAfterInactive(day, user.inactiveAsOf)) {
    return false;
  }
  const joining = user.joiningDate ? toYmd(user.joiningDate) : '';
  if (joining && day < joining) return false;
  return true;
}

const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

function normalizeScheduleDate(d: unknown): number {
  if (!d) return 0;
  if (typeof d === 'string') return new Date(d).getTime();
  if (d instanceof Date) return d.getTime();
  if (typeof d === 'object' && d !== null && '$date' in d) {
    return new Date((d as { $date: string }).$date).getTime();
  }
  return 0;
}

/** At least one weekday has in/out times (not a blank or all-holiday placeholder row). */
function dailyHasWorkTiming(daily: unknown): boolean {
  if (!daily || typeof daily !== 'object') return false;
  for (const day of WEEKDAY_KEYS) {
    const sch = (daily as Record<string, { inTime?: string; isHoliday?: boolean }>)[day];
    const inTime = normalizeStr(sch?.inTime);
    if (inTime && !sch?.isHoliday) return true;
  }
  return false;
}

/**
 * True when the user document has an attendance timing schedule defined
 * (schedules[] or seasonalSchedules[] with real weekday in/out times).
 * Schema legacy defaults alone do not count.
 */
export function hasAttendanceScheduleDefined(user: any, asOf: Date = new Date()): boolean {
  const asOfTime = asOf.getTime();

  if (Array.isArray(user?.seasonalSchedules)) {
    for (const entry of user.seasonalSchedules) {
      if (normalizeScheduleDate(entry?.effectiveFrom) > asOfTime) continue;
      if (dailyHasWorkTiming(entry?.daily)) return true;
    }
  }

  if (Array.isArray(user?.schedules) && user.schedules.length > 0) {
    const applicable = user.schedules
      .filter((entry: { effectiveFrom?: unknown }) => {
        const t = normalizeScheduleDate(entry?.effectiveFrom);
        return t > 0 && t <= asOfTime;
      })
      .sort(
        (a: { effectiveFrom?: unknown }, b: { effectiveFrom?: unknown }) =>
          normalizeScheduleDate(b.effectiveFrom) - normalizeScheduleDate(a.effectiveFrom)
      )[0];

    if (applicable && dailyHasWorkTiming(applicable.daily)) return true;
  }

  return false;
}

/**
 * PL partner is defined only when both Registered Under Partner and
 * Working Under Partner are set (field history respected as of `asOf`).
 */
export function hasPlPartnerDefined(user: any, asOf: Date = new Date()): boolean {
  const registered =
    getManagedFieldValueForDate(user, 'registeredUnderPartner', asOf) ||
    normalizeStr(user?.registeredUnderPartner);
  const working =
    getManagedFieldValueForDate(user, 'workingUnderPartner', asOf) ||
    normalizeStr(user?.workingUnderPartner);
  return registered.length > 0 && working.length > 0;
}

/** Attendance approval issue: employee email equals attendance email (self-approval). */
export function isAttendanceApproverSameAsEmployee(user: any): boolean {
  const attendanceEmail = normalizeEmail(user?.attendanceEmail);
  const employeeEmail = normalizeEmail(user?.email);
  if (!attendanceEmail || !employeeEmail) return false;
  return attendanceEmail === employeeEmail;
}

function hasValidPunch(rec: any): boolean {
  const checkin = normalizeStr(rec?.editedCheckin || rec?.checkin);
  const checkout = normalizeStr(rec?.editedCheckout || rec?.checkout);
  const inOk = !!checkin && checkin !== '00:00';
  const outOk = !!checkout && checkout !== '00:00';
  return inOk || outOk;
}

function isBiometricPresentForDay(rec: any | undefined): boolean {
  if (!rec) return false;
  const type = normalizeStr(rec?.typeOfPresence);
  if (type === 'ThumbMachine') return true;
  return hasValidPunch(rec);
}

function isLeaveOrHolidayRecord(rec: any | undefined, typeFromSchedule: { isHoliday: boolean }): boolean {
  if (typeFromSchedule.isHoliday) return true;
  if (!rec) return false;
  const type = normalizeStr(rec?.typeOfPresence);
  return (
    type === 'Holiday' ||
    type === 'Sunday' ||
    type === 'Weekoff' ||
    type === 'Weekoff - special allowance' ||
    type === 'On leave' ||
    type === 'Leave'
  );
}

/** List YYYY-MM-DD keys for a calendar month. */
export function datesInMonthYear(monthYear: string): string[] {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m) return [];
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

export function findMissingBiometricDates(
  user: any,
  records: Record<string, any>,
  holidayDateSet: Set<string>,
  monthYear: string,
  todayYmd: string
): string[] {
  const missing: string[] = [];

  for (const dateKey of datesInMonthYear(monthYear)) {
    if (dateKey >= todayYmd) continue;
    if (!isEmployeeActiveOnDate(user, dateKey)) continue;

    const dow = new Date(dateKey).getDay();
    if (dow === 0) continue;
    if (holidayDateSet.has(dateKey)) continue;

    const sched = getScheduledTimes(user, dateKey);
    const rec = records[dateKey];
    if (isLeaveOrHolidayRecord(rec, sched)) continue;
    if (sched.isHoliday) continue;

    if (!isBiometricPresentForDay(rec)) {
      missing.push(dateKey);
    }
  }

  return missing;
}

export function computeMisExceptionsForUser(
  user: any,
  opts: {
    monthYear: string;
    todayYmd: string;
    holidayDateSet: Set<string>;
    records: Record<string, any>;
    partnerAsOf: Date;
  }
): MisExceptionType[] {
  const types: MisExceptionType[] = [];

  if (!user?.isActive) return types;

  const missingBio = findMissingBiometricDates(
    user,
    opts.records,
    opts.holidayDateSet,
    opts.monthYear,
    opts.todayYmd
  );
  if (missingBio.length > 0) types.push('missing-biometric');

  if (!hasAttendanceScheduleDefined(user, opts.partnerAsOf)) types.push('no-schedule');
  if (!hasPlPartnerDefined(user, opts.partnerAsOf)) types.push('no-pl-partner');
  if (isAttendanceApproverSameAsEmployee(user)) types.push('approver-same-as-employee');

  return types;
}
