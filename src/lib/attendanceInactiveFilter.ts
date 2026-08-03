/**
 * Calendar day as YYYY-MM-DD in local time.
 * Prefer leading ISO date from strings; never use UTC `toISOString().slice` for Date
 * (shifts the day west of UTC / can move inactiveAsOf back a day).
 */
export function toYmd(date: Date | string | null | undefined): string {
  if (date == null) return '';
  if (typeof date === 'string') {
    const m = String(date).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** True when dateKey is on or after the first inactive calendar day (inclusive → NA). */
export function isDateOnOrAfterInactive(dateKey: string, inactiveAsOf: Date | string | null | undefined): boolean {
  if (inactiveAsOf == null) return false;
  const cut = toYmd(inactiveAsOf);
  if (!cut) return false;
  const d = dateKey.slice(0, 10);
  return d >= cut;
}

export function filterRecordsByInactiveCutoff<T extends Record<string, unknown>>(
  records: T | null | undefined,
  inactiveAsOf: Date | string | null | undefined
): T {
  if (!records || !inactiveAsOf) return (records || {}) as T;
  const out = {} as T;
  for (const [dateKey, rec] of Object.entries(records)) {
    if (isDateOnOrAfterInactive(dateKey, inactiveAsOf)) continue;
    (out as Record<string, unknown>)[dateKey] = rec;
  }
  return out;
}

export type AttendanceDayRec = {
  typeOfPresence?: string;
  editedCheckin?: string;
  checkin?: string;
  editedCheckout?: string;
  checkout?: string;
  totalHour?: number;
  excessHour?: number;
  halfDay?: boolean;
};

export function summarizeAttendanceRecords(records: Record<string, AttendanceDayRec | unknown>): {
  totalHour: number;
  totalLateArrival: number;
  excessHour: number;
  totalHalfDay: number;
  totalPresent: number;
  totalAbsent: number;
  totalLeave: number;
} {
  const summary = {
    totalHour: 0,
    totalLateArrival: 0,
    excessHour: 0,
    totalHalfDay: 0,
    totalPresent: 0,
    totalAbsent: 0,
    totalLeave: 0,
  };

  for (const rec of Object.values(records) as AttendanceDayRec[]) {
    const type = String(rec?.typeOfPresence || '');
    const checkin = String(rec?.editedCheckin || rec?.checkin || '').trim();
    const checkout = String(rec?.editedCheckout || rec?.checkout || '').trim();
    const totalHour = Number(rec?.totalHour || 0);
    const isHolidayLike =
      type === 'Holiday' ||
      type === 'Sunday' ||
      type === 'Weekoff' ||
      type === 'Weekoff - special allowance';

    if (!isHolidayLike) {
      summary.totalHour += totalHour;
    }
    summary.excessHour += Number(rec?.excessHour || 0);

    if (type === 'Leave' || type === 'On leave') {
      summary.totalLeave += 1;
      summary.totalAbsent += 1;
      continue;
    }

    if (type === 'Absent') {
      summary.totalAbsent += 1;
      continue;
    }

    if (isHolidayLike) {
      continue;
    }

    const hasValidIn = checkin && checkin !== '00:00';
    const hasValidOut = checkout && checkout !== '00:00';

    if (rec?.halfDay) {
      summary.totalHalfDay += 1;
      summary.totalPresent += 1;
    } else if (hasValidIn || hasValidOut || totalHour > 0) {
      summary.totalPresent += 1;
    } else {
      summary.totalAbsent += 1;
    }
  }

  return summary;
}
