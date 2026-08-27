import { calculateTotalHours } from '@/lib/attendanceHours';
import { effectiveScheduledMinutesForDay } from '@/lib/calculateDayExcessHour';
import {
  getRecordPunchHours,
  getRecordPunchTimeRange,
} from '@/lib/extraWorkRequest';

export type DayWorkedHoursRecord = {
  totalHour?: number;
  workingHours?: number;
  workingHour?: number;
  value?: number;
  typeOfPresence?: string;
  status?: string;
  halfDay?: boolean;
  editedCheckin?: string;
  checkin?: string;
  inTime?: string;
  editedCheckout?: string;
  checkout?: string;
  outTime?: string;
  extraWorkEntries?: Array<{ hours?: number; startTime?: string; endTime?: string }> | null;
};

/** Presence types that may store day credit in `value` with empty/00:00 punches. */
export function isValueBasedPresenceHoursType(typeOfPresence: unknown): boolean {
  const t = String(typeOfPresence || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!t) return false;
  return (
    t.includes('client place') ||
    t.includes('clientplace') ||
    t.includes('outstation') ||
    t.includes('onsite presence') ||
    t === 'os-p' ||
    t.includes('(os-p)') ||
    t.includes('wfh') ||
    t.includes('work from home')
  );
}

/** Match both `Present - client place` and `Present - ClientPlace (...)`. */
export function typeIncludesClientPlace(typeOfPresence: unknown): boolean {
  const t = String(typeOfPresence || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return t.includes('client place') || t.includes('clientplace') || t === 'cp-p' || t.includes('(cp-p)');
}

/**
 * Resolve worked hours for one day — same rules as summary when data is healthy,
 * with optional fallbacks for CP-P / OS-P / WFH where `totalHour` was wiped to 0:
 * 1) stored totalHour / workingHours
 * 2) punch in/out duration
 * 3) value × scheduled duration (only when `allowValueScheduleFallback` is true — daywise display)
 *
 * Summary HR +/- must NOT use (3); that invented hours and skewed excess/deficit.
 */
export function resolveDayWorkedHours(
  rec: DayWorkedHoursRecord | null | undefined,
  opts?: {
    scheduledIn?: string;
    scheduledOut?: string;
    /** When false (summary excess/worked), skip value×schedule invention. Default true for daywise. */
    allowValueScheduleFallback?: boolean;
  }
): number {
  if (!rec) return 0;

  const stored = Number(rec.workingHours ?? rec.workingHour ?? rec.totalHour ?? 0);
  if (Number.isFinite(stored) && stored > 0) {
    return Number(stored.toFixed(2));
  }

  const punchOnly = getRecordPunchHours(rec);
  const extra = Array.isArray(rec.extraWorkEntries)
    ? rec.extraWorkEntries.reduce((s, e) => s + (Number(e.hours) || 0), 0)
    : 0;
  if (punchOnly > 0) {
    return Number((punchOnly + Math.max(0, extra)).toFixed(2));
  }

  // Direct punch duration if getRecordPunchHours still 0 (e.g. totalHour 0, times present)
  const { inTime, outTime } = getRecordPunchTimeRange(rec);
  const fromTimes = calculateTotalHours(inTime, outTime);
  if (fromTimes > 0) {
    return Number((fromTimes + Math.max(0, extra)).toFixed(2));
  }

  if (opts?.allowValueScheduleFallback === false) {
    return 0;
  }

  const presence = rec.typeOfPresence || rec.status || '';
  if (!isValueBasedPresenceHoursType(presence)) return 0;

  const dayValue = Number(rec.value);
  const scheduledIn = String(opts?.scheduledIn || '').trim();
  const scheduledOut = String(opts?.scheduledOut || '').trim();
  if (
    !(Number.isFinite(dayValue) && dayValue > 0) ||
    !scheduledIn ||
    !scheduledOut ||
    scheduledIn === '00:00' ||
    scheduledOut === '00:00'
  ) {
    return 0;
  }

  const schedMins = effectiveScheduledMinutesForDay(scheduledIn, scheduledOut, rec);
  if (schedMins <= 0) return 0;
  return Number(((dayValue * schedMins) / 60).toFixed(2));
}
