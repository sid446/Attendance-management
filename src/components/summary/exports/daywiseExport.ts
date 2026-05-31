import type { User } from '@/types/ui';
import { getEmploymentTypeForDate } from '@/lib/attendanceSummaryMetrics';
import { getDesignationForDate } from '@/lib/userFieldHistory';
import { formatIsoKeyAsDdMmYyyy, sortRecordDetailsEntries } from '../utils/summaryDateUtils';
import { calendarDateFromIsoKey } from '../utils/summaryDateUtils';
import type { SummaryExportContext } from './exportTypes';
import {
  decimalHoursToExcelDuration,
  EXCEL_DURATION_NUM_FMT,
  hhmmStringToExcelTime,
} from './exportExcelDuration';
import { downloadWorkbook } from './downloadWorkbook';


export async function exportDaywiseAttendance(ctx: SummaryExportContext): Promise<void> {
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

    if (filteredSummaries.length === 0) return;

    const summariesToExport =
      selectedEmployeeIds.size > 0
        ? filteredSummaries.filter((item) => selectedEmployeeIds.has(item.userId))
        : filteredSummaries;

    if (summariesToExport.length === 0) return;

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

    // Column keys + widths (no `header` here Ã¢â‚¬â€ we insert a real header row so row 1 is not overwritten by data)
    worksheet.columns = [
      { key: 'weekType', width: 12 },
      { key: 'source', width: 22 },
      { key: 'date', width: 12 },
      { key: 'day', width: 11 },
      { key: 'employeeName', width: 22 },
      { key: 'designation', width: 16 },
      { key: 'presentAbsent', width: 14 },
      { key: 'actualInTimeOriginal', width: 14 },
      { key: 'actualOutTimeOriginal', width: 14 },
      { key: 'actualInTimeEditable', width: 14 },
      { key: 'actualOutTimeEditable', width: 14 },
      { key: 'trueFalseInTime', width: 12 },
      { key: 'trueFalseOutTime', width: 12 },
      { key: 'scheduledInTime', width: 12 },
      { key: 'scheduledOutTime', width: 12 },
      { key: 'maxWFH', width: 10 },
      { key: 'actualWFH', width: 11 },
      { key: 'maxOutstation', width: 14 },
      { key: 'actualOutstation', width: 12 },
      { key: 'workingHrs', width: 11 },
      { key: 'scheduledTime', width: 12 },
      { key: 'scheduledHrsMonth', width: 16 },
      { key: 'workingHrsMonth', width: 16 },
      { key: 'excessShortHrsMonth', width: 16 },
      { key: 'excessShortHrsDay', width: 16 },
      { key: 'halfDays', width: 9 },
    ];

    const daywiseHeaderLabels = [
      'Weekday / weekoff',
      'Source',
      'Date',
      'Day',
      'Employee name',
      'Designation',
      'Present / absent',
      'Actual in (original)',
      'Actual out (original)',
      'Actual in (edited)',
      'Actual out (edited)',
      'In time unchanged',
      'Out time unchanged',
      'Scheduled in',
      'Scheduled out',
      'Max WFH',
      'Actual WFH',
      'Max outstation (1.2 d)',
      'Actual outstation',
      'Working hrs (day)',
      'Scheduled (day)',
      'Scheduled hrs (month)',
      'Working hrs (month)',
      'Excess/short (month)',
      'Excess/short (day)',
      'Half day',
    ];
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

    // Helper to get updater email from attendance request (if edited)
    const getUpdaterEmail = (record: any) => {
      if (record && typeof record.updatedByEmail === 'string') return record.updatedByEmail;
      if (record && typeof record.updatedBy === 'string') return record.updatedBy;
      return null;
    };

    // Helper to get Source
    const getSource = (record: any) => {
      const updater = getUpdaterEmail(record);
      if (updater) return updater;
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
      // Calculate scheduled hours for the month for this user, EXCLUDING holidays from API
      let scheduledHrsMonth = 0;
      if (allUsers && item.userId) {
        const user = allUsers.find(u => u._id === item.userId);
        if (user && item.recordDetails) {
          for (const [dateStr, rec] of sortRecordDetailsEntries(item.recordDetails)) {
            if (!includeDaywiseIsoDate(dateStr)) continue;
            if (holidayDates.has(dateStr)) continue; // skip API holidays
            if (rec.typeOfPresence === 'Holiday') continue;
            const dateObj = calendarDateFromIsoKey(dateStr);
            const dayName = dateObj.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
            // Find applicable schedule entry for this date
            let scheduleEntry;
            if (user.schedules && Array.isArray(user.schedules)) {
              scheduleEntry = user.schedules.slice().reverse().find(entry => {
                const eff = new Date(entry.effectiveFrom);
                return eff <= dateObj;
              });
            }
            let scheduledIn = '';
            let scheduledOut = '';
            let isHoliday = false;
            if (scheduleEntry && scheduleEntry.daily && scheduleEntry.daily[dayName]) {
              const sch = scheduleEntry.daily[dayName] as { inTime?: string; outTime?: string; isHoliday?: boolean; isHalfDay?: boolean } | undefined;
              scheduledIn = sch?.inTime ?? '';
              scheduledOut = sch?.outTime ?? '';
              isHoliday = !!sch?.isHoliday;
            } else if (user.scheduleInOutTime && ['monday','tuesday','wednesday','thursday','friday'].includes(dayName)) {
              scheduledIn = user.scheduleInOutTime.inTime ?? '';
              scheduledOut = user.scheduleInOutTime.outTime ?? '';
              isHoliday = !!user.scheduleInOutTime.isHoliday;
            } else if (user.scheduleInOutTimeSat && dayName === 'saturday') {
              scheduledIn = user.scheduleInOutTimeSat.inTime ?? '';
              scheduledOut = user.scheduleInOutTimeSat.outTime ?? '';
              isHoliday = !!user.scheduleInOutTimeSat.isHoliday;
            } else if (user.scheduleInOutTimeMonth && dayName === 'monthly') {
              scheduledIn = user.scheduleInOutTimeMonth.inTime ?? '';
              scheduledOut = user.scheduleInOutTimeMonth.outTime ?? '';
              isHoliday = !!user.scheduleInOutTimeMonth.isHoliday;
            }
            // Skip holidays from schedule
            if (isHoliday) continue;
            if (scheduledIn && scheduledOut && scheduledIn !== '00:00' && scheduledOut !== '00:00') {
              const [inH, inM] = scheduledIn.split(':').map(Number);
              const [outH, outM] = scheduledOut.split(':').map(Number);
              let diff = (outH * 60 + outM) - (inH * 60 + inM);
              if (diff < 0) diff += 24 * 60;
              scheduledHrsMonth += diff / 60;
            }
          }
        }
      }

      // Only one of excess or short for the month should be nonzero
      // Fetch monthly excess directly from attendance summary
      let excessShortHrsMonth = '';
      if (item.summary && typeof item.summary.excessHour === 'number') {
        const val = item.summary.excessHour;
        const sign = val < 0 ? '-' : '';
        const abs = Math.abs(val);
        const h = Math.floor(abs);
        const m = Math.round((abs % 1) * 60);
        excessShortHrsMonth = `${sign}${h}:${m.toString().padStart(2, '0')}`;
      }
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
        // Always use edited times for calculations and display
        const actualInTimeEditable = formatTime(record.editedCheckin ?? record.inTime ?? '');
        const actualOutTimeEditable = formatTime(record.editedCheckout ?? record.outTime ?? '');
        // For display, keep original for reference
        const actualInTimeOriginal = formatTime(record.originalInTime ?? record.checkin ?? '');
        const actualOutTimeOriginal = formatTime(record.originalOutTime ?? record.checkout ?? '');
        // Get scheduled in/out from user schedule for this day
        let scheduledInTime = '';
        let scheduledOutTime = '';
        let scheduledTime = '';
        // Set scheduled time to zero for holidays and weekoffs
        const isHoliday = holidayDates.has(date);
        const isSunday = d.getDay() === 0;
        const isWeekoff = isSunday || (record && typeof record.status === 'string' && record.status.toLowerCase().includes('weekoff'));
        let weekType = getWeekType(date, record);
        if (isHoliday) {
          weekType = 'Weekoff';
        }
        if (isHoliday || isWeekoff) {
          scheduledTime = '0h 0m';
          scheduledInTime = '';
          scheduledOutTime = '';
        } else if (allUsers && item.userId) {
          const user = allUsers.find(u => u._id === item.userId);
          if (user) {
            // Find applicable schedule entry for this date
            let scheduleEntry;
            if (user.schedules && Array.isArray(user.schedules)) {
              scheduleEntry = user.schedules.slice().reverse().find(entry => {
                const eff = new Date(entry.effectiveFrom);
                return eff <= d;
              });
            }
            // Fallback to legacy
            let dayKey = dayName.toLowerCase();
            if (scheduleEntry && scheduleEntry.daily && scheduleEntry.daily[dayKey]) {
              const sch = scheduleEntry.daily[dayKey] as { inTime?: string; outTime?: string } | undefined;
              scheduledInTime = sch?.inTime ?? '';
              scheduledOutTime = sch?.outTime ?? '';
            } else if (user.scheduleInOutTime && ['monday','tuesday','wednesday','thursday','friday'].includes(dayKey)) {
              scheduledInTime = user.scheduleInOutTime.inTime ?? '';
              scheduledOutTime = user.scheduleInOutTime.outTime ?? '';
            } else if (user.scheduleInOutTimeSat && dayKey === 'saturday') {
              scheduledInTime = user.scheduleInOutTimeSat.inTime ?? '';
              scheduledOutTime = user.scheduleInOutTimeSat.outTime ?? '';
            } else if (user.scheduleInOutTimeMonth && dayKey === 'monthly') {
              scheduledInTime = user.scheduleInOutTimeMonth.inTime ?? '';
              scheduledOutTime = user.scheduleInOutTimeMonth.outTime ?? '';
            }
            // Calculate scheduled time (hours) for this day
            if (scheduledInTime && scheduledOutTime && scheduledInTime !== '00:00' && scheduledOutTime !== '00:00') {
              const [inH, inM] = scheduledInTime.split(':').map(Number);
              const [outH, outM] = scheduledOutTime.split(':').map(Number);
              let diff = (outH * 60 + outM) - (inH * 60 + inM);
              if (diff < 0) diff += 24 * 60; // handle overnight
              const hours = Math.floor(diff / 60);
              const mins = diff % 60;
              scheduledTime = `${hours}:${mins.toString().padStart(2, '0')}`;
            } else {
              scheduledTime = '';
            }
          }
        }
        // --- Custom logic for WFH and Outstation ---
        let maxWFH = '';
        let actualWFH = '';
        let maxOutstation = '';
        let actualOutstation = '';
        // Default working hours
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

        // Present/Absent/Holiday logic
        let presentAbsent = 'Absent';
        const inTime = String(actualInTimeEditable).trim();
        const outTime = String(actualOutTimeEditable).trim();
        // Custom present logic for WFH and Outstation (client place / outstation: 00:00 in-out is OK; still fill max/actual outstation)
        const typeOfPresence = record.typeOfPresence || record.status || '';
        // Outstation / client place / OS-P must win over calendar Sunday or API holidays (e.g. work at client on a Sunday).
        if (recordIsDaywiseOutstationRow(record)) {
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
        } else if (isHoliday || isSunday) {
          presentAbsent = 'Holiday';
        } else if (
          (record.status && record.status.toLowerCase().includes('present')) ||
          (inTime !== '00:00' && outTime !== '00:00')
        ) {
          presentAbsent = 'Present';
        } else if (inTime === '00:00' && outTime === '00:00') {
          presentAbsent = 'Absent';
        }

        // --- Excess/Short calculation for the day ---
        // Always output Ã‚Â±HH:MM:SS
        let daySeconds = 0;
        const isAbsent = presentAbsent === 'Absent';
        if (isAbsent && scheduledInTime && scheduledOutTime && scheduledInTime !== '00:00' && scheduledOutTime !== '00:00') {
          const [schInH, schInM] = scheduledInTime.split(':').map(Number);
          const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
          let scheduledMinutes = schOutH * 60 + schOutM - (schInH * 60 + schInM);
          if (scheduledMinutes < 0) scheduledMinutes += 24 * 60;
          daySeconds = -scheduledMinutes * 60;
        } else if (scheduledInTime && scheduledOutTime && scheduledInTime !== '00:00' && scheduledOutTime !== '00:00' && inTime && outTime && inTime !== '00:00' && outTime !== '00:00') {
          const [schInH, schInM] = scheduledInTime.split(':').map(Number);
          const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
          const [actInH, actInM] = inTime.split(':').map(Number);
          const [actOutH, actOutM] = outTime.split(':').map(Number);
          let scheduledMinutes = schOutH * 60 + schOutM - (schInH * 60 + schInM);
          if (scheduledMinutes < 0) scheduledMinutes += 24 * 60;
          let actualMinutes = actOutH * 60 + actOutM - (actInH * 60 + actInM);
          if (actualMinutes < 0) actualMinutes += 24 * 60;
          let isArticle = false;
          if (allUsers && item.userId) {
            const user = allUsers.find(u => u._id === item.userId);
            const empType = getEmploymentTypeForDate(user, d);
            if (user && (user.designation?.toLowerCase() === 'article' || empType === 'article')) {
              isArticle = true;
            }
          }
          if (actualMinutes < scheduledMinutes) {
            daySeconds = -(scheduledMinutes - actualMinutes) * 60;
          } else if (actualMinutes > scheduledMinutes) {
            if (isArticle) {
              let excess = 0;
              if (actInH * 60 + actInM < schInH * 60 + schInM) {
                excess += (schInH * 60 + schInM) - (actInH * 60 + actInM);
              }
              if (actOutH * 60 + actOutM > schOutH * 60 + schOutM) {
                const late = (actOutH * 60 + actOutM) - (schOutH * 60 + schOutM);
                if (late > 30) excess += late;
              }
              daySeconds = excess * 60;
            } else {
              daySeconds = (actualMinutes - scheduledMinutes) * 60;
            }
          } else {
            daySeconds = 0;
          }
        } else {
          daySeconds = 0;
        }
        dailyExcessShortSeconds.push(daySeconds);

        let workingHrsExport: number | '' = '';
        if (typeof workingHrs === 'number' && !Number.isNaN(workingHrs)) {
          workingHrsExport = decimalHoursToExcelDuration(workingHrs);
        } else {
          const hm = formatTime(workingHrs);
          const dec = hmStringToDecimalHours(hm);
          workingHrsExport = dec === '' ? '' : decimalHoursToExcelDuration(dec);
        }

        let scheduledTimeExport: number | '' = '';
        if (scheduledTime === '') {
          scheduledTimeExport = '';
        } else if (/^0h\s*0m$/i.test(String(scheduledTime).trim())) {
          scheduledTimeExport = decimalHoursToExcelDuration(0);
        } else {
          const dec = hmStringToDecimalHours(String(scheduledTime));
          scheduledTimeExport = dec === '' ? '' : decimalHoursToExcelDuration(dec);
        }

        worksheet.addRow({
          weekType,
          source: getSource(record),
          date: formatIsoKeyAsDdMmYyyy(date),
          day: dayName,
          employeeName: item.userName,
          designation: daywiseUser
            ? getDesignationForDate(daywiseUser as Parameters<typeof getDesignationForDate>[0], date)
            : item.designation || '',
          presentAbsent,
          actualInTimeOriginal: hhmmStringToExcelTime(String(actualInTimeOriginal)),
          actualOutTimeOriginal: hhmmStringToExcelTime(String(actualOutTimeOriginal)),
          actualInTimeEditable: hhmmStringToExcelTime(String(actualInTimeEditable)),
          actualOutTimeEditable: hhmmStringToExcelTime(String(actualOutTimeEditable)),
          trueFalseInTime: String(actualInTimeOriginal) === String(actualInTimeEditable) ? 'True' : 'False',
          trueFalseOutTime: String(actualOutTimeOriginal) === String(actualOutTimeEditable) ? 'True' : 'False',
          scheduledInTime: hhmmStringToExcelTime(formatTime(scheduledInTime)),
          scheduledOutTime: hhmmStringToExcelTime(formatTime(scheduledOutTime)),
          maxWFH: maxWFH === '' ? '' : round2(Number(maxWFH)),
          actualWFH: actualWFH === '' ? '' : daywiseNumericOrString(String(actualWFH)),
          maxOutstation: maxOutstation === '' ? '' : round2(Number(maxOutstation)),
          actualOutstation: actualOutstation === '' ? '' : daywiseNumericOrString(String(actualOutstation)),
          workingHrs: workingHrsExport,
          scheduledTime: scheduledTimeExport,
          scheduledHrsMonth: scheduledHrsMonth ? decimalHoursToExcelDuration(scheduledHrsMonth) : '',
          workingHrsMonth: workingHrsMonth ? decimalHoursToExcelDuration(workingHrsMonth) : '',
          excessShortHrsMonth: '',
          excessShortHrsDay: decimalHoursToExcelDuration(daySeconds / 3600),
          halfDays,
        });
        rowIndexes.push(worksheet.rowCount);
      });
      // After all rows for this user/month, sum daily seconds and update monthly column
      if (dailyExcessShortSeconds.length > 0) {
        const totalMonthSeconds = dailyExcessShortSeconds.reduce((a: number, b: number) => a + b, 0);
        const excessShortHrsMonthFormatted = decimalHoursToExcelDuration(totalMonthSeconds / 3600);
        for (const rowIdx of rowIndexes) {
          worksheet.getRow(rowIdx).getCell('excessShortHrsMonth').value = excessShortHrsMonthFormatted;
        }
      }
    };

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

    const daywiseLeftAlignKeys = new Set(['source', 'employeeName', 'designation']);

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
      scheduledTime: EXCEL_DURATION_NUM_FMT,
      scheduledHrsMonth: EXCEL_DURATION_NUM_FMT,
      workingHrsMonth: EXCEL_DURATION_NUM_FMT,
      excessShortHrsMonth: EXCEL_DURATION_NUM_FMT,
      excessShortHrsDay: EXCEL_DURATION_NUM_FMT,
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
      if (pa === 'Absent') {
        presentAbsentCell.font = { size: 10, name: 'Calibri', color: { argb: 'FFBE123C' }, bold: true };
        presentAbsentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF1F2' },
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

    const fileName = `daywise_attendance_${new Date().toISOString().split('T')[0]}.xlsx`;
    await downloadWorkbook(await workbook.xlsx.writeBuffer(), fileName);
}
