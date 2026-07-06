import type { User } from '@/types/ui';
import { formatHoursMinutes, getExtraWorkHoursTotalForPeriod } from '@/lib/attendanceSummaryMetrics';
import {
  formatExtraWorkEntriesTimeSummary,
  getRecordPunchHours,
  sumExtraWorkEntryHours,
} from '@/lib/extraWorkRequest';
import { getDesignationForDate } from '@/lib/userFieldHistory';
import { sortRecordDetailsEntries } from '../utils/summaryDateUtils';
import type { SummaryExportContext } from './exportTypes';
import { decimalHoursToExcelDuration, EXCEL_DURATION_NUM_FMT } from './exportExcelDuration';
import { downloadWorkbook } from './downloadWorkbook';

const summaryDurationColumnKeys = new Set([
  'scheduled',
  'definedSchedule',
  'workHours',
  'punchWorkHours',
  'extraWorkHours',
]);

const summaryLeftAlignColumnKeys = new Set(['employeeName']);

function formatExportDate(value?: string | Date | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}


export async function exportSummaryAttendance(ctx: SummaryExportContext): Promise<void> {
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

    // Import ExcelJS dynamically
    const ExcelJS = (await import('exceljs')).default;

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Summary');


    // Add date range at the top (row 1)
    let dateRangeText = '';
    if (filterType === 'month') {
      dateRangeText = `Date Range: ${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    } else if (filterType === 'week') {
      // Clamp weekStart and weekEnd to selected month boundaries
      const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
      const lastDay = new Date(selectedYear, selectedMonth, 0);
      let weekStart = new Date(currentWeekStart);
      if (weekStart < firstDay) weekStart = new Date(firstDay);
      let weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > lastDay) weekEnd = new Date(lastDay);
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = weekEnd.toISOString().split('T')[0];
      dateRangeText = `Date Range: ${weekStartStr} to ${weekEndStr}`;
    } else if (filterType === 'range') {
      dateRangeText = `Date Range: ${rangeStart} to ${rangeEnd}`;
    }
    // Now add the header row (row 1)
    worksheet.columns = [
      { key: 'employeeCode', header: 'Employee Code', width: 15 },
      { key: 'paidFrom', header: 'Paid From', width: 12 },
      { key: 'employeeName', header: 'Employee Name', width: 25 },
      { key: 'category', header: 'Category', width: 12 },
      { key: 'verticalHead', header: 'Authorised Vertical Head', width: 25 },
      { key: 'team', header: 'Team', width: 12 },
      { key: 'designation', header: 'Designation', width: 15 },
      { key: 'joiningDate', header: 'Date of Joining', width: 14 },
      { key: 'dateOfLeave', header: 'Date of Leave', width: 14 },
      { key: 'totalDays', header: 'Total Days', width: 10 },
      { key: 'holidays', header: 'Holidays', width: 10 },
      { key: 'workingDays', header: 'Working Days', width: 12 },
      { key: 'present', header: 'Present', width: 8 },
      { key: 'halfDays', header: 'Half Days', width: 10 },
      { key: 'absent', header: 'Absent', width: 8 },
      { key: 'late', header: 'Late', width: 8 },
      { key: 'scheduled', header: 'Scheduled', width: 12 },
      { key: 'definedSchedule', header: 'Defined Work Hour', width: 15 },
      { key: 'workHours', header: 'Work Hours', width: 12 },
      { key: 'punchWorkHours', header: 'Punch Hours', width: 12 },
      { key: 'extraWorkHours', header: 'Extra Work', width: 12 },
      { key: 'excess', header: 'Excess', width: 12 },

    ];

    // Insert date range row above the header (row 1)
    worksheet.spliceRows(1, 0, [dateRangeText]);
    worksheet.mergeCells(1, 1, 1, worksheet.columns.length);
    worksheet.getRow(1).font = { bold: true, size: 13 };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data rows - using summary data from the database, start from row 3
    filteredSummaries.forEach((item) => {
      const user = allUsers?.find(u => u._id === item.userId);
      const workPartnerAtPeriod = user
        ? resolveWorkPartnerForItem(user, item.monthYear)
        : item.team || '';
      const designationAtPeriod = user
        ? resolveDesignationForItem(user, item.monthYear)
        : item.designation || '';
      const periodDateList = Object.keys(item.recordDetails || {}).filter((dateStr) => {
        const records = item.recordDetails || {};
        return dateStr in records;
      });
      const extraWorkHoursTotal = getExtraWorkHoursTotalForPeriod(item, periodDateList);
      const punchWorkHoursTotal = Number(
        Math.max(0, (item.summary.totalHour || 0) - extraWorkHoursTotal).toFixed(2)
      );

      worksheet.addRow({
        employeeCode: user?.employeeCode || item.employeeCode || item.odId || item.userId || '-',
        paidFrom: user?.paidFrom || 'N/A',
        employeeName: user?.name || item.userName,
        category: user?.category || 'N/A',
        verticalHead: workPartnerAtPeriod || 'N/A',
        team: workPartnerAtPeriod || item.team || '-',
        designation: designationAtPeriod || '-',
        joiningDate: formatExportDate(user?.joiningDate),
        dateOfLeave: formatExportDate(user?.inactiveAsOf),
        totalDays: Object.keys(item.recordDetails || {}).length,
        holidays: (() => {
          const records = item.recordDetails || {};
          const holidayDatesSet = new Set(holidays.map(h => h.date));
          let holidayCount = 0;
          Object.keys(records).forEach((dateStr) => {
            const d = new Date(dateStr);
            if (d.getDay() === 0) holidayCount++;
            else if (holidayDatesSet.has(dateStr)) holidayCount++;
          });
          return holidayCount;
        })(),
        workingDays: (() => {
          const records = item.recordDetails || {};
          const holidayDatesSet = new Set(holidays.map(h => h.date));
          return Object.entries(records).filter(([dateStr, rec]: [string, any]) => {
            const d = new Date(dateStr);
            if (d.getDay() === 0) return false;
            if (holidayDatesSet.has(dateStr)) return false;
            if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) return false;
            return true;
          }).length;
        })(),
        present: item.summary.totalPresent,
        halfDays: item.summary.totalHalfDay,
        absent: item.summary.totalAbsent,
        late: item.calcLate || 0,
        scheduled: decimalHoursToExcelDuration(item.calcScheduled || 0),
        definedSchedule: decimalHoursToExcelDuration(item.calcDefinedSchedule || 0),
        workHours: decimalHoursToExcelDuration(item.summary.totalHour),
        punchWorkHours: decimalHoursToExcelDuration(punchWorkHoursTotal),
        extraWorkHours:
          extraWorkHoursTotal > 0
            ? decimalHoursToExcelDuration(extraWorkHoursTotal)
            : decimalHoursToExcelDuration(0),
        excess: formatHoursMinutes(item.calcExcessDeficit ?? 0),
      });
    });

    // Style the header row (now row 2)
    const headerRow = worksheet.getRow(2);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2C5F2D' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // Style data rows (start from row 3)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip date range row
      if (rowNumber === 2) return; // Skip header row

      const isEvenRow = rowNumber % 2 === 0;
      row.eachCell((cell, colNumber) => {
        const colKey = worksheet.columns[colNumber - 1]?.key as string | undefined;
        cell.font = { size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEvenRow ? 'FFF8F9FA' : 'FFFFFFFF' }
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: colKey && summaryLeftAlignColumnKeys.has(colKey) ? 'left' : 'center'
        };
        if (colKey && summaryDurationColumnKeys.has(colKey)) {
          cell.numFmt = EXCEL_DURATION_NUM_FMT;
        } else if (colKey === 'excess' || colKey === 'joiningDate' || colKey === 'dateOfLeave') {
          cell.numFmt = '@';
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
      });
    });

    // Generate filename
    const fileName = filterType === 'month'
      ? `Attendance_Summary_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx`
      : filterType === 'week'
      ? `Attendance_Summary_Week_${currentWeekStart}.xlsx`
      : `Attendance_Summary_${rangeStart}_to_${rangeEnd}.xlsx`;

    await downloadWorkbook(await workbook.xlsx.writeBuffer(), fileName);
}
