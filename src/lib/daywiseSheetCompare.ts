import {
  DAYWISE_COLUMN_KEYS,
  DAYWISE_COMPARE_KEYS,
  DAYWISE_COMPARE_LABEL,
  DAYWISE_HEADER_LABELS,
  type DaywiseColumnKey,
  type DaywisePlainRow,
} from '@/components/summary/exports/daywiseExportFormat';

const TIME_KEYS = new Set<DaywiseColumnKey>([
  'actualInTimeOriginal',
  'actualOutTimeOriginal',
  'actualInTimeEditable',
  'actualOutTimeEditable',
  'scheduledInTime',
  'scheduledOutTime',
  'punchWorkingHrs',
  'extraWorkHrs',
  'workingHrs',
  'scheduledTime',
  'scheduledHrsMonth',
  'workingHrsMonth',
]);

const DURATION_LABEL_KEYS = new Set<DaywiseColumnKey>([
  'excessHrsMonth',
  'deficitHrsMonth',
  'excessHrsDay',
  'deficitHrsDay',
]);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const HEADER_TO_KEY: Map<string, DaywiseColumnKey> = (() => {
  const map = new Map<string, DaywiseColumnKey>();
  DAYWISE_HEADER_LABELS.forEach((label, i) => {
    map.set(normalizeHeader(label), DAYWISE_COLUMN_KEYS[i]);
  });
  map.set('employee code', 'employeeCode');
  map.set('emp code', 'employeeCode');
  map.set('present / absent', 'presentAbsent');
  map.set('present/absent', 'presentAbsent');
  map.set('actual in (edited)', 'actualInTimeEditable');
  map.set('actual out (edited)', 'actualOutTimeEditable');
  map.set('actual in (original)', 'actualInTimeOriginal');
  map.set('actual out (original)', 'actualOutTimeOriginal');
  map.set('half day', 'halfDays');
  map.set('halfday', 'halfDays');
  return map;
})();

