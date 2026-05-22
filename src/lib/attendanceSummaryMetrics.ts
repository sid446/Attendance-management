/**
 * Mirrors Attendance Summary table calculations in SummarySection.tsx
 * so the employee portal can show the same numbers for a single month.
 */
import type { AttendanceSummaryView, DailySchedule, ScheduleEntry, ScheduleTime, User } from '@/types/ui';
import { getScheduledTimes } from './scheduleUtils';

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

export function getHalfDayCountLikeSummary(item: AttendanceSummaryView, user: User | undefined): number {
  const records = item.recordDetails || {};
  let n = 0;

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
    if (r.halfDay && r.typeOfPresence !== 'Holiday' && !isBothZero) {
      n += 1;
    }
  });

  return n;
}

export function getAbsentCountLikeSummary(
  item: AttendanceSummaryView,
  holidayDates: Set<string>
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
export function getTotalPresentLikeAdminSummary(item: AttendanceSummaryView): number {
  let totalPresent = 0;
  for (const rec of Object.values(item.recordDetails || {}) as any[]) {
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
 * Sum of per-day `totalHour` excluding holiday-like rows — matches admin
 * `page.tsx` fetchSummaries recalculation (not raw API `summary.totalHour`).
 */
export function getTotalHourLikeAdminSummary(item: AttendanceSummaryView): number {
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

/** Per-day worked hours on non–holiday-like rows, chronological (for dashboard charts). */
export function getDailyWorkedHoursSeries(
  item: AttendanceSummaryView
): { date: string; hours: number }[] {
  const rows: { date: string; hours: number }[] = [];
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
  return Object.entries(records).filter(([dateStr, rec]: [string, any]) => {
    const d = new Date(dateStr);
    if (d.getDay() === 0) return false;
    if (holidayDates.has(dateStr)) return false;
    if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) {
      return false;
    }
    return true;
  }).length;
}

export function getScheduledHoursNoLunchForMonth(
  item: AttendanceSummaryView,
  user: User | undefined,
  dateList: string[]
): number {
  if (!user) return 0;
  let total = 0;

  dateList.forEach((dateStr) => {
    const rec = item.recordDetails?.[dateStr];
    if (!rec || !isExcessEligibleRecord(dateStr, rec)) return;

    const dateObj = new Date(dateStr);
    const schedule = getScheduledTimes(user, dateObj);

    if (schedule.isHoliday || !schedule.inTime || !schedule.outTime || schedule.inTime === '00:00' || schedule.outTime === '00:00') return;

    const [inH, inM] = schedule.inTime.split(':').map(Number);
    const [outH, outM] = schedule.outTime.split(':').map(Number);
    let diff = outH * 60 + outM - (inH * 60 + inM);
    if (diff < 0) diff += 24 * 60;

    total += diff / 60;
  });

  return total;
}

export function getExcessDeficitLikeSummary(
  item: AttendanceSummaryView,
  user: User | undefined,
  dateList: string[],
  workedHours?: number
): number {
  const w = workedHours !== undefined ? workedHours : getTotalHourLikeAdminSummary(item);
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
  monthYear: string
): SummaryAlignedMetrics | null {
  if (!item || !user) return null;

  const holidayDates = new Set(holidays.map((h) => h.date));
  const dateList = monthDateStrings(monthYear);
  const totalHour = getTotalHourLikeAdminSummary(item);

  return {
    totalDaysInRecords: getTotalDaysInRecords(item),
    holidaysInRecords: getHolidaysInRecordsCount(item, holidayDates),
    workingDaysInRecords: getWorkingDaysInRecordsCount(item, holidayDates),
    totalPresent: getTotalPresentLikeAdminSummary(item),
    totalHalfDay: getHalfDayCountLikeSummary(item, user),
    totalAbsent: getAbsentCountLikeSummary(item, holidayDates),
    calcLate: getLateCountLikeSummary(item, user),
    leaveFullDaysConsumed: getLeaveConsumedFullDays(item),
    calcScheduledHours: getScheduledHoursNoLunchForMonth(item, user, dateList),
    totalHour,
    calcExcessDeficit: getExcessDeficitLikeSummary(item, user, dateList, totalHour),
  };
}
