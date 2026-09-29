import { parseIsoDateLocal } from '@/lib/attendanceSummaryMetrics';
import { getScheduledTimes } from '@/lib/scheduleUtils';

const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseHhMmToMinutes(time: string): number | null {
  const t = String(time || '').trim();
  if (TIME_INPUT_PATTERN.test(t)) {
    const [hours, minutes] = t.split(':').map(Number);
    return hours * 60 + minutes;
  }
  const loose = t.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!loose) return null;
  const hours = Number(loose[1]);
  const minutes = Number(loose[2]);
  if (hours > 23) return null;
  return hours * 60 + minutes;
}

export function minutesToHhMm(totalMinutes: number): string {
  const mins = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function normalizeHhMm(time: string | undefined | null): string {
  const minutes = parseHhMmToMinutes(String(time || ''));
  return minutes === null ? '' : minutesToHhMm(minutes);
}

/** Monday used as working-day reference for weekoff (Sunday → next Monday). */
export function getWeekoffReferenceMondayIso(dateStr: string): string {
  const d = parseIsoDateLocal(String(dateStr || '').slice(0, 10));
  const day = d.getDay();
  const delta = day === 0 ? 1 : day === 1 ? 0 : 1 - day;
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Holiday / weekoff days can still return default 09:00–18:00 from getScheduledTimes.
 * That default is not a real working in-time and must not be used for WFH.
 */
export function hasWorkingScheduleIn(
  schedule: { inTime?: string; outTime?: string; isHoliday?: boolean } | null | undefined
): boolean {
  const inTime = String(schedule?.inTime || '').trim();
  if (!inTime || inTime === '00:00') return false;
  if (schedule?.isHoliday) return false;
  return true;
}

export function getWorkHoursReferenceSchedule(
  user: unknown,
  dateStr: string
): ReturnType<typeof getScheduledTimes> & { scheduleSource: string } {
  const dayIso = String(dateStr || '').slice(0, 10);
  const dayDate = parseIsoDateLocal(dayIso);
  const isSunday = !Number.isNaN(dayDate.getTime()) && dayDate.getDay() === 0;
  let schedule = user ? getScheduledTimes(user, dayIso) : null;
  let scheduleSource: string = schedule?.source || 'default';

  // Sunday is always weekoff for WFH hours, even if the profile copied weekday
  // times onto Sunday (seen on some intern schedules).
  if ((isSunday || !hasWorkingScheduleIn(schedule)) && user) {
    const mondayIso = getWeekoffReferenceMondayIso(dayIso);
    schedule = getScheduledTimes(user, mondayIso);
    scheduleSource = `${schedule.source}-monday-fallback`;
  }

  let inTime = schedule?.inTime || '';
  const outTime = schedule?.outTime || '';
  if (!inTime || inTime === '00:00') {
    inTime = '09:00';
    scheduleSource = 'default';
  }

  return {
    inTime,
    outTime: outTime || '18:00',
    isHoliday: schedule?.isHoliday || false,
    isHalfDay: schedule?.isHalfDay || false,
    source: schedule?.source || 'default',
    scheduleSource,
  };
}

/**
 * Move an existing in/out window so it starts at `newStartTime`, keeping the same duration.
 */
export function shiftTimeRangeToStart(
  startTime: string | undefined,
  endTime: string | undefined,
  newStartTime: string
): { startTime: string; endTime?: string } {
  const newStartMin = parseHhMmToMinutes(newStartTime);
  if (newStartMin === null) {
    return { startTime: newStartTime, endTime };
  }

  const oldStart = parseHhMmToMinutes(String(startTime || ''));
  const oldEnd = parseHhMmToMinutes(String(endTime || ''));
  if (oldStart === null || oldEnd === null || oldEnd <= oldStart) {
    return { startTime: minutesToHhMm(newStartMin), endTime };
  }

  const duration = oldEnd - oldStart;
  const newEndMin = newStartMin + duration;
  if (newEndMin >= 24 * 60) {
    return { startTime: minutesToHhMm(newStartMin), endTime: '23:59' };
  }

  return {
    startTime: minutesToHhMm(newStartMin),
    endTime: minutesToHhMm(newEndMin),
  };
}

/**
 * Derive in/out from entered work hours using that day's scheduled in-time as start.
 * Weekoff / holiday / empty days use the nearest Monday working schedule, not the
 * Sunday default of 09:00–18:00.
 */
export function deriveInOutFromWorkHours(
  user: unknown,
  dateStr: string,
  hours: number
): { startTime: string; endTime: string; scheduleIn: string; scheduleSource: string } | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;

  const schedule = getWorkHoursReferenceSchedule(user, dateStr);
  const startMinutes = parseHhMmToMinutes(schedule.inTime);
  if (startMinutes === null) return null;

  const durationMinutes = Math.round(hours * 60);
  if (durationMinutes <= 0) return null;

  const endMinutes = startMinutes + durationMinutes;
  if (endMinutes >= 24 * 60) {
    return {
      startTime: minutesToHhMm(startMinutes),
      endTime: '23:59',
      scheduleIn: schedule.inTime,
      scheduleSource: schedule.scheduleSource,
    };
  }

  return {
    startTime: minutesToHhMm(startMinutes),
    endTime: minutesToHhMm(endMinutes),
    scheduleIn: schedule.inTime,
    scheduleSource: schedule.scheduleSource,
  };
}
