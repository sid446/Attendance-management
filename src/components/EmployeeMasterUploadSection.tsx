import React, { ChangeEvent, useState } from 'react';
import { Upload, FileSpreadsheet, Users } from 'lucide-react';

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

export const EmployeeMasterUploadSection: React.FC<EmployeeMasterUploadSectionProps> = ({ onRefreshUsers }) => {
  const [mode, setMode] = useState<UploadMode>('update');
  const [effectiveFrom, setEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [scheduleEffectiveFrom, setScheduleEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isUploading, setIsUploading] = useState(false);
  const [isScheduleUploading, setIsScheduleUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [scheduleStats, setScheduleStats] = useState<any>(null);

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

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setStats(null);

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

      const response = await fetch('/api/users/basic-master-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, employees, effectiveFrom }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      setStats(result.data);
      onRefreshUsers?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
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
        outTimeSat: findCol(['Sch-Out (For Sat)', 'Sat Out Time', 'Saturday Out']),
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
            outTimeSat: formatTime(getVal(row, idx.outTimeSat)),
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

      const response = await fetch('/api/users/basic-schedule-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effectiveFrom: scheduleEffectiveFrom, schedules }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Schedule upload failed');
      }

      setScheduleStats(result.data);
      onRefreshUsers?.();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Schedule upload failed');
    } finally {
      setIsScheduleUploading(false);
      e.target.value = '';
    }
  };

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Employee Master Upload</h2>
          <p className="text-xs text-slate-400 mt-1">
            Basic master upload for employee records. Excludes leave/schedule-specific columns.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <FileSpreadsheet className="w-4 h-4" />
          <span>Excel .xlsx / .xls</span>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-300 mb-2">Upload mode</label>
        <div className="flex items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2 text-slate-200">
            <input
              type="radio"
              name="basic-master-mode"
              checked={mode === 'update'}
              onChange={() => setMode('update')}
            />
            Update Existing
          </label>
          <label className="inline-flex items-center gap-2 text-slate-200">
            <input
              type="radio"
              name="basic-master-mode"
              checked={mode === 'add'}
              onChange={() => setMode('add')}
            />
            Add New Entries
          </label>
        </div>
      </div>

      <div className="mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-2">Effective From Date</label>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/60"
          />
          <p className="text-[11px] text-slate-500 mt-1">Default is current date. You can change it before upload.</p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <label className="flex-1 flex items-center justify-between px-4 py-3 border border-dashed border-slate-700 rounded-lg cursor-pointer bg-slate-900/80 hover:border-emerald-500 transition-colors">
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Upload className="w-4 h-4 text-slate-400" />
            <span>Choose Employee Master Excel</span>
          </div>
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" disabled={isUploading} />
        </label>
      </div>

      <div className="mb-4 p-3 bg-slate-900/40 border border-slate-700 rounded text-xs text-slate-300">
        <div className="font-medium mb-1">Excluded columns in Basic Upload</div>
        <div>{EXCLUDED_COLUMNS.join(', ')}</div>
      </div>

      {error && (
        <div className="mt-3 bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      {stats && (
        <div className="mt-3 bg-emerald-950/40 border border-emerald-700/60 text-emerald-100 px-4 py-3 rounded-md text-xs">
          <div className="font-medium">Upload Complete ({stats.mode})</div>
          <div className="mt-1">Updated: {stats.updated || 0}, Created: {stats.created || 0}, Failed: {stats.failed || 0}</div>
          <div className="mt-1">Effective From: {stats.effectiveFrom || effectiveFrom}</div>
          {Array.isArray(stats.errors) && stats.errors.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-rose-200 max-h-32 overflow-y-auto">
              {stats.errors.map((msg: string, idx: number) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 text-[11px] text-slate-500 flex items-center gap-2">
        <Users className="w-3 h-3" />
        <span>Fields like Registered/Working Under Partner and salary values are tracked with effective date history.</span>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-800">
        <h3 className="text-lg font-semibold text-slate-100 mb-3">Employee Schedule Upload</h3>
        <p className="text-xs text-slate-400 mb-4">
          Upload schedule rows with headers: Name, Employee Code (optional), Sch-In, Sch-Out, Sch-Out (For Sat optional),
          or day-wise headers Monday..Sunday with values like 10:00 - 17:00.
        </p>

        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-300 mb-2">Schedule Effective From Date</label>
          <input
            type="date"
            value={scheduleEffectiveFrom}
            onChange={(e) => setScheduleEffectiveFrom(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/60"
          />
        </div>

        <label className="flex items-center justify-between px-4 py-3 border border-dashed border-slate-700 rounded-lg cursor-pointer bg-slate-900/80 hover:border-emerald-500 transition-colors">
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Upload className="w-4 h-4 text-slate-400" />
            <span>Choose Schedule Excel</span>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleScheduleUpload}
            className="hidden"
            disabled={isScheduleUploading}
          />
        </label>

        {scheduleError && (
          <div className="mt-3 bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs">
            {scheduleError}
          </div>
        )}

        {scheduleStats && (
          <div className="mt-3 bg-emerald-950/40 border border-emerald-700/60 text-emerald-100 px-4 py-3 rounded-md text-xs">
            <div className="font-medium">Schedule Upload Complete</div>
            <div className="mt-1">Updated: {scheduleStats.updated || 0}, Failed: {scheduleStats.failed || 0}</div>
            <div className="mt-1">Effective From: {scheduleStats.effectiveFrom || scheduleEffectiveFrom}</div>
            {Array.isArray(scheduleStats.errors) && scheduleStats.errors.length > 0 && (
              <ul className="mt-2 list-disc list-inside text-rose-200 max-h-32 overflow-y-auto">
                {scheduleStats.errors.map((msg: string, idx: number) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
