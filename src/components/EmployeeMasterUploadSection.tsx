import React, { ChangeEvent, useState } from 'react';
import { Upload, FileSpreadsheet, Users, Download } from 'lucide-react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { UploadErrorLogPanel } from '@/components/UploadErrorLogPanel';
import {
  groupRowErrors,
  GroupedUploadError,
  RowUploadError,
  rowErrorsFromMessages,
  saveUploadErrorLog,
} from '@/lib/uploadErrorLogUtils';
import { confirmMajorAction } from '@/lib/confirmMajorAction';
import { getActiveUsersMissingFromUpload } from '@/lib/basicMasterUploadPresence';

interface EmployeeMasterUploadSectionProps {
  onRefreshUsers?: () => void;
}

type UploadMode = 'update' | 'add';

const EXCLUDED_COLUMNS = [
  'Leaves B/F',
  'Credits for Articles (as on 1st Jan 26)',
  'Weekly Scheduled Hours',
  'Scheduled Daily Hours (Sat)',
  'Work Timings (Sat)',
  'Scheduled Daily Hours (Mon to Fri)',
  'Work Timings (Mon to Fri)',
];

const BASIC_MASTER_WORKFLOW_STEPS = ['Mode & effective date', 'Choose Excel', 'Review result'] as const;
const SCHEDULE_UPLOAD_WORKFLOW_STEPS = ['Schedule effective date', 'Choose Excel', 'Review result'] as const;

