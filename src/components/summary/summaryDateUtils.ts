/** Sort key for `YYYY-MM-DD` — integer compare avoids any timezone parsing. */
export function isoCalendarKeyToSortNumber(iso: string): number | null {
  const t = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

/** Display-only: calendar cell as dd.mm.yyyy from DB key (never pass JS Date into Excel for this). */
export function formatIsoKeyAsDdMmYyyy(isoKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoKey || '').trim());
  if (!m) return String(isoKey || '');
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Chronological sort for attendance date keys (`yyyy-mm-dd` or parseable ISO). Object key order is not reliable. */
export function sortRecordDetailsEntries<T>(
  recordDetails: Record<string, T> | undefined | null
): [string, T][] {
  return Object.entries(recordDetails || {}).sort(([a], [b]) => {
    const na = isoCalendarKeyToSortNumber(a);
    const nb = isoCalendarKeyToSortNumber(b);
    if (na != null && nb != null) return na - nb;
    const msA = Date.parse(a.trim());
    const msB = Date.parse(b.trim());
    if (!Number.isNaN(msA) && !Number.isNaN(msB)) return msA - msB;
    return a.localeCompare(b);
  });
}

/** Calendar day from attendance key `YYYY-MM-DD` without UTC drift. */
export function calendarDateFromIsoKey(iso: string): Date {
  const parts = String(iso || '')
    .trim()
    .split('-');
  if (parts.length !== 3) return new Date(iso);
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return new Date(iso);
  return new Date(y, mo - 1, d);
}
