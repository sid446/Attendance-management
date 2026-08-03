import { getScheduledTimes } from '@/lib/scheduleUtils';
import { toYmd, isDateOnOrAfterInactive } from '@/lib/attendanceInactiveFilter';
import { getManagedFieldValueForDate } from '@/lib/userFieldHistory';
import { isValidPunchTime, normalizeTimeToHHmm } from '@/lib/attendanceHours';

export type MisExceptionType =
  | 'missing-attendance'
  | 'missing-biometric'
  | 'early-in-late-out'
  | 'no-schedule'
  | 'no-pl-partner'
  | 'approver-same-as-employee'
  | 'non-asija-email';

export const MIS_EXCEPTION_LABELS: Record<MisExceptionType, string> = {
  'missing-attendance': 'Active — attendance not uploaded for month',
  'missing-biometric': 'Biometric not uploaded (past dates)',
  'early-in-late-out': 'In time ≤ 8 AM or out time ≥ 8 PM',
  'no-schedule': 'Attendance timing schedule not defined',
  'no-pl-partner': 'PL partner not defined (registered or working under partner missing)',
  'approver-same-as-employee': 'Employee email same as attendance email',
  'non-asija-email': 'Email does not end with @asija.in',
};

export const MIS_EXCEPTION_TYPES: MisExceptionType[] = [
  'missing-attendance',
  'missing-biometric',
  'early-in-late-out',
  'no-schedule',
  'no-pl-partner',
  'approver-same-as-employee',
  'non-asija-email',
];

/** 08:00 — in time at or before this is flagged. */
const EARLY_IN_CUTOFF_MINUTES = 8 * 60;
/** 20:00 — out time at or after this is flagged. */
const LATE_OUT_CUTOFF_MINUTES = 20 * 60;

export type EarlyInLateOutReason = 'early-in' | 'late-out' | 'both';

export type EarlyInLateOutHit = {
  date: string;
  inTime?: string;
  outTime?: string;
  reason: EarlyInLateOutReason;
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
  earlyInLateOutHits?: EarlyInLateOutHit[];
};

export type MisBiometricDayEmployee = Pick<
  MisExceptionRow,
  'userId' | 'odId' | 'name' | 'designation' | 'workingUnderPartner'
>;

export type MisBiometricDayRow = {
  date: string;
  employees: MisBiometricDayEmployee[];
};

export type EarlyInLateOutDayEmployee = MisBiometricDayEmployee & {
  inTime?: string;
  outTime?: string;
  reason: EarlyInLateOutReason;
};

export type EarlyInLateOutDayRow = {
  date: string;
  employees: EarlyInLateOutDayEmployee[];
};

function punchTimeToMinutes(time: string): number | null {
  const normalized = normalizeTimeToHHmm(time);
  if (!isValidPunchTime(normalized)) return null;
  const [h, m] = normalized.split(':').map(Number);
  if ([h, m].some((n) => Number.isNaN(n))) return null;
  return h * 60 + m;
}

function getEffectivePunchIn(rec: any): string {
  return normalizeTimeToHHmm(rec?.editedCheckin || rec?.checkin || rec?.inTime);
}

function getEffectivePunchOut(rec: any): string {
  return normalizeTimeToHHmm(rec?.editedCheckout || rec?.checkout || rec?.outTime);
}

/** True when in ≤ 08:00 and/or out ≥ 20:00 on a day record. */
export function getEarlyInLateOutHit(rec: any | undefined): EarlyInLateOutHit | null {
  if (!rec) return null;

  const inTime = getEffectivePunchIn(rec);
  const outTime = getEffectivePunchOut(rec);
  const inMin = punchTimeToMinutes(inTime);
  const outMin = punchTimeToMinutes(outTime);

  const earlyIn = inMin !== null && inMin <= EARLY_IN_CUTOFF_MINUTES;
  const lateOut = outMin !== null && outMin >= LATE_OUT_CUTOFF_MINUTES;
  if (!earlyIn && !lateOut) return null;

  return {
    date: '',
    inTime: inMin !== null ? inTime : undefined,
    outTime: outMin !== null ? outTime : undefined,
    reason: earlyIn && lateOut ? 'both' : earlyIn ? 'early-in' : 'late-out',
  };
}

