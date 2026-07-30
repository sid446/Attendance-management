import type { User } from '@/types/ui';
import { applyDayAllowanceToRawExcess } from '@/lib/excessHourAllowance';
import {
  getEmploymentTypeForDate,
  getScheduledHoursNoLunchForMonth,
  isDayIncludedInScheduledCalc,
} from '@/lib/attendanceSummaryMetrics';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import {
  formatExtraWorkEntriesTimeSummary,
  getRecordPunchHours,
  sumExtraWorkEntryHours,
} from '@/lib/extraWorkRequest';
import { getDesignationForDate, getWorkingUnderPartnerForDate } from '@/lib/userFieldHistory';
import { formatIsoKeyAsDdMmYyyy, sortRecordDetailsEntries } from '../utils/summaryDateUtils';
import { calendarDateFromIsoKey } from '../utils/summaryDateUtils';
import type { SummaryExportContext } from './exportTypes';
import {
  decimalHoursToExcelDuration,
  EXCEL_DURATION_NUM_FMT,
  hhmmStringToExcelTime,
  splitExcessAndDeficitLabels,
} from './exportExcelDuration';
import { downloadWorkbook } from './downloadWorkbook';
import {
  calculateArticleDayExcessMinutes,
  isArticleEmployee,
} from '@/lib/isArticleEmployee';
import { isDateOnOrAfterInactive } from '@/lib/attendanceInactiveFilter';
import {
  effectiveScheduledMinutesForDay,
  isHalfDayAttendanceRecord,
} from '@/lib/calculateDayExcessHour';
import {
  daywiseSourceLookupKey,
  formatDaywiseSourceLabel,
  type AttendanceEditSourceInfo,
} from '@/lib/daywiseAttendanceSource';
import { DAYWISE_COLUMN_KEYS, DAYWISE_HEADER_LABELS } from './daywiseExportFormat';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';

