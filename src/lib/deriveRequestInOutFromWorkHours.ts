import {
  BUILTIN_WFH_CREDIT,
  effectiveWfhAttendanceValue,
  presenceKindForStatus,
  type PresenceCreditEmployee,
  type PresenceCreditRuleLike,
} from '@/lib/presenceCredit';
import { getScheduledTimes } from '@/lib/scheduleUtils';

function parseIsoDateLocal(dateStr: string): Date {
  const iso = String(dateStr || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(`${iso}T12:00:00`);
  }
  return new Date(dateStr);
}

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

export type SpentScheduleWindow = {
  scheduledIn: string;
  scheduledOut: string;
  minutes: number;
};

type SpentScheduleRecord = {
  typeOfPresence?: string;
  status?: string;
  value?: number;
  totalHour?: number;
  editedCheckin?: string;
  checkin?: string;
  inTime?: string;
  editedCheckout?: string;
  checkout?: string;
  outTime?: string;
};

/** WFH, outstation, and onsite presence. Client place stays on the office schedule. */
export function isWfhOrOspPresence(typeOfPresence: unknown): boolean {
  return presenceKindForStatus(String(typeOfPresence || '')) !== null;
}

function durationMinutes(start: string, end: string): number | null {
  const startMin = parseHhMmToMinutes(start);
  const endMin = parseHhMmToMinutes(end);
  if (startMin === null || endMin === null || endMin <= startMin) return null;
  return endMin - startMin;
}

function clocksMatch(a: string, b: string): boolean {
  const left = parseHhMmToMinutes(a);
  const right = parseHhMmToMinutes(b);
  return left !== null && left === right;
}

/**
 * Scheduled in/out for a WFH or OSP day.
 * A real in/out pair is kept. Hours alone start at the usual in-time.
 * A pair that is only the office window, with hours equal to the day credit, is treated as hours-only.
 */
export function resolveWfhOspSpentSchedule(input: {
  user: unknown;
  dateStr: string;
  typeOfPresence?: string | null;
  value?: number | null;
  givenIn?: string | null;
  givenOut?: string | null;
  totalHour?: number | null;
  trustGivenPair?: boolean;
}): SpentScheduleWindow | null {
  if (!isWfhOrOspPresence(input.typeOfPresence)) return null;

  const schedule = getWorkHoursReferenceSchedule(input.user, input.dateStr);
  const officeIn = normalizeHhMm(schedule.inTime);
  const officeOut = normalizeHhMm(schedule.outTime);
  const officeMinutes = officeIn && officeOut ? durationMinutes(officeIn, officeOut) : null;
  if (!officeIn || officeMinutes === null || officeMinutes <= 0) return null;

  const valueNum = Number(input.value);
  const hasValue = Number.isFinite(valueNum) && valueNum > 0;
  const fraction = hasValue ? valueNum : 1;
  const creditHours = fraction * (officeMinutes / 60);

  const givenIn = normalizeHhMm(input.givenIn);
  const givenOut = normalizeHhMm(input.givenOut);
  const givenMinutes = givenIn && givenOut ? durationMinutes(givenIn, givenOut) : null;
  const pairIsOffice =
    !!givenIn &&
    !!givenOut &&
    clocksMatch(givenIn, officeIn) &&
    clocksMatch(givenOut, officeOut);
  const storedHours = Number(input.totalHour);
  const stored = Number.isFinite(storedHours) ? storedHours : 0;
  const looksLikeCreditFill =
    !input.trustGivenPair &&
    pairIsOffice &&
    hasValue &&
    (stored <= 0 || Math.abs(stored - creditHours) <= 0.08);
  // Saved days still store hours for the old 0.75 credit. Once that credit
  // becomes 0.5, those office punches are the fill, not a chosen out-time.
  const oldDefaultHours = BUILTIN_WFH_CREDIT * (officeMinutes / 60);
  const looksLikeOldDefaultFill =
    !input.trustGivenPair &&
    pairIsOffice &&
    hasValue &&
    Math.abs(fraction - BUILTIN_WFH_CREDIT) > 0.001 &&
    Math.abs(stored - oldDefaultHours) <= 0.08;

  if (givenMinutes !== null && givenIn && givenOut && !looksLikeCreditFill && !looksLikeOldDefaultFill) {
    return { scheduledIn: givenIn, scheduledOut: givenOut, minutes: givenMinutes };
  }

  const startMin = parseHhMmToMinutes(officeIn);
  if (startMin === null) return null;
  const spentMinutes = Math.max(1, Math.round(officeMinutes * fraction));
  const endMin = startMin + spentMinutes;
  const scheduledOut = endMin >= 24 * 60 ? '23:59' : minutesToHhMm(endMin);
  const cappedEnd = parseHhMmToMinutes(scheduledOut);
  const minutes = cappedEnd !== null && cappedEnd > startMin ? cappedEnd - startMin : spentMinutes;
  return {
    scheduledIn: minutesToHhMm(startMin),
    scheduledOut,
    minutes,
  };
}