/** Group early-in / late-out employees by calendar date (chronological). */
export function buildEarlyInLateOutByDay(rows: MisExceptionRow[]): EarlyInLateOutDayRow[] {
  const byDate = new Map<string, EarlyInLateOutDayEmployee[]>();

  for (const row of rows) {
    if (!row.exceptions.includes('early-in-late-out')) continue;
    for (const hit of row.earlyInLateOutHits ?? []) {
      const list = byDate.get(hit.date) ?? [];
      list.push({
        userId: row.userId,
        odId: row.odId,
        name: row.name,
        designation: row.designation,
        workingUnderPartner: row.workingUnderPartner,
        inTime: hit.inTime,
        outTime: hit.outTime,
        reason: hit.reason,
      });
      byDate.set(hit.date, list);
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, employees]) => ({
      date,
      employees: employees.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/** Group missing-biometric employees by calendar date (chronological). */
export function buildBiometricMissingByDay(rows: MisExceptionRow[]): MisBiometricDayRow[] {
  const byDate = new Map<string, MisBiometricDayEmployee[]>();

  for (const row of rows) {
    if (!row.exceptions.includes('missing-biometric')) continue;
    for (const date of row.missingBiometricDates ?? []) {
      const list = byDate.get(date) ?? [];
      list.push({
        userId: row.userId,
        odId: row.odId,
        name: row.name,
        designation: row.designation,
        workingUnderPartner: row.workingUnderPartner,
      });
      byDate.set(date, list);
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, employees]) => ({
      date,
      employees: employees.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function normalizeStr(v: unknown): string {
  return String(v ?? '').trim();
}

function normalizeEmail(v: unknown): string {
  return normalizeStr(v).toLowerCase();
}

/** Employee counts for reporting on this day: before inactiveAsOf (and after joining). */
export function isEmployeeActiveOnDate(user: any, dateKey: string): boolean {
  if (!user) return false;
  const day = dateKey.slice(0, 10);
  if (user.inactiveAsOf && isDateOnOrAfterInactive(day, user.inactiveAsOf)) {
    return false;
  }
  // Deactivated with no cutoff → inactive for all report days
  if (user.isActive === false && !user.inactiveAsOf) return false;
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

const ASIJA_EMAIL_SUFFIX = '@asija.in';

/** Employee login email must end with @asija.in. */
export function isAsijaEmail(email: unknown): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return normalized.endsWith(ASIJA_EMAIL_SUFFIX);
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

export function findEarlyInLateOutDates(
  user: any,
  records: Record<string, any>,
  monthYear: string,
  todayYmd: string
): EarlyInLateOutHit[] {
  const hits: EarlyInLateOutHit[] = [];

  for (const dateKey of datesInMonthYear(monthYear)) {
    if (dateKey >= todayYmd) continue;
    if (!isEmployeeActiveOnDate(user, dateKey)) continue;

    const hit = getEarlyInLateOutHit(records[dateKey]);
    if (hit) {
      hits.push({ ...hit, date: dateKey });
    }
  }

  return hits;
}

/** True when no attendance month document exists, or it has zero day records. */
export function isAttendanceMissingForMonth(
  hasAttendanceDoc: boolean,
  records: Record<string, any>
): boolean {
  if (!hasAttendanceDoc) return true;
  return Object.keys(records || {}).length === 0;
}

export function computeMisExceptionsForUser(
  user: any,
  opts: {
    monthYear: string;
    todayYmd: string;
    holidayDateSet: Set<string>;
    records: Record<string, any>;
    hasAttendanceDoc: boolean;
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

  const attendanceMissing =
    isAttendanceMissingForMonth(opts.hasAttendanceDoc, opts.records) &&
    missingBio.length > 0;

  if (attendanceMissing) {
    types.push('missing-attendance');
  } else if (missingBio.length > 0) {
    types.push('missing-biometric');
  }

  const earlyInLateOut = findEarlyInLateOutDates(
    user,
    opts.records,
    opts.monthYear,
    opts.todayYmd
  );
  if (earlyInLateOut.length > 0) {
    types.push('early-in-late-out');
  }

  if (!hasAttendanceScheduleDefined(user, opts.partnerAsOf)) types.push('no-schedule');
  if (!hasPlPartnerDefined(user, opts.partnerAsOf)) types.push('no-pl-partner');
  if (isAttendanceApproverSameAsEmployee(user)) types.push('approver-same-as-employee');
  if (!isAsijaEmail(user?.email)) types.push('non-asija-email');

  return types;
}
