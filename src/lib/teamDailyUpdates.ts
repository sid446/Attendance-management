import { istDateString } from '@/lib/attendanceRequestWindow';

export type TeamDailyUpdateCategory =
  | 'leave'
  | 'wfh'
  | 'outstation'
  | 'half_day'
  | 'other_approved'
  | 'pending'
  | 'pending_hr';

export const TEAM_DAILY_UPDATES_MAX_RANGE_DAYS = 31;

export interface TeamDailyUpdateEntry {
  userId: string;
  name: string;
  odId: string;
  employeeCode: string;
  category: TeamDailyUpdateCategory;
  label: string;
  requestedStatus: string;
  requestStatus: 'Approved' | 'Pending' | 'PendingHr' | 'Attendance';
  source: 'request' | 'attendance';
  /** YYYY-MM-DD (IST) the update applies to. */
  date?: string;
  approvedBy?: string;
  reason?: string;
  startTime?: string;
  endTime?: string;
}

export interface TeamDailyUpdateRangeEntry extends TeamDailyUpdateEntry {
  date: string;
  dateFrom: string;
  dateTo: string;
}

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export function isYyyyMmDd(value: string): boolean {
  return YYYY_MM_DD.test(value);
}

export function shiftIstYyyyMmDd(date: string, deltaDays: number): string {
  const parsed = new Date(`${date}T12:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return istDateString();
  parsed.setDate(parsed.getDate() + deltaDays);
  return istDateString(parsed);
}

export function enumerateYyyyMmDd(
  from: string,
  to: string,
  maxDays = TEAM_DAILY_UPDATES_MAX_RANGE_DAYS
): string[] {
  if (!isYyyyMmDd(from) || !isYyyyMmDd(to)) return [];
  let start = from;
  let end = to;
  if (end < start) {
    start = to;
    end = from;
  }
  const dates: string[] = [];
  let current = start;
  while (current <= end && dates.length < maxDays) {
    dates.push(current);
    current = shiftIstYyyyMmDd(current, 1);
  }
  return dates;
}

export function clampDailyUpdateRange(from: string, to: string): { from: string; to: string } {
  const dates = enumerateYyyyMmDd(from, to);
  if (dates.length === 0) {
    const today = istDateString();
    return { from: today, to: today };
  }
  return { from: dates[0], to: dates[dates.length - 1] };
}

export function monthYearsInRange(from: string, to: string): string[] {
  return [...new Set(enumerateYyyyMmDd(from, to).map((d) => d.slice(0, 7)))];
}

function dayOrdinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function formatDateParts(date: string): { day: number; month: string; yearShort: string } {
  const [yearStr, monthStr, dayStr] = date.split('-');
  const monthIndex = parseInt(monthStr, 10) - 1;
  return {
    day: parseInt(dayStr, 10),
    month: MONTHS_SHORT[monthIndex] ?? monthStr,
    yearShort: yearStr.slice(-2),
  };
}

/** e.g. "29th Aug to 5th Sep 26" */
export function formatDailyUpdateRangeLabel(from: string, to: string): string {
  const a = formatDateParts(from);
  const b = formatDateParts(to);
  if (!a.day || !b.day) return from === to ? from : `${from} to ${to}`;
  if (from === to) return `${dayOrdinal(a.day)} ${a.month} ${a.yearShort}`;
  if (a.month === b.month && a.yearShort === b.yearShort) {
    return `${dayOrdinal(a.day)} to ${dayOrdinal(b.day)} ${b.month} ${b.yearShort}`;
  }
  if (a.yearShort === b.yearShort) {
    return `${dayOrdinal(a.day)} ${a.month} to ${dayOrdinal(b.day)} ${b.month} ${b.yearShort}`;
  }
  return `${dayOrdinal(a.day)} ${a.month} ${a.yearShort} to ${dayOrdinal(b.day)} ${b.month} ${b.yearShort}`;
}

export function mergeConsecutiveDailyUpdates(
  entries: TeamDailyUpdateEntry[]
): TeamDailyUpdateRangeEntry[] {
  const dated = entries.filter((e): e is TeamDailyUpdateEntry & { date: string } =>
    Boolean(e.date && isYyyyMmDd(e.date))
  );
  const groups = new Map<string, Array<TeamDailyUpdateEntry & { date: string }>>();
  for (const entry of dated) {
    const key = [
      entry.userId,
      entry.category,
      entry.requestedStatus,
      entry.requestStatus,
      entry.reason ?? '',
      entry.startTime ?? '',
      entry.endTime ?? '',
    ].join('|');
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  const merged: TeamDailyUpdateRangeEntry[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    let run: TeamDailyUpdateRangeEntry | null = null;
    for (const entry of list) {
      if (run && shiftIstYyyyMmDd(run.dateTo, 1) === entry.date) {
        run.dateTo = entry.date;
        continue;
      }
      if (run) merged.push(run);
      run = { ...entry, dateFrom: entry.date, dateTo: entry.date };
    }
    if (run) merged.push(run);
  }

  merged.sort(
    (a, b) => a.dateFrom.localeCompare(b.dateFrom) || a.name.localeCompare(b.name)
  );
  return merged;
}

const LEAVE_STATUSES = new Set(['on leave', 'leave']);

function statusLower(value: string): string {
  return String(value || '').trim().toLowerCase();
}

export function categorizePresenceStatus(requestedStatus: string): TeamDailyUpdateCategory | null {
  const t = statusLower(requestedStatus);
  if (!t) return null;
  if (LEAVE_STATUSES.has(t) || t.includes('on leave')) return 'leave';
  if (t.includes('wfh') || t.includes('work from home')) return 'wfh';
  if (
    t.includes('outstation') ||
    t.includes('client place') ||
    t.includes('clientplace') ||
    t.includes('os-p') ||
    t.includes('onsite')
  ) {
    return 'outstation';
  }
  if (t.includes('half day') || t === 'half day (hd)' || t.includes('halfday')) return 'half_day';
  if (t === 'absent' || t === 'holiday' || t.includes('weekoff')) return 'other_approved';
  return 'other_approved';
}

export function formatDailyUpdateLabel(requestedStatus: string): string {
  const t = String(requestedStatus || '').trim();
  if (!t) return 'Updated attendance';
  if (LEAVE_STATUSES.has(statusLower(t)) || statusLower(t).includes('on leave')) return 'On leave';
  return t;
}

export function groupDailyUpdates<T extends TeamDailyUpdateEntry>(entries: T[]) {
  const groups: Record<TeamDailyUpdateCategory, T[]> = {
    leave: [],
    wfh: [],
    outstation: [],
    half_day: [],
    other_approved: [],
    pending: [],
    pending_hr: [],
  };
  for (const entry of entries) {
    groups[entry.category].push(entry);
  }
  return groups;
}

export const DAILY_UPDATE_GROUP_META: Record<
  TeamDailyUpdateCategory,
  { title: string; description: string; tone: 'rose' | 'sky' | 'amber' | 'emerald' | 'violet' | 'slate' }
> = {
  leave: {
    title: 'On leave',
    description: 'Approved leave or absence',
    tone: 'rose',
  },
  wfh: {
    title: 'Work from home',
    description: 'Approved WFH',
    tone: 'sky',
  },
  outstation: {
    title: 'Outstation / client place',
    description: 'Approved travel or client-site work',
    tone: 'violet',
  },
  half_day: {
    title: 'Half day',
    description: 'Approved half-day attendance',
    tone: 'amber',
  },
  other_approved: {
    title: 'Other approved changes',
    description: 'Other approved attendance',
    tone: 'emerald',
  },
  pending: {
    title: 'Awaiting your approval',
    description: 'Requests submitted for the selected dates',
    tone: 'amber',
  },
  pending_hr: {
    title: 'Pending HR',
    description: 'You approved — HR final approval required',
    tone: 'slate',
  },
};
