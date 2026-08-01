import {
  DAYWISE_COLUMN_KEYS,
  DAYWISE_COMPARE_KEYS,
  DAYWISE_COMPARE_LABEL,
  DAYWISE_HEADER_LABELS,
  type DaywiseColumnKey,
  type DaywisePlainRow,
} from '@/components/summary/exports/daywiseExportFormat';

/** Clock-of-day punches / schedule times (never exceed 24h meaningfully). */
const CLOCK_TIME_KEYS = new Set<DaywiseColumnKey>([
  'actualInTimeOriginal',
  'actualOutTimeOriginal',
  'actualInTimeEditable',
  'actualOutTimeEditable',
  'scheduledInTime',
  'scheduledOutTime',
]);

/** Elapsed working/scheduled hours — may exceed 24h (month totals). */
const DURATION_HHMM_KEYS = new Set<DaywiseColumnKey>([
  'punchWorkingHrs',
  'extraWorkHrs',
  'workingHrs',
  'scheduledTime',
  'scheduledHrsMonth',
  'workingHrsMonth',
]);

const TIME_KEYS = new Set<DaywiseColumnKey>([...CLOCK_TIME_KEYS, ...DURATION_HHMM_KEYS]);

const DURATION_LABEL_KEYS = new Set<DaywiseColumnKey>([
  'excessHrsMonth',
  'deficitHrsMonth',
  'excessHrsDay',
  'deficitHrsDay',
]);

const PRESENCE_QUOTA_KEYS = new Set<DaywiseColumnKey>([
  'maxWFH',
  'actualWFH',
  'maxOutstation',
  'actualOutstation',
]);

/** ExcelJS maps serial 0 → 1899-12-30T00:00:00.000Z (UTC). */
const EXCELJS_EPOCH_MS = Date.UTC(1899, 11, 30);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateToExcelSerial(d: Date): number {
  return (d.getTime() - EXCELJS_EPOCH_MS) / 86_400_000;
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** ExcelJS cells may be rich text / formula result objects. */
function cellToPlainText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (typeof value === 'object') {
    const v = value as {
      text?: unknown;
      richText?: Array<{ text?: string }>;
      result?: unknown;
      error?: unknown;
      formula?: unknown;
      sharedFormula?: unknown;
    };
    if (v.error != null) return '';
    if (Array.isArray(v.richText)) {
      return v.richText.map((p) => p.text || '').join('');
    }
    if (v.text != null) return cellToPlainText(v.text);
    if (v.result != null) return cellToPlainText(v.result);
    // Unknown object (avoid "[object Object]")
    return '';
  }
  return String(value);
}

