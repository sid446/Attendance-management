import Holiday from '@/models/Holiday';
import { datesInMonthYear, isEmployeeActiveOnDate } from '@/lib/employeeMisExceptions';
import { isSundayDate } from '@/lib/attendanceSummaryMetrics';
import { hasPhysicalAttendancePresence } from '@/lib/attendancePhysicalPresence';

type DayRecord = Record<string, unknown>;
type RecordsMap = Map<string, DayRecord> | Record<string, DayRecord> | any;

export type HolidaySundayRepairAction = 'added' | 'converted' | 'remapped';

export type HolidaySundayRepairChange = {
  date: string;
  action: HolidaySundayRepairAction;
  fromType: string;
  toType: string;
  reason: string;
};

export type HolidaySundayRepairResult = {
  changed: number;
  added: number;
  converted: number;
  remapped: number;
  changes: HolidaySundayRepairChange[];
};

const WEEKDAY_TO_WEEKOFF: Record<string, string> = {
  'Present - in office - weekdays': 'Present - in office - weekoff',
  'Present - in office': 'Present - in office - weekoff',
  Present: 'Present - in office - weekoff',
  'WFH - weekdays': 'WFH - weekoff',
  'Work From Home (WFH)': 'WFH - weekoff',
  'Half Day - weekdays': 'Half Day - weekoff',
  'Half Day (HD)': 'Half Day - weekoff',
  'Present - Outstation (Weekdays)': 'Present - Outstation (Weekoff)',
  'Present - ClientPlace (Weekdays)': 'Present - ClientPlace (Weekoff)',
  ThumbMachine: 'Present - in office - weekoff',
  Manual: 'Present - in office - weekoff',
  Remote: 'Present - in office - weekoff',
};

function getDayRecord(records: RecordsMap, date: string): DayRecord | undefined {
  if (!records) return undefined;
  if (typeof records.get === 'function') {
    return records.get(date) as DayRecord | undefined;
  }
  return records[date] as DayRecord | undefined;
}

function setDayRecord(
  attendance: { records: RecordsMap; markModified?: (path: string) => void },
  date: string,
  rec: DayRecord
): void {
  if (typeof attendance.records?.set === 'function') {
    attendance.records.set(date, rec);
  } else if (attendance.records) {
    (attendance.records as Record<string, DayRecord>)[date] = rec;
  }
  attendance.markModified?.('records');
}

function cloneDayRecord(rec: DayRecord | undefined): DayRecord {
  if (!rec) return {};
  if (typeof (rec as { toObject?: () => DayRecord }).toObject === 'function') {
    return (rec as { toObject: () => DayRecord }).toObject();
  }
  return { ...rec };
}

function typeOf(rec: DayRecord | undefined): string {
  return String(rec?.typeOfPresence || '').trim();
}

function isRestType(type: string): boolean {
  return type === 'Holiday' || type === 'Sunday' || type === 'Weekoff';
}

function isLeaveType(type: string): boolean {
  const t = type.toLowerCase();
  return t === 'on leave' || t === 'leave';
}

function hasExtraWork(rec: DayRecord | undefined): boolean {
  const entries = rec?.extraWorkEntries;
  return Array.isArray(entries) && entries.length > 0;
}

/**
 * Worked on a rest day: punches, hours, extra work, or an explicit presence type.
 * Leave / blank Absent without punches is not work.
 */
export function hasWorkedOnRestDay(rec: DayRecord | undefined): boolean {
  if (!rec) return false;
  if (hasPhysicalAttendancePresence(rec as any)) return true;
  if (hasExtraWork(rec)) return true;
  if (Number(rec.totalHour || 0) > 0) return true;

  const t = typeOf(rec).toLowerCase();
  if (!t) return false;
  if (isLeaveType(t) || t === 'absent' || isRestType(typeOf(rec))) return false;
  return (
    t.includes('present') ||
    t.includes('wfh') ||
    t.includes('half day') ||
    t.includes('outstation') ||
    t.includes('client') ||
    t.includes('special allowance') ||
    t.includes('wo-pio') ||
    t.includes('os-p') ||
    t.includes('extra work')
  );
}

function restDayRecord(remarks: string, existing?: DayRecord): DayRecord {
  const base = cloneDayRecord(existing);
  return {
    ...base,
    checkin: String(base.checkin || '00:00'),
    checkout: String(base.checkout || '00:00'),
    editedCheckin: base.editedCheckin || '',
    editedCheckout: base.editedCheckout || '',
    totalHour: 0,
    excessHour: 0,
    typeOfPresence: 'Holiday',
    halfDay: false,
    value: 0,
    remarks: remarks || String(base.remarks || ''),
  };
}

function appendRemark(existing: unknown, extra: string): string {
  const cur = String(existing || '').trim();
  if (!extra) return cur;
  if (!cur) return extra;
  if (cur.includes(extra)) return cur;
  return `${cur} | ${extra}`;
}

