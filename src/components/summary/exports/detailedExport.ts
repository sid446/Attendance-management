import type { AttendanceSummaryView, User } from '@/types/ui';
import { getEmploymentTypeForDate } from '@/lib/attendanceSummaryMetrics';
import {
  getDesignationForDate,
  getSummaryPeriodEndDate,
  getWorkingUnderPartnerForDate,
} from '@/lib/userFieldHistory';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { sortRecordDetailsEntries } from '../utils/summaryDateUtils';
import type { SummaryExportContext } from './exportTypes';
import { downloadWorkbook } from './downloadWorkbook';
import { isArticleEmployee } from '@/lib/isArticleEmployee';

const INACTIVE_ROW_FILL = 'FFFDBA74';

function isUserMarkedInactive(user: User | undefined): boolean {
  if (!user) return false;
  if (user.isActive === false) return true;
  const raw: unknown = user.isActive;
  return typeof raw === 'string' && raw.toLowerCase() === 'false';
}

function summaryHasExportData(item: AttendanceSummaryView): boolean {
  return Object.keys(item.recordDetails || {}).length > 0;
}


export async function exportDetailedAttendance(ctx: SummaryExportContext): Promise<void> {
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
    summaryPeriodBase,
  } = ctx;

    if (filteredSummaries.length === 0) return;

    // Build holiday date set for quick checks
    const holidayDates = new Set(holidays.map(h => h.date));

    // Helper predicates per spec
    const isPIO = (rec: any) => {
      const t = rec.typeOfPresence;
      if (!t) return false;
      if (rec.halfDay) return false;

      // Exclude ThumbMachine records with no real checkin/out (00:00 or missing)
      if (t === 'ThumbMachine') {
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const effectiveCheckout = rec.editedCheckout || rec.checkout;
        const hasValidCheckin = !!(effectiveCheckin && effectiveCheckin !== '00:00');
        const hasValidCheckout = !!(effectiveCheckout && effectiveCheckout !== '00:00');
        if (!hasValidCheckin && !hasValidCheckout) return false;
      }

      return t === 'ThumbMachine' || t === 'Present - in office' || t === 'Present - in office - weekdays' || t === 'Present';
    };

    const isWOPIO = (rec: any) => {
      const t = rec.typeOfPresence || '';
      if (!t) return false;
      if (rec.halfDay) return false;
      return t === 'Present - in office - weekoff' || t === 'Present - weekoff' || t === 'Weekly Off - Present (WO-Present)';
    };

    const isOSP = (rec: any) => {
      const t = rec.typeOfPresence || '';
      const set = new Set([
        'Present - Outstation (Weekdays)',
        'Present - Outstation (Weekoff)',
        'Present - ClientPlace (Weekoff)',
        'Present - ClientPlace (Weekdays)',
        'Present - outstation',
        'Present - client place',
        'Present - Outstation (Weekdays)'
      ]);
      return set.has(t);
    };

    const isWFHWeekoff = (rec: any) => {
      const t = rec.typeOfPresence || '';
      return t === 'WFH - weekoff' || t === 'Weekly Off - Work From Home (WO-WFH)';
    };

    const isWFHWeekday = (rec: any) => {
      const t = rec.typeOfPresence || '';
      return t === 'WFH - weekdays' || t === 'Work From Home (WFH)';
    };

    const isHalfDayWeekoff = (rec: any) => rec.halfDay && (rec.typeOfPresence === 'Half Day - weekoff' || rec.typeOfPresence === 'Half Day (HD)');

    const isHalfDayWeekday = (rec: any) => rec.halfDay && (rec.typeOfPresence === 'Half Day - weekdays' || rec.typeOfPresence === 'Half Day (HD)');

    // WFH allowed default per user (days) - default 2
    const getWfhAllowed = (user: User | undefined) => {
      return 2;
    };

    const toDateOnly = (v: string) => new Date(`${v}T00:00:00`);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

    const getExportRange = () => {
      if (filterType === 'month') {
        const start = new Date(selectedYear, selectedMonth - 1, 1);
        const end = new Date(selectedYear, selectedMonth, 0);
        return { start, end };
      }

      if (filterType === 'week') {
        const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
        const lastDay = new Date(selectedYear, selectedMonth, 0);
        let weekStart = new Date(currentWeekStart);
        if (weekStart < firstDay) weekStart = new Date(firstDay);
        let weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd > lastDay) weekEnd = new Date(lastDay);
        return { start: weekStart, end: weekEnd };
      }

      return { start: new Date(rangeStart), end: new Date(rangeEnd) };
    };

    const isHolidayLikeType = (typeOfPresence: string) => {
      const t = String(typeOfPresence || '').toLowerCase();
      return (
        t === 'holiday' ||
        t === 'sun' ||
        t === 'sunday' ||
        t === 'official holiday duty (ohd)' ||
        t.includes('weekoff')
      );
    };

    // Leave contribution rules for detailed export adjustments:
    // Absent => 1, Half Day => 0.5, WFH => 1 - value, Leave => value/full-day.
    const getLeaveContribution = (dateStr: string, rec: any): number => {
      if (!rec) return 0;

      const dateObj = toDateOnly(dateStr);
      if (dateObj.getDay() === 0) return 0;
      if (holidayDates.has(dateStr)) return 0;

      const type = String(rec.typeOfPresence || '');
      if (isHolidayLikeType(type)) return 0;

      const inTime = String(rec.editedCheckin || rec.checkin || '').trim();
      const outTime = String(rec.editedCheckout || rec.checkout || '').trim();
      const hasIn = inTime !== '' && inTime !== '00:00';
      const hasOut = outTime !== '' && outTime !== '00:00';
      const totalHour = Number(rec.totalHour || 0);

      // Paid leave / on leave entries
      if (type === 'Leave' || type === 'On leave') {
        const raw = Number(rec.value);
        if (Number.isFinite(raw) && raw > 0) return round2(clamp01(raw));
        return rec.halfDay ? 0.5 : 1;
      }

      // Absent entries
      const isAbsentByType = type === 'Absent';
      const isAbsentByTime = totalHour === 0 && !hasIn && !hasOut;
      if (isAbsentByType || isAbsentByTime) {
        return 1;
      }

      // Half day entries
      if (rec.halfDay || type === 'Half Day - weekdays' || type === 'Half Day - weekoff' || type === 'Half Day (HD)') {
        return 0.5;
      }

      // WFH entries consume the shortfall from 1 day
      const isWFH =
        type === 'WFH - weekdays' ||
        type === 'WFH - weekoff' ||
        type === 'Work From Home (WFH)' ||
        type === 'Weekly Off - Work From Home (WO-WFH)';

      if (isWFH) {
        const raw = Number(rec.value);
        const normalized = Number.isFinite(raw) ? clamp01(raw) : 0;
        return round2(Math.max(0, 1 - normalized));
      }

      return 0;
    };

    // Import ExcelJS dynamically
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Detailed Attendance');

    // Define columns exactly in required order
    worksheet.columns = [
      { key: 'employeeCode', width: 14 },
      { key: 'employeeName', width: 22 },
      { key: 'category', width: 12 },
      { key: 'verticalHead', width: 18 },
      { key: 'paidFrom', width: 12 },

      // New columns after paidFrom
      { key: 'PIO', width: 8 },
      { key: 'WO_PIO', width: 8 },
      { key: 'OS_P', width: 8 },
      { key: 'A', width: 6 },
      { key: 'HD', width: 8 },
      { key: 'Weekoff_HD', width: 12 },
      { key: 'Weekoffs', width: 14 },
      { key: 'Sun', width: 10 },
      { key: 'OHD', width: 10 },
      { key: 'WFH_Weekoff', width: 12 },
      { key: 'WFH_Weekday', width: 12 },
      { key: 'WFH_MaxAllowed', width: 14 },
      { key: 'Absent_WFH', width: 12 },
      { key: 'Present_WFH', width: 16 },
      { key: 'Absent_WFH_MaxActual', width: 16 },
      { key: 'Staff_Weekdays_Working', width: 18 },
      { key: 'Leaves_Taken', width: 14 },
      { key: 'Leaves_BF', width: 10 },
      { key: 'Leaves_Earned', width: 12 },
      { key: 'Leaves_Earned_Extra', width: 12 },
      { key: 'Leaves_Consumed', width: 18 },
      { key: 'Leaves_CF', width: 10 },
      { key: 'Staff_Weekoff_Working', width: 20 },
      { key: 'Staff_Overtime', width: 12 },
      { key: 'Net_Staff_Working', width: 18 },
      { key: 'Loss_Due_Invalid', width: 18 }
    ];

    // Insert numbering row above header (1..N) and header row at row 2
    const colCount = worksheet.columns.length;
    const numberingRow = Array.from({ length: colCount }, (_, i) => i + 1);
    worksheet.insertRow(1, numberingRow);
    const headerLabels = [
      'Employee Code',
      'Employee Name',
      'Category',
      'Authorised Vertical Head',
      'Paid From',

      'PIO',
      'WO-PIO',
      'OS-P',
      'A',
      'HD',
      'Weekoff HD (Days)',
      'Weekoffs (Inc. Sun+OHD)',
      'Sun (Days)',
      'OHD (Days)',
      'WFH (In Weekoff)',
      'WFH (Days)',
      'WFH (Max Day Allowed)',
      'Absent WFH',
      'Present WFH (Actual)',
      'Absent WFH (Max-Actual)',
      'Staff Weekdays-Working',
      'Leaves Taken By Staff',
      'Leaves B/F',
      'Leaves Earned This Month',
      'Leaves Earned - Extra',
      'Leaves Consumed This Month',
      'C/F Leaves',
      'Staff Weekoff Working Days',
      'Staff Overtime',
      'Net Staff Working Days',
      'Loss due to invalid'
    ];
    worksheet.insertRow(2, headerLabels);

    // Pre-calc period range
    let startDate: Date;
    let endDate: Date;

    if (filterType === 'month') {
      startDate = new Date(selectedYear, selectedMonth - 1, 1);
      endDate = new Date(selectedYear, selectedMonth, 0);
    } else if (filterType === 'week') {
      startDate = new Date(currentWeekStart);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
    } else {
      startDate = new Date(rangeStart);
      endDate = new Date(rangeEnd);
    }

    // Pre-calc total Sundays and total DB-holidays in selected period (same for all users)
    const totalSundaysInPeriod = countTotalSundaysInPeriod();
    const countHolidaysInPeriod = () => {
      let cnt = 0;
      for (const h of holidays) {
        const [y, m, d] = h.date.split('-').map(Number);
        const localHolidayDate = new Date(y, m - 1, d);
        if (localHolidayDate >= startDate && localHolidayDate <= endDate) cnt++;
      }
      return cnt;
    };
    const totalHolidaysInPeriod = countHolidaysInPeriod();

    const exportRange = getExportRange();

    // Current month context for snapshot-driven leave adjustment
    const targetMonth = filterType === 'range'
      ? `${exportRange.end.getFullYear()}-${String(exportRange.end.getMonth() + 1).padStart(2, '0')}`
      : `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

    // Fetch snapshots for the target month so Leaves_B/F and leave taken adjustment are accurate
    let snapshotMap: Record<string, any> = {};
    try {
      const snapRes = await fetch(`/api/leave/snapshots?monthYear=${targetMonth}`);
      if (snapRes.ok) {
        const json = await snapRes.json();
        if (json && Array.isArray(json.data)) {
          snapshotMap = Object.fromEntries(json.data.map((s: any) => [String(s.userId), s]));
        }
      }
    } catch (e) {
      // ignore snapshot fetch errors and fallback to user.leaveBalance
    }

    // For week/range exports, fetch full current-month attendance so we can
    // adjust snapshot leave values for included/excluded dates precisely.
    let currentMonthRecordsByUser: Record<string, Record<string, any>> = {};
    if (filterType !== 'month') {
      try {
        const monthRes = await fetch(`/api/attendance?monthYear=${encodeURIComponent(targetMonth)}`);
        if (monthRes.ok) {
          const json = await monthRes.json();
          if (json?.success && Array.isArray(json.data)) {
            for (const row of json.data) {
              const uid = String(row?.userId?._id || row?.userId || '');
              if (!uid) continue;
              currentMonthRecordsByUser[uid] = (row?.records || {}) as Record<string, any>;
            }
          }
        }
      } catch (e) {
        // If month fetch fails, detailed export falls back to in-range records only.
      }
    }

    const usersById = new Map<string, User>();
    for (const u of allUsers ?? []) {
      usersById.set(u._id, u);
    }
    const inactiveUserIds = new Set<string>();
    try {
      const usersRes = await fetch('/api/users?listOnly=1&includeInactive=1', hrCredentialsInit());
      if (usersRes.ok) {
        const usersJson = await usersRes.json();
        if (usersJson?.success && Array.isArray(usersJson.data)) {
          for (const u of usersJson.data as User[]) {
            usersById.set(u._id, u);
            if (isUserMarkedInactive(u)) inactiveUserIds.add(u._id);
          }
        }
      }
    } catch {
      // Fall back to active users from export context.
    }

    const resolveUser = (item: AttendanceSummaryView) =>
      usersById.get(item.userId) ??
      allUsers?.find((u) => u._id === item.userId || u.odId === item.userId);

    const classifySummary = (item: AttendanceSummaryView) => {
      const user = resolveUser(item);
      const periodEndForItem = getSummaryPeriodEndDate({ ...summaryPeriodBase, monthYear: item.monthYear });
      const employmentType =
        user?.employmentType || getEmploymentTypeForDate(user as any, periodEndForItem);
      const designationAtPeriod = getDesignationForDate(
        user as Parameters<typeof getDesignationForDate>[0],
        periodEndForItem
      );
      const isArticle = isArticleEmployee({
        employmentType,
        designation: designationAtPeriod || item.designation,
        category: user?.category,
      });
      const isInactive = inactiveUserIds.has(item.userId) || isUserMarkedInactive(user);
      return { isArticle, isInactive };
    };

    // Active first, inactive last (each split into employees vs articles).
    const activeEmployeeSummaries: AttendanceSummaryView[] = [];
    const activeArticleSummaries: AttendanceSummaryView[] = [];
    const inactiveEmployeeSummaries: AttendanceSummaryView[] = [];
    const inactiveArticleSummaries: AttendanceSummaryView[] = [];
    filteredSummaries.forEach((item) => {
      if (!summaryHasExportData(item)) return;
      const { isArticle, isInactive } = classifySummary(item);
      if (isInactive) {
        if (isArticle) inactiveArticleSummaries.push(item);
        else inactiveEmployeeSummaries.push(item);
      } else if (isArticle) {
        activeArticleSummaries.push(item);
      } else {
        activeEmployeeSummaries.push(item);
      }
    });

    const inactiveRowNumbers = new Set<number>();

    // Process a single summary and add a row; if `isArticle` blanks certain columns
    const processItem = (item: AttendanceSummaryView, isArticle = false, markInactive = false) => {
      const user = resolveUser(item);
      const periodEnd = getSummaryPeriodEndDate({ ...summaryPeriodBase, monthYear: item.monthYear });
      const workPartnerAtPeriod = getWorkingUnderPartnerForDate(
        user as Parameters<typeof getWorkingUnderPartnerForDate>[0],
        periodEnd
      );
      const records = item.recordDetails || {};

      let weekdayHours = 8;
      try {
        const schedules = (user as any)?.schedules;
        if (schedules && Array.isArray(schedules) && schedules.length > 0) {
          const sortedSchedules = schedules.slice().sort((a: any, b: any) =>
            new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
          );
          const mondaySchedule = sortedSchedules[0]?.daily?.monday;
          if (mondaySchedule?.inTime && mondaySchedule?.outTime) {
            const [inH, inM] = mondaySchedule.inTime.split(':').map(Number);
            const [outH, outM] = mondaySchedule.outTime.split(':').map(Number);
            const calc = (outH + outM / 60) - (inH + inM / 60);
            if (calc > 0) weekdayHours = calc;
          }
        }
      } catch (e) {
        weekdayHours = 8;
      }

      // Calculate loss due to invalid attendance (deficient due to missing in/out)
      let lossDueToInvalidHour = 0;
      sortRecordDetailsEntries(records).forEach(([dateStr, recAny]) => {
        const rec: any = recAny || {};
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const effectiveCheckout = rec.editedCheckout || rec.checkout;
        // If both inTime and outTime are '00:00' or missing, treat as absent, not invalid
        const isBothZero = !(effectiveCheckin && effectiveCheckin !== '00:00') && !(effectiveCheckout && effectiveCheckout !== '00:00');
        if (isBothZero) return; // skip, this is absent
        // If either inTime or outTime is missing (invalid attendance)
        const missingIn = !(effectiveCheckin && effectiveCheckin !== '00:00');
        const missingOut = !(effectiveCheckout && effectiveCheckout !== '00:00');
        if (missingIn || missingOut) {
          // If excessHour is negative (deficit), sum it
          const ex = typeof rec.excessHour === 'number' ? rec.excessHour : (rec.excessHour ? Number(rec.excessHour) : 0);
          if (ex < 0) lossDueToInvalidHour += Math.abs(ex);
        }
      });
      // Convert total deficient hours to days (divide by weekdayHours)
      const lossDueToInvalid = weekdayHours > 0 ? Number((lossDueToInvalidHour / weekdayHours).toFixed(2)) : 0;

      // Counters
      let pio = 0;
      let wo_pio = 0;
      let os_p = 0; // can be fractional
      let absent = 0;
      let hd_count = 0; // number of half-day weekday records
      let weekoff_hd_days = 0; // half-day weekoff count -> will convert to days later
      let weekoffs_sum = 0; // sum of values for weekoff present records
      let sun_days = 0;
      let ohd_days = 0;
      let wfh_weekoff = 0; // sum of values
      let wfh_weekday = 0; // sum of values
      let present_wfh_actual = 0; // same as wfh_weekday
      let leaves_taken = 0;
      let extraEarnedFromOutclient = 0; // additional leave earned from outstation/clientplace attendances
      let staffOvertime = 0; // sum of excessHour for ThumbMachine records

      sortRecordDetailsEntries(records).forEach(([dateStr, recAny]) => {
        const rec: any = recAny || {};
        const d = new Date(dateStr);
        const isSunday = d.getDay() === 0;
        const isHoliday = holidayDates.has(dateStr) || rec.typeOfPresence === 'Holiday';
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const effectiveCheckout = rec.editedCheckout || rec.checkout;
        const isBothZero = !(effectiveCheckin && effectiveCheckin !== '00:00') && !(effectiveCheckout && effectiveCheckout !== '00:00');
        // If both checkin/checkout are 00:00 (or missing) treat record as no-value (0)
        const value = typeof rec.value === 'number'
          ? rec.value
          : (isBothZero ? 0 : (rec.halfDay ? 0.5 : (rec.totalHour > 0 ? 1 : 0)));

        const t = rec.typeOfPresence || '';
        const outclientSet = new Set(['Present - Outstation (Weekdays)', 'Present - Outstation (Weekoff)', 'Present - ClientPlace (Weekoff)', 'Present - ClientPlace (Weekdays)', 'Present - outstation', 'Present - client place']);

        // Resolve employment type for this record's date (respect history)
        const empType = getEmploymentTypeForDate(user, d) || user?.employmentType;

        // PIO
        if (isPIO(rec) && !isHoliday && !isSunday) {
          pio += 1;
        } else if (empType === 'halftime' && rec.halfDay && !isHoliday && !isSunday && !isBothZero) {
          // For halftime employees, count half-days as PIO (use rec.value if present)
          if (!outclientSet.has(t)) {
            const inc = typeof rec.value === 'number' ? rec.value : 0.5;
            pio += inc;
          }
        }

        // WO-PIO: explicit weekoff present types, or in-office present (PIO rules) on Sunday / holiday
        if (isWOPIO(rec)) {
          wo_pio += 1;
        } else if (isPIO(rec) && (isSunday || isHoliday)) {
          wo_pio += 1;
        }

        // OS-P (allow half days)
        if (isOSP(rec)) {
          os_p += (rec.halfDay ? 0.5 : 1);
        }

        // Absent (A): exclude Sundays and holidays from absent counting.
        let isAbsentRecord = false;
        const isExplicitAbsent = rec.typeOfPresence === 'Absent';
        const isLeaveMarked = rec.typeOfPresence === 'Leave' || rec.typeOfPresence === 'On leave';
        const typeLower = String(t || '').toLowerCase();
        const isClientOrRemotePresence =
          outclientSet.has(t) ||
          typeLower.includes('client place') ||
          typeLower.includes('clientplace') ||
          typeLower.includes('outstation') ||
          typeLower.includes('wfh') ||
          typeLower.includes('work from home') ||
          typeLower.includes('onsite presence');

        if (!isSunday && !isHoliday && (isExplicitAbsent || isLeaveMarked)) {
          absent += 1;
          isAbsentRecord = true;
        } else if (
          !isSunday &&
          !isHoliday &&
          !isClientOrRemotePresence &&
          rec.totalHour === 0 &&
          rec.typeOfPresence !== 'Holiday' &&
          !(typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff'))
        ) {
          const effectiveCheckin = rec.editedCheckin || rec.checkin;
          const effectiveCheckout = rec.editedCheckout || rec.checkout;
          if ((!(effectiveCheckin && effectiveCheckin !== '00:00')) && (!(effectiveCheckout && effectiveCheckout !== '00:00'))) {
            absent += 1;
            isAbsentRecord = true;
          }
        }

        // HD handling:
        // Count explicit 'Half Day - weekoff' regardless of rec.halfDay, but skip if record is absent
        if (t === 'Half Day - weekoff') {
          if (!isAbsentRecord) weekoff_hd_days += 1;
        } else if (rec.halfDay) {
          // If record is actually absent (no valid checkin/checkout) do not count as half-day
          if (isAbsentRecord) {
            // skip
          } else if (isSunday || isHoliday) {
            weekoff_hd_days += 1;
          } else {
            if (!outclientSet.has(t)) {
              // For halftime employees, half-days are counted into PIO above, so skip hd_count to avoid double-counting
              if (empType !== 'halftime') {
                hd_count += 1;
              }
            }
          }
        }

        // Weekoffs (Inc. Sun+OHD)
        const isWeekoffType = typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff');
        if ((isSunday || isHoliday || isWeekoffType) && value > 0) {
          weekoffs_sum += value;
        }

        if (outclientSet.has(t)) {
          const explicitExtra = typeof rec.extraEarned === 'number' ? rec.extraEarned : (rec.extraEarned ? Number(rec.extraEarned) : 0);
          const impliedExtra = value > 1 ? (value - 1) : 0;
          extraEarnedFromOutclient += explicitExtra + impliedExtra;
        }

        // Sun (Days)
        if (isSunday && value > 0) sun_days += value;

        // OHD (Days)
        if (holidayDates.has(dateStr) && value > 0) ohd_days += value;

        // WFH handling
        if (isWFHWeekoff(rec)) {
          wfh_weekoff += value;
        }
        if (isWFHWeekday(rec)) {
          wfh_weekday += 1;
          present_wfh_actual += value;
        }

        leaves_taken += getLeaveContribution(dateStr, rec);

        // Staff Overtime
        const excessHourVal = typeof rec.excessHour === 'number' ? rec.excessHour : (rec.excessHour ? Number(rec.excessHour) : 0);
        if (!isAbsentRecord && rec.typeOfPresence && typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('thumbmachine')) {
          staffOvertime += excessHourVal;
        }
      });

      // Post-process conversions (same as before)
      const weekoff_hd_days_converted = Number(weekoff_hd_days.toFixed(3));
      const wfhMaxAllowed = Number((wfh_weekday * 0.75).toFixed(3));
      const presentWFHActual = Number(present_wfh_actual.toFixed(2));
      const absentWFH = Number((wfh_weekday * 0.25).toFixed(3));
      const absentWFH_MaxActual = Number(Math.max(0, wfhMaxAllowed - presentWFHActual).toFixed(3));
      const staffWeekdaysWorking = Number((pio + os_p + (hd_count / 2) + presentWFHActual).toFixed(3));

      // Snapshot-driven leave taken adjustment for week/range exports.
      // Baseline from current-month snapshot, then:
      // 1) subtract excluded current-month dates,
      // 2) add included non-current-month dates (e.g., last day of previous month).
      if (filterType !== 'month') {
        const uid = String(user?._id || item.userId);
        const fullCurrentMonthRecords = currentMonthRecordsByUser[uid] || {};
        const snapshotUsedRaw = Number(snapshotMap[uid]?.usedThisMonth);
        const hasSnapshotUsed = Number.isFinite(snapshotUsedRaw);

        let excludedCurrentMonthContribution = 0;
        if (hasSnapshotUsed) {
          for (const [dateStr, rec] of sortRecordDetailsEntries(fullCurrentMonthRecords)) {
            if (!dateStr.startsWith(`${targetMonth}-`)) continue;
            const d = toDateOnly(dateStr);
            const isIncluded = d >= exportRange.start && d <= exportRange.end;
            if (!isIncluded) {
              excludedCurrentMonthContribution += getLeaveContribution(dateStr, rec);
            }
          }
        }

        let includedOtherMonthContribution = 0;
        for (const [dateStr, rec] of sortRecordDetailsEntries(records)) {
          if (dateStr.startsWith(`${targetMonth}-`)) continue;
          const d = toDateOnly(dateStr);
          if (d >= exportRange.start && d <= exportRange.end) {
            includedOtherMonthContribution += getLeaveContribution(dateStr, rec);
          }
        }

        if (hasSnapshotUsed) {
          const adjustedCurrentMonth = Math.max(0, snapshotUsedRaw - excludedCurrentMonthContribution);
          leaves_taken = round2(adjustedCurrentMonth + includedOtherMonthContribution);
        } else {
          leaves_taken = round2(leaves_taken);
        }
      } else {
        const uid = String(user?._id || item.userId);
        const snapshotUsedRaw = Number(snapshotMap[uid]?.usedThisMonth);
        if (Number.isFinite(snapshotUsedRaw)) {
          leaves_taken = round2(snapshotUsedRaw);
        } else {
          leaves_taken = round2(leaves_taken);
        }
      }

      // Prefer snapshot balanceAsOfMonth for Leaves B/F, fallback to user.leaveBalance
      const snap = snapshotMap[String(user?._id || item.userId)];
      const leavesBF = snap && typeof snap.balanceAsOfMonth === 'number'
        ? Number(snap.balanceAsOfMonth)
        : Math.max(0, (user?.leaveBalance?.remaining ?? 0) - (user?.leaveBalance?.monthlyEarned ?? 0));
      const leavesEarned = (user?.leaveBalance?.monthlyEarned ?? 2);
      const totalLeavesEarned = Number((leavesEarned + (extraEarnedFromOutclient || 0)).toFixed(3));
      let leavesConsumed = 0;
      if (staffWeekdaysWorking < 10) {
        leavesConsumed = 0;
      } else {
        const available = leavesBF + totalLeavesEarned;
        leavesConsumed = Math.min(leaves_taken, available);
      }
      const leavesCF = Number((leavesBF + totalLeavesEarned - leavesConsumed).toFixed(3));
      // Calculate unique weekoffs (Sundays + non-Sunday Holidays)
      let uniqueWeekoffs = totalSundaysInPeriod;
      for (const h of holidays) {
        const [y, m, day] = h.date.split('-').map(Number);
        const d = new Date(y, m - 1, day);
        if (d >= startDate && d <= endDate && d.getDay() !== 0) {
          uniqueWeekoffs++;
        }
      }
      const weekoffs_total = Number(uniqueWeekoffs.toFixed(3));
      const staffWeekoffWorking = Number((wo_pio + (weekoff_hd_days_converted / 2) + wfh_weekoff).toFixed(3));

      // Staff Overtime (non-articles): hours from ThumbMachine excess days, plus 1 day per each full 6h of net period excess (worked  scheduled)
      const thumbOvertimeDays = Number(((staffOvertime || 0) / (weekdayHours || 8)).toFixed(2));
      const periodExcessHours = Math.max(0, Number(item.calcExcessDeficit) || 0);
      const overtimeDaysFromExcessBlocks =
        !isArticle && periodExcessHours >= 6 ? Math.floor(periodExcessHours / 6) : 0;
      const staffOvertimeDays = Number((thumbOvertimeDays + overtimeDaysFromExcessBlocks).toFixed(2));
      const employmentType = user?.employmentType || getEmploymentTypeForDate(user as any, new Date());

      // Net Staff Working Days formula:
      // If employmentType is 'article', use staffWeekdaysWorking only.
      // Else, sum staffWeekdaysWorking + leavesConsumed + staffWeekoffWorking + staffOvertimeDays
      let netStaffWorking = 0;
      if (isArticle) {
        netStaffWorking = staffWeekdaysWorking;
      } else {
        netStaffWorking = Number((staffWeekdaysWorking + leavesConsumed + staffWeekoffWorking + staffOvertimeDays).toFixed(3));
      }

      const rowData: any = {
        employeeCode: user?.employeeCode || user?.odId || item.userId,
        employeeName: user?.name || item.userName,
        category: user?.category || '',
        verticalHead: workPartnerAtPeriod,
        paidFrom: user?.paidFrom || '',

        PIO: Number(pio.toFixed(2)),
        WO_PIO: Number(wo_pio.toFixed(2)),
        OS_P: Number(os_p.toFixed(2)),
        A: Number(absent.toFixed(2)),
        HD: Number(hd_count.toFixed(2)),
        Weekoff_HD: Number(weekoff_hd_days_converted.toFixed(2)),
        Weekoffs: Number(weekoffs_total.toFixed(2)),
        Sun: Number(totalSundaysInPeriod),
        OHD: Number(totalHolidaysInPeriod),
        WFH_Weekoff: Number(wfh_weekoff.toFixed(2)),
        WFH_Weekday: Number(wfh_weekday.toFixed(2)),
        WFH_MaxAllowed: wfhMaxAllowed,
        Absent_WFH: absentWFH,
        Present_WFH: presentWFHActual,
        Absent_WFH_MaxActual: absentWFH_MaxActual,
        Staff_Weekdays_Working: staffWeekdaysWorking,
        Leaves_Taken: Number(leaves_taken.toFixed(2)),
        Leaves_BF: Number(leavesBF.toFixed(2)),
        Leaves_Earned: Number(totalLeavesEarned.toFixed(2)),
        Leaves_Earned_Extra: Number((extraEarnedFromOutclient || 0).toFixed(2)),
        Leaves_Consumed: Number(leavesConsumed.toFixed(2)),
        Leaves_CF: leavesCF,
        Staff_Weekoff_Working: staffWeekoffWorking,
        Staff_Overtime: staffOvertimeDays,
        Net_Staff_Working: Number(netStaffWorking.toFixed(3)),
        Loss_Due_Invalid: lossDueToInvalid
      };

      if (isArticle) {
        rowData.Leaves_Taken = '';
        rowData.Leaves_BF = '';
        rowData.Leaves_Earned = '';
        rowData.Leaves_Earned_Extra = '';
        rowData.Leaves_Consumed = '';
        rowData.Leaves_CF = '';
        rowData.Staff_Weekoff_Working = '';
        rowData.Staff_Overtime = '';
      }

      worksheet.addRow(rowData);
      if (markInactive) {
        inactiveRowNumbers.add(worksheet.lastRow?.number ?? worksheet.rowCount);
      }
    };

    const addSectionSeparator = () => {
      worksheet.addRow([]);
      worksheet.addRow([]);
      worksheet.addRow([]);
    };

    // Write active employees, then active articles.
    activeEmployeeSummaries.forEach((i) => processItem(i, false));
    if (activeArticleSummaries.length > 0) {
      addSectionSeparator();
      activeArticleSummaries.forEach((i) => processItem(i, true));
    }

    // Inactive people with period data appear last, whole row highlighted orange.
    if (inactiveEmployeeSummaries.length > 0 || inactiveArticleSummaries.length > 0) {
      addSectionSeparator();
      inactiveEmployeeSummaries.forEach((i) => processItem(i, false, true));
      if (inactiveArticleSummaries.length > 0) {
        addSectionSeparator();
        inactiveArticleSummaries.forEach((i) => processItem(i, true, true));
      }
    }

    // Style numbering row and header row (numbering = row 1, header = row 2)
    const numbering = worksheet.getRow(1);
    numbering.height = 18;
    numbering.eachCell((cell) => {
      cell.font = { bold: true, size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const headerRow = worksheet.getRow(2);
    headerRow.height = 36; // increased height for better readability

    // Role-based header and data styling
    const identityKeys = new Set(['employeeCode','employeeName','category','verticalHead','paidFrom','team','designation']);
    const presenceKeys = new Set(['PIO','WO_PIO','OS_P','A','HD','Weekoff_HD','Weekoffs','Sun','OHD','WFH_Weekoff','WFH_Weekday','WFH_MaxAllowed','Absent_WFH','Present_WFH','Absent_WFH_MaxActual']);
    const leaveKeys = new Set(['Leaves_Taken','Leaves_BF','Leaves_Earned','Leaves_Earned_Extra','Leaves_Consumed','Leaves_CF']);
    const workKeys = new Set(['Staff_Weekdays_Working','Staff_Weekoff_Working','Staff_Overtime','Net_Staff_Working']);

    const headerFillMap: Record<string,string> = {
      identity: 'FF0F172A', // dark slate
      presence: 'FF1E3A8A', // indigo
      leave: 'FF1F2937', // gray-800
      work: 'FF065F46' // teal/green
    };

    const dataFillMap: Record<string,string> = {
      identity: 'FFFFFFFF',
      presence: 'FFEEF2FF',
      leave: 'FFF1F5F9',
      work: 'FFE6F6EF'
    };

    // Highlight specific columns in orange (header + subtle data tint)
    const highlightKeys = new Set(['Leaves_Earned_Extra', 'Loss_Due_Invalid']);
    const highlightHeaderColor = 'FFFB923C'; // orange
    const highlightDataColor = 'FFFEEBD4';

    headerRow.eachCell((cell, colNumber) => {
      const colKey = worksheet.columns[colNumber - 1]?.key as string | undefined;
      // Highlighted header columns use orange
      if (colKey && highlightKeys.has(colKey)) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: highlightHeaderColor } };
        return;
      }

      let role = 'identity';
      if (colKey && presenceKeys.has(colKey)) role = 'presence';
      else if (colKey && leaveKeys.has(colKey)) role = 'leave';
      else if (colKey && workKeys.has(colKey)) role = 'work';

      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFillMap[role] } };
    });

    // Style data rows and apply role-based fills
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // skip numbering + header
      const isInactiveRow = inactiveRowNumbers.has(rowNumber);
      const isEvenRow = rowNumber % 2 === 0;
      row.eachCell((cell, colNumber) => {
        const colKey = worksheet.columns[colNumber - 1]?.key as string | undefined;
        let role = 'identity';
        if (colKey && presenceKeys.has(colKey)) role = 'presence';
        else if (colKey && leaveKeys.has(colKey)) role = 'leave';
        else if (colKey && workKeys.has(colKey)) role = 'work';

        // Base font/alignment
        cell.font = { size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'left' : 'center' };

        if (isInactiveRow) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INACTIVE_ROW_FILL } };
          return;
        }

        // If highlighted column, apply special data fill
        if (colKey && highlightKeys.has(colKey)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: (isEvenRow ? highlightDataColor : 'FFFFFFFF') } };
        } else {
          // Apply role-based data fill with subtle alternation
          const baseFill = dataFillMap[role] || 'FFFFFFFF';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseFill } };
          if (isEvenRow) {
            // slightly tint even rows darker for readability
            if (role !== 'identity') {
              const darkVariant = role === 'presence' ? 'FFE6EEFF' : role === 'leave' ? 'FFF8FAFC' : role === 'work' ? 'FFF1FAF6' : baseFill;
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: darkVariant } };
            }
          }
        }
      });
    });

    const fileName = filterType === 'month'
      ? `Detailed_Attendance_Summary_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx`
      : filterType === 'week'
      ? `Detailed_Attendance_Summary_Week_${currentWeekStart}.xlsx`
      : `Detailed_Attendance_Summary_${rangeStart}_to_${rangeEnd}.xlsx`;

    await downloadWorkbook(await workbook.xlsx.writeBuffer(), fileName);
}
