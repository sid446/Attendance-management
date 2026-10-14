import Holiday from '@/models/Holiday';
import { datesInMonthYear, isEmployeeActiveOnDate } from '@/lib/employeeMisExceptions';
import { isSundayDate } from '@/lib/attendanceSummaryMetrics';
import { hasPhysicalAttendancePresence } from '@/lib/attendancePhysicalPresence';
import { getScheduledTimes } from '@/lib/scheduleUtils';

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
    let scheduleOffLabel = '';
    if (user && !holidayName && !sunday) {
      // isHoliday is only the schedule checkbox. Blank Saturday times are not a week off.
      const sched = getScheduledTimes(user, dateKey);
      if (sched.isHoliday) {
        const dow = new Date(`${dateKey}T12:00:00`).getDay();
        scheduleOffLabel = dow === 6 ? 'Weekly Off (Saturday)' : 'Weekly Off';
      }
    }
    if (!holidayName && !sunday && !scheduleOffLabel) continue;

    const restLabel = holidayName || (sunday ? 'Weekly Off (Sunday)' : scheduleOffLabel);
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

    // Schedule weekoff (for example Saturday holiday): a Present/Absent label
    // with no punches is not work. Company holidays and Sundays keep the
    // existing rule so a real presence type is preserved.
    const worked = scheduleOffLabel
      ? hasPhysicalAttendancePresence(rec) || hasExtraWork(rec)
      : hasWorkedOnRestDay(rec);
    if (worked) {
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

    if (isRestType(currentType)) continue;
    // Paid leave on a schedule weekoff (Saturday holiday) is not a working-day leave.
    if (isLeaveType(currentType) && !scheduleOffLabel) continue;
    if (isLeaveType(currentType) && hasPhysicalAttendancePresence(rec)) continue;

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

const FALSE_SCHEDULE_OFF_LABELS = new Set(['Weekly Off (Saturday)', 'Weekly Off']);

const WEEKOFF_TO_WEEKDAY: Record<string, string> = {
  'Present - in office - weekoff': 'Present - in office - weekdays',
  'WFH - weekoff': 'WFH - weekdays',
  'Half Day - weekoff': 'Half Day - weekdays',
  'Present - Outstation (Weekoff)': 'Present - Outstation (Weekdays)',
  'Present- Outstation (Weekoff)': 'Present - Outstation (Weekdays)',
  'Present - ClientPlace (Weekoff)': 'Present - ClientPlace (Weekdays)',
  'Present - weekoff': 'Present - in office - weekdays',
  'Weekly Off - Present (WO-Present)': 'Present - in office - weekdays',
  'Weekly Off - Work From Home (WO-WFH)': 'WFH - weekdays',
};

export type FalseScheduleHolidayAction = 'deleted' | 'restored-absent' | 'restored-worked' | 'remark-cleared';

export type FalseScheduleHolidayChange = {
  date: string;
  action: FalseScheduleHolidayAction;
  fromType: string;
  toType: string;
};

export type FalseScheduleHolidayRevertResult = {
  changed: number;
  deleted: number;
  restoredAbsent: number;
  restoredWorked: number;
  remarksCleared: number;
  changes: FalseScheduleHolidayChange[];
};

function remarkParts(remarks: unknown): string[] {
  return String(remarks || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasFalseScheduleOffRemark(remarks: unknown): boolean {
  return remarkParts(remarks).some((part) => FALSE_SCHEDULE_OFF_LABELS.has(part));
}

function stripFalseScheduleOffRemark(remarks: unknown): string {
  return remarkParts(remarks)
    .filter((part) => !FALSE_SCHEDULE_OFF_LABELS.has(part))
    .join(' | ');
}

function deleteDayRecord(
  attendance: { records: RecordsMap; markModified?: (path: string) => void },
  date: string
): void {
  if (typeof attendance.records?.delete === 'function') {
    attendance.records.delete(date);
  } else if (attendance.records) {
    delete (attendance.records as Record<string, DayRecord>)[date];
  }
  attendance.markModified?.('records');
}

function weekdayTypeForFalseWeekoff(currentType: string, remarksAfterStrip: string, rec: DayRecord): string {
  if (
    currentType === 'Present - in office - weekoff' &&
    !remarksAfterStrip &&
    hasPhysicalAttendancePresence(rec)
  ) {
    return 'ThumbMachine';
  }
  return WEEKOFF_TO_WEEKDAY[currentType] || currentType;
}

/**
 * Undo holiday / weekoff marks on days the schedule does not mark as Holiday.
 * Real Sundays, company holidays, schedule-checkbox holidays, and dates in
 * preserveDates (approved Holiday requests) are left alone.
 * Script-added stubs (no edited punches) are removed. Uploaded empty days
 * go back to Absent. Worked days go back to a weekday presence type.
 */
export function revertFalseScheduleHolidayRecords(
  attendance: {
    records: RecordsMap;
    monthYear: string;
    markModified?: (path: string) => void;
  },
  holidayNameByDate: Map<string, string>,
  options?: { user?: any; preserveDates?: Set<string> }
): FalseScheduleHolidayRevertResult {
  const monthYear = String(attendance.monthYear || '').slice(0, 7);
  const empty: FalseScheduleHolidayRevertResult = {
    changed: 0,
    deleted: 0,
    restoredAbsent: 0,
    restoredWorked: 0,
    remarksCleared: 0,
    changes: [],
  };
  if (!/^\d{4}-\d{2}$/.test(monthYear)) return empty;

  const user = options?.user;
  if (!user) return empty;

  const result = { ...empty, changes: [] as FalseScheduleHolidayChange[] };

  for (const dateKey of datesInMonthYear(monthYear)) {
    const existing = getDayRecord(attendance.records, dateKey);
    if (!existing) continue;
    const looksFalseRest = isRestType(typeOf(existing));
    if (!hasFalseScheduleOffRemark(existing.remarks) && !looksFalseRest) continue;
    if (isSundayDate(dateKey) || holidayNameByDate.has(dateKey)) continue;
    if (getScheduledTimes(user, dateKey).isHoliday) continue;
    if (options?.preserveDates?.has(dateKey)) continue;

    const rec = cloneDayRecord(existing);
    const currentType = typeOf(rec);
    const strippedRemarks = stripFalseScheduleOffRemark(rec.remarks);
    const worked = hasPhysicalAttendancePresence(rec) || hasExtraWork(rec);

    if (worked) {
      const nextType = isRestType(currentType)
        ? strippedRemarks
          ? 'Present - in office - weekdays'
          : 'ThumbMachine'
        : weekdayTypeForFalseWeekoff(currentType, strippedRemarks, rec);
      const typeChanged = nextType !== currentType;
      const remarksChanged = strippedRemarks !== String(rec.remarks || '').trim();
      if (!typeChanged && !remarksChanged) continue;
      rec.typeOfPresence = nextType;
      rec.remarks = strippedRemarks;
      setDayRecord(attendance, dateKey, rec);
      result.restoredWorked += 1;
      result.changes.push({
        date: dateKey,
        action: 'restored-worked',
        fromType: currentType,
        toType: nextType,
      });
      continue;
    }

    if (isRestType(currentType)) {
      const editedIn = String(rec.editedCheckin ?? '').trim();
      const editedOut = String(rec.editedCheckout ?? '').trim();
      const checkin = String(rec.checkin ?? '').trim();
      const checkout = String(rec.checkout ?? '').trim();
      const hadUploadedRow =
        editedIn !== '' || editedOut !== '' || checkin !== '' || checkout !== '';
      if (!hadUploadedRow && !strippedRemarks) {
        deleteDayRecord(attendance, dateKey);
        result.deleted += 1;
        result.changes.push({
          date: dateKey,
          action: 'deleted',
          fromType: currentType,
          toType: '',
        });
        continue;
      }
      rec.typeOfPresence = 'Absent';
      rec.halfDay = false;
      rec.value = 0;
      rec.totalHour = 0;
      rec.excessHour = 0;
      rec.remarks = strippedRemarks;
      setDayRecord(attendance, dateKey, rec);
      result.restoredAbsent += 1;
      result.changes.push({
        date: dateKey,
        action: 'restored-absent',
        fromType: currentType,
        toType: 'Absent',
      });
      continue;
    }

    if (strippedRemarks === String(rec.remarks || '').trim()) continue;
    rec.remarks = strippedRemarks;
    setDayRecord(attendance, dateKey, rec);
    result.remarksCleared += 1;
    result.changes.push({
      date: dateKey,
      action: 'remark-cleared',
      fromType: currentType,
      toType: currentType,
    });
  }

  result.changed =
    result.deleted + result.restoredAbsent + result.restoredWorked + result.remarksCleared;
  return result;
}