/** Report view of one saved day. Null means this day keeps the office schedule. */
export function scheduledWindowForAttendanceDay(
  user: unknown,
  dateStr: string,
  rec: SpentScheduleRecord | null | undefined,
  rules?: PresenceCreditRuleLike[] | null
): SpentScheduleWindow | null {
  if (!rec) return null;
  const type = rec.typeOfPresence || rec.status || '';
  if (!isWfhOrOspPresence(type)) return null;
  const stored = typeof rec.value === 'number' ? rec.value : undefined;
  const value =
    presenceKindForStatus(type) === 'wfh' && stored != null
      ? effectiveWfhAttendanceValue(stored, user as PresenceCreditEmployee, dateStr, rules)
      : stored;
  return resolveWfhOspSpentSchedule({
    user,
    dateStr,
    typeOfPresence: type,
    value,
    totalHour: rec.totalHour,
    givenIn: rec.editedCheckin || rec.checkin || rec.inTime || '',
    givenOut: rec.editedCheckout || rec.checkout || rec.outTime || '',
    trustGivenPair: false,
  });
}

/**
 * Excess compares worked time to this window. For WFH/OSP the punches used in that
 * comparison are the spent window, so a day filled with the office out-time is not a deficit.
 */
export function withWfhOspSchedule<T extends SpentScheduleRecord>(
  user: unknown,
  dateStr: string,
  rec: T,
  officeIn: string,
  officeOut: string
): { scheduledIn: string; scheduledOut: string; record: T } {
  const spent = scheduledWindowForAttendanceDay(user, dateStr, rec);
  if (!spent) {
    return { scheduledIn: officeIn, scheduledOut: officeOut, record: rec };
  }
  return {
    scheduledIn: spent.scheduledIn,
    scheduledOut: spent.scheduledOut,
    record: {
      ...rec,
      editedCheckin: spent.scheduledIn,
      editedCheckout: spent.scheduledOut,
    },
  };
}

/** Write the spent window onto a day. Returns false when the type is not WFH or OSP. */
export function applyWfhOspSpentWindow(
  rec: SpentScheduleRecord & { excessHour?: number },
  user: unknown,
  dateStr: string,
  opts?: {
    typeOfPresence?: string | null;
    givenIn?: string | null;
    givenOut?: string | null;
    trustGivenPair?: boolean;
  }
): boolean {
  const window = resolveWfhOspSpentSchedule({
    user,
    dateStr,
    typeOfPresence: opts?.typeOfPresence || rec.typeOfPresence || rec.status,
    value: rec.value,
    givenIn: opts?.givenIn,
    givenOut: opts?.givenOut,
    trustGivenPair: opts?.trustGivenPair,
  });
  if (!window) return false;
  rec.editedCheckin = window.scheduledIn;
  rec.editedCheckout = window.scheduledOut;
  rec.totalHour = Number((window.minutes / 60).toFixed(2));
  rec.excessHour = 0;
  return true;
}