function weekoffTypeForWorkedDay(currentType: string): string | null {
  if (WEEKDAY_TO_WEEKOFF[currentType]) return WEEKDAY_TO_WEEKOFF[currentType];
  const t = currentType.toLowerCase();
  if (!t || isRestType(currentType) || t.includes('weekoff') || t.includes('week off')) {
    return null;
  }
  if (t === 'absent') return 'Present - in office - weekoff';
  return null;
}

export async function loadActiveHolidayNameByDate(
  years?: number[]
): Promise<Map<string, string>> {
  const query: Record<string, unknown> = { isActive: true };
  if (years && years.length > 0) query.year = { $in: years };
  const holidays = await Holiday.find(query).select('date name').lean();
  const map = new Map<string, string>();
  for (const h of holidays) {
    const dateKey = String(h.date || '').slice(0, 10);
    if (dateKey) map.set(dateKey, String(h.name || 'Holiday'));
  }
  return map;
}

/**
 * Repair one month of attendance:
 * - Missing Sunday / company-holiday rows → Holiday
 * - Absent / empty / 00:00 unmarked rest days → Holiday
 * - Present / punched / extra-work / WFH / OS on rest days → keep (remap weekday→weekoff)
 * - On leave on a rest day → keep (leave already applied)
 * - Inactive / pre-joining dates → skip
 */
export function repairHolidayAndSundayRecords(
  attendance: {
    records: RecordsMap;
    monthYear: string;
    markModified?: (path: string) => void;
  },
  holidayNameByDate: Map<string, string>,
  options?: {
    fromDate?: string;
    toDate?: string;
    user?: any;
  }
): HolidaySundayRepairResult {
  const monthYear = String(attendance.monthYear || '').slice(0, 7);
  const empty: HolidaySundayRepairResult = {
    changed: 0,
    added: 0,
    converted: 0,
    remapped: 0,
    changes: [],
  };
  if (!/^\d{4}-\d{2}$/.test(monthYear)) return empty;

  const from = options?.fromDate?.slice(0, 10);
  const to = options?.toDate?.slice(0, 10);
  const user = options?.user;
  const result = { ...empty, changes: [] as HolidaySundayRepairChange[] };

  for (const dateKey of datesInMonthYear(monthYear)) {
    if (from && dateKey < from) continue;
    if (to && dateKey > to) continue;
    if (user && !isEmployeeActiveOnDate(user, dateKey)) continue;

    const holidayName = holidayNameByDate.get(dateKey);
    const sunday = isSundayDate(dateKey);
    if (!holidayName && !sunday) continue;

    const restLabel = holidayName || 'Weekly Off (Sunday)';
    const existing = getDayRecord(attendance.records, dateKey);

    if (!existing) {
      setDayRecord(attendance, dateKey, restDayRecord(restLabel));
      result.added += 1;
      result.changes.push({
        date: dateKey,
        action: 'added',
        fromType: '',
        toType: 'Holiday',
        reason: restLabel,
      });
      continue;
    }

    const rec = cloneDayRecord(existing);
    const currentType = typeOf(rec);

    if (hasWorkedOnRestDay(rec)) {
      const nextType = weekoffTypeForWorkedDay(currentType);
      if (nextType && nextType !== currentType) {
        rec.typeOfPresence = nextType;
        rec.remarks = appendRemark(rec.remarks, restLabel);
        setDayRecord(attendance, dateKey, rec);
        result.remapped += 1;
        result.changes.push({
          date: dateKey,
          action: 'remapped',
          fromType: currentType,
          toType: nextType,
          reason: `Worked on ${restLabel}`,
        });
      }
      continue;
    }

    if (isLeaveType(currentType) || isRestType(currentType)) {
      continue;
    }

    // Unmarked / Absent / empty punches on a rest day → Holiday
    setDayRecord(attendance, dateKey, restDayRecord(restLabel, rec));
    result.converted += 1;
    result.changes.push({
      date: dateKey,
      action: 'converted',
      fromType: currentType || '(blank)',
      toType: 'Holiday',
      reason: restLabel,
    });
  }

  result.changed = result.added + result.converted + result.remapped;
  return result;
}

/**
 * Fill calendar holidays and Sundays that have no attendance row yet,
 * and convert unmarked Absent rest days. Does not overwrite worked days.
 */
export async function fillMissingHolidayAndSundayRecords(
  attendance: {
    records: RecordsMap;
    monthYear: string;
    markModified?: (path: string) => void;
  },
  options?: { fromDate?: string; toDate?: string; user?: any }
): Promise<number> {
  const monthYear = String(attendance.monthYear || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(monthYear)) return 0;
  const year = Number(monthYear.slice(0, 4));
  const holidayNameByDate = await loadActiveHolidayNameByDate([year]);
  const result = repairHolidayAndSundayRecords(attendance, holidayNameByDate, options);
  return result.changed;
}
