/**
 * Mirrors Attendance Summary table calculations in SummarySection.tsx
 * so the employee portal can show the same numbers for a single month.
 */
import type { AttendanceSummaryView, DailySchedule, ScheduleEntry, ScheduleTime, User } from '@/types/ui';
import { isSinglePunch } from './attendanceHours';
import { getScheduledTimes } from './scheduleUtils';

import { calculateDayExcessHour } from './calculateDayExcessHour';
import { applyDayAllowanceToRawExcess, applyExcessHourAllowance, lookupExcessAllowance, lookupExcessDisplay, type ExcessAllowanceLookup, type ExcessDayAllowanceLookup, type ExcessDisplayLookup } from './excessHourAllowance';
import {
  formatExtraWorkEntriesTimeSummary,
  formatRecordPunchTimeRange,
  getRecordPunchHours,
  getRecordPunchTimeRange,
  sumExtraWorkEntryHours,
} from './extraWorkRequest';
import { isArticleEmployee } from './isArticleEmployee';

/** True when the ISO date (YYYY-MM-DD) falls on a Sunday. */
export function isSundayDate(dateStr: string): boolean {
  const d = new Date(`${dateStr}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.getDay() === 0;
}

/** Holidays list detail: Sundays are week off, not company holiday. */
export function holidayMetricDetailLabel(dateStr: string): string {
  return isSundayDate(dateStr) ? 'Week off' : 'Company holiday';
}

/** Calendar badge: backend stores Sundays as Holiday; show as week off in UI only. */
export function calendarStatusLabelForDay(
  status: string,
  typeOfPresence: string | undefined,
  date: Date
): string {
  if (date.getDay() !== 0) return status;
  const t = String(typeOfPresence || '').toLowerCase();
  const isWeeklyOffType =
    status === 'Holiday' ||
    status === 'Week Off' ||
    t === 'holiday' ||
    t === 'sunday' ||
    t === 'weekoff' ||
    t.includes('week off');
  if (
    isWeeklyOffType &&
    status !== 'Present' &&
    status !== 'HalfDay' &&
    status !== 'Half Day (HD)'
  ) {
    return 'Week Off';
  }
  return status;
}

/** Short mobile badge for week off vs company holiday. */
export function calendarStatusShortLabel(status: string): string {
  if (status === 'Week Off') return 'Off';
  if (status === 'Holiday') return 'Hol';
  return status;
}

export interface SummaryMetricsOptions {
  /** Team leaderboard: only in or only out counts as absent (not present / half day). */
  treatSinglePunchAsAbsent?: boolean;
  /** Partner-approved cap for positive excess (single value). */
  allowedExcessCap?: number | null;
  /** Batch lookup map keyed by userId:monthYear. */
  excessAllowanceMap?: ExcessAllowanceLookup | null;
  /** Day-wise partner-approved display excess keyed by userId:monthYear. */
  excessDisplayMap?: ExcessDisplayLookup | null;
  /** Partner-set allowed hours per day (userId:YYYY-MM-DD). */
  excessDayAllowanceMap?: ExcessDayAllowanceLookup | null;
}

type EmploymentTypeHistory = { employmentType: string; effectiveFrom: string | Date };

export function formatHoursMinutes(hours: number): string {
  const absHours = Math.abs(hours);
  if (absHours === 0) return '0:00';
  const totalMinutes = Math.round(absHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const sign = hours < 0 ? '-' : '';
  return `${sign}${h}:${m.toString().padStart(2, '0')}`;
}

/** Parse H:MM (same as formatHoursMinutes) or plain decimal hours. Returns null if invalid. */
export function parseHoursMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const [hPart, mPart] = trimmed.split(':');
    if (mPart == null || mPart.includes(':')) return null;
    const h = parseInt(hPart, 10);
    const m = parseInt(mPart, 10);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0 || m >= 60) return null;
    return Number((h + m / 60).toFixed(2));
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(2));
}

/** Like parseHoursMinutes but allows a leading minus (e.g. -1:30). */
export function parseSignedHoursMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith('-') || trimmed.startsWith('−');
  const body = negative ? trimmed.replace(/^[-−]/, '').trim() : trimmed;
  if (!body) return null;
  const magnitude = parseHoursMinutes(body);
  if (magnitude == null) return null;
  return Number((negative ? -magnitude : magnitude).toFixed(2));
}

export function monthDateStrings(monthYear: string): string[] {
  const [ys, ms] = monthYear.split('-');
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  if (!y || !m) return [];
  const daysInMonth = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return out;
}

export function getEmploymentTypeForDate(user: User | undefined, date: Date): string | undefined {
  if (!user) return undefined;
  const history: EmploymentTypeHistory[] | undefined = (user as any).employmentTypeHistory;
  if (history && Array.isArray(history) && history.length > 0) {
    const sorted = history
      .slice()
      .sort(
        (a, b) =>
          new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
      );
    const found = sorted.find((e) => new Date(e.effectiveFrom) <= date);
    return found?.employmentType;
  }
  return user.employmentType;
}

/** Matches upload/API rules: halftime employees are never late or half-day. */
export function isHalftimeEmploymentType(employmentType: string | undefined): boolean {
  const t = String(employmentType || '').toLowerCase();
  return t === 'halftime' || t.includes('half');
}

export function getApplicableSchedule(
  item: AttendanceSummaryView,
  user: User | undefined,
  date?: string
): ScheduleEntry | undefined {
  const targetDate = date ? new Date(date) : new Date(item.monthYear + '-01');

  if (item.schedules && !date) {
    return item.schedules;
  }

  if (user?.schedules && Array.isArray(user.schedules)) {
    const applicable = user.schedules
      .filter((s: any) => new Date(s.effectiveFrom) <= targetDate)
      .sort(
        (a: any, b: any) =>
          new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
      )[0];
    return applicable || undefined;
  }

  return undefined;
}

function hasValidInOutForExcess(rec: any): boolean {
  const inTime = rec?.editedCheckin || rec?.checkin;
  const outTime = rec?.editedCheckout || rec?.checkout;
  return !!(inTime && inTime !== '00:00' && outTime && outTime !== '00:00');
}

function getEffectivePunches(rec: any): { checkin: string; checkout: string } {
  return {
    checkin: String(rec?.editedCheckin || rec?.checkin || '').trim(),
    checkout: String(rec?.editedCheckout || rec?.checkout || '').trim(),
  };
}

function isSinglePunchRecord(rec: any): boolean {
  const { checkin, checkout } = getEffectivePunches(rec);
  return isSinglePunch(checkin, checkout);
}

/** Single-sided in/out punch on a working day (same rule as employee calendar "Missed Entry"). */
export function isMissedEntryRecord(rec: {
  typeOfPresence?: string;
  checkin?: string;
  checkout?: string;
  editedCheckin?: string;
  editedCheckout?: string;
} | null | undefined): boolean {
  if (!rec) return false;
  const type = String(rec.typeOfPresence || '');
  const typeLower = type.toLowerCase();
  if (
    type === 'Absent' ||
    type === 'Holiday' ||
    type === 'Leave' ||
    type === 'On leave' ||
    typeLower.includes('leave') ||
    typeLower.includes('holiday') ||
    typeLower.includes('weekoff') ||
    typeLower.includes('week off')
  ) {
    return false;
  }
  const { checkin, checkout } = getEffectivePunches(rec);
  const inMarked = !!checkin && checkin !== '00:00';
  const outMarked = !!checkout && checkout !== '00:00';
  return inMarked !== outMarked;
}

/** WFH / outstation etc. may not require paired machine punches. */
function isExemptFromSinglePunchAbsentRule(rec: any): boolean {
  const type = String(rec?.typeOfPresence || '');
  const typeLower = type.toLowerCase();
  return (
    type === 'Holiday' ||
    type === 'Sunday' ||
    type === 'Weekoff' ||
    type === 'Weekoff - special allowance' ||
    type === 'Leave' ||
    type === 'On leave' ||
    type === 'Absent' ||
    typeLower.includes('weekoff') ||
    typeLower.includes('wfh') ||
    typeLower.includes('outstation') ||
    typeLower.includes('clientplace')
  );
}

function isWorkingDayForMetrics(
  dateStr: string,
  rec: any,
  holidayDates: Set<string>
): boolean {
  const d = new Date(dateStr);
  if (d.getDay() === 0) return false;
  if (holidayDates.has(dateStr)) return false;
  if (typeof rec?.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) {
    return false;
  }
  return true;
}

function isSinglePunchAbsentDay(
  dateStr: string,
  rec: any,
  holidayDates: Set<string>,
  options?: SummaryMetricsOptions
): boolean {
  if (!options?.treatSinglePunchAsAbsent) return false;
  if (!isWorkingDayForMetrics(dateStr, rec, holidayDates)) return false;
  if (isExemptFromSinglePunchAbsentRule(rec)) return false;
  return isSinglePunchRecord(rec);
}

/** Days that count toward Sched. / excess (worked vs scheduled). */
export function isExcessEligibleRecord(dateStr: string, recAny: any): boolean {
  const rec: any = recAny || {};
  const type = String(rec.typeOfPresence || '').trim();
  const typeLower = type.toLowerCase();
  const d = new Date(dateStr);

  if (Number.isNaN(d.getTime())) return false;
  if (d.getDay() === 0) return false;

  if (type === 'Holiday' || type === 'Sunday' || type === 'Weekoff' || type === 'Absent') {
    return false;
  }
  if (type === 'On leave' || type === 'Leave') return false;
  if (typeLower.includes('weekoff')) return false;

  const hasAnyPunch = () => {
    const inTime = rec?.editedCheckin || rec?.checkin;
    const outTime = rec?.editedCheckout || rec?.checkout;
    return (
      !!(inTime && inTime !== '00:00') || !!(outTime && outTime !== '00:00')
    );
  };

  const hasWorkActivity = () =>
    hasValidInOutForExcess(rec) ||
    hasAnyPunch() ||
    Number(rec.totalHour || 0) > 0 ||
    Number(rec.value || 0) > 0;

  if (type === 'ThumbMachine') {
    return hasValidInOutForExcess(rec) || Number(rec.totalHour || 0) > 0;
  }

  // Default upload / thumb status for most employees
  if (type === 'Present') {
    return hasWorkActivity();
  }

  if (
    type === 'Present - in office - weekdays' ||
    type === 'Present - in office - weekoff' ||
    typeLower.includes('present - in office')
  ) {
    return true;
  }

  if (
    type === 'Half Day - weekdays' ||
    type === 'Half Day (HD)' ||
    type === 'Half Day - weekoff'
  ) {
    return true;
  }

  if (typeLower.includes('present')) {
    return hasWorkActivity();
  }

  return false;
}



/** Same late rules as admin Summary (schedule-aware, skips weekoff/holiday/halftime). */
export function isLateArrivalLikeSummary(
  dateStr: string,
  rec: {
    checkin?: string;
    editedCheckin?: string;
    inTime?: string;
    typeOfPresence?: string;
  },
  user: User | undefined
): boolean {
  if (!user) return false;

  const effectiveCheckin = rec.editedCheckin || rec.checkin || rec.inTime;
  if (!effectiveCheckin || effectiveCheckin === '00:00') return false;

  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getDay() === 0) return false;

  const type = String(rec.typeOfPresence || '');
  if (type === 'Holiday') return false;
  if (type.toLowerCase().includes('weekoff')) return false;

  if (isHalftimeEmploymentType(getEmploymentTypeForDate(user, d))) return false;

  const schedule = getScheduledTimes(user, d);
  if (!schedule.inTime || schedule.inTime === '00:00') return false;

  return effectiveCheckin > schedule.inTime;
}

export function getLateCountLikeSummary(item: AttendanceSummaryView, user: User | undefined): number {
  if (!user) return 0;
  const records = item.recordDetails || {};
  let count = 0;

  Object.entries(records).forEach(([date, rec]) => {
    if (isLateArrivalLikeSummary(date, rec as any, user)) count += 1;
  });

  return count;
}

export function getHalfDayCountLikeSummary(
  item: AttendanceSummaryView,
  user: User | undefined,
  options?: SummaryMetricsOptions,
  holidayDates?: Set<string>
): number {
  const records = item.recordDetails || {};
  let n = 0;
  const holidays = holidayDates ?? new Set<string>();

  Object.entries(records).forEach(([date, rec]) => {
    const r = rec as any;
    const effectiveCheckin = r.editedCheckin || r.checkin;
    const effectiveCheckout = r.editedCheckout || r.checkout;
    const isBothZero =
      !(effectiveCheckin && effectiveCheckin !== '00:00') &&
      !(effectiveCheckout && effectiveCheckout !== '00:00');
    const d = new Date(date);
    const empTypeHalfDay = getEmploymentTypeForDate(user, d);
    if (isHalftimeEmploymentType(empTypeHalfDay)) return;
    if (isSinglePunchAbsentDay(date, r, holidays, options)) return;
    if (r.halfDay && r.typeOfPresence !== 'Holiday' && !isBothZero) {
      n += 1;
    }
  });

  return n;
}

/** Paid full-day leave (value = 1) — counted under Leave, not Absent. */
function isPaidFullLeaveRecord(recAny: unknown): boolean {
  const rec = recAny as { typeOfPresence?: string; value?: unknown };
  return (
    (rec?.typeOfPresence === 'On leave' || rec?.typeOfPresence === 'Leave') &&
    Number(rec?.value) === 1
  );
}

export function getAbsentCountLikeSummary(
  item: AttendanceSummaryView,
  holidayDates: Set<string>,
  options?: SummaryMetricsOptions
): number {
  let calcAbsent = 0;
  Object.entries(item.recordDetails || {}).forEach(([dateStr, recAny]) => {
    const rec: any = recAny || {};
    const d = new Date(dateStr);
    if (d.getDay() === 0) return;
    if (holidayDates.has(dateStr)) return;
    if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) {
      return;
    }
    if (rec.typeOfPresence === 'Absent') {
      calcAbsent += 1;
      return;
    }
    if (rec.typeOfPresence === 'Leave' || rec.typeOfPresence === 'On leave') {
      if (!isPaidFullLeaveRecord(rec)) {
        calcAbsent += 1;
      }
      return;
    }

    if (isSinglePunchAbsentDay(dateStr, rec, holidayDates, options)) {
      calcAbsent += 1;
      return;
    }

    // Presence types that shouldn't be absent even with 0 hours
    const typeLower = String(rec.typeOfPresence || '').toLowerCase();
    const isPresenceType = typeLower.includes('wfh') || 
                           typeLower.includes('outstation') || 
                           typeLower.includes('clientplace') || 
                           typeLower.includes('half day') ||
                           rec.halfDay;

    if (isPresenceType) return;

    const effectiveCheckin = rec.editedCheckin || rec.checkin;
    const effectiveCheckout = rec.editedCheckout || rec.checkout;
    if (
      (!effectiveCheckin || effectiveCheckin === '00:00') &&
      (!effectiveCheckout || effectiveCheckout === '00:00')
    ) {
      calcAbsent += 1;
    }
  });
  return calcAbsent;
}

export function getLeaveConsumedFullDays(item: AttendanceSummaryView): number {
  let fullLeaveDays = 0;
  Object.values(item.recordDetails || {}).forEach((record: any) => {
    if (
      (record.typeOfPresence === 'On leave' || record.typeOfPresence === 'Leave') &&
      record.value === 1
    ) {
      fullLeaveDays++;
    }
  });
  return fullLeaveDays;
}

/**
 * Present count as recalculated in admin `page.tsx` fetchSummaries from recordDetails
 * (not raw API summary.totalPresent).
 */
export function getTotalPresentLikeAdminSummary(
  item: AttendanceSummaryView,
  options?: SummaryMetricsOptions,
  holidayDates?: Set<string>
): number {
  const holidays = holidayDates ?? new Set<string>();
  let totalPresent = 0;
  for (const [dateStr, rec] of Object.entries(item.recordDetails || {}) as [string, any][]) {
    const type = String(rec?.typeOfPresence || '');
    const typeLower = type.toLowerCase();
    const checkin = String(rec?.editedCheckin || rec?.checkin || '').trim();
    const checkout = String(rec?.editedCheckout || rec?.checkout || '').trim();
    const totalHour = Number(rec?.totalHour || 0);
    const isHolidayLike =
      type === 'Holiday' ||
      type === 'Sunday' ||
      type === 'Weekoff' ||
      type === 'Weekoff - special allowance';

    if (type === 'Leave' || type === 'On leave') {
      continue;
    }

    if (type === 'Absent') {
      continue;
    }

    if (isHolidayLike) {
      continue;
    }

    if (isSinglePunchAbsentDay(dateStr, rec, holidays, options)) {
      continue;
    }

    const hasValidIn = checkin && checkin !== '00:00';
    const hasValidOut = checkout && checkout !== '00:00';
    const isPresenceType = typeLower.includes('wfh') || 
                           typeLower.includes('outstation') || 
                           typeLower.includes('clientplace') || 
                           typeLower.includes('half day') ||
                           rec?.halfDay;

    if (isPresenceType || hasValidIn || hasValidOut || totalHour > 0) {
      totalPresent += 1;
    }
  }
  return totalPresent;
}

/**
 * Same day gate as Sched. column: excess-eligible + valid employee schedule in/out.
 */
export function isDayIncludedInScheduledCalc(
  user: User,
  dateStr: string,
  recAny: unknown
): boolean {
  if (!recAny || !isExcessEligibleRecord(dateStr, recAny)) return false;
  const dateObj = new Date(dateStr);
  const schedule = getScheduledTimes(user, dateObj);
  if (
    schedule.isHoliday ||
    !schedule.inTime ||
    !schedule.outTime ||
    schedule.inTime === '00:00' ||
    schedule.outTime === '00:00'
  ) {
    return false;
  }
  return true;
}

/** Worked hours summed only on days that count toward Sched. (same dates). */
export function getWorkedHoursMatchingScheduledDays(
  item: AttendanceSummaryView,
  user: User | undefined,
  dateList: string[]
): number {
  if (!user) return 0;
  let total = 0;
  dateList.forEach((dateStr) => {
    const rec = item.recordDetails?.[dateStr];
    if (!isDayIncludedInScheduledCalc(user, dateStr, rec)) return;
    total += Number(rec?.totalHour || 0);
  });
  return Number(total.toFixed(2));
}

export function buildSummaryPeriodDateList(
  filter: string | { start: string; end: string } | { startDate: string; endDate: string },
  startDate: Date | null,
  endDate: Date | null
): string[] {
  if (startDate && endDate) {
    const dates: string[] = [];
    const d = new Date(startDate);
    const end = new Date(endDate);
    while (d <= end) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }
  if (typeof filter === 'string') {
    return monthDateStrings(filter);
  }
  if ('start' in filter && 'end' in filter) {
    const dates: string[] = [];
    const [startY, startM] = filter.start.split('-').map(Number);
    const [endY, endM] = filter.end.split('-').map(Number);
    let y = startY;
    let m = startM;
    while (y < endY || (y === endY && m <= endM)) {
      dates.push(...monthDateStrings(`${y}-${String(m).padStart(2, '0')}`));
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return dates;
  }
  return [];
}

/**
 * Sum of per-day `totalHour` on scheduled days when user + dateList are provided;
 * otherwise legacy sum excluding holiday-like rows only.
 */
export function getTotalHourLikeAdminSummary(
  item: AttendanceSummaryView,
  user?: User,
  dateList?: string[]
): number {
  if (user && dateList && dateList.length > 0) {
    return getWorkedHoursMatchingScheduledDays(item, user, dateList);
  }
  let sum = 0;
  for (const rec of Object.values(item.recordDetails || {}) as any[]) {
    const type = String(rec?.typeOfPresence || '');
    const isHolidayLike =
      type === 'Holiday' ||
      type === 'Sunday' ||
      type === 'Weekoff' ||
      type === 'Weekoff - special allowance';
    if (!isHolidayLike) {
      sum += Number(rec?.totalHour || 0);
    }
  }
  return Number(sum.toFixed(2));
}

/** Per-day worked hours on scheduled days (or non–holiday-like fallback), chronological. */
export function getDailyWorkedHoursSeries(
  item: AttendanceSummaryView,
  user?: User,
  monthYear?: string
): { date: string; hours: number }[] {
  const dateList = user && monthYear ? monthDateStrings(monthYear) : null;
  const rows: { date: string; hours: number }[] = [];

  if (dateList && user) {
    for (const dateStr of dateList) {
      const rec = item.recordDetails?.[dateStr];
      if (!isDayIncludedInScheduledCalc(user, dateStr, rec)) continue;
      const hours = Number(rec?.totalHour || 0);
      if (hours <= 0) continue;
      rows.push({ date: dateStr, hours });
    }
    return rows;
  }

  const entries = Object.entries(item.recordDetails || {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  for (const [dateStr, rec] of entries) {
    const type = String((rec as { typeOfPresence?: string })?.typeOfPresence || '');
    const isHolidayLike =
      type === 'Holiday' ||
      type === 'Sunday' ||
      type === 'Weekoff' ||
      type === 'Weekoff - special allowance';
    if (isHolidayLike) continue;
    rows.push({
      date: dateStr,
      hours: Number((rec as { totalHour?: number })?.totalHour || 0),
    });
  }
  return rows;
}

/** Sum approved extra-work hours across dates in a period. */
export function getExtraWorkHoursTotalForPeriod(
  item: AttendanceSummaryView,
  dateList: string[]
): number {
  let total = 0;
  for (const dateStr of dateList) {
    const rec = item.recordDetails?.[dateStr];
    total += sumExtraWorkEntryHours(
      (rec as { extraWorkEntries?: Array<{ hours?: number; startTime?: string; endTime?: string }> } | undefined)
        ?.extraWorkEntries
    );
  }
  return Number(total.toFixed(2));
}

export function getTotalDaysInRecords(item: AttendanceSummaryView): number {
  return Object.keys(item.recordDetails || {}).length;
}

export function getHolidaysInRecordsCount(
  item: AttendanceSummaryView,
  holidayDates: Set<string>
): number {
  let holidayCount = 0;
  Object.keys(item.recordDetails || {}).forEach((dateStr) => {
    const d = new Date(dateStr);
    if (d.getDay() === 0) holidayCount++;
    else if (holidayDates.has(dateStr)) holidayCount++;
  });
  return holidayCount;
}

export function getWorkingDaysInRecordsCount(
  item: AttendanceSummaryView,
  holidayDates: Set<string>
): number {
  const records = item.recordDetails || {};
  return Object.entries(records).filter(([dateStr, rec]: [string, any]) =>
    isWorkingDayInRecords(dateStr, rec, holidayDates)
  ).length;
}

function isWorkingDayInRecords(
  dateStr: string,
  rec: { typeOfPresence?: string },
  holidayDates: Set<string>
): boolean {
  const d = new Date(dateStr);
  if (d.getDay() === 0) return false;
  if (holidayDates.has(dateStr)) return false;
  if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) {
    return false;
  }
  return true;
}

function isHolidayInRecords(dateStr: string, holidayDates: Set<string>): boolean {
  const d = new Date(dateStr);
  if (d.getDay() === 0) return true;
  return holidayDates.has(dateStr);
}

function isAbsentDayInRecords(
  dateStr: string,
  recAny: unknown,
  holidayDates: Set<string>
): boolean {
  const rec: any = recAny || {};
  const d = new Date(dateStr);
  if (d.getDay() === 0) return false;
  if (holidayDates.has(dateStr)) return false;
  if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) {
    return false;
  }
  if (rec.typeOfPresence === 'Absent') return true;
  if (rec.typeOfPresence === 'Leave' || rec.typeOfPresence === 'On leave') {
    return !isPaidFullLeaveRecord(rec);
  }

  const typeLower = String(rec.typeOfPresence || '').toLowerCase();
  const isPresenceType =
    typeLower.includes('wfh') ||
    typeLower.includes('outstation') ||
    typeLower.includes('clientplace') ||
    typeLower.includes('half day') ||
    rec.halfDay;
  if (isPresenceType) return false;

  const effectiveCheckin = rec.editedCheckin || rec.checkin;
  const effectiveCheckout = rec.editedCheckout || rec.checkout;
  return (
    (!effectiveCheckin || effectiveCheckin === '00:00') &&
    (!effectiveCheckout || effectiveCheckout === '00:00')
  );
}

function isPresentDayInRecords(recAny: unknown): boolean {
  const rec: any = recAny || {};
  const type = String(rec?.typeOfPresence || '');
  const typeLower = type.toLowerCase();
  const checkin = String(rec?.editedCheckin || rec?.checkin || '').trim();
  const checkout = String(rec?.editedCheckout || rec?.checkout || '').trim();
  const totalHour = Number(rec?.totalHour || 0);
  const isHolidayLike =
    type === 'Holiday' ||
    type === 'Sunday' ||
    type === 'Weekoff' ||
    type === 'Weekoff - special allowance';

  if (type === 'Leave' || type === 'On leave' || type === 'Absent' || isHolidayLike) {
    return false;
  }

  const hasValidIn = checkin && checkin !== '00:00';
  const hasValidOut = checkout && checkout !== '00:00';
  const isPresenceType =
    typeLower.includes('wfh') ||
    typeLower.includes('outstation') ||
    typeLower.includes('clientplace') ||
    typeLower.includes('half day') ||
    rec?.halfDay;

  return !!(isPresenceType || hasValidIn || hasValidOut || totalHour > 0);
}

function isHalfDayInRecords(dateStr: string, recAny: unknown, user: User | undefined): boolean {
  const r = recAny as any;
  const effectiveCheckin = r?.editedCheckin || r?.checkin;
  const effectiveCheckout = r?.editedCheckout || r?.checkout;
  const isBothZero =
    !(effectiveCheckin && effectiveCheckin !== '00:00') &&
    !(effectiveCheckout && effectiveCheckout !== '00:00');
  const d = new Date(dateStr);
  const empTypeHalfDay = getEmploymentTypeForDate(user, d);
  if (isHalftimeEmploymentType(empTypeHalfDay)) return false;
  return !!(r?.halfDay && r?.typeOfPresence !== 'Holiday' && !isBothZero);
}

function isFullLeaveDayInRecords(recAny: unknown): boolean {
  return isPaidFullLeaveRecord(recAny);
}

export type SummaryMetricDayKind =
  | 'total-days'
  | 'holidays'
  | 'working-days'
  | 'present'
  | 'half-days'
  | 'absent'
  | 'late'
  | 'leave';

export interface SummaryMetricDayRow {
  date: string;
  dateLabel: string;
  detail?: string;
}

function formatSummaryDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function getSummaryMetricDays(
  kind: SummaryMetricDayKind,
  item: AttendanceSummaryView,
  user: User | undefined,
  holidays: { date: string }[]
): SummaryMetricDayRow[] {
  const holidayDates = new Set(holidays.map((h) => h.date));
  const records = item.recordDetails || {};
  const rows: SummaryMetricDayRow[] = [];

  for (const [dateStr, recAny] of Object.entries(records)) {
    const rec = recAny as any;
    let include = false;
    let detail: string | undefined;

    switch (kind) {
      case 'total-days':
        include = true;
        break;
      case 'holidays':
        include = isHolidayInRecords(dateStr, holidayDates);
        if (include) {
          detail = holidayMetricDetailLabel(dateStr);
        }
        break;
      case 'working-days':
        include = isWorkingDayInRecords(dateStr, rec, holidayDates);
        break;
      case 'present':
        include = isPresentDayInRecords(rec);
        if (include) {
          detail = String(rec.typeOfPresence || 'Present').trim() || undefined;
        }
        break;
      case 'half-days':
        include = isHalfDayInRecords(dateStr, rec, user);
        break;
      case 'absent':
        include = isAbsentDayInRecords(dateStr, rec, holidayDates);
        if (include) {
          detail = String(rec.typeOfPresence || 'Absent').trim() || 'Absent';
        }
        break;
      case 'late':
        include = isLateArrivalLikeSummary(dateStr, rec, user);
        if (include) {
          const checkin = rec.editedCheckin || rec.checkin || rec.inTime || '—';
          const scheduled = user ? getScheduledTimes(user, new Date(`${dateStr}T12:00:00`)).inTime : '';
          detail = scheduled ? `In ${checkin} (sched. ${scheduled})` : `In ${checkin}`;
        }
        break;
      case 'leave':
        include = isFullLeaveDayInRecords(rec);
        if (include) detail = 'Full leave day';
        break;
      default:
        include = false;
    }

    if (include) {
      rows.push({
        date: dateStr,
        dateLabel: formatSummaryDayLabel(dateStr),
        detail,
      });
    }
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export const SUMMARY_METRIC_DAY_LABELS: Record<SummaryMetricDayKind, string> = {
  'total-days': 'Total days',
  holidays: 'Holidays',
  'working-days': 'Working days',
  present: 'Present days',
  'half-days': 'Half days',
  absent: 'Absent days',
  late: 'Late arrivals',
  leave: 'Leave days',
};

export function getScheduledHoursNoLunchForMonth(
  item: AttendanceSummaryView,
  user: User | undefined,
  dateList: string[]
): number {
  if (!user) return 0;
  let total = 0;

  dateList.forEach((dateStr) => {
    const rec = item.recordDetails?.[dateStr];
    if (!isDayIncludedInScheduledCalc(user, dateStr, rec)) return;

    const dateObj = new Date(dateStr);
    const schedule = getScheduledTimes(user, dateObj);

    const [inH, inM] = schedule.inTime!.split(':').map(Number);
    const [outH, outM] = schedule.outTime!.split(':').map(Number);
    let diff = outH * 60 + outM - (inH * 60 + inM);
    if (diff < 0) diff += 24 * 60;

    total += diff / 60;
  });

  return total;
}

/** Sum per-day article excess (early in / late out >30m) for dates in the period. */
function resolveArticleDayExcessHour(
  user: User,
  dateStr: string,
  rec: NonNullable<AttendanceSummaryView['recordDetails']>[string],
  scheduledInTime: string,
  scheduledOutTime: string
): number {
  const stored =
    typeof rec.excessHour === 'number' && Number.isFinite(rec.excessHour)
      ? rec.excessHour
      : null;
  return stored !== null
    ? stored
    : calculateDayExcessHour(user, dateStr, rec, scheduledInTime, scheduledOutTime);
}

function formatPunchTime(value: string | undefined): string {
  const t = String(value ?? '').trim();
  if (!t || t === '00:00') return '—';
  return t;
}

export function getArticleExcessSumForPeriod(
  item: AttendanceSummaryView,
  user: User,
  dateList: string[]
): number {
  let total = 0;
  dateList.forEach((dateStr) => {
    const rec = item.recordDetails?.[dateStr];
    if (!rec) return;

    const schedule = getScheduledTimes(user, new Date(dateStr));
    total += resolveArticleDayExcessHour(
      user,
      dateStr,
      rec,
      schedule.inTime || '',
      schedule.outTime || ''
    );
  });
  return Number(total.toFixed(2));
}

/** Date-wise article excess rows for summary detail modal (in/out + schedule + daily excess). */
export function getArticleExcessBreakdownForPeriod(
  item: AttendanceSummaryView,
  user: User,
  dateList: string[],
  options?: {
    displayTotal?: number;
    dayAllowanceMap?: ExcessDayAllowanceLookup | null;
  }
): { date: string; info: string; subInfo?: string }[] {
  const userId = String(item.userId || '');
  const breakdown: { date: string; info: string; subInfo?: string }[] = [
    {
      date: 'Article rule',
      info: 'Early check-in counts as excess. Late check-out counts only when more than 30 minutes after scheduled out.',
    },
  ];

  const datedRows: { date: string; info: string; subInfo?: string }[] = [];

  dateList.forEach((dateStr) => {
    const rec = item.recordDetails?.[dateStr];
    if (!rec) return;

    const schedule = getScheduledTimes(user, new Date(dateStr));
    const scheduledInTime = schedule.inTime || '';
    const scheduledOutTime = schedule.outTime || '';
    const inTime = formatPunchTime(getRecordPunchTimeRange(rec).inTime);
    const outTime = formatPunchTime(getRecordPunchTimeRange(rec).outTime);
    const schIn = formatPunchTime(scheduledInTime);
    const schOut = formatPunchTime(scheduledOutTime);
    const extraHours = sumExtraWorkEntryHours(
      (rec as { extraWorkEntries?: Array<{ hours?: number; startTime?: string; endTime?: string }> })
        .extraWorkEntries
    );
    const extraTimes = formatExtraWorkEntriesTimeSummary(
      (rec as { extraWorkEntries?: Array<{ startTime?: string; endTime?: string }> }).extraWorkEntries
    );

    const rawDayExcess = resolveArticleDayExcessHour(
      user,
      dateStr,
      rec,
      scheduledInTime,
      scheduledOutTime
    );
    const dayExcess = applyDayAllowanceToRawExcess(
      rawDayExcess,
      userId,
      dateStr,
      options?.dayAllowanceMap
    );
    const sign = dayExcess > 0 ? '+' : dayExcess < 0 ? '-' : '';
    const dateObj = new Date(dateStr);
    const weekday = Number.isNaN(dateObj.getTime())
      ? ''
      : dateObj.toLocaleDateString('en-US', { weekday: 'short' });

    let info = `Punch ${inTime} → ${outTime} · Sch ${schIn}–${schOut}`;
    if (extraHours > 0) {
      info += ` · Extra +${formatHoursMinutes(extraHours)}`;
      if (extraTimes) info += ` (${extraTimes})`;
    }
    if (dayExcess !== rawDayExcess) {
      const rawSign = rawDayExcess > 0 ? '+' : rawDayExcess < 0 ? '-' : '';
      info += ` · Raw ${rawSign}${formatHoursMinutes(Math.abs(rawDayExcess))}`;
    }

    datedRows.push({
      date: dateStr,
      info,
      subInfo: `${weekday ? `${weekday} · ` : ''}${sign}${formatHoursMinutes(Math.abs(dayExcess))}`,
    });
  });

  datedRows.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  breakdown.push(...datedRows);

  const rawTotal = getArticleExcessSumForPeriod(item, user, dateList);
  const displayTotal =
    options?.displayTotal != null && Number.isFinite(options.displayTotal)
      ? Number(Number(options.displayTotal).toFixed(2))
      : rawTotal;

  if (displayTotal !== rawTotal) {
    breakdown.push({
      date: 'Calculated total',
      info: `${rawTotal > 0 ? '+' : rawTotal < 0 ? '-' : ''}${formatHoursMinutes(Math.abs(rawTotal))}`,
      subInfo: 'Before partner allowance',
    });
  }

  breakdown.push({
    date: 'Period total',
    info: `${displayTotal > 0 ? '+' : displayTotal < 0 ? '-' : ''}${formatHoursMinutes(Math.abs(displayTotal))}`,
    subInfo:
      displayTotal !== rawTotal
        ? 'Matches summary (+ partner allowance applied)'
        : `${datedRows.length} day(s) with attendance records`,
  });

  return breakdown;
}

export function getExcessDeficitLikeSummary(
  item: AttendanceSummaryView,
  user: User | undefined,
  dateList: string[],
  workedHours?: number
): number {
  if (user && isArticleEmployee(user)) {
    return getArticleExcessSumForPeriod(item, user, dateList);
  }
  const w = workedHours !== undefined ? workedHours : getTotalHourLikeAdminSummary(item, user, dateList);
  const scheduledHours = Number(getScheduledHoursNoLunchForMonth(item, user, dateList) || 0);
  return Number((w - scheduledHours).toFixed(2));
}

export interface SummaryAlignedMetrics {
  /** Row count in summary (days with a record row) */
  totalDaysInRecords: number;
  /** Sundays + company holidays that appear in those record dates */
  holidaysInRecords: number;
  workingDaysInRecords: number;
  totalPresent: number;
  totalHalfDay: number;
  totalAbsent: number;
  calcLate: number;
  leaveFullDaysConsumed: number;
  calcScheduledHours: number;
  totalHour: number;
  calcExcessDeficit: number;
}

export function computeSummaryAlignedMetrics(
  item: AttendanceSummaryView | null,
  user: User | undefined,
  holidays: { date: string }[],
  monthYear: string,
  options?: SummaryMetricsOptions
): SummaryAlignedMetrics | null {
  if (!item || !user) return null;

  const holidayDates = new Set(holidays.map((h) => h.date));
  const dateList = monthDateStrings(monthYear);
  const totalHour = getTotalHourLikeAdminSummary(item, user, dateList);

  const rawExcess = getExcessDeficitLikeSummary(item, user, dateList, totalHour);
  const fromDays = lookupExcessDisplay(
    options?.excessDisplayMap ?? null,
    String(item.userId || ''),
    monthYear
  );
  let calcExcessDeficit: number;
  if (fromDays != null) {
    calcExcessDeficit = fromDays;
  } else {
    const capFromMap = lookupExcessAllowance(
      options?.excessAllowanceMap ?? null,
      String(item.userId || ''),
      monthYear
    );
    const cap = options?.allowedExcessCap !== undefined ? options.allowedExcessCap : capFromMap;
    calcExcessDeficit = applyExcessHourAllowance(rawExcess, cap).displayExcess;
  }

  return {
    totalDaysInRecords: getTotalDaysInRecords(item),
    holidaysInRecords: getHolidaysInRecordsCount(item, holidayDates),
    workingDaysInRecords: getWorkingDaysInRecordsCount(item, holidayDates),
    totalPresent: getTotalPresentLikeAdminSummary(item, options, holidayDates),
    totalHalfDay: getHalfDayCountLikeSummary(item, user, options, holidayDates),
    totalAbsent: getAbsentCountLikeSummary(item, holidayDates, options),
    calcLate: getLateCountLikeSummary(item, user),
    leaveFullDaysConsumed: getLeaveConsumedFullDays(item),
    calcScheduledHours: getScheduledHoursNoLunchForMonth(item, user, dateList),
    totalHour,
    calcExcessDeficit,
  };
}
