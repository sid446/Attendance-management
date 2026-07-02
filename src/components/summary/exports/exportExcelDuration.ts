/** Excel `[h]:mm` format — durations can exceed 24h and sum correctly in spreadsheets. */
export const EXCEL_DURATION_NUM_FMT = '[h]:mm';

/**
 * Signed elapsed-time format (negative excess/deficit).
 * Requires `enableExcelNegativeDurations` on the workbook — Excel's default 1900 date
 * system cannot display negative time serials and shows ##### instead.
 */
export const EXCEL_SIGNED_DURATION_NUM_FMT = '[h]:mm;-[h]:mm;0:00';

/** Enable 1904 date system so negative duration serials render instead of #####. */
export function enableExcelNegativeDurations(workbook: {
  properties?: { date1904?: boolean };
}): void {
  workbook.properties = { ...workbook.properties, date1904: true };
}

/** Decimal hours → Excel duration serial (fraction of day). */
export function decimalHoursToExcelDuration(
  hours: number | '' | null | undefined
): number | '' {
  if (hours === '' || hours == null || !Number.isFinite(hours)) return '';
  return hours / 24;
}

/** `HH:MM` / `H:MM` clock string → Excel time serial (empty/invalid → ''). */
export function hhmmStringToExcelTime(value: string | null | undefined): number | '' {
  if (value == null) return '';
  const t = String(value).trim();
  if (t === '') return '';
  const match = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const h = Number(match[1]);
  const min = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59) return '';
  return decimalHoursToExcelDuration(h + min / 60);
}
