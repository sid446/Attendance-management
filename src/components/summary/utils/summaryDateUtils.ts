/** Label in summary detail modal: ISO keys → dd/mm/yyyy; parseable dates localized; else plain text. */
export function formatSummaryDetailDateLabel(date: string): string {
  const t = String(date || '').trim();
  if (!t) return '—';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }
  const ms = Date.parse(t);
  if (!Number.isNaN(ms)) {
    return new Date(ms).toLocaleDateString('en-GB');
  }
  return t;
}

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

/** `YYYY-MM-DD` from a date-only string or a local calendar Date. */
export function isoDateKey(value: string | Date | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function enumerateIsoDates(startIso: string, endIso: string): string[] {
  const startKey = isoDateKey(startIso);
  const endKey = isoDateKey(endIso);
  if (!startKey || !endKey || startKey > endKey) return [];
  const dates: string[] = [];
  const cursor = calendarDateFromIsoKey(startKey);
  const end = calendarDateFromIsoKey(endKey);
  while (cursor <= end) {
    dates.push(isoDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function summaryPeriodDates(input: {
  filterType: 'month' | 'range' | 'week';
  selectedYear: number;
  selectedMonth: number;
  currentWeekStart?: string;
  rangeStart?: string;
  rangeEnd?: string;
}): string[] {
  if (input.filterType === 'range' && input.rangeStart && input.rangeEnd) {
    return enumerateIsoDates(input.rangeStart, input.rangeEnd);
  }
  if (input.filterType === 'week' && input.currentWeekStart) {
    const weekStartDate = calendarDateFromIsoKey(isoDateKey(input.currentWeekStart));
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStartDate);
      day.setDate(weekStartDate.getDate() + i);
      if (day.getMonth() === input.selectedMonth - 1 && day.getFullYear() === input.selectedYear) {
        dates.push(isoDateKey(day));
      }
    }
    return dates;
  }
  const daysInMonth = new Date(input.selectedYear, input.selectedMonth, 0).getDate();
  const month = String(input.selectedMonth).padStart(2, '0');
  return Array.from({ length: daysInMonth }, (_, index) => {
    return `${input.selectedYear}-${month}-${String(index + 1).padStart(2, '0')}`;
  });
}

/** Sunday or a company holiday. Worked days stay in this count. */
export function isSummaryOffDay(dateStr: string, holidayDates: Set<string>): boolean {
  const key = isoDateKey(dateStr);
  if (!key) return false;
  if (holidayDates.has(key)) return true;
  return calendarDateFromIsoKey(key).getDay() === 0;
}

export function holidayDateSet(holidays: { date: string }[] | undefined): Set<string> {
  const keys = new Set<string>();
  for (const holiday of holidays || []) {
    const key = isoDateKey(holiday.date);
    if (key) keys.add(key);
  }
  return keys;
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
