const TZ = 'Asia/Kolkata';

export interface RequestWindowConfig {
  /** Inclusive day-of-month (IST) until which the previous calendar month stays open. */
  previousMonthCutoffDay: number;
  /** Max look-back for current-month past dates (in days). */
  currentMonthPastDays: number;
  /** 1 = allow through end of next calendar month after today. */
  futureMonthsAhead: number;
}

export const DEFAULT_REQUEST_WINDOW: RequestWindowConfig = {
  previousMonthCutoffDay: 3,
  currentMonthPastDays: 7,
  futureMonthsAhead: 1,
};

export interface RequestWindowBounds {
  earliestDate: string; // YYYY-MM-DD inclusive
  latestDate: string; // YYYY-MM-DD inclusive
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

/** Allowed request date range (inclusive) in IST for the given config. */
export function getRequestWindowBounds(
  config: RequestWindowConfig,
  now: Date = new Date()
): RequestWindowBounds {
  const sanitized = sanitizeRequestWindowConfig(config);
  const today = istDateString(now);
  const currentMonth = monthKeyFromDateStr(today);
  const previousMonth = prevMonthKey(currentMonth);
  const currentMonthStart = firstDayOfMonthYyyyMm(currentMonth);
  const previousMonthStart = firstDayOfMonthYyyyMm(previousMonth);

  let earliest: string;
  if (dayOfMonthIst(now) <= sanitized.previousMonthCutoffDay) {
    earliest = previousMonthStart;
  } else {
    const rollingEarliest = addDaysYyyyMmDd(today, -sanitized.currentMonthPastDays);
    earliest =
      rollingEarliest < currentMonthStart ? currentMonthStart : rollingEarliest;
  }

  const futureMonth = addMonthsToYyyyMm(currentMonth, sanitized.futureMonthsAhead);
  const latest = lastDayOfMonthYyyyMm(futureMonth);

  return { earliestDate: earliest, latestDate: latest, config: sanitized };
}

export function isDateWithinRequestWindow(
  dateYyyyMmDd: string,
  config: RequestWindowConfig,
  now: Date = new Date()
): boolean {
  if (!parseYyyyMmDd(dateYyyyMmDd)) return false;
  const { earliestDate, latestDate } = getRequestWindowBounds(config, now);
  return dateYyyyMmDd >= earliestDate && dateYyyyMmDd <= latestDate;
}

export function requestWindowRejectionMessage(
  dateYyyyMmDd: string,
  bounds: RequestWindowBounds
): string {
  const { earliestDate, latestDate, config } = bounds;
  if (dateYyyyMmDd < earliestDate) {
    const today = istDateString();
    const day = dayOfMonthIst();
    if (day <= config.previousMonthCutoffDay) {
      return `Requests are only allowed from ${earliestDate} onward (previous month open until day ${config.previousMonthCutoffDay}; current-month look-back is ${config.currentMonthPastDays} days).`;
    }
    return `This date is outside the allowed window. You can request from ${earliestDate} (last ${config.currentMonthPastDays} days of the current month; previous month closed after day ${config.previousMonthCutoffDay}).`;
  }
  if (dateYyyyMmDd > latestDate) {
    return `Future requests cannot go beyond ${latestDate} (limit: through end of month ${config.futureMonthsAhead} month(s) ahead).`;
  }
  return 'This date is outside the allowed request window.';
}