export const EmployeeMasterUploadSection: React.FC<EmployeeMasterUploadSectionProps> = ({ onRefreshUsers }) => {
  const [mode, setMode] = useState<UploadMode>('update');
  const [deactivateMissing, setDeactivateMissing] = useState(true);
  const [effectiveFrom, setEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [scheduleEffectiveFrom, setScheduleEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isUploading, setIsUploading] = useState(false);
  const [isScheduleUploading, setIsScheduleUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [scheduleStats, setScheduleStats] = useState<any>(null);
  const [masterGroupedErrors, setMasterGroupedErrors] = useState<GroupedUploadError[]>([]);
  const [scheduleGroupedErrors, setScheduleGroupedErrors] = useState<GroupedUploadError[]>([]);

  const applyUploadErrors = async (
    rowErrors: RowUploadError[],
    fileName: string,
    logType: 'employee-master' | 'employee-schedule',
    setGrouped: (errors: GroupedUploadError[]) => void
  ) => {
    const grouped = groupRowErrors(rowErrors);
    setGrouped(grouped);
    if (grouped.length > 0) {
      await saveUploadErrorLog(fileName, grouped, logType);
    }
  };

  const normalize = (value: any) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const formatExcelDate = (val: any) => {
    if (!val) return undefined;
    if (val instanceof Date) return !isNaN(val.getTime()) ? val.toISOString() : undefined;
    if (typeof val === 'number') {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      return !isNaN(date.getTime()) ? date.toISOString() : undefined;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return undefined;
      const d = new Date(trimmed);
      return !isNaN(d.getTime()) ? d.toISOString() : undefined;
    }
    return undefined;
  };

  const findHeaderRow = (rows: any[][]) => {
    for (let i = 0; i < Math.min(rows.length, 120); i++) {
      const norm = (rows[i] || []).map(normalize);
      if (norm.some((h: string) => h === 'name' || h === 'employee name')) {
        return i;
      }
    }
    return 0;
  };

  const formatTime = (value: any): string | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') {
      const totalMinutes = Math.round(value * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    const text = String(value).trim();
    if (!text) return undefined;
    if (/^\d{1,2}:\d{2}$/.test(text)) {
      const [h, m] = text.split(':');
      return `${String(Number(h)).padStart(2, '0')}:${m}`;
    }
    return text;
  };

  const handleDownloadMasterFormat = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;

      const headers = [
        'Name',
        'Registration / Membership No.',
        'Employee Code',
        'Paid From',
        'Designation',
        'Category',
        'Tally Name',
        'Gender',
        'Asija Mail ID',
        'Attendance Approver',
        'Parents/Guardians Names',
        'Parents/Guardians Occupation',
        'Cell No.',
        'Alternate No.',
        'Alternate Mail Id',
        'Address 1',
        'Address 2',
        'Emergency Contact No.',
        'Relation',
        'Anniversary Date',
        'Bank Name',
        'Branch Name',
        'Account No.',
        'IFSC',
        'Type of Account',
        'Name of Account Holder',
        'Aadhar No.',
        'PAN',
        'Basis Salary/Stipend/Fees',
        'Laptop Allowance',
        'Total Salary (P/M)',
        'Per Annum',
        'PF',
        'ESI',
        'Gratuity',
        'Date of Joining -in Asija',
        'Articleship Start Date',
        'Transfer Case',
        '1st Yr of Articleship',
        '2nd Yr of Articleship',
        '3rd Yr of Articleship',
        'Filled Scholarship',
        'Qualification Level',
        'Next Attempt Due Date',
        'Registered Under Partner',
        'Working Under Partner',
      ];

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Asija Attendance System';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Master', {
        views: [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }],
      });

      worksheet.columns = headers.map((header) => ({
        header,
        key: header,
        width: Math.max(16, Math.min(36, header.length + 4)),
      }));

      const headerRow = worksheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E3A8A' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });

      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([
        buffer,
      ], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Employee_Master_Format.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download format file');
    }
  };

  const handleDownloadScheduleFormat = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;

      const headers = [
        'Name',
        'Employee Code',
        'Sch-In',
        'Sch-Out',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ];

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Asija Attendance System';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Schedule', {
        views: [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }],
      });

      worksheet.columns = headers.map((header) => ({
        header,
        key: header,
        width: Math.max(14, Math.min(24, header.length + 4)),
      }));

      const headerRow = worksheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF065F46' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });

      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([
        buffer,
      ], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Employee_Schedule_Format.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setScheduleError('Failed to download schedule format file');
    }
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setStats(null);
    setMasterGroupedErrors([]);

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      const headerRowIndex = findHeaderRow(jsonData);
      const headers = (jsonData[headerRowIndex] || []).map((h: any) => String(h || '').trim());
      const headersNorm = headers.map(normalize);

      const findCol = (names: string[]) => {
        const targets = names.map((n) => normalize(n));
        return headersNorm.findIndex((h) => targets.includes(h));
      };

      const idx = {
        name: findCol(['Name', 'Employee Name']),
        registrationNo: findCol(['Registration / Membership No.', 'Registration No', 'Membership No']),
        employeeCode: findCol(['Employee Code', 'Emp Code']),
        paidFrom: findCol(['Paid From']),
        designation: findCol(['Designation']),
        category: findCol(['Category']),
        tallyName: findCol(['Tally Name']),
        gender: findCol(['Gender']),
        email: findCol(['Asija Mail ID', 'Email']),
        attendanceEmail: findCol(['Attendance Approver', 'Attendance Email', 'Attendance Mail ID']),
        parentName: findCol(['Parents/Guardians Names', 'Parent Name']),
        parentOccupation: findCol(['Parents/Guardians Occupation', 'Parent Occupation']),
        mobileNumber: findCol(['Cell No.', 'Mobile']),
        alternateMobileNumber: findCol(['Alternate No.', 'Alternate Mobile']),
        alternateEmail: findCol(['Alternate Mail Id', 'Alternate Email']),
        address1: findCol(['Address 1']),
        address2: findCol(['Address 2']),
        emergencyContactNo: findCol(['Emergency Contact No.']),
        emergencyContactRelation: findCol(['Relation', 'Emergency Contact Relation']),
        anniversaryDate: findCol(['Anniversary Date']),
        bankName: findCol(['Bank Name']),
        branchName: findCol(['Branch Name']),
        accountNumber: findCol(['Account No.', 'Account Number']),
        ifscCode: findCol(['IFSC', 'IFSC Code']),
        accountType: findCol(['Type of Account', 'Account Type']),
        accountHolderName: findCol(['Name of Account Holder', 'Account Holder Name']),
        aadhaarNumber: findCol(['Aadhar No.', 'Aadhaar Number']),
        panNumber: findCol(['PAN', 'PAN Number']),
        basicSalary: findCol(['Basis Salary/Stipend/Fees', 'Basic Salary']),
        laptopAllowance: findCol(['Laptop Allowance', 'Laptop Allowence']),
        totalSalaryPerMonth: findCol(['Total Salary (P/M)']),
        totalSalaryPerAnnum: findCol(['Per Annum', 'Total Salary Per Annum']),
        pf: findCol(['PF']),
        esi: findCol(['ESI']),
        gratuity: findCol(['Gratuity']),
        joiningDate: findCol(['Date of Joining -in Asija', 'Date of Joining', 'Joining Date']),
        articleshipStartDate: findCol(['Articleship Start Date']),
        transferCase: findCol(['Transfer Case']),
        firstYearArticleship: findCol(['1st Yr of Articleship']),
        secondYearArticleship: findCol(['2nd Yr of Articleship']),
        thirdYearArticleship: findCol(['3rd Yr of Articleship']),
        filledScholarship: findCol(['Filled Scholarship']),
        qualificationLevel: findCol(['Qualification Level']),
        nextAttemptDueDate: findCol(['Next Attempt Due Date']),
        registeredUnderPartner: findCol(['Registered Under Partner']),
        workingUnderPartner: findCol(['Working Under Partner']),
      };

      if (idx.name === -1) {
        throw new Error('Could not find Name column.');
      }

      const getVal = (row: any[], i: number) => (i === -1 ? undefined : row[i]);

      const employees = jsonData
        .slice(headerRowIndex + 1)
        .map((row) => {
          const name = String(getVal(row, idx.name) || '').trim();
          if (!name) return null;

          return {
            name,
            registrationNo: getVal(row, idx.registrationNo),
            employeeCode: getVal(row, idx.employeeCode),
            paidFrom: getVal(row, idx.paidFrom),
            designation: getVal(row, idx.designation),
            category: getVal(row, idx.category),
            tallyName: getVal(row, idx.tallyName),
            gender: getVal(row, idx.gender),
            email: getVal(row, idx.email),
            attendanceEmail: getVal(row, idx.attendanceEmail),
            parentName: getVal(row, idx.parentName),
            parentOccupation: getVal(row, idx.parentOccupation),
            mobileNumber: getVal(row, idx.mobileNumber),
            alternateMobileNumber: getVal(row, idx.alternateMobileNumber),
            alternateEmail: getVal(row, idx.alternateEmail),
            address1: getVal(row, idx.address1),
            address2: getVal(row, idx.address2),
            emergencyContactNo: getVal(row, idx.emergencyContactNo),
            emergencyContactRelation: getVal(row, idx.emergencyContactRelation),
            anniversaryDate: formatExcelDate(getVal(row, idx.anniversaryDate)),
            bankName: getVal(row, idx.bankName),
            branchName: getVal(row, idx.branchName),
            accountNumber: getVal(row, idx.accountNumber),
            ifscCode: getVal(row, idx.ifscCode),
            accountType: getVal(row, idx.accountType),
            accountHolderName: getVal(row, idx.accountHolderName),
            aadhaarNumber: getVal(row, idx.aadhaarNumber),
            panNumber: getVal(row, idx.panNumber),
            basicSalary: getVal(row, idx.basicSalary),
            laptopAllowance: getVal(row, idx.laptopAllowance),
            totalSalaryPerMonth: getVal(row, idx.totalSalaryPerMonth),
            totalSalaryPerAnnum: getVal(row, idx.totalSalaryPerAnnum),
            pf: getVal(row, idx.pf),
            esi: getVal(row, idx.esi),
            gratuity: getVal(row, idx.gratuity),
            joiningDate: formatExcelDate(getVal(row, idx.joiningDate)),
            articleshipStartDate: formatExcelDate(getVal(row, idx.articleshipStartDate)),
            transferCase: getVal(row, idx.transferCase),
            firstYearArticleship: getVal(row, idx.firstYearArticleship),
            secondYearArticleship: getVal(row, idx.secondYearArticleship),
            thirdYearArticleship: getVal(row, idx.thirdYearArticleship),
            filledScholarship: getVal(row, idx.filledScholarship),
            qualificationLevel: getVal(row, idx.qualificationLevel),
            nextAttemptDueDate: formatExcelDate(getVal(row, idx.nextAttemptDueDate)),
            registeredUnderPartner: getVal(row, idx.registeredUnderPartner),
            workingUnderPartner: getVal(row, idx.workingUnderPartner),
          };
        })
        .filter(Boolean);

      if (!employees.length) {
        throw new Error('No valid employee rows found in file.');
      }

      const modeLabel = mode === 'update' ? 'Update existing employees from master Excel' : 'Add new employees from master Excel';
      const confirmDetails = [
        `File: ${file.name}`,
        `${employees.length} employee row(s) found`,
        `Effective from: ${effectiveFrom}`,
      ];
      if (mode === 'update' && deactivateMissing) {
        confirmDetails.push('Employees not listed in the file will be marked inactive.');

        try {
          const usersRes = await fetch('/api/users?listOnly=1', hrCredentialsInit());
          const usersJson = await usersRes.json();
          if (usersJson.success && Array.isArray(usersJson.data)) {
            const { count, names } = getActiveUsersMissingFromUpload(employees, usersJson.data);
            confirmDetails.push('');
            if (count > 0) {
              confirmDetails.push(`${count} active employee(s) will be marked inactive:`);
              confirmDetails.push(...names.map((name) => `• ${name}`));
              if (count > names.length) {
                confirmDetails.push(`…and ${count - names.length} more`);
              }
            } else {
              confirmDetails.push('No active employees will be marked inactive.');
            }
          }
        } catch {
          confirmDetails.push('');
          confirmDetails.push('Could not load employee list to preview who will be marked inactive.');
        }
      }
      if (!confirmMajorAction(modeLabel, confirmDetails)) {
        return;
      }

      const response = await fetch('/api/users/basic-master-upload', hrCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          employees,
          effectiveFrom,
          deactivateMissing: mode === 'update' && deactivateMissing,
        }),
      }));

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      setStats(result.data);
      const rowErrors: RowUploadError[] = Array.isArray(result.data?.rowErrors)
        ? result.data.rowErrors
        : rowErrorsFromMessages(Array.isArray(result.data?.errors) ? result.data.errors : []);
      await applyUploadErrors(rowErrors, file.name, 'employee-master', setMasterGroupedErrors);
      onRefreshUsers?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      const grouped = groupRowErrors(rowErrorsFromMessages([message]));
      setMasterGroupedErrors(grouped);
      await saveUploadErrorLog(file.name, grouped, 'employee-master');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleScheduleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScheduleUploading(true);
    setScheduleError(null);
    setScheduleStats(null);
    setScheduleGroupedErrors([]);

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      const headerRowIndex = findHeaderRow(jsonData);
      const headers = (jsonData[headerRowIndex] || []).map((h: any) => String(h || '').trim());
      const headersNorm = headers.map(normalize);

      const findCol = (names: string[]) => {
        const targets = names.map((n) => normalize(n));
        return headersNorm.findIndex((h) => targets.includes(h));
      };

      const idx = {
        name: findCol(['Name', 'Employee Name']),
        employeeCode: findCol(['Employee Code', 'Emp Code']),
        inTime: findCol(['Sch-In', 'In Time', 'Schedule In']),
        outTime: findCol(['Sch-Out', 'Out Time', 'Schedule Out']),
        monday: findCol(['Monday', 'Mon']),
        tuesday: findCol(['Tuesday', 'Tue']),
        wednesday: findCol(['Wednesday', 'Wed']),
        thursday: findCol(['Thursday', 'Thu']),
        friday: findCol(['Friday', 'Fri']),
        saturday: findCol(['Saturday', 'Sat']),
        sunday: findCol(['Sunday', 'Sun']),
      };

      if (idx.name === -1) {
        throw new Error('Could not find Name column for schedule upload.');
      }

      const getVal = (row: any[], i: number) => (i === -1 ? undefined : row[i]);

      const schedules = jsonData
        .slice(headerRowIndex + 1)
        .map((row) => {
          const name = String(getVal(row, idx.name) || '').trim();
          if (!name) return null;

          return {
            name,
            employeeCode: String(getVal(row, idx.employeeCode) || '').trim(),
            inTime: formatTime(getVal(row, idx.inTime)),
            outTime: formatTime(getVal(row, idx.outTime)),
            dailyRanges: {
              monday: String(getVal(row, idx.monday) || '').trim(),
              tuesday: String(getVal(row, idx.tuesday) || '').trim(),
              wednesday: String(getVal(row, idx.wednesday) || '').trim(),
              thursday: String(getVal(row, idx.thursday) || '').trim(),
              friday: String(getVal(row, idx.friday) || '').trim(),
              saturday: String(getVal(row, idx.saturday) || '').trim(),
              sunday: String(getVal(row, idx.sunday) || '').trim(),
            },
          };
        })
        .filter(Boolean);

      if (!schedules.length) {
        throw new Error('No valid schedule rows found in file.');
      }

      if (
        !confirmMajorAction('Bulk update employee schedules from Excel', [
          `File: ${file.name}`,
          `${schedules.length} schedule row(s) found`,
          `Effective from: ${scheduleEffectiveFrom}`,
          'Weekly schedule times will be updated for matched employees.',
        ])
      ) {
        return;
      }

      const response = await fetch('/api/users/basic-schedule-upload', hrCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effectiveFrom: scheduleEffectiveFrom, schedules }),
      }));

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Schedule upload failed');
      }

      setScheduleStats(result.data);
      const rowErrors: RowUploadError[] = Array.isArray(result.data?.rowErrors)
        ? result.data.rowErrors
        : rowErrorsFromMessages(Array.isArray(result.data?.errors) ? result.data.errors : []);
      await applyUploadErrors(rowErrors, file.name, 'employee-schedule', setScheduleGroupedErrors);
      onRefreshUsers?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Schedule upload failed';
      setScheduleError(message);
      const grouped = groupRowErrors(rowErrorsFromMessages([message]));
      setScheduleGroupedErrors(grouped);
      await saveUploadErrorLog(file.name, grouped, 'employee-schedule');
    } finally {
      setIsScheduleUploading(false);
      e.target.value = '';
    }
  };

  return (
    <section
      className="rounded-md border border-blue-200/65 bg-panel p-5 shadow-sm sm:p-6"
      aria-labelledby="employee-master-upload-heading"
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <header className="min-w-0 flex-1 space-y-2">
          <h2 id="employee-master-upload-heading" className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            Employee master upload
          </h2>
          <p className="max-w-2xl text-sm text-slate-600">
            Bulk update or add rows from one spreadsheet. Leave-only and some schedule columns are not read here—see the
            excluded list and use the schedule section below for timings.
          </p>
          <ol className="flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Basic master upload workflow">
            {BASIC_MASTER_WORKFLOW_STEPS.map((t, i) => (
              <li
                key={t}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>
        </header>
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <FileSpreadsheet className="h-4 w-4 text-blue-600" aria-hidden />
          <span>.xlsx / .xls</span>
        </div>
      </div>

      <fieldset className="mb-5 border-0 p-0">
        <legend className="mb-2 text-xs font-medium text-slate-600">Upload mode</legend>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-800">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="basic-master-mode"
              checked={mode === 'update'}
              onChange={() => setMode('update')}
              className="border-slate-300 text-blue-600 focus:ring-blue-500/40"
            />
            Update existing rows
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="basic-master-mode"
              checked={mode === 'add'}
              onChange={() => setMode('add')}
              className="border-slate-300 text-blue-600 focus:ring-blue-500/40"
            />
            Add new entries only
          </label>
        </div>
      </fieldset>

      <div className="mb-5">
        <label htmlFor="basic-master-effective-from" className="mb-2 block text-xs font-medium text-slate-600">
          Effective from (for dated fields)
        </label>
        <input
          id="basic-master-effective-from"
          type="date"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          className="w-full max-w-xs rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <p className="mt-1 text-[11px] text-slate-600">Defaults to today; change before upload if you need a back-dated effective date.</p>
      </div>

      {mode === 'update' && (
        <div className="mb-5 rounded-md border border-amber-200/80 bg-amber-50/50 px-4 py-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={deactivateMissing}
              onChange={(e) => setDeactivateMissing(e.target.checked)}
              className="mt-0.5 border-slate-300 text-blue-600 focus:ring-blue-500/40"
            />
            <span>
              <span className="font-medium">Mark missing employees inactive</span>
              <span className="mt-1 block text-xs text-slate-600">
                Active employees not in this file are set inactive with inactive date = effective from above
                (left or no longer on master). Rows in the file reactivate previously inactive employees.
              </span>
            </span>
          </label>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40">
          <span className="flex items-center gap-2 text-sm text-slate-700">
            <Upload className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
            <span>Choose employee master Excel</span>
          </span>
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" disabled={isUploading} />
        </label>
        <button
          type="button"
          onClick={handleDownloadMasterFormat}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200/65 bg-panel px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <Download className="h-4 w-4 text-blue-600" aria-hidden />
          Download master format
        </button>
      </div>

      <div className="mb-5 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <div className="mb-1 font-medium text-slate-800">Columns ignored in this basic upload</div>
        <p className="leading-relaxed">{EXCLUDED_COLUMNS.join(', ')}</p>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      )}

      {stats && (
        <div
          className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
          role="status"
          aria-live="polite"
        >
          <div className="font-semibold">Upload complete ({stats.mode})</div>
          <div className="mt-1">
            Updated: {stats.updated || 0}, Created: {stats.created || 0}, Failed: {stats.failed || 0}
            {(stats.reactivated > 0 || stats.deactivated > 0) && (
              <>
                {', '}
                Reactivated: {stats.reactivated || 0}, Deactivated: {stats.deactivated || 0}
              </>
            )}
          </div>
          <div className="mt-1">Effective from: {stats.effectiveFrom || effectiveFrom}</div>
          {Array.isArray(stats.deactivatedNames) && stats.deactivatedNames.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-slate-700">Marked inactive (not in file):</div>
              <ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto text-xs text-slate-800">
                {stats.deactivatedNames.map((name: string, idx: number) => (
                  <li key={idx}>{name}</li>
                ))}
              </ul>
              {stats.deactivated > stats.deactivatedNames.length && (
                <p className="mt-1 text-xs text-slate-600">
                  …and {stats.deactivated - stats.deactivatedNames.length} more
                </p>
              )}
            </div>
          )}
          {stats.failed > 0 && (
            <p className="mt-2 text-xs text-red-800">See error details in the log section below.</p>
          )}
        </div>
      )}

      <UploadErrorLogPanel
        groupedErrors={masterGroupedErrors}
        logType="employee-master"
        sectionTitle="Master upload history & logs"
        currentErrorsLabel="Current master upload errors"
        exportFilePrefix="Employee_Master_Upload"
      />

      <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-slate-700">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" aria-hidden />
        <span>
          Partner and salary-style fields keep an effective-date history when saved from{' '}
          <span className="font-medium">Employees</span>.
        </span>
      </div>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <h3 className="mb-1 text-base font-semibold text-slate-900">Schedule bulk upload</h3>
        <p className="mb-3 max-w-2xl text-sm text-slate-600">
          Second file: rows with Name, optional Employee Code, Sch-In / Sch-Out, or Monday–Sunday
          cells such as <span className="font-mono text-slate-800">10:00 - 17:00</span>.
        </p>
        <ol className="mb-5 flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Schedule upload workflow">
          {SCHEDULE_UPLOAD_WORKFLOW_STEPS.map((t, i) => (
            <li
              key={t}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>

        <div className="mb-4">
          <label htmlFor="schedule-effective-from" className="mb-2 block text-xs font-medium text-slate-600">
            Schedule effective from
          </label>
          <input
            id="schedule-effective-from"
            type="date"
            value={scheduleEffectiveFrom}
            onChange={(e) => setScheduleEffectiveFrom(e.target.value)}
            className="w-full max-w-xs rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40">
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <Upload className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              <span>Choose schedule Excel</span>
            </span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleScheduleUpload}
              className="hidden"
              disabled={isScheduleUploading}
            />
          </label>
          <button
            type="button"
            onClick={handleDownloadScheduleFormat}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200/65 bg-panel px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <Download className="h-4 w-4 text-blue-600" aria-hidden />
            Download schedule format
          </button>
        </div>

        {scheduleError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
            {scheduleError}
          </div>
        )}

        {scheduleStats && (
          <div
            className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            role="status"
            aria-live="polite"
          >
            <div className="font-semibold">Schedule upload complete</div>
            <div className="mt-1">
              Updated: {scheduleStats.updated || 0}, Failed: {scheduleStats.failed || 0}
            </div>
            <div className="mt-1">Effective from: {scheduleStats.effectiveFrom || scheduleEffectiveFrom}</div>
            {scheduleStats.failed > 0 && (
              <p className="mt-2 text-xs text-red-800">See error details in the log section below.</p>
            )}
          </div>
        )}

        <UploadErrorLogPanel
          groupedErrors={scheduleGroupedErrors}
          logType="employee-schedule"
          sectionTitle="Schedule upload history & logs"
          currentErrorsLabel="Current schedule upload errors"
          exportFilePrefix="Employee_Schedule_Upload"
        />
      </div>
    </section>
  );
};
