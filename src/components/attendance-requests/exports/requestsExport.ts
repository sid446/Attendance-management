import type { AttendanceRequest, DateRangeGroup } from '../types';
import { buildSortedRequestRows } from '../utils/requestSorting';
import { getDefaultValueForType, isLeaveRequestType } from '../utils/requestValues';

export interface ExportRequestsParams {
  rangeGroups: DateRangeGroup[];
  individualRequests: AttendanceRequest[];
}

export async function exportRequestsToExcel({
  rangeGroups,
  individualRequests,
}: ExportRequestsParams): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Attendance Requests');

  worksheet.columns = [
    { header: 'Employee Name', key: 'employeeName', width: 25 },
    { header: 'Designation', key: 'designation', width: 20 },
    { header: 'Partner', key: 'partner', width: 20 },
    { header: 'Start Date', key: 'startDate', width: 15 },
    { header: 'End Date', key: 'endDate', width: 15 },
    { header: 'Days', key: 'days', width: 8 },
    { header: 'Requested Status', key: 'requestedStatus', width: 25 },
    { header: 'Value (default if approve)', key: 'defaultApproveValue', width: 18 },
    { header: 'Time (Start)', key: 'startTime', width: 12 },
    { header: 'Time (End)', key: 'endTime', width: 12 },
    { header: 'Reason', key: 'reason', width: 35 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Action By', key: 'actionBy', width: 20 },
    { header: 'Processed Date', key: 'processedDate', width: 15 },
    { header: 'Processed Time', key: 'processedTime', width: 15 },
    { header: 'Approver Email', key: 'email', width: 30 },
    { header: 'HR Value', key: 'hrValue', width: 10 },
    { header: 'Submitted Date', key: 'submittedDate', width: 15 },
    { header: 'Submitted Time', key: 'submittedTime', width: 15 },
    { header: 'Partner Remarks', key: 'partnerRemarks', width: 35 },
    { header: 'HR Remarks', key: 'hrRemarks', width: 35 },
  ];

  const getDesignation = (item: DateRangeGroup | AttendanceRequest) => {
    if ('dates' in item) return item.designation || 'Employee';
    return item.userId?.designation || 'Employee';
  };

  const getApproveContext = (item: DateRangeGroup | AttendanceRequest) => {
    if ('dates' in item) {
      return {
        employee: {
          designation: item.designation,
          employmentType: item.employmentType,
          category: item.category,
        },
      };
    }
    return { employee: item.userId };
  };

  const addRequestRow = (item: DateRangeGroup | AttendanceRequest) => {
    const isRange = 'dates' in item;
    worksheet.addRow({
      employeeName: item.userName,
      designation: getDesignation(item),
      partner: item.partnerName,
      startDate: new Date(isRange ? item.startDate : item.date).toLocaleDateString('en-GB'),
      endDate: new Date(isRange ? item.endDate : item.date).toLocaleDateString('en-GB'),
      days: isRange ? item.dates.length : 1,
      requestedStatus: item.requestedStatus,
      defaultApproveValue: isLeaveRequestType(item.requestedStatus)
        ? ''
        : getDefaultValueForType(item.requestedStatus, getApproveContext(item)),
      startTime: item.startTime || '',
      endTime: item.endTime || '',
      reason: item.reason || '',
      status: item.status === 'PendingHr' ? 'PendingHr (await HR)' : item.status,
      actionBy: item.approvedBy || item.rejectedBy || '-',
      processedDate:
        item.approvedAt || item.rejectedAt
          ? new Date(item.approvedAt || item.rejectedAt!).toLocaleDateString('en-GB')
          : '-',
      processedTime:
        item.approvedAt || item.rejectedAt
          ? new Date(item.approvedAt || item.rejectedAt!).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-',
      email: item.approvedByEmail || item.rejectedByEmail || '',
      hrValue: item.hrValue || (item.status === 'PendingHr' ? item.partnerProposedValue : '') || '',
      submittedDate: new Date(item.createdAt).toLocaleDateString('en-GB'),
      submittedTime: new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      partnerRemarks: item.partnerRemarks || '',
      hrRemarks: item.hrRemarks || '',
    });
  };

  buildSortedRequestRows(rangeGroups, individualRequests).forEach((row) => {
    addRequestRow(row.type === 'range' ? row.item : row.item);
  });

  const titleText = `Attendance Requests Report - Generated on ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString()}`;
  worksheet.spliceRows(1, 0, [titleText]);
  worksheet.mergeCells(1, 1, 1, worksheet.columns.length);
  worksheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 35;

  const headerRow = worksheet.getRow(2);
  headerRow.height = 25;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;

    const isEven = rowNumber % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.font = { size: 10 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber <= 3 || colNumber >= 19 ? 'left' : 'center',
      };
      if (isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (colNumber === 11) {
        const val = cell.value?.toString();
        if (val === 'Approved') cell.font = { color: { argb: 'FF059669' }, bold: true };
        if (val === 'Rejected') cell.font = { color: { argb: 'FFDC2626' }, bold: true };
        if (val === 'Pending') cell.font = { color: { argb: 'FFD97706' }, bold: true };
        if (val === 'PendingHr' || (typeof val === 'string' && val.includes('PendingHr'))) {
          cell.font = { color: { argb: 'FFDC2626' }, bold: true };
        }
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Attendance_Requests_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
