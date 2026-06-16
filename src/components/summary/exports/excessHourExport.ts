import type { DailyExcessApprovalRow } from '@/lib/excessHourAllowance';
import {
  decimalHoursToExcelDuration,
  EXCEL_DURATION_NUM_FMT,
  hhmmStringToExcelTime,
} from './exportExcelDuration';
import { downloadWorkbook } from './downloadWorkbook';

export interface ExcessHourExportMember {
  _id: string;
  name: string;
  employeeCode: string;
  odId: string;
  days: DailyExcessApprovalRow[];
}

const excessLeftAlignKeys = new Set(['name', 'remark']);

const excessColumnNumFmt: Record<string, string> = {
  date: '@',
  checkIn: EXCEL_DURATION_NUM_FMT,
  checkOut: EXCEL_DURATION_NUM_FMT,
  rawExcess: EXCEL_DURATION_NUM_FMT,
  updatedHours: EXCEL_DURATION_NUM_FMT,
  countsAs: EXCEL_DURATION_NUM_FMT,
};

export async function exportExcessHourSheet(
  members: ExcessHourExportMember[],
  monthYear: string,
  fileName?: string
): Promise<void> {
  if (members.length === 0) return;

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Excess Hours');

  worksheet.columns = [
    { key: 'name', header: 'Name', width: 24 },
    { key: 'employeeCode', header: 'Employee Code', width: 16 },
    { key: 'date', header: 'Date', width: 12 },
    { key: 'checkIn', header: 'In', width: 10 },
    { key: 'checkOut', header: 'Out', width: 10 },
    { key: 'rawExcess', header: 'Excess Hour', width: 14 },
    { key: 'updatedHours', header: 'Updated Hours', width: 14 },
    { key: 'countsAs', header: 'Counts As', width: 14 },
    { key: 'remark', header: 'Remarks', width: 32 },
  ];

  const dateRangeText = `Date Range: ${monthYear}`;
  worksheet.spliceRows(1, 0, [dateRangeText]);
  worksheet.mergeCells(1, 1, 1, worksheet.columns.length);
  worksheet.getRow(1).font = { bold: true, size: 13 };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  for (const member of members) {
    const empCode = member.employeeCode || member.odId || '';
    for (const day of member.days) {
      worksheet.addRow({
        name: member.name,
        employeeCode: empCode,
        date: day.date,
        checkIn: hhmmStringToExcelTime(day.checkIn),
        checkOut: hhmmStringToExcelTime(day.checkOut),
        rawExcess: decimalHoursToExcelDuration(day.rawExcessHour),
        updatedHours:
          day.allowedExcessHours != null
            ? decimalHoursToExcelDuration(day.allowedExcessHours)
            : '',
        countsAs: decimalHoursToExcelDuration(day.countsAs),
        remark: day.remark || '',
      });
    }
  }

  const headerRow = worksheet.getRow(2);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2C5F2D' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rowNumber === 2) return;

    const isEvenRow = rowNumber % 2 === 0;
    row.eachCell((cell, colNumber) => {
      const colKey = worksheet.columns[colNumber - 1]?.key as string | undefined;
      const alignLeft = colKey && excessLeftAlignKeys.has(colKey);

      cell.font = { size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEvenRow ? 'FFF8F9FA' : 'FFFFFFFF' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: alignLeft ? 'left' : 'center',
      };
      if (colKey && excessColumnNumFmt[colKey]) {
        cell.numFmt = excessColumnNumFmt[colKey];
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    });
  });

  const safeMonth = monthYear.replace(/[^\d-]/g, '');
  const defaultName =
    members.length === 1
      ? `Excess_Hours_${members[0].name.replace(/[^\w.-]+/g, '_')}_${safeMonth}.xlsx`
      : `Excess_Hours_All_${safeMonth}.xlsx`;

  await downloadWorkbook(await workbook.xlsx.writeBuffer(), fileName || defaultName);
}