const HEADER_TO_KEY: Map<string, DaywiseColumnKey> = (() => {
  const map = new Map<string, DaywiseColumnKey>();
  DAYWISE_HEADER_LABELS.forEach((label, i) => {
    map.set(normalizeHeader(label), DAYWISE_COLUMN_KEYS[i]);
  });

  // Portal / short aliases
  map.set('employee code', 'employeeCode');
  map.set('emp code', 'employeeCode');
  map.set('emp. code', 'employeeCode');
  map.set('code', 'employeeCode');
  map.set('present / absent', 'presentAbsent');
  map.set('present/absent', 'presentAbsent');
  map.set('actual in (edited)', 'actualInTimeEditable');
  map.set('actual out (edited)', 'actualOutTimeEditable');
  map.set('actual in (original)', 'actualInTimeOriginal');
  map.set('actual out (original)', 'actualOutTimeOriginal');
  map.set('half day', 'halfDays');
  map.set('halfday', 'halfDays');

  // Legacy human sheet (Book.xlsx / Att.* style)
  map.set('weekdays/weekoffs', 'weekType');
  map.set('weekday/weekoffs', 'weekType');
  map.set('weekdays / weekoffs', 'weekType');
  map.set('weekday / weekoffs', 'weekType');
  map.set('employee name', 'employeeName');
  map.set('name', 'employeeName');
  map.set('department name', 'verticalHead');
  map.set('department', 'verticalHead');
  map.set('actual intime orignal data', 'actualInTimeOriginal');
  map.set('actual outtime orignal data', 'actualOutTimeOriginal');
  map.set('actual intime original data', 'actualInTimeOriginal');
  map.set('actual outtime original data', 'actualOutTimeOriginal');
  map.set('actual intime editable data', 'actualInTimeEditable');
  map.set('actual outtime editable data', 'actualOutTimeEditable');
  map.set('true/ false in time', 'trueFalseInTime');
  map.set('true/ false out time', 'trueFalseOutTime');
  map.set('true/false in time', 'trueFalseInTime');
  map.set('true/false out time', 'trueFalseOutTime');
  map.set('scheduled in time', 'scheduledInTime');
  map.set('scheduled out time', 'scheduledOutTime');
  map.set('max - wfh', 'maxWFH');
  map.set('actual - wfh', 'actualWFH');
  map.set('max - outstation (1.2 days)', 'maxOutstation');
  map.set('max - outstation (1.2 day)', 'maxOutstation');
  map.set('actual - out station', 'actualOutstation');
  map.set('actual - outstation', 'actualOutstation');
  map.set('working hrs', 'workingHrs');
  map.set('scheduled time', 'scheduledTime');
  map.set('scheduled  time', 'scheduledTime');
  map.set('sechudled hrs (in month)', 'scheduledHrsMonth');
  map.set('scheduled hrs (in month)', 'scheduledHrsMonth');
  map.set('working hrs (in month)', 'workingHrsMonth');
  map.set('short hrs (in month)', 'deficitHrsMonth');
  map.set('excess hrs (in month)', 'excessHrsMonth');
  map.set('short hrs (in a day)', 'deficitHrsDay');
  map.set('excess hrs (in a day)', 'excessHrsDay');
  map.set('excess hrs working', 'excessHrsDay');
  map.set('excess hrs', 'excessHrsDay');
  map.set('hafldays', 'halfDays');
  map.set('halfdays', 'halfDays');
  return map;
})();