function excelSerialToHhMm(serial: number): string {
  const totalMinutes = Math.round(((serial % 1) + (serial < 0 ? 1 : 0)) * 24 * 60);
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = totalMinutes < 0 || serial < 0 ? '-' : '';
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

/** Normalize any sheet cell into a stable compare string. */
export function normalizeDaywiseCellValue(raw: unknown, key?: DaywiseColumnKey): string {
  if (raw == null) return '';
  if (typeof raw === 'object' && raw !== null && 'text' in (raw as object)) {
    return normalizeDaywiseCellValue((raw as { text?: unknown }).text, key);
  }
  if (typeof raw === 'object' && raw !== null && 'result' in (raw as object)) {
    return normalizeDaywiseCellValue((raw as { result?: unknown }).result, key);
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    if (key === 'date') return dateToDdMmYyyy(raw);
    return `${pad2(raw.getHours())}:${pad2(raw.getMinutes())}`;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (key === 'date') {
      const utc = new Date(Math.round((raw - 25569) * 86400 * 1000));
      return dateToDdMmYyyy(utc);
    }
    if (key && DURATION_LABEL_KEYS.has(key)) {
      return excelSerialToDurationLabel(raw);
    }
    if (key && TIME_KEYS.has(key)) {
      if (raw >= 0 && raw < 10) return excelSerialToHhMm(raw);
      const h = Math.floor(raw);
      const m = Math.round((raw - h) * 60);
      return `${pad2(h)}:${pad2(m)}`;
    }
    const rounded = Math.round(raw * 100) / 100;
    return String(rounded);
  }
  let s = String(raw).replace(/\u00a0/g, ' ').trim();
  if (!s) return '';
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
  if (key === 'presentAbsent') {
    return s.replace(/\s+/g, ' ');
  }
  return s;
}

export function daywiseRowKey(employeeCode: string, date: string): string {
  return `${normalizeDaywiseCellValue(employeeCode, 'employeeCode').toLowerCase()}|${normalizeDaywiseCellValue(date, 'date')}`;
}

export async function parseDaywiseSheetBuffer(buffer: ArrayBuffer): Promise<DaywisePlainRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet =
    workbook.getWorksheet('Daywise Attendance') ||
    workbook.worksheets.find((ws) => ws.rowCount > 1) ||
    workbook.worksheets[0];
  if (!worksheet) throw new Error('No worksheet found in the uploaded file');

  const headerRow = worksheet.getRow(1);
  const colIndexToKey = new Map<number, DaywiseColumnKey>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = HEADER_TO_KEY.get(normalizeHeader(cell.value));
    if (key) colIndexToKey.set(colNumber, key);
  });

  if (!colIndexToKey.size) {
    throw new Error(
      'Could not recognize daywise headers. Use a sheet with the same columns as the portal daywise export.'
    );
  }
  const hasCode = [...colIndexToKey.values()].includes('employeeCode');
  const hasDate = [...colIndexToKey.values()].includes('date');
  if (!hasCode || !hasDate) {
    throw new Error('Daywise sheet must include Employee Code and Date columns');
  }

  const rows: DaywisePlainRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const plain: Partial<Record<DaywiseColumnKey, string>> = {};
    colIndexToKey.forEach((key, colNumber) => {
      const cell = row.getCell(colNumber);
      plain[key] = normalizeDaywiseCellValue(cell.value, key);
    });
    const employeeCode = plain.employeeCode || '';
    const date = plain.date || '';
    if (!employeeCode && !date) return;
    rows.push({
      ...plain,
      employeeCode,
      date,
      employeeName: plain.employeeName || '',
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
  const portalMap = new Map<string, DaywisePlainRow>();
  for (const row of portalRows) {
    const k = daywiseRowKey(row.employeeCode, row.date);
    if (!k.startsWith('|') && !k.endsWith('|')) portalMap.set(k, row);
  }
  const humanMap = new Map<string, DaywisePlainRow>();
  for (const row of humanRows) {
    const k = daywiseRowKey(row.employeeCode, row.date);
    if (!k.startsWith('|') && !k.endsWith('|')) humanMap.set(k, row);
  }

  const diffs: DaywiseRowDiff[] = [];
  let matchedRowCount = 0;

  for (const [k, portal] of portalMap) {
    const human = humanMap.get(k);
    if (!human) {
      diffs.push({
        key: k,
        employeeCode: portal.employeeCode,
        date: portal.date,
        employeeName: portal.employeeName || '',
        kind: 'missingInHuman',
        fields: [],
        summary: 'Row exists in portal export but is missing from the human sheet.',
      });
      continue;
    }
    const fields: DaywiseFieldDiff[] = [];
    for (const key of DAYWISE_COMPARE_KEYS) {
      const p = normalizeDaywiseCellValue(portal[key] ?? '', key);
      const h = normalizeDaywiseCellValue(human[key] ?? '', key);
      if (p === h) continue;
      if (!p && !h) continue;
      fields.push({
        key,
        label: DAYWISE_COMPARE_LABEL[key],
        portal: p,
        human: h,
        reason: reasonForField(key, p, h),
      });
    }
    if (fields.length === 0) {
      matchedRowCount += 1;
    } else {
      diffs.push({
        key: k,
        employeeCode: portal.employeeCode,
        date: portal.date,
        employeeName: portal.employeeName || human.employeeName || '',
        kind: 'mismatch',
        fields,
        summary: `${fields.length} field${fields.length === 1 ? '' : 's'} differ`,
      });
    }
  }

  for (const [k, human] of humanMap) {
    if (portalMap.has(k)) continue;
    diffs.push({
      key: k,
      employeeCode: human.employeeCode,
      date: human.date,
      employeeName: human.employeeName || '',
      kind: 'extraInHuman',
      fields: [],
      summary: 'Row exists in the human sheet but not in the portal export for this month.',
    });
  }

  diffs.sort((a, b) => {
    const kindOrder = { mismatch: 0, missingInHuman: 1, extraInHuman: 2 };
    if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind];
    const codeCmp = a.employeeCode.localeCompare(b.employeeCode, undefined, { sensitivity: 'base' });
    if (codeCmp !== 0) return codeCmp;
    return a.date.localeCompare(b.date);
  });

  return {
    portalRowCount: portalMap.size,
    humanRowCount: humanMap.size,
    matchedRowCount,
    mismatchCount: diffs.filter((d) => d.kind === 'mismatch').length,
    missingInHumanCount: diffs.filter((d) => d.kind === 'missingInHuman').length,
    extraInHumanCount: diffs.filter((d) => d.kind === 'extraInHuman').length,
    diffs,
  };
}

/** Read plain compare rows from a generated portal workbook. */
export async function plainRowsFromDaywiseWorkbook(
  workbook: import('exceljs').Workbook
): Promise<DaywisePlainRow[]> {
  const buffer = await workbook.xlsx.writeBuffer();
  return parseDaywiseSheetBuffer(buffer as ArrayBuffer);
}
