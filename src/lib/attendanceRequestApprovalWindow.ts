const TZ = 'Asia/Kolkata';

/** YYYY-MM for a Date in IST (calendar month). */
function monthKeyIst(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  return `${y}-${m}`;
}

/** Previous calendar month key from YYYY-MM. */
function prevMonthKey(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  const y2 = d.getUTCFullYear();
  const m2 = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y2}-${m2}`;
}

/**
 * Current and previous calendar month in IST (partner-only window; no HR after partner).
 * Returns [currentMonthKey, previousMonthKey] both as YYYY-MM.
 */
export function getPartnerOnlyMonthKeysIst(now: Date = new Date()): [string, string] {
  const current = monthKeyIst(now);
  const previous = prevMonthKey(current);
  return [current, previous];
}

/**
 * True if attendance date (YYYY-MM-DD) falls in current or previous calendar month in IST.
 */
export function isAttendanceDatePartnerOnlyIst(dateYyyyMmDd: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYyyyMmDd)) return false;
  const requestMonth = dateYyyyMmDd.slice(0, 7);
  const [current, previous] = getPartnerOnlyMonthKeysIst(now);
  return requestMonth === current || requestMonth === previous;
}
