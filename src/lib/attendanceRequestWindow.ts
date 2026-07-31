const TZ = 'Asia/Kolkata';

export interface RequestWindowConfig {
  /**
   * Inclusive day-of-month (IST) that is the deadline for requesting the whole
   * previous calendar month. On day 3 with a cutoff of 3 the previous month is
   * still fully open; from day 4 it is closed.
   */
  previousMonthCutoffDay: number;
  /** Max look-back for current-month past dates (in days). */
  currentMonthPastDays: number;
  /**
   * Extra whole calendar months open after the current one. Future dates in the
   * current month are always open, so 0 = rest of this month only, 1 = rest of
   * this month plus all of next month.
   */
  futureMonthsAhead: number;
}

export const DEFAULT_REQUEST_WINDOW: RequestWindowConfig = {
  previousMonthCutoffDay: 3,
  currentMonthPastDays: 7,
  futureMonthsAhead: 1,
};

/** One continuous run of allowed dates (inclusive, YYYY-MM-DD). */
export interface RequestWindowSegment {
  startDate: string;
  endDate: string;
}

export interface RequestWindowBounds {
  earliestDate: string; // YYYY-MM-DD inclusive
  latestDate: string; // YYYY-MM-DD inclusive
  /**
   * Allowed runs of dates. The previous-month allowance can sit apart from the
   * look-back/future run, so `earliestDate`..`latestDate` is only an envelope.
   */
  segments: RequestWindowSegment[];
  config: RequestWindowConfig;
}

export type RequestWindowScope = 'global' | 'team' | 'employee';

export interface RequestWindowOverride {
  scope: RequestWindowScope;
  partnerName?: string;
  userId?: string;
  previousMonthCutoffDay?: number;
  currentMonthPastDays?: number;
  futureMonthsAhead?: number;
}

/** Partial override merged onto defaults / global / team / employee chain. */
export function mergeRequestWindowConfig(
  ...layers: Array<Partial<RequestWindowConfig> | null | undefined>
): RequestWindowConfig {
  return layers.reduce<RequestWindowConfig>(
    (acc, layer) => ({
      previousMonthCutoffDay:
        layer?.previousMonthCutoffDay ?? acc.previousMonthCutoffDay,
      currentMonthPastDays: layer?.currentMonthPastDays ?? acc.currentMonthPastDays,
      futureMonthsAhead: layer?.futureMonthsAhead ?? acc.futureMonthsAhead,
    }),
    { ...DEFAULT_REQUEST_WINDOW }
  );
}

function clampDayOfMonth(day: number): number {
  return Math.min(31, Math.max(1, Math.floor(day)));
}

function clampPositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

export function sanitizeRequestWindowConfig(
  input: Partial<RequestWindowConfig> | null | undefined
): RequestWindowConfig {
  return {
    previousMonthCutoffDay: clampDayOfMonth(
      input?.previousMonthCutoffDay ?? DEFAULT_REQUEST_WINDOW.previousMonthCutoffDay
    ),
    currentMonthPastDays: clampPositiveInt(
      input?.currentMonthPastDays ?? DEFAULT_REQUEST_WINDOW.currentMonthPastDays,
      DEFAULT_REQUEST_WINDOW.currentMonthPastDays
    ),
    futureMonthsAhead: clampPositiveInt(
      input?.futureMonthsAhead ?? DEFAULT_REQUEST_WINDOW.futureMonthsAhead,
      DEFAULT_REQUEST_WINDOW.futureMonthsAhead
    ),
  };
}