/** Clock time-of-day from an Excel serial (fractional day). */
function excelSerialToClockHhMm(serial: number): string {
  let frac = serial % 1;
  if (frac < 0) frac += 1;
  let totalMinutes = Math.round(frac * 24 * 60);
  if (totalMinutes === 24 * 60) totalMinutes = 0;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/** Duration from Excel serial — keeps hours ≥ 24 (e.g. month totals). */
function excelSerialToDurationHhMm(serial: number): string {
  const totalMinutes = Math.round(serial * 24 * 60);
  const sign = totalMinutes < 0 ? '-' : '';
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${pad2(h)}:${pad2(m)}`;
}

function excelSerialToDurationLabel(serial: number): string {
  const totalSeconds = Math.round(serial * 24 * 3600);
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(totalSeconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `${sign}${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function dateToDdMmYyyy(d: Date): string {
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function formatExcelSerialForKey(serial: number, key?: DaywiseColumnKey): string {
  if (key && DURATION_LABEL_KEYS.has(key)) return excelSerialToDurationLabel(serial);
  if (key && DURATION_HHMM_KEYS.has(key)) return excelSerialToDurationHhMm(serial);
  if (key && CLOCK_TIME_KEYS.has(key)) return excelSerialToClockHhMm(serial);
  if (key && TIME_KEYS.has(key)) return excelSerialToClockHhMm(serial);
  return excelSerialToClockHhMm(serial);
}

function isEmptyishPresenceQuota(val: string): boolean {
  const v = val.trim().toLowerCase();
  return !v || v === '0' || v === '0.0' || v === '0.00' || v === 'na' || v === 'n/a' || v === '-';
}

function isEmptyishDuration(val: string): boolean {
  const v = val.trim();
  if (!v) return true;
  return /^-?0+:0+(:0+)?$/.test(v);
}

function valuesEquivalentForKey(key: DaywiseColumnKey, portal: string, human: string): boolean {
  if (portal === human) return true;
  if (PRESENCE_QUOTA_KEYS.has(key)) {
    return isEmptyishPresenceQuota(portal) && isEmptyishPresenceQuota(human);
  }
  if (DURATION_LABEL_KEYS.has(key) || DURATION_HHMM_KEYS.has(key) || CLOCK_TIME_KEYS.has(key)) {
    if (isEmptyishDuration(portal) && isEmptyishDuration(human)) return true;
  }
  return false;
}

/** Normalize any sheet cell into a stable compare string. */
export function normalizeDaywiseCellValue(raw: unknown, key?: DaywiseColumnKey): string {
  if (raw == null) return '';
  if (typeof raw === 'boolean') {
    if (key === 'halfDays' || key === 'trueFalseInTime' || key === 'trueFalseOutTime') {
      return raw ? 'True' : 'False';
    }
    return raw ? 'True' : 'False';
  }
  if (typeof raw === 'object' && raw !== null && !(raw instanceof Date)) {
    const obj = raw as {
      text?: unknown;
      richText?: Array<{ text?: string }>;
      result?: unknown;
      error?: unknown;
    };
    if (obj.error != null) return '';
    if (Array.isArray(obj.richText)) {
      return normalizeDaywiseCellValue(obj.richText.map((p) => p.text || '').join(''), key);
    }
    if (obj.text != null) return normalizeDaywiseCellValue(obj.text, key);
    if ('result' in obj) return normalizeDaywiseCellValue(obj.result, key);
    return '';
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    if (key === 'date') return dateToDdMmYyyy(raw);
    // ExcelJS stores times/durations as UTC Dates on the 1899-12-30 epoch.
    // Never use local getHours() — IST (+5:30) shifts every punch (12:27 → 17:57).
    return formatExcelSerialForKey(dateToExcelSerial(raw), key);
  }
  if (raw instanceof Date) {
    return '';
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (key === 'date') {
      const utc = new Date(Math.round((raw - 25569) * 86400 * 1000));
      return dateToDdMmYyyy(utc);
    }
    if (key === 'halfDays' || key === 'trueFalseInTime' || key === 'trueFalseOutTime') {
      if (raw === 0) return 'False';
      if (raw === 1) return 'True';
    }
    if (key && (DURATION_LABEL_KEYS.has(key) || TIME_KEYS.has(key))) {
      // Excel time/duration serials are fractions of a day (36h → 1.5).
      // Values ≥ 10 are treated as decimal hours (legacy).
      if (Math.abs(raw) < 10) return formatExcelSerialForKey(raw, key);
      const h = Math.floor(Math.abs(raw));
      const m = Math.round((Math.abs(raw) - h) * 60);
      const sign = raw < 0 ? '-' : '';
      if (key && DURATION_LABEL_KEYS.has(key)) {
        return `${sign}${pad2(h)}:${pad2(m)}:00`;
      }
      return `${sign}${pad2(h)}:${pad2(m)}`;
    }
    const rounded = Math.round(raw * 100) / 100;
    return String(rounded);
  }
  let s = String(raw).replace(/\u00a0/g, ' ').trim();
  if (!s || s === 'Invalid Date' || s === '[object Object]') return '';

  // ExcelJS sometimes stringifies formula results as ISO datetimes
  if (key && key !== 'date' && (TIME_KEYS.has(key) || DURATION_LABEL_KEYS.has(key))) {
    const isoDt = s.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    if (isoDt) {
      const asDate = new Date(s);
      if (!Number.isNaN(asDate.getTime())) {
        return normalizeDaywiseCellValue(asDate, key);
      }
    }
  }

  if (key === 'date') {
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (dmy) {
      const dd = pad2(Number(dmy[1]));
      const mm = pad2(Number(dmy[2]));
      let yyyy = dmy[3];
      if (yyyy.length === 2) yyyy = `20${yyyy}`;
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  if (key && (TIME_KEYS.has(key) || DURATION_LABEL_KEYS.has(key))) {
    const m = s.match(/^(-)?(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) {
      const sign = m[1] || '';
      const h = pad2(Number(m[2]));
      const min = pad2(Number(m[3]));
      if (DURATION_LABEL_KEYS.has(key) || m[4] != null) {
        const sec = pad2(Number(m[4] || 0));
        return `${sign}${h}:${min}:${sec}`;
      }
      return `${sign}${h}:${min}`;
    }
  }
  if (key === 'halfDays' || key === 'trueFalseInTime' || key === 'trueFalseOutTime') {
    const low = s.toLowerCase();
    if (low === 'true' || low === 'yes' || low === '1') return 'True';
    if (low === 'false' || low === 'no' || low === '0') return 'False';
  }
  if (key === 'weekType') {
    const low = s.toLowerCase().replace(/\s+/g, '');
    if (low === 'weekday' || low === 'weekdays') return 'Weekdays';
    if (low === 'weekoff' || low === 'weekoffs' || low === 'weeklyoff') return 'Weekoff';
  }
  if (key === 'presentAbsent') {
    return s.replace(/\s+/g, ' ');
  }
  return s;
}

export function normalizePersonNameForMatch(name: string): string {
  return String(name || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function daywiseRowKey(employeeCode: string, date: string, employeeName?: string): string {
  const d = normalizeDaywiseCellValue(date, 'date');
  const code = normalizeDaywiseCellValue(employeeCode, 'employeeCode').toLowerCase().trim();
  if (code) return `code:${code}|${d}`;
  const name = normalizePersonNameForMatch(employeeName || '');
  if (name) return `name:${name}|${d}`;
  return `|${d}`;
}

function looksLikeValidDaywiseDate(date: string): boolean {
  const m = String(date || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const y = Number(m[3]);
  return y >= 2015 && y <= 2100;
}

function looksLikeEmployeeIdentity(name: string, code: string): boolean {
  const c = String(code || '').trim();
  if (c && !/^\d{1,2}$/.test(c)) return true;
  const n = String(name || '').trim();
  if (!n) return false;
  if (/^\d+$/.test(n)) return false;
  if (/^employee\s*name$/i.test(n)) return false;
  if (/^copy formula/i.test(n)) return false;
  return /[a-zA-Z]/.test(n);
}

type SheetIndexes = {
  byCode: Map<string, DaywisePlainRow>;
  byName: Map<string, DaywisePlainRow>;
  rows: DaywisePlainRow[];
};

function buildSheetIndexes(rows: DaywisePlainRow[]): SheetIndexes {
  const byCode = new Map<string, DaywisePlainRow>();
  const byName = new Map<string, DaywisePlainRow>();
  const kept: DaywisePlainRow[] = [];

  for (const row of rows) {
    const date = normalizeDaywiseCellValue(row.date, 'date');
    if (!looksLikeValidDaywiseDate(date)) continue;
    const code = normalizeDaywiseCellValue(row.employeeCode || '', 'employeeCode').trim();
    const name = String(row.employeeName || '').trim();
    if (!looksLikeEmployeeIdentity(name, code)) continue;

    const normalized: DaywisePlainRow = {
      ...row,
      employeeCode: code,
      date,
      employeeName: name,
    };
    kept.push(normalized);

    if (code) byCode.set(`${code.toLowerCase()}|${date}`, normalized);
    const nameKey = normalizePersonNameForMatch(name);
    if (nameKey) byName.set(`${nameKey}|${date}`, normalized);
  }

  return { byCode, byName, rows: kept };
}

function findHumanMatch(
  portal: DaywisePlainRow,
  human: SheetIndexes
): DaywisePlainRow | undefined {
  const date = normalizeDaywiseCellValue(portal.date, 'date');
  const code = normalizeDaywiseCellValue(portal.employeeCode || '', 'employeeCode').toLowerCase();
  if (code) {
    const byCode = human.byCode.get(`${code}|${date}`);
    if (byCode) return byCode;
  }
  const nameKey = normalizePersonNameForMatch(portal.employeeName || '');
  if (nameKey) {
    return human.byName.get(`${nameKey}|${date}`);
  }
  return undefined;
}

function humanMatchKey(row: DaywisePlainRow): string {
  return daywiseRowKey(row.employeeCode, row.date, row.employeeName);
}

function scanDaywiseHeaderRow(
  // ExcelJS worksheet — keep loose so we don't fight workbook typings
  worksheet: {
    rowCount?: number;
    getRow: (r: number) => {
      eachCell: (
        opt: { includeEmpty: boolean },
        cb: (cell: { value: unknown }, colNumber: number) => void
      ) => void;
    };
  },
  maxScan = 5
): { headerRowNumber: number; colIndexToKey: Map<number, DaywiseColumnKey> } | null {
  const maxHeaderScan = Math.min(maxScan, worksheet.rowCount || 1);
  for (let r = 1; r <= maxHeaderScan; r++) {
    const map = new Map<number, DaywiseColumnKey>();
    worksheet.getRow(r).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = HEADER_TO_KEY.get(normalizeHeader(cellToPlainText(cell.value)));
      if (key) map.set(colNumber, key);
    });
    const values = [...map.values()];
    const hasDate = values.includes('date');
    const hasCode = values.includes('employeeCode');
    const hasName = values.includes('employeeName');
    if (hasDate && (hasCode || hasName)) {
      return { headerRowNumber: r, colIndexToKey: map };
    }
  }
  return null;
}

type DaywiseWorksheet = {
  name: string;
  rowCount?: number;
  getRow: (r: number) => {
    eachCell: (
      opt: { includeEmpty: boolean },
      cb: (cell: { value: unknown }, colNumber: number) => void
    ) => void;
    getCell: (colNumber: number) => { value: unknown };
  };
  eachRow: (
    opt: { includeEmpty: boolean },
    cb: (row: { getCell: (colNumber: number) => { value: unknown } }, rowNumber: number) => void
  ) => void;
};

/**
 * Prefer a sheet that actually has daywise headers. Files like
 * "Attendance Sheet - June'26_E.xlsx" put schedules on sheet 1 (`Sch.Time`)
 * and attendance on sheet 2 (`Att.June26`) — picking sheet 1 fails.
 */
function findDaywiseWorksheet(workbook: {
  getWorksheet: (name: string) => DaywiseWorksheet | undefined;
  worksheets: DaywiseWorksheet[];
}): {
  worksheet: DaywiseWorksheet;
  headerRowNumber: number;
  colIndexToKey: Map<number, DaywiseColumnKey>;
} {
  const preferredNames = ['Daywise Attendance', 'Daywise'];
  for (const name of preferredNames) {
    const ws = workbook.getWorksheet(name);
    if (!ws) continue;
    const header = scanDaywiseHeaderRow(ws);
    if (header) return { worksheet: ws, ...header };
  }

  // Prefer sheets whose name looks like attendance (Att.June26, Att June, etc.)
  const ranked = [...workbook.worksheets].sort((a, b) => {
    const score = (name: string) => {
      const n = name.toLowerCase();
      if (n.startsWith('att')) return 0;
      if (n.includes('daywise') || n.includes('attendance')) return 1;
      if (n.startsWith('sch') || n.includes('schedule') || n.includes('time')) return 3;
      return 2;
    };
    return score(a.name) - score(b.name);
  });

  for (const ws of ranked) {
    const header = scanDaywiseHeaderRow(ws);
    if (header) {
      return { worksheet: ws, ...header };
    }
  }

  throw new Error(
    'Could not recognize daywise headers. Need a sheet with Date plus Employee Code or Employee Name (e.g. Att.June26). Schedule sheets like Sch.Time are skipped.'
  );
}

export async function parseDaywiseSheetBuffer(buffer: ArrayBuffer): Promise<DaywisePlainRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const { worksheet, headerRowNumber, colIndexToKey } = findDaywiseWorksheet(
    workbook as unknown as {
      getWorksheet: (name: string) => DaywiseWorksheet | undefined;
      worksheets: DaywiseWorksheet[];
    }
  );

  const hasCode = [...colIndexToKey.values()].includes('employeeCode');
  const hasDate = [...colIndexToKey.values()].includes('date');
  const hasName = [...colIndexToKey.values()].includes('employeeName');
  if (!hasDate || (!hasCode && !hasName)) {
    throw new Error(
      'Daywise sheet must include Date and either Employee Code or Employee Name columns'
    );
  }

  const rows: DaywisePlainRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const plain: Partial<Record<DaywiseColumnKey, string>> = {};
    colIndexToKey.forEach((key, colNumber) => {
      const cell = row.getCell(colNumber);
      plain[key] = normalizeDaywiseCellValue(cell.value, key);
    });
    const employeeCode = plain.employeeCode || '';
    const date = plain.date || '';
    const employeeName = plain.employeeName || '';
    if (!looksLikeValidDaywiseDate(date)) return;
    if (!looksLikeEmployeeIdentity(employeeName, employeeCode)) return;
    rows.push({
      ...plain,
      employeeCode,
      date,
      employeeName,
    });
  });
  return rows;
}

export type DaywiseFieldDiff = {
  key: DaywiseColumnKey;
  label: string;
  portal: string;
  human: string;
  reason: string;
};

export type DaywiseRowDiff = {
  key: string;
  employeeCode: string;
  date: string;
  employeeName: string;
  kind: 'mismatch' | 'missingInHuman' | 'extraInHuman';
  fields: DaywiseFieldDiff[];
  summary: string;
};

export type DaywiseCompareResult = {
  portalRowCount: number;
  humanRowCount: number;
  matchedRowCount: number;
  mismatchCount: number;
  missingInHumanCount: number;
  extraInHumanCount: number;
  diffs: DaywiseRowDiff[];
};

function reasonForField(key: DaywiseColumnKey, portal: string, human: string): string {
  const label = DAYWISE_COMPARE_LABEL[key];
  switch (key) {
    case 'presentAbsent':
      return `Status differs — portal shows "${portal || '(blank)'}", human sheet shows "${human || '(blank)'}". Often caused by leave/WFH/OS-P/holiday classification or edited punches.`;
    case 'actualInTimeEditable':
    case 'actualOutTimeEditable':
      return `Edited punch time differs in ${label}. Human may have corrected in/out after export, or portal request edits were applied later.`;
    case 'actualInTimeOriginal':
    case 'actualOutTimeOriginal':
      return `Original punch differs in ${label}. Portal source punch changed or sheet was edited from an older export.`;
    case 'scheduledInTime':
    case 'scheduledOutTime':
    case 'scheduledTime':
      return `Schedule differs in ${label}. Check employee schedule history / effective-from dates for that day.`;
    case 'weekType':
      return `Weekday/weekoff differs. Portal uses Sunday + holiday calendar; human sheet may mark a day differently.`;
    case 'halfDays':
      return `Half-day flag differs (Saturday is always half day in portal export).`;
    case 'excessHrsDay':
    case 'deficitHrsDay':
      return `Day excess/deficit differs because punches, schedule, article rules, or day allowance differ.`;
    case 'excessHrsMonth':
    case 'deficitHrsMonth':
    case 'scheduledHrsMonth':
    case 'workingHrsMonth':
      return `Month total column differs — usually a knock-on from day-level punch/status differences.`;
    case 'maxWFH':
    case 'actualWFH':
    case 'maxOutstation':
    case 'actualOutstation':
      return `WFH/outstation fields differ — presence type or day value may not match portal classification.`;
    case 'workingHrs':
    case 'punchWorkingHrs':
    case 'extraWorkHrs':
    case 'extraWorkTimes':
      return `${label} differs — check punch hours and approved extra-work entries.`;
    default:
      return `${label} differs (portal: "${portal || '(blank)'}" vs human: "${human || '(blank)'}").`;
  }
}

export function compareDaywiseRows(
  portalRows: DaywisePlainRow[],
  humanRows: DaywisePlainRow[]
): DaywiseCompareResult {
  const portal = buildSheetIndexes(portalRows);
  const human = buildSheetIndexes(humanRows);

  const diffs: DaywiseRowDiff[] = [];
  let matchedRowCount = 0;
  const matchedHumanKeys = new Set<string>();

  for (const p of portal.rows) {
    const h = findHumanMatch(p, human);
    const rowKey = daywiseRowKey(p.employeeCode, p.date, p.employeeName);
    if (!h) {
      diffs.push({
        key: rowKey,
        employeeCode: p.employeeCode,
        date: p.date,
        employeeName: p.employeeName || '',
        kind: 'missingInHuman',
        fields: [],
        summary: 'Row exists in portal export but is missing from the human sheet.',
      });
      continue;
    }
    matchedHumanKeys.add(humanMatchKey(h));

    const fields: DaywiseFieldDiff[] = [];
    for (const key of DAYWISE_COMPARE_KEYS) {
      const rawHuman = h[key];
      // Column not present on human sheet at all
      if (rawHuman === undefined) continue;
      const pVal = normalizeDaywiseCellValue(p[key] ?? '', key);
      const hVal = normalizeDaywiseCellValue(rawHuman ?? '', key);
      if (valuesEquivalentForKey(key, pVal, hVal)) continue;
      // Legacy sheets often have blank/broken formulas — only compare when human has a value
      if (!hVal) continue;
      // Human sheets fill WFH/OS columns with 0 / NA as placeholders — ignore those
      if (PRESENCE_QUOTA_KEYS.has(key) && isEmptyishPresenceQuota(hVal)) continue;
      fields.push({
        key,
        label: DAYWISE_COMPARE_LABEL[key],
        portal: pVal,
        human: hVal,
        reason: reasonForField(key, pVal, hVal),
      });
    }
    if (fields.length === 0) {
      matchedRowCount += 1;
    } else {
      diffs.push({
        key: rowKey,
        employeeCode: p.employeeCode || h.employeeCode,
        date: p.date,
        employeeName: p.employeeName || h.employeeName || '',
        kind: 'mismatch',
        fields,
        summary: `${fields.length} field${fields.length === 1 ? '' : 's'} differ`,
      });
    }
  }

  for (const h of human.rows) {
    if (matchedHumanKeys.has(humanMatchKey(h))) continue;
    diffs.push({
      key: humanMatchKey(h),
      employeeCode: h.employeeCode,
      date: h.date,
      employeeName: h.employeeName || '',
      kind: 'extraInHuman',
      fields: [],
      summary: 'Row exists in the human sheet but not in the portal export for this month.',
    });
  }

  diffs.sort((a, b) => {
    const kindOrder = { mismatch: 0, missingInHuman: 1, extraInHuman: 2 };
    if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind];
    const nameCmp = a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    const codeCmp = a.employeeCode.localeCompare(b.employeeCode, undefined, { sensitivity: 'base' });
    if (codeCmp !== 0) return codeCmp;
    return a.date.localeCompare(b.date);
  });

  return {
    portalRowCount: portal.rows.length,
    humanRowCount: human.rows.length,
    matchedRowCount,
    mismatchCount: diffs.filter((d) => d.kind === 'mismatch').length,
    missingInHumanCount: diffs.filter((d) => d.kind === 'missingInHuman').length,
    extraInHumanCount: diffs.filter((d) => d.kind === 'extraInHuman').length,
    diffs,
  };
}

/** Read plain compare rows from a generated portal workbook (no re-serialize). */
export async function plainRowsFromDaywiseWorkbook(
  workbook: import('exceljs').Workbook
): Promise<DaywisePlainRow[]> {
  const worksheet =
    workbook.getWorksheet('Daywise Attendance') || workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: DaywisePlainRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const plain: Partial<Record<DaywiseColumnKey, string>> = {};
    for (const key of DAYWISE_COLUMN_KEYS) {
      try {
        plain[key] = normalizeDaywiseCellValue(row.getCell(key).value, key);
      } catch {
        // column key missing on sheet
      }
    }
    const employeeCode = plain.employeeCode || '';
    const date = plain.date || '';
    const employeeName = plain.employeeName || '';
    if (!looksLikeValidDaywiseDate(date)) return;
    if (!looksLikeEmployeeIdentity(employeeName, employeeCode)) return;
    rows.push({
      ...plain,
      employeeCode,
      date,
      employeeName,
    });
  });
  return rows;
}