export async function buildDaywiseWorkbook(
  ctx: SummaryExportContext,
  options?: { skipFormatting?: boolean }
): Promise<import('exceljs').Workbook | null> {
  const {
    filteredSummaries,
    allUsers,
    holidays,
    filterType,
    selectedYear,
    selectedMonth,
    currentWeekStart,
    rangeStart,
    rangeEnd,
    selectedEmployeeIds,
    resolveWorkPartner: resolveWorkPartnerForItem,
    resolveDesignation: resolveDesignationForItem,
    countTotalSundaysInPeriod,
  } = ctx;

    if (filteredSummaries.length === 0) return null;

    const summariesToExport =
      selectedEmployeeIds.size > 0
        ? filteredSummaries.filter((item) => selectedEmployeeIds.has(item.userId))
        : filteredSummaries;

    if (summariesToExport.length === 0) return null;

    // Approved-request Source fallback (partner / HR) for days missing stamp on the record
    const sourceByUserDate = new Map<string, AttendanceEditSourceInfo>();
    try {
      const monthYears = new Set<string>();
      for (const item of summariesToExport) {
        if (item.monthYear) monthYears.add(String(item.monthYear));
        Object.keys(item.recordDetails || {}).forEach((iso) => {
          const m = String(iso).slice(0, 7);
          if (/^\d{4}-\d{2}$/.test(m)) monthYears.add(m);
        });
      }
      if (filterType === 'month') {
        monthYears.add(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}`);
      }
      const params = new URLSearchParams();
      [...monthYears].forEach((my) => params.append('monthYear', my));
      if ([...monthYears].length > 0) {
        const res = await fetch(`/api/attendance/daywise-sources?${params}`, hrCredentialsInit());
        if (res.ok) {
          const json = await res.json();
          if (json?.success && json.data && typeof json.data === 'object') {
            for (const [k, v] of Object.entries(json.data as Record<string, AttendanceEditSourceInfo>)) {
              sourceByUserDate.set(k, v);
            }
          }
        }
      }
    } catch {
      // Source enrichment is best-effort; export still proceeds
    }

    // 1. Fetch holidays for the relevant year(s)
    let years = new Set<number>();
    summariesToExport.forEach((summary) => {
      if (summary && summary.recordDetails) {
        Object.keys(summary.recordDetails).forEach(dateStr => {
          years.add(Number(dateStr.substring(0, 4)));
        });
      }
    });
    let fetchedHolidays: { date: string; name: string }[] = [];
    for (const year of years) {
      try {
        const res = await fetch(`/api/holidays?year=${year}&activeOnly=true`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.data) {
            fetchedHolidays = fetchedHolidays.concat(data.data.map((h: any) => ({ date: h.date, name: h.name })));
          }
        }
      } catch (e) {
        // Ignore fetch errors, continue
      }
    }
    const holidayDates = new Set(fetchedHolidays.map(h => h.date));

    // Import ExcelJS dynamically
    const ExcelJS = (await import('exceljs')).default;

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Daywise Attendance', {
      views: [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' }],
    });

    // Column keys + widths (no `header` here — we insert a real header row so row 1 is not overwritten by data)
    worksheet.columns = DAYWISE_COLUMN_KEYS.map((key) => ({
      key,
      width:
        key === 'source'
          ? 28
          : key === 'employeeName' || key === 'verticalHead' || key === 'extraWorkTimes'
          ? 22
          : key === 'designation'
            ? 16
            : key === 'employeeCode'
              ? 14
              : 12,
    }));

    const daywiseHeaderLabels = [...DAYWISE_HEADER_LABELS];
    worksheet.insertRow(1, daywiseHeaderLabels);

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const toIsoFromLocalDate = (dt: Date) =>
      `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

    /** Selected summary period as inclusive ISO date bounds (string compare safe for YYYY-MM-DD). */
    const getDaywiseExportIsoInclusiveRange = (): { min: string; max: string } | null => {
      if (filterType === 'month') {
        const y = selectedYear;
        const m = selectedMonth;
        const lastD = new Date(y, m, 0).getDate();
        return { min: `${y}-${pad2(m)}-01`, max: `${y}-${pad2(m)}-${pad2(lastD)}` };
      }
      if (filterType === 'week' && currentWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(currentWeekStart.trim())) {
        const [wy, wm, wd] = currentWeekStart.trim().split('-').map(Number);
        let ws = new Date(wy, wm - 1, wd);
        const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
        const lastDayMonth = new Date(selectedYear, selectedMonth, 0);
        if (ws < firstDay) ws = new Date(firstDay);
        let we = new Date(ws);
        we.setDate(we.getDate() + 6);
        if (we > lastDayMonth) we = new Date(lastDayMonth);
        return { min: toIsoFromLocalDate(ws), max: toIsoFromLocalDate(we) };
      }
      if (filterType === 'range' && rangeStart && rangeEnd) {
        const min = rangeStart.trim().substring(0, 10);
        const max = rangeEnd.trim().substring(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(min) && /^\d{4}-\d{2}-\d{2}$/.test(max)) {
          return min <= max ? { min, max } : { min: max, max: min };
        }
      }
      return null;
    };

    const daywiseIsoRange = getDaywiseExportIsoInclusiveRange();
    const includeDaywiseIsoDate = (isoKey: string) => {
      if (!daywiseIsoRange) return true;
      const k = String(isoKey || '').trim().substring(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return true;
      return k >= daywiseIsoRange.min && k <= daywiseIsoRange.max;
    };

    const round2 = (n: number): number => {
      if (!Number.isFinite(n)) return n;
      return Math.round(n * 100) / 100;
    };

    /** Parse H:MM / HH:MM to decimal hours for re-formatting legacy strings. */
    const hmStringToDecimalHours = (s: string): number | '' => {
      if (!s || typeof s !== 'string') return '';
      const t = s.trim();
      if (t === '' || /^0h\s*0m$/i.test(t)) return 0;
      const match = t.match(/^(\d+):(\d{2})$/);
      if (!match) return '';
      const h = Number(match[1]);
      const min = Number(match[2]);
      if (!Number.isFinite(h) || !Number.isFinite(min)) return '';
      return round2(h + min / 60);
    };

    const daywiseNumericOrString = (s: string): number | string => {
      if (!s || String(s).trim() === '') return '';
      const n = Number(s);
      return Number.isFinite(n) ? round2(n) : s;
    };

    const formatSecondsToHMS = (seconds: number): string => {
      const sign = seconds < 0 ? '-' : '';
      const abs = Math.abs(seconds);
      const h = Math.floor(abs / 3600);
      const m = Math.floor((abs % 3600) / 60);
      const s = abs % 60;
      return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const daywiseBorderThin = {
      top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    };

    /** Presence types that use max outstation 1.2 d and per-day actual from `record.value` (same as legacy Present - outstation). */
    const daywiseOutstationPresenceExact = new Set([
      'Present - outstation',
      'Present - Outstation (Weekdays)',
      'Present - Outstation (Weekoff)',
      'Present - ClientPlace (Weekdays)',
      'Present - ClientPlace (Weekoff)',
      'Present - client place',
      'Onsite Presence (OS-P)',
    ]);
    const isDaywiseOutstationPresence = (raw: string) => {
      const s = String(raw || '').trim();
      if (daywiseOutstationPresenceExact.has(s)) return true;
      const low = s.toLowerCase().replace(/\s+/g, ' ');
      return (
        low === 'present - outstation (weekdays)' ||
        low === 'present - outstation (weekoff)' ||
        low === 'present - clientplace (weekdays)' ||
        low === 'present - clientplace (weekoff)' ||
        low === 'present - client place' ||
        low === 'present- outstation (weekoff)' ||
        low === 'present- outstation (weekdays)' ||
        low === 'present- clientplace (weekoff)' ||
        low === 'present- clientplace (weekdays)' ||
        low === 'onsite presence (os-p)' ||
        low === 'os-p'
      );
    };

    /** Loose match when type/status strings vary but still mean client place / outstation (in/out may be 00:00). */
    const isDaywiseOutstationByPhrase = (raw: string) => {
      const low = String(raw || '').toLowerCase().replace(/\s+/g, ' ');
      if (low === 'os-p' || low.includes('(os-p)') || low.includes('onsite presence')) return true;
      if (!low.includes('present')) return false;
      if (low.includes('outstation')) return true;
      if (low.includes('clientplace') || low.includes('client place')) return true;
      return false;
    };

    const recordIsDaywiseOutstationRow = (rec: any) => {
      for (const k of ['typeOfPresence', 'status'] as const) {
        const v = rec?.[k];
        if (typeof v !== 'string' || !v.trim()) continue;
        const t = v.trim();
        if (isDaywiseOutstationPresence(t) || isDaywiseOutstationByPhrase(t)) return true;
      }
      return false;
    };

    /** Per-day actual outstation days: prefer numeric `value` (including 0), then fallbacks. */
    const formatDaywiseActualOutstation = (rec: any, workingHrsFallback: unknown): string => {
      const v = rec?.value;
      if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
      if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        if (!Number.isNaN(n)) return String(n);
        return v.trim();
      }
      if (v != null && v !== '') {
        const n = Number(v);
        if (!Number.isNaN(n)) return String(n);
      }
      if (typeof workingHrsFallback === 'number' && !Number.isNaN(workingHrsFallback)) {
        return String(workingHrsFallback);
      }
      if (workingHrsFallback != null && String(workingHrsFallback).trim() !== '') {
        const n = Number(workingHrsFallback);
        if (!Number.isNaN(n)) return String(n);
        return String(workingHrsFallback);
      }
      return '';
    };

    /** `typeOfPresence` values for WFH on daily records (see `Attendance.ts` / summary aggregates). */
    const daywiseWFHTypeExact = new Set([
      'WFH - weekdays',
      'WFH - weekoff',
      'Work From Home (WFH)',
      'Weekly Off - Work From Home (WO-WFH)',
    ]);

    const recordIsDaywiseWFHRow = (rec: any) => {
      const t = String(rec?.typeOfPresence || rec?.status || '').trim();
      return daywiseWFHTypeExact.has(t);
    };

    const isDaywiseLeaveRecord = (rec: any) => {
      const type = String(rec?.typeOfPresence || '').trim().toLowerCase();
      const status = String(rec?.status || '').trim().toLowerCase();
      if (type === 'on leave' || type === 'leave') return true;
      if (status === 'on leave' || status === 'leave') return true;
      if (type.includes('leave') && !type.includes('present')) return true;
      if (status.includes('leave') && !status.includes('present')) return true;
      return false;
    };

    const isDaywiseExplicitAbsentRecord = (rec: any) => {
      const t = String(rec?.typeOfPresence || rec?.status || '').trim().toLowerCase();
      return t === 'absent';
    };

    const isDaywiseHalfDayRecord = (rec: any, bothPunchesZero: boolean) => {
      if (isDaywiseLeaveRecord(rec) || isDaywiseExplicitAbsentRecord(rec)) return false;
      const type = String(rec?.typeOfPresence || '').trim().toLowerCase();
      const status = String(rec?.status || '').trim().toLowerCase();
      if (type.includes('half day') || status.includes('half day')) return true;
      if (rec?.halfDay && !bothPunchesZero) return true;
      return false;
    };

    const zeroDaywiseScheduledFields = () => ({
      scheduledInTime: '00:00',
      scheduledOutTime: '00:00',
      scheduledTime: '0:00',
    });

    /** Same scheduled in/out + hours as summary Sched. column (`getScheduledResultForItem`). */
    const getDaywiseScheduledFieldsForDay = (
      user: User | undefined,
      date: string,
      record: any
    ) => {
      if (!user || !isDayIncludedInScheduledCalc(user, date, record)) {
        return zeroDaywiseScheduledFields();
      }

      const schedule = getScheduledTimes(user, date);
      const scheduledInTime = schedule.inTime ?? '';
      const scheduledOutTime = schedule.outTime ?? '';
      if (
        !scheduledInTime ||
        !scheduledOutTime ||
        scheduledInTime === '00:00' ||
        scheduledOutTime === '00:00'
      ) {
        return zeroDaywiseScheduledFields();
      }

      const [inH, inM] = scheduledInTime.split(':').map(Number);
      const [outH, outM] = scheduledOutTime.split(':').map(Number);
      let diff = outH * 60 + outM - (inH * 60 + inM);
      if (diff < 0) diff += 24 * 60;

      return {
        scheduledInTime,
        scheduledOutTime,
        scheduledTime: `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')}`,
      };
    };

    /** Scheduled in/out for absent deficit when day is excluded from Sched. total. */
    const getDaywiseScheduleTimesForAbsentDeficit = (
      user: User | undefined,
      date: string,
      record: any,
      presentAbsent: string,
      isHolidayDate: boolean
    ) => {
      if (!user || presentAbsent !== 'Absent') {
        return { scheduledInTime: '', scheduledOutTime: '' };
      }

      const d = calendarDateFromIsoKey(date);
      if (d.getDay() === 0 || isHolidayDate) {
        return { scheduledInTime: '', scheduledOutTime: '' };
      }

      const type = String(record?.typeOfPresence || '').trim();
      const typeLower = type.toLowerCase();
      if (type === 'Holiday' || type === 'Sunday' || type === 'Weekoff' || typeLower.includes('weekoff')) {
        return { scheduledInTime: '', scheduledOutTime: '' };
      }

      const schedule = getScheduledTimes(user, date);
      if (
        schedule.isHoliday ||
        !schedule.inTime ||
        !schedule.outTime ||
        schedule.inTime === '00:00' ||
        schedule.outTime === '00:00'
      ) {
        return { scheduledInTime: '', scheduledOutTime: '' };
      }

      return {
        scheduledInTime: schedule.inTime,
        scheduledOutTime: schedule.outTime,
      };
    };

    const buildDaywisePeriodDateList = (): string[] => {
      if (!daywiseIsoRange) return [];
      const dates: string[] = [];
      const [y1, m1, d1] = daywiseIsoRange.min.split('-').map(Number);
      const [y2, m2, d2] = daywiseIsoRange.max.split('-').map(Number);
      const cursor = new Date(y1, m1 - 1, d1);
      const end = new Date(y2, m2 - 1, d2);
      while (cursor <= end) {
        dates.push(toIsoFromLocalDate(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return dates;
    };

    const resolveDaywiseScheduledHoursMonth = (
      item: (typeof summariesToExport)[number],
      user: User | undefined
    ) => {
      let total = 0;
      if (typeof item.calcScheduled === 'number' && Number.isFinite(item.calcScheduled)) {
        if (!(user as User | undefined)?.inactiveAsOf) {
          total = item.calcScheduled;
        }
      }
      if ((!total || (user as User | undefined)?.inactiveAsOf) && user) {
        const periodDates = buildDaywisePeriodDateList().filter(
          (d) => !(user.inactiveAsOf && isDateOnOrAfterInactive(d, user.inactiveAsOf))
        );
        if (periodDates.length > 0) {
          total = getScheduledHoursNoLunchForMonth(item, user, periodDates);
        }
      }

      // Worked holiday/Sunday days: scheduled = work hours (add into month scheduled)
      const periodDates = buildDaywisePeriodDateList();
      for (const dateStr of periodDates) {
        if (user?.inactiveAsOf && isDateOnOrAfterInactive(dateStr, user.inactiveAsOf)) continue;
        const rec = (item.recordDetails || {})[dateStr] as any;
        if (!rec) continue;
        const d = calendarDateFromIsoKey(dateStr);
        const isSun = d.getDay() === 0;
        const isHol = holidayDates.has(dateStr);
        if (!isSun && !isHol) continue;
        if (isDayIncludedInScheduledCalc(user as User, dateStr, rec)) continue;

        const inT = String(rec.editedCheckin ?? rec.checkin ?? '').trim();
        const outT = String(rec.editedCheckout ?? rec.checkout ?? '').trim();
        const type = String(rec.typeOfPresence || rec.status || '').toLowerCase();
        if (type === 'absent' || type.includes('leave') || type === 'holiday' || type === 'sunday') {
          // still allow if they have punches (worked)
        }
        let workMins = 0;
        if (inT && outT && inT !== '00:00' && outT !== '00:00') {
          const [inH, inM] = inT.split(':').map(Number);
          const [outH, outM] = outT.split(':').map(Number);
          workMins = outH * 60 + outM - (inH * 60 + inM);
          if (workMins < 0) workMins += 24 * 60;
        } else {
          const hrs = Number(rec.totalHour || 0);
          if (hrs > 0) workMins = Math.round(hrs * 60);
        }
        if (workMins > 0) total += workMins / 60;
      }

      return Number(total.toFixed(2));
    };

    /**
     * Weekday WFH Ã¢â€ â€™ "WFH". DB week-off WFH types, or weekday/legacy WFH on API holiday or Sunday Ã¢â€ â€™ "WO-WFH".
     */
    const daywiseWFHStatusLabel = (rec: any, isHolidayDate: boolean, isSundayDate: boolean): 'WFH' | 'WO-WFH' => {
      const t = String(rec?.typeOfPresence || rec?.status || '').trim();
      if (t === 'WFH - weekoff' || t === 'Weekly Off - Work From Home (WO-WFH)') {
        return 'WO-WFH';
      }
      if (t === 'WFH - weekdays' || t === 'Work From Home (WFH)') {
        if (isHolidayDate || isSundayDate) return 'WO-WFH';
        return 'WFH';
      }
      return 'WFH';
    };

    /** Same rules as `handleDetailedExport` / monthly WO-PIO column (PIO on Sun/API holiday, or explicit weekoff present). */
    const daywiseIsPIO = (rec: any) => {
      const t = String(rec?.typeOfPresence || rec?.status || '');
      if (!t) return false;
      if (rec.halfDay) return false;
      if (t === 'ThumbMachine') {
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const effectiveCheckout = rec.editedCheckout || rec.checkout;
        const hasValidCheckin = !!(effectiveCheckin && effectiveCheckin !== '00:00');
        const hasValidCheckout = !!(effectiveCheckout && effectiveCheckout !== '00:00');
        if (!hasValidCheckin && !hasValidCheckout) return false;
      }
      return t === 'ThumbMachine' || t === 'Present - in office' || t === 'Present - in office - weekdays' || t === 'Present or NA';
    };

    const daywiseIsWOPIOExplicit = (rec: any) => {
      const t = String(rec?.typeOfPresence || rec?.status || '');
      if (!t || rec.halfDay) return false;
      return (
        t === 'Present - in office - weekoff' ||
        t === 'Present - weekoff' ||
        t === 'Weekly Off - Present (WO-Present)'
      );
    };

    // Helper to get Source (request approval / HR edit / ThumbMachine)
    const getSource = (record: any, userId: string, dateIso: string) => {
      const fromRecord: AttendanceEditSourceInfo = {
        approvedBy: record?.approvedBy,
        approvedByEmail: record?.approvedByEmail,
        updatedBy: record?.updatedBy,
        updatedByEmail: record?.updatedByEmail,
      };
      const hasRecordStamp = !!(
        fromRecord.approvedBy ||
        fromRecord.updatedBy ||
        fromRecord.approvedByEmail ||
        fromRecord.updatedByEmail
      );
      if (hasRecordStamp) return formatDaywiseSourceLabel(fromRecord);

      const fromRequest = sourceByUserDate.get(daywiseSourceLookupKey(userId, dateIso));
      if (fromRequest) return formatDaywiseSourceLabel(fromRequest);

      // Remarks stamp from older HR admin edits: "Updated by HR: email@..."
      const remarks = String(record?.remarks || '');
      const hrRemarkMatch = remarks.match(/Updated by HR:\s*([^\s|]+)/i);
      if (hrRemarkMatch?.[1]) {
        return formatDaywiseSourceLabel({
          approvedBy: 'HR',
          approvedByEmail: hrRemarkMatch[1],
        });
      }

      return 'ThumbMachine';
    };

    // Helper to get Weekdays/Weekoffs
    const getWeekType = (date: string, record: any) => {
      const d = calendarDateFromIsoKey(date);
      const day = d.getDay();
      if (record && typeof record.status === 'string' && record.status.toLowerCase().includes('weekoff')) return 'Weekoff';
      return day === 0 ? 'Weekoff' : 'Weekdays';
    };

    // Loop through each summary and each day
    for (const item of summariesToExport) {
    const daywiseUser = allUsers?.find((u) => u._id === item.userId || u.odId === item.userId);
    // These must be declared inside the forEach to be scoped per summary
    const dailyExcessShortSeconds: number[] = [];
    const rowIndexes: number[] = [];
    // Calculate actual working hours for the month for this user
    let workingHrsMonth = 0;
    const monthYear = item.monthYear || '';
    const [year, month] = monthYear.split('-').map(Number);
    const recordsMonth = item.recordDetails || {};
    sortRecordDetailsEntries(recordsMonth).forEach(([date, record]: [string, any]) => {
      if (!includeDaywiseIsoDate(date)) return;
      if (daywiseUser?.inactiveAsOf && isDateOnOrAfterInactive(date, daywiseUser.inactiveAsOf)) {
        return;
      }
      const d = calendarDateFromIsoKey(date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        // Use edited in/out times for calculation
        const actualIn = (record.editedCheckin ?? record.inTime ?? '').trim();
        const actualOut = (record.editedCheckout ?? record.outTime ?? '').trim();
        if (actualIn && actualOut && actualIn !== '00:00' && actualOut !== '00:00') {
          const [inH, inM] = actualIn.split(':').map(Number);
          const [outH, outM] = actualOut.split(':').map(Number);
          let diff = (outH * 60 + outM) - (inH * 60 + inM);
          if (diff < 0) diff += 24 * 60;
          workingHrsMonth += diff / 60;
        }
      }
    });
      const scheduledHrsMonth = resolveDaywiseScheduledHoursMonth(item, daywiseUser as User | undefined);

      const records = item.recordDetails || {};
      sortRecordDetailsEntries(records).forEach(([date, record]: [string, any]) => {
        if (!includeDaywiseIsoDate(date)) return;
        const d = calendarDateFromIsoKey(date);
        const dayName = d.toLocaleString('en-US', { weekday: 'long' });
        // Robust extraction for each column
        // Helper to format time as H:M
        const formatTime = (val: any) => {
          if (!val || typeof val !== 'string') return '';
          const [h, m] = val.split(':');
          if (h === undefined || m === undefined) return val;
          // Always pad to two digits
          return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
        };
        // Punch times only — never extra-work slot times
        const actualInTimeEditable = formatTime(record.editedCheckin ?? record.checkin ?? record.inTime ?? '');
        const actualOutTimeEditable = formatTime(record.editedCheckout ?? record.checkout ?? record.outTime ?? '');
        // For display, keep original for reference
        const actualInTimeOriginal = formatTime(record.originalInTime ?? record.checkin ?? '');
        const actualOutTimeOriginal = formatTime(record.originalOutTime ?? record.checkout ?? '');
        const extraWorkTimes = formatExtraWorkEntriesTimeSummary(record.extraWorkEntries);
        const extraWorkHrs = sumExtraWorkEntryHours(record.extraWorkEntries);
        const punchWorkingHrs = getRecordPunchHours(record);
        const { scheduledInTime, scheduledOutTime, scheduledTime } = getDaywiseScheduledFieldsForDay(
          daywiseUser as User | undefined,
          date,
          record
        );
        // Set week type for holidays and weekoffs
        const isHoliday = holidayDates.has(date);
        const isSunday = d.getDay() === 0;
        let weekType = getWeekType(date, record);
        if (isHoliday) {
          weekType = 'Weekoff';
        }
        // --- Custom logic for WFH and Outstation ---
        let maxWFH = '';
        let actualWFH = '';
        let maxOutstation = '';
        let actualOutstation = '';
        // Total working hours (punch + approved extra work)
        const workingHrs = record.workingHours ?? record.workingHour ?? record.totalHour ?? '';
        // Mark halfday as true for Saturday
        let isHalfDay = false;
        if (typeof record.halfDay === 'boolean') {
          isHalfDay = record.halfDay;
        } else if (record.halfDay !== undefined) {
          isHalfDay = Boolean(record.halfDay);
        }
        if (dayName.toLowerCase() === 'saturday') {
          isHalfDay = true;
        }
        const halfDays = isHalfDay ? 'True' : 'False';

        // After inactive/left date: show NA, no excess/deficit or schedule calc
        const isInactiveDay = !!(
          daywiseUser?.inactiveAsOf && isDateOnOrAfterInactive(date, daywiseUser.inactiveAsOf)
        );

        // Present/Absent/Holiday logic
        let presentAbsent = 'Absent';
        const inTime = String(actualInTimeEditable).trim();
        const outTime = String(actualOutTimeEditable).trim();
        // Custom present logic for WFH and Outstation (client place / outstation: 00:00 in-out is OK; still fill max/actual outstation)
        const typeOfPresence = record.typeOfPresence || record.status || '';
        if (isInactiveDay) {
          presentAbsent = 'NA';
          maxWFH = '';
          actualWFH = '';
          maxOutstation = '';
          actualOutstation = '';
        } else if (recordIsDaywiseOutstationRow(record)) {
          maxOutstation = '1.2';
          actualOutstation = formatDaywiseActualOutstation(record, workingHrs);
          presentAbsent = 'OS-P';
        } else if (recordIsDaywiseWFHRow(record)) {
          maxWFH = '0.75';
          actualWFH = formatDaywiseActualOutstation(record, workingHrs);
          presentAbsent = daywiseWFHStatusLabel(record, isHoliday, isSunday);
        } else if (
          daywiseIsWOPIOExplicit(record) ||
          (daywiseIsPIO(record) && (isHoliday || isSunday))
        ) {
          presentAbsent = 'WO-PIO';
        } else if (isDaywiseLeaveRecord(record)) {
          presentAbsent = 'On leave';
        } else if (isDaywiseExplicitAbsentRecord(record)) {
          presentAbsent = 'Absent';
        } else if (isHoliday || isSunday) {
          presentAbsent = 'Holiday';
        } else if (isDaywiseHalfDayRecord(record, inTime === '00:00' && outTime === '00:00')) {
          presentAbsent = 'HD';
        } else if (
          (typeOfPresence && String(typeOfPresence).toLowerCase().includes('present')) ||
          (record.status && record.status.toLowerCase().includes('present')) ||
          (inTime !== '00:00' && outTime !== '00:00')
        ) {
          presentAbsent = 'Present';
        } else if (inTime === '00:00' && outTime === '00:00') {
          presentAbsent = 'Absent';
        }

        // HD: scheduled duration is half for display + excess/deficit
        const useHalfSchedule =
          presentAbsent === 'HD' || isHalfDayAttendanceRecord(record);
        let dayScheduledTimeLabel = scheduledTime;
        let exportScheduledInTime = scheduledInTime;
        let exportScheduledOutTime = scheduledOutTime;
        if (
          useHalfSchedule &&
          scheduledInTime &&
          scheduledOutTime &&
          scheduledInTime !== '00:00' &&
          scheduledOutTime !== '00:00'
        ) {
          const halfMins = effectiveScheduledMinutesForDay(
            scheduledInTime,
            scheduledOutTime,
            { ...record, halfDay: true }
          );
          dayScheduledTimeLabel = `${Math.floor(halfMins / 60)}:${String(halfMins % 60).padStart(2, '0')}`;
        }

        // Worked on holiday / Sunday: scheduled hours = work hours (no day excess/deficit)
        const workedOnHolidayOrSunday =
          (isHoliday || isSunday) &&
          presentAbsent !== 'Holiday' &&
          presentAbsent !== 'Absent' &&
          presentAbsent !== 'On leave' &&
          presentAbsent !== 'NA';

        let holidaySundayWorkMinutes = 0;
        if (workedOnHolidayOrSunday) {
          if (inTime && outTime && inTime !== '00:00' && outTime !== '00:00') {
            const [actInH, actInM] = inTime.split(':').map(Number);
            const [actOutH, actOutM] = outTime.split(':').map(Number);
            let mins = actOutH * 60 + actOutM - (actInH * 60 + actInM);
            if (mins < 0) mins += 24 * 60;
            holidaySundayWorkMinutes = mins;
          } else if (typeof workingHrs === 'number' && Number.isFinite(workingHrs) && workingHrs > 0) {
            holidaySundayWorkMinutes = Math.round(workingHrs * 60);
          } else if (punchWorkingHrs > 0) {
            holidaySundayWorkMinutes = Math.round(punchWorkingHrs * 60);
          }
          if (holidaySundayWorkMinutes > 0) {
            dayScheduledTimeLabel = `${Math.floor(holidaySundayWorkMinutes / 60)}:${String(
              holidaySundayWorkMinutes % 60
            ).padStart(2, '0')}`;
            if (inTime && outTime && inTime !== '00:00' && outTime !== '00:00') {
              exportScheduledInTime = inTime;
              exportScheduledOutTime = outTime;
            }
          }
        }

        // --- Excess/Short calculation for the day ---
        // Always output ±HH:MM:SS. Leave / inactive (NA) days never carry day deficit/excess.
        // Holiday/Sunday work: schedule matched to work → day excess/deficit is 0.
        // For worked days: excess/deficit = Working hrs − Scheduled (day) (same values as those columns).
        let daySeconds = 0;
        const isAbsent = presentAbsent === 'Absent';
        const parseHmLabelToMinutes = (label: string): number => {
          const m = String(label || '')
            .trim()
            .match(/^(-)?(\d+):(\d{2})$/);
          if (!m) return 0;
          const mins = Number(m[2]) * 60 + Number(m[3]);
          return m[1] ? -mins : mins;
        };
        const resolveWorkMinutesForDay = (): number => {
          if (typeof workingHrs === 'number' && Number.isFinite(workingHrs) && workingHrs > 0) {
            return Math.round(workingHrs * 60);
          }
          if (inTime && outTime && inTime !== '00:00' && outTime !== '00:00') {
            const [actInH, actInM] = inTime.split(':').map(Number);
            const [actOutH, actOutM] = outTime.split(':').map(Number);
            let mins = actOutH * 60 + actOutM - (actInH * 60 + actInM);
            if (mins < 0) mins += 24 * 60;
            return mins;
          }
          const fromText = hmStringToDecimalHours(formatTime(workingHrs));
          if (fromText !== '' && fromText > 0) return Math.round(fromText * 60);
          if (punchWorkingHrs > 0) return Math.round(punchWorkingHrs * 60);
          return 0;
        };

        if (workedOnHolidayOrSunday) {
          daySeconds = 0;
        } else if (presentAbsent !== 'On leave' && presentAbsent !== 'NA') {
          if (isAbsent) {
            let deficitScheduledIn = scheduledInTime;
            let deficitScheduledOut = scheduledOutTime;
            if (
              !deficitScheduledIn ||
              !deficitScheduledOut ||
              deficitScheduledIn === '00:00' ||
              deficitScheduledOut === '00:00'
            ) {
              const deficitSchedule = getDaywiseScheduleTimesForAbsentDeficit(
                daywiseUser as User | undefined,
                date,
                record,
                presentAbsent,
                isHoliday
              );
              deficitScheduledIn = deficitSchedule.scheduledInTime;
              deficitScheduledOut = deficitSchedule.scheduledOutTime;
            }

            if (
              deficitScheduledIn &&
              deficitScheduledOut &&
              deficitScheduledIn !== '00:00' &&
              deficitScheduledOut !== '00:00'
            ) {
              const scheduledMinutes = effectiveScheduledMinutesForDay(
                deficitScheduledIn,
                deficitScheduledOut,
                useHalfSchedule ? { ...record, halfDay: true } : record
              );
              daySeconds = -scheduledMinutes * 60;
            }
          } else {
            let scheduledMinutes = parseHmLabelToMinutes(dayScheduledTimeLabel);
            if (
              scheduledMinutes <= 0 &&
              scheduledInTime &&
              scheduledOutTime &&
              scheduledInTime !== '00:00' &&
              scheduledOutTime !== '00:00'
            ) {
              scheduledMinutes = effectiveScheduledMinutesForDay(
                scheduledInTime,
                scheduledOutTime,
                useHalfSchedule ? { ...record, halfDay: true } : record
              );
            }
            const workMinutes = resolveWorkMinutesForDay();
            if (scheduledMinutes > 0) {
              const deltaMinutes = workMinutes - scheduledMinutes;
              if (deltaMinutes < 0) {
                daySeconds = deltaMinutes * 60;
              } else if (deltaMinutes > 0) {
                let isArticle = false;
                if (allUsers && item.userId) {
                  const user = allUsers.find((u) => u._id === item.userId);
                  if (user) isArticle = isArticleEmployee(user);
                }
                if (
                  isArticle &&
                  inTime &&
                  outTime &&
                  inTime !== '00:00' &&
                  outTime !== '00:00' &&
                  scheduledInTime &&
                  scheduledOutTime &&
                  scheduledInTime !== '00:00' &&
                  scheduledOutTime !== '00:00'
                ) {
                  const excessMinutes = calculateArticleDayExcessMinutes(
                    scheduledInTime,
                    scheduledOutTime,
                    inTime,
                    outTime
                  );
                  daySeconds = excessMinutes * 60;
                } else {
                  daySeconds = deltaMinutes * 60;
                }
              }
            }
          }
        }
        const rawDayHours =
          presentAbsent === 'On leave' || presentAbsent === 'NA' || workedOnHolidayOrSunday
            ? 0
            : daySeconds / 3600;
        // Always use export's Working hrs − Scheduled (day) result — not stored record.excessHour.
        const adjustedDayHours =
          presentAbsent === 'NA' || workedOnHolidayOrSunday
            ? 0
            : applyDayAllowanceToRawExcess(
                rawDayHours,
                String(item.userId || ''),
                date,
                ctx.excessDayAllowanceMap
              );
        daySeconds = adjustedDayHours * 3600;
        dailyExcessShortSeconds.push(daySeconds);
        const dayExcessDeficitSplit =
          presentAbsent === 'NA' || workedOnHolidayOrSunday
            ? { excess: '', deficit: '' }
            : splitExcessAndDeficitLabels(adjustedDayHours);

        const exportScheduledIn = presentAbsent === 'NA' ? '' : exportScheduledInTime;
        const exportScheduledOut = presentAbsent === 'NA' ? '' : exportScheduledOutTime;
        const exportScheduledTime = presentAbsent === 'NA' ? '' : dayScheduledTimeLabel;

        let workingHrsExport: number | '' = '';
        if (presentAbsent !== 'NA') {
          if (typeof workingHrs === 'number' && !Number.isNaN(workingHrs)) {
            workingHrsExport = decimalHoursToExcelDuration(workingHrs);
          } else {
            const hm = formatTime(workingHrs);
            const dec = hmStringToDecimalHours(hm);
            workingHrsExport = dec === '' ? '' : decimalHoursToExcelDuration(dec);
          }
        }

        const punchWorkingHrsExport =
          presentAbsent === 'NA' || punchWorkingHrs <= 0
            ? ''
            : decimalHoursToExcelDuration(punchWorkingHrs);
        const extraWorkHrsExport =
          presentAbsent === 'NA' || extraWorkHrs <= 0
            ? ''
            : decimalHoursToExcelDuration(extraWorkHrs);

        let scheduledTimeExport: number | '' = '';
        if (exportScheduledTime === '') {
          scheduledTimeExport = '';
        } else if (/^0h\s*0m$/i.test(String(exportScheduledTime).trim())) {
          scheduledTimeExport = decimalHoursToExcelDuration(0);
        } else {
          const dec = hmStringToDecimalHours(String(exportScheduledTime));
          scheduledTimeExport = dec === '' ? '' : decimalHoursToExcelDuration(dec);
        }

        worksheet.addRow({
          employeeCode: daywiseUser?.employeeCode || item.employeeCode || item.odId || item.userId || '-',
          weekType,
          source: presentAbsent === 'NA' ? '' : getSource(record, String(item.userId || ''), date),
          date: formatIsoKeyAsDdMmYyyy(date),
          day: dayName,
          employeeName: item.userName,
          designation: daywiseUser
            ? getDesignationForDate(daywiseUser as Parameters<typeof getDesignationForDate>[0], date)
            : item.designation || '',
          verticalHead: daywiseUser
            ? getWorkingUnderPartnerForDate(
                daywiseUser as Parameters<typeof getWorkingUnderPartnerForDate>[0],
                date
              )
            : resolveWorkPartnerForItem(daywiseUser, item.monthYear) || item.team || '-',
          presentAbsent,
          actualInTimeOriginal:
            presentAbsent === 'NA' ? '' : hhmmStringToExcelTime(String(actualInTimeOriginal)),
          actualOutTimeOriginal:
            presentAbsent === 'NA' ? '' : hhmmStringToExcelTime(String(actualOutTimeOriginal)),
          actualInTimeEditable:
            presentAbsent === 'NA' ? '' : hhmmStringToExcelTime(String(actualInTimeEditable)),
          actualOutTimeEditable:
            presentAbsent === 'NA' ? '' : hhmmStringToExcelTime(String(actualOutTimeEditable)),
          extraWorkTimes: presentAbsent === 'NA' ? '' : extraWorkTimes || '',
          punchWorkingHrs: punchWorkingHrsExport,
          extraWorkHrs: extraWorkHrsExport,
          trueFalseInTime:
            presentAbsent === 'NA'
              ? ''
              : String(actualInTimeOriginal) === String(actualInTimeEditable)
                ? 'True'
                : 'False',
          trueFalseOutTime:
            presentAbsent === 'NA'
              ? ''
              : String(actualOutTimeOriginal) === String(actualOutTimeEditable)
                ? 'True'
                : 'False',
          scheduledInTime: hhmmStringToExcelTime(formatTime(exportScheduledIn)),
          scheduledOutTime: hhmmStringToExcelTime(formatTime(exportScheduledOut)),
          maxWFH: maxWFH === '' ? '' : round2(Number(maxWFH)),
          actualWFH: actualWFH === '' ? '' : daywiseNumericOrString(String(actualWFH)),
          maxOutstation: maxOutstation === '' ? '' : round2(Number(maxOutstation)),
          actualOutstation: actualOutstation === '' ? '' : daywiseNumericOrString(String(actualOutstation)),
          workingHrs: workingHrsExport,
          scheduledTime: scheduledTimeExport,
          scheduledHrsMonth:
            presentAbsent === 'NA' || !scheduledHrsMonth
              ? ''
              : decimalHoursToExcelDuration(scheduledHrsMonth),
          workingHrsMonth:
            presentAbsent === 'NA' || !workingHrsMonth
              ? ''
              : decimalHoursToExcelDuration(workingHrsMonth),
          excessHrsMonth: '',
          deficitHrsMonth: '',
          excessHrsDay: dayExcessDeficitSplit.excess,
          deficitHrsDay: dayExcessDeficitSplit.deficit,
          halfDays: presentAbsent === 'NA' ? '' : halfDays,
        });
        rowIndexes.push(worksheet.rowCount);
      });
      // After all rows for this user/month, set monthly excess/deficit columns
      if (rowIndexes.length > 0) {
        const monthExcessHours = dailyExcessShortSeconds.reduce((a, b) => a + b, 0) / 3600;
        const monthSplit = splitExcessAndDeficitLabels(monthExcessHours);
        for (const rowIdx of rowIndexes) {
          const row = worksheet.getRow(rowIdx);
          const pa = String(row.getCell('presentAbsent').value || '');
          if (pa === 'NA') {
            row.getCell('excessHrsMonth').value = '';
            row.getCell('deficitHrsMonth').value = '';
            continue;
          }
          row.getCell('excessHrsMonth').value = monthSplit.excess;
          row.getCell('deficitHrsMonth').value = monthSplit.deficit;
        }
      }
    }

    // Header row (row 1) Ã¢â‚¬â€ data starts row 2 (keep header compact; no wrap avoids tall rows)
    const headerRow = worksheet.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false, shrinkToFit: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF1E40AF' } },
        bottom: { style: 'medium', color: { argb: 'FF1E40AF' } },
        left: { style: 'thin', color: { argb: 'FF1E40AF' } },
        right: { style: 'thin', color: { argb: 'FF1E40AF' } },
      };
    });

    if (!options?.skipFormatting) {
    const daywiseLeftAlignKeys = new Set(['source', 'employeeName', 'designation', 'verticalHead', 'extraWorkTimes']);

    const daywiseNumericColumnFmt: Record<string, string> = {
      date: '@',
      actualInTimeOriginal: EXCEL_DURATION_NUM_FMT,
      actualOutTimeOriginal: EXCEL_DURATION_NUM_FMT,
      actualInTimeEditable: EXCEL_DURATION_NUM_FMT,
      actualOutTimeEditable: EXCEL_DURATION_NUM_FMT,
      scheduledInTime: EXCEL_DURATION_NUM_FMT,
      scheduledOutTime: EXCEL_DURATION_NUM_FMT,
      maxWFH: '0.00',
      maxOutstation: '0.00',
      actualWFH: '0.00',
      actualOutstation: '0.00',
      workingHrs: EXCEL_DURATION_NUM_FMT,
      punchWorkingHrs: EXCEL_DURATION_NUM_FMT,
      extraWorkHrs: EXCEL_DURATION_NUM_FMT,
      scheduledTime: EXCEL_DURATION_NUM_FMT,
      scheduledHrsMonth: EXCEL_DURATION_NUM_FMT,
      workingHrsMonth: EXCEL_DURATION_NUM_FMT,
      excessHrsMonth: '@',
      deficitHrsMonth: '@',
      excessHrsDay: '@',
      deficitHrsDay: '@',
    };

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.height = 15;
      const isEvenRow = rowNumber % 2 === 0;
      row.eachCell((cell, colNumber) => {
        const colKey = worksheet.columns[colNumber - 1]?.key as string | undefined;
        const alignLeft = colKey && daywiseLeftAlignKeys.has(colKey);
        cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF0F172A' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEvenRow ? 'FFF8FAFC' : 'FFFFFFFF' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: alignLeft ? 'left' : 'center',
          wrapText: false,
          shrinkToFit: true,
          indent: alignLeft ? 1 : 0,
        };
        cell.border = daywiseBorderThin;
        if (colKey && daywiseNumericColumnFmt[colKey]) {
          cell.numFmt = daywiseNumericColumnFmt[colKey];
        }
      });

      const presentAbsentCell = row.getCell('presentAbsent');
      const pa = presentAbsentCell.value;
      const styleDurationTextCell = (
        key: 'excessHrsMonth' | 'deficitHrsMonth' | 'excessHrsDay' | 'deficitHrsDay',
        color: string,
        fill: string
      ) => {
        const cell = row.getCell(key);
        const v = cell.value;
        if (v == null || String(v).trim() === '') return;
        cell.font = { size: 10, name: 'Calibri', color: { argb: color }, bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fill },
        };
      };
      styleDurationTextCell('excessHrsMonth', 'FF047857', 'FFECFDF5');
      styleDurationTextCell('excessHrsDay', 'FF047857', 'FFECFDF5');
      styleDurationTextCell('deficitHrsMonth', 'FFBE123C', 'FFFFF1F2');
      styleDurationTextCell('deficitHrsDay', 'FFBE123C', 'FFFFF1F2');
      if (pa === 'Absent') {
        presentAbsentCell.font = { size: 10, name: 'Calibri', color: { argb: 'FFBE123C' }, bold: true };
        presentAbsentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF1F2' },
        };
      } else if (pa === 'NA') {
        presentAbsentCell.font = { size: 10, name: 'Calibri', color: { argb: 'FF475569' }, bold: true };
        presentAbsentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
      } else if (pa === 'On leave') {
        presentAbsentCell.font = { size: 10, name: 'Calibri', color: { argb: 'FF0369A1' }, bold: true };
        presentAbsentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0F2FE' },
        };
      } else if (pa === 'HD') {
        presentAbsentCell.font = { size: 10, name: 'Calibri', color: { argb: 'FFC2410C' }, bold: true };
        presentAbsentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEDD5' },
        };
      } else if (pa === 'Holiday') {
        presentAbsentCell.font = { size: 10, name: 'Calibri', color: { argb: 'FFB45309' }, bold: true };
        presentAbsentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF3C7' },
        };
      } else if (pa === 'Present' || pa === 'OS-P' || pa === 'WFH' || pa === 'WO-WFH' || pa === 'WO-PIO') {
        presentAbsentCell.font = { size: 10, name: 'Calibri', color: { argb: 'FF047857' }, bold: true };
        presentAbsentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFECFDF5' },
        };
      }
    });

    // Widen columns slightly if content is longer than default (cap so layout stays usable)
    worksheet.columns.forEach((col, idx) => {
      const headerLen = (daywiseHeaderLabels[idx] || '').length;
      let maxLen = headerLen;
      if (col.eachCell) {
        col.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
          if (rowNumber === 1) return;
          const v = cell.value != null ? String(cell.value) : '';
          maxLen = Math.max(maxLen, Math.min(v.length, 55));
        });
      }
      const base = col.width || 10;
      col.width = Math.min(42, Math.max(base, maxLen * 0.9 + 1.5));
    });
    }

    return workbook;
}

export async function exportDaywiseAttendance(ctx: SummaryExportContext): Promise<void> {
  const workbook = await buildDaywiseWorkbook(ctx);
  if (!workbook) return;
  const fileName = `daywise_attendance_${new Date().toISOString().split('T')[0]}.xlsx`;
  await downloadWorkbook(await workbook.xlsx.writeBuffer(), fileName);
}