/** Calendar date YYYY-MM-DD in IST for `d`. */
export function istDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Wall-clock time HH:mm (24h) in IST for `d`. */
export function istTimeString(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

function parseYyyyMmDd(dateStr: string): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function dateStrFromParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDaysYyyyMmDd(dateStr: string, days: number): string {
  const parts = parseYyyyMmDd(dateStr);
  if (!parts) return dateStr;
  const utc = Date.UTC(parts.y, parts.m - 1, parts.d + days);
  const dt = new Date(utc);
  return dateStrFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function firstDayOfMonthYyyyMm(yyyyMm: string): string {
  return `${yyyyMm}-01`;
}

function lastDayOfMonthYyyyMm(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return dateStrFromParts(y, m, last);
}

function prevMonthKey(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function addMonthsToYyyyMm(yyyyMm: string, months: number): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthKeyFromDateStr(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function dayOfMonthIst(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    day: '2-digit',
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'day')?.value ?? '1');
}

/** Collapse overlapping or day-adjacent runs into the fewest segments. */
function mergeSegments(segments: RequestWindowSegment[]): RequestWindowSegment[] {
  const sorted = [...segments]
    .filter((s) => s.startDate <= s.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const merged: RequestWindowSegment[] = [];
  for (const segment of sorted) {
    const last = merged[merged.length - 1];
    if (last && segment.startDate <= addDaysYyyyMmDd(last.endDate, 1)) {
      if (segment.endDate > last.endDate) last.endDate = segment.endDate;
      continue;
    }
    merged.push({ ...segment });
  }
  return merged;
}

/**
 * Allowed date runs (inclusive, IST). Each setting is applied independently:
 * the previous month is open in full until the cutoff day, current-month past
 * dates use the rolling look-back, and future dates run through the end of the
 * last allowed future month.
 */
export function getRequestWindowSegments(
  config: RequestWindowConfig,
  now: Date = new Date()
): RequestWindowSegment[] {
  const sanitized = sanitizeRequestWindowConfig(config);
  const today = istDateString(now);
  const currentMonth = monthKeyFromDateStr(today);
  const currentMonthStart = firstDayOfMonthYyyyMm(currentMonth);

  const rollingStart = addDaysYyyyMmDd(today, -sanitized.currentMonthPastDays);
  const lookBackStart =
    rollingStart < currentMonthStart ? currentMonthStart : rollingStart;
  const futureEnd = lastDayOfMonthYyyyMm(
    addMonthsToYyyyMm(currentMonth, sanitized.futureMonthsAhead)
  );

  const segments: RequestWindowSegment[] = [
    { startDate: lookBackStart, endDate: futureEnd },
  ];

  if (dayOfMonthIst(now) <= sanitized.previousMonthCutoffDay) {
    const previousMonth = prevMonthKey(currentMonth);
    segments.push({
      startDate: firstDayOfMonthYyyyMm(previousMonth),
      endDate: lastDayOfMonthYyyyMm(previousMonth),
    });
  }

  return mergeSegments(segments);
}

/** Allowed request date range (inclusive) in IST for the given config. */
export function getRequestWindowBounds(
  config: RequestWindowConfig,
  now: Date = new Date()
): RequestWindowBounds {
  const sanitized = sanitizeRequestWindowConfig(config);
  const segments = getRequestWindowSegments(sanitized, now);

  return {
    earliestDate: segments[0].startDate,
    latestDate: segments[segments.length - 1].endDate,
    segments,
    config: sanitized,
  };
}

export function isDateInRequestWindowSegments(
  dateYyyyMmDd: string,
  segments: RequestWindowSegment[]
): boolean {
  return segments.some(
    (s) => dateYyyyMmDd >= s.startDate && dateYyyyMmDd <= s.endDate
  );
}

export function isDateWithinRequestWindow(
  dateYyyyMmDd: string,
  config: RequestWindowConfig,
  now: Date = new Date()
): boolean {
  if (!parseYyyyMmDd(dateYyyyMmDd)) return false;
  return isDateInRequestWindowSegments(
    dateYyyyMmDd,
    getRequestWindowSegments(config, now)
  );
}

function formatSegments(segments: RequestWindowSegment[]): string {
  return segments.map((s) => `${s.startDate} to ${s.endDate}`).join(' and ');
}

/** Tolerates payloads without `segments` (e.g. a cached API response). */
export function requestWindowRejectionMessage(
  dateYyyyMmDd: string,
  bounds: Omit<RequestWindowBounds, 'segments'> & { segments?: RequestWindowSegment[] }
): string {
  const { earliestDate, latestDate, config } = bounds;
  const segments = bounds.segments?.length
    ? bounds.segments
    : [{ startDate: earliestDate, endDate: latestDate }];

  if (dateYyyyMmDd > latestDate) {
    return `Future requests cannot go beyond ${latestDate} (limit: rest of this month plus ${config.futureMonthsAhead} future month(s)).`;
  }

  if (dateYyyyMmDd < earliestDate) {
    return `This date is outside the allowed window. You can request ${formatSegments(segments)} (previous month closes after day ${config.previousMonthCutoffDay}; current-month look-back is ${config.currentMonthPastDays} days).`;
  }

  return `This date is outside the allowed request window. You can request ${formatSegments(segments)} (previous month closes after day ${config.previousMonthCutoffDay}; current-month look-back is ${config.currentMonthPastDays} days).`;
}
