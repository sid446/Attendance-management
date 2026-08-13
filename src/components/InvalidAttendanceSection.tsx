import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Mail,
  Search,
  RefreshCw,
  Clock,
  User,
  Calendar,
  Send,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { downloadWorkbook } from '@/components/summary/exports/downloadWorkbook';

/** Same title + header + striped rows as Attendance Summary export. */
function styleListExportSheet(
  worksheet: any,
  titleText: string,
  leftAlignKeys: Set<string>
) {
  const colCount = worksheet.columns.length;
  worksheet.spliceRows(1, 0, [titleText]);
  worksheet.mergeCells(1, 1, 1, colCount);
  worksheet.getRow(1).font = { bold: true, size: 13 };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 22;

  const headerRow = worksheet.getRow(2);
  headerRow.height = 24;
  headerRow.eachCell((cell: { font: unknown; fill: unknown; alignment: unknown; border: unknown }) => {
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

  worksheet.eachRow((row: { eachCell: (cb: (cell: { font: unknown; fill: unknown; alignment: unknown; border: unknown }, colNumber: number) => void) => void }, rowNumber: number) => {
    if (rowNumber <= 2) return;
    const isEvenRow = rowNumber % 2 === 0;
    row.eachCell((cell, colNumber) => {
      const colKey = worksheet.columns[colNumber - 1]?.key;
      cell.font = { size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEvenRow ? 'FFF8F9FA' : 'FFFFFFFF' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colKey && leftAlignKeys.has(colKey) ? 'left' : 'center',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    });
  });

  worksheet.views = [{ state: 'frozen', ySplit: 2 }];
  worksheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: colCount },
  };
}

interface InvalidRecord {
  date: string;
  checkin: string;
  checkout: string;
  issue: 'missing-checkin' | 'missing-checkout';
  monthYear: string;
  notificationCount?: number;
  lastNotifiedAt?: string;
}

interface EmployeeWithInvalidRecords {
  userId: string;
  name: string;
  email: string;
  designation: string;
  workingUnderPartner: string;
  attendanceEmail: string;
  invalidRecords: InvalidRecord[];
  notificationCount?: number;
  lastNotifiedAt?: string;
}

interface MissingDayRecord {
  date: string;
  notificationCount?: number;
  lastNotifiedAt?: string;
}

interface MissingMonthEmployee {
  userId: string;
  odId: string;
  name: string;
  email: string;
  designation: string;
  workingUnderPartner: string;
  attendanceEmail: string;
  wholeMonthMissing: boolean;
  missingDays: MissingDayRecord[];
  notificationCount?: number;
  lastNotifiedAt?: string;
}

interface InvalidAttendanceSectionProps {
  onRefresh?: () => void;
}

const INVALID_ATTENDANCE_WORKFLOW_STEPS = [
  'Pick month',
  'Review rows',
  'Notify employees',
  'Export Excel',
] as const;

export const InvalidAttendanceSection: React.FC<InvalidAttendanceSectionProps> = ({
  onRefresh,
}) => {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeWithInvalidRecords[]>([]);
  const [missingMonthEmployees, setMissingMonthEmployees] = useState<MissingMonthEmployee[]>([]);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [expandedMissingEmployee, setExpandedMissingEmployee] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [sendingNotification, setSendingNotification] = useState<Set<string>>(new Set());
  const [sendingMissingNotification, setSendingMissingNotification] = useState<Set<string>>(
    new Set()
  );
  const [sendingBulk, setSendingBulk] = useState(false);
  const [sendingMissingBulk, setSendingMissingBulk] = useState(false);
  const [exporting, setExporting] = useState<'missing' | 'invalid' | null>(null);
  const [view, setView] = useState<'invalid' | 'missing'>('invalid');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchInvalidRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invalidRes, missingRes] = await Promise.all([
        fetch(`/api/attendance/invalid-records?monthYear=${selectedMonth}`),
        fetch(`/api/attendance/missing-month?monthYear=${selectedMonth}`),
      ]);
      const invalidResult = await invalidRes.json();
      const missingResult = await missingRes.json();

      if (invalidResult.success) {
        setEmployees(invalidResult.data);
      } else {
        setError(invalidResult.error || 'Failed to fetch invalid records');
      }

      if (missingResult.success) {
        setMissingMonthEmployees(missingResult.data);
      } else if (invalidResult.success) {
        setError(missingResult.error || 'Failed to fetch employees with no attendance recorded');
      }
    } catch {
      setError('Failed to fetch invalid attendance data');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchInvalidRecords();
  }, [fetchInvalidRecords]);

  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return employees;
    const term = searchTerm.toLowerCase();
    return employees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(term) ||
        emp.designation?.toLowerCase().includes(term) ||
        emp.workingUnderPartner?.toLowerCase().includes(term)
    );
  }, [employees, searchTerm]);

  const filteredMissingMonth = useMemo(() => {
    if (!searchTerm) return missingMonthEmployees;
    const term = searchTerm.toLowerCase();
    return missingMonthEmployees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(term) ||
        emp.odId?.toLowerCase().includes(term) ||
        emp.designation?.toLowerCase().includes(term) ||
        emp.workingUnderPartner?.toLowerCase().includes(term) ||
        emp.email?.toLowerCase().includes(term)
    );
  }, [missingMonthEmployees, searchTerm]);

  const sendNotification = async (employeeId: string) => {
    setSendingNotification((prev) => new Set(prev).add(employeeId));
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/attendance/notify-invalid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeIds: [employeeId], monthYear: selectedMonth }),
      });
      const result = await response.json();
      if (result.success) {
        setSuccessMessage('Notification sent successfully');
        const now = new Date().toISOString();
        setEmployees((prev) =>
          prev.map((emp) => {
            if (emp.userId !== employeeId) return emp;
            const recordCount = emp.invalidRecords.length;
            return {
              ...emp,
              notificationCount: (emp.notificationCount || 0) + recordCount,
              lastNotifiedAt: now,
              invalidRecords: emp.invalidRecords.map((rec) => ({
                ...rec,
                notificationCount: (rec.notificationCount || 0) + 1,
                lastNotifiedAt: now,
              })),
            };
          })
        );
      } else {
        setError(result.error || 'Failed to send notification');
      }
    } catch {
      setError('Failed to send notification');
    } finally {
      setSendingNotification((prev) => {
        const next = new Set(prev);
        next.delete(employeeId);
        return next;
      });
    }
  };

  const sendBulkNotifications = async () => {
    setSendingBulk(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const employeeIds = filteredEmployees.map((emp) => emp.userId);
      const response = await fetch('/api/attendance/notify-invalid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeIds, monthYear: selectedMonth }),
      });
      const result = await response.json();
      if (result.success) {
        setSuccessMessage(`Notifications sent to ${result.sentCount} employees`);
        const now = new Date().toISOString();
        setEmployees((prev) =>
          prev.map((emp) => {
            if (!employeeIds.includes(emp.userId)) return emp;
            const recordCount = emp.invalidRecords.length;
            return {
              ...emp,
              notificationCount: (emp.notificationCount || 0) + recordCount,
              lastNotifiedAt: now,
              invalidRecords: emp.invalidRecords.map((rec) => ({
                ...rec,
                notificationCount: (rec.notificationCount || 0) + 1,
                lastNotifiedAt: now,
              })),
            };
          })
        );
      } else {
        setError(result.error || 'Failed to send notifications');
      }
    } catch {
      setError('Failed to send notifications');
    } finally {
      setSendingBulk(false);
    }
  };

  const sendMissingNotification = async (employeeId: string) => {
    setSendingMissingNotification((prev) => new Set(prev).add(employeeId));
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/attendance/notify-missing-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeIds: [employeeId], monthYear: selectedMonth }),
      });
      const result = await response.json();
      if (result.success) {
        setSuccessMessage('Notification sent successfully');
        const now = new Date().toISOString();
        setMissingMonthEmployees((prev) =>
          prev.map((emp) => {
            if (emp.userId !== employeeId) return emp;
            const dayCount = emp.missingDays?.length || 0;
            return {
              ...emp,
              notificationCount: (emp.notificationCount || 0) + dayCount,
              lastNotifiedAt: now,
              missingDays: (emp.missingDays || []).map((day) => ({
                ...day,
                notificationCount: (day.notificationCount || 0) + 1,
                lastNotifiedAt: now,
              })),
            };
          })
        );
      } else {
        setError(result.error || 'Failed to send notification');
      }
    } catch {
      setError('Failed to send notification');
    } finally {
      setSendingMissingNotification((prev) => {
        const next = new Set(prev);
        next.delete(employeeId);
        return next;
      });
    }
  };

  const sendMissingBulkNotifications = async () => {
    setSendingMissingBulk(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const employeeIds = filteredMissingMonth.map((emp) => emp.userId);
      const response = await fetch('/api/attendance/notify-missing-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeIds, monthYear: selectedMonth }),
      });
      const result = await response.json();
      if (result.success) {
        setSuccessMessage(`Notifications sent to ${result.sentCount} employees`);
        const now = new Date().toISOString();
        setMissingMonthEmployees((prev) =>
          prev.map((emp) => {
            if (!employeeIds.includes(emp.userId)) return emp;
            const dayCount = emp.missingDays?.length || 0;
            return {
              ...emp,
              notificationCount: (emp.notificationCount || 0) + dayCount,
              lastNotifiedAt: now,
              missingDays: (emp.missingDays || []).map((day) => ({
                ...day,
                notificationCount: (day.notificationCount || 0) + 1,
                lastNotifiedAt: now,
              })),
            };
          })
        );
      } else {
        setError(result.error || 'Failed to send notifications');
      }
    } catch {
      setError('Failed to send notifications');
    } finally {
      setSendingMissingBulk(false);
    }
  };

  const exportMissingMonthExcel = async () => {
    if (filteredMissingMonth.length === 0) return;
    setExporting('missing');
    setError(null);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Attendance not recorded');
      sheet.columns = [
        { header: 'OD ID', key: 'odId', width: 14 },
        { header: 'Name', key: 'name', width: 28 },
        { header: 'Email', key: 'email', width: 32 },
        { header: 'Designation', key: 'designation', width: 24 },
        { header: 'Working under partner', key: 'workingUnderPartner', width: 28 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Issue', key: 'issue', width: 28 },
        { header: 'Times notified', key: 'notificationCount', width: 16 },
        { header: 'Last notified', key: 'lastNotifiedAt', width: 22 },
      ];
      for (const emp of filteredMissingMonth) {
        const days = emp.missingDays?.length
          ? emp.missingDays
          : [{ date: selectedMonth, notificationCount: emp.notificationCount }];
        for (const day of days) {
          sheet.addRow({
            odId: emp.odId || '',
            name: emp.name,
            email: emp.email || '',
            designation: emp.designation || '',
            workingUnderPartner: emp.workingUnderPartner || '',
            date: day.date,
            issue: emp.wholeMonthMissing ? 'No month attendance' : 'Day not recorded',
            notificationCount: day.notificationCount || 0,
            lastNotifiedAt: day.lastNotifiedAt
              ? new Date(day.lastNotifiedAt).toLocaleString()
              : '',
          });
        }
      }
      styleListExportSheet(
        sheet,
        `Attendance not recorded — ${formatMonthYear(selectedMonth)}`,
        new Set(['name', 'email', 'designation', 'workingUnderPartner'])
      );
      const buffer = await workbook.xlsx.writeBuffer();
      await downloadWorkbook(
        buffer as ArrayBuffer,
        `Attendance_Not_Recorded_${selectedMonth}.xlsx`
      );
    } catch {
      setError('Failed to export Excel');
    } finally {
      setExporting(null);
    }
  };

  const exportInvalidExcel = async () => {
    if (filteredEmployees.length === 0) return;
    setExporting('invalid');
    setError(null);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Invalid attendance');
      sheet.columns = [
        { header: 'Name', key: 'name', width: 28 },
        { header: 'Email', key: 'email', width: 32 },
        { header: 'Designation', key: 'designation', width: 24 },
        { header: 'Working under partner', key: 'workingUnderPartner', width: 28 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Check-in', key: 'checkin', width: 12 },
        { header: 'Check-out', key: 'checkout', width: 12 },
        { header: 'Issue', key: 'issue', width: 20 },
        { header: 'Times notified', key: 'notificationCount', width: 16 },
        { header: 'Last notified', key: 'lastNotifiedAt', width: 22 },
      ];
      for (const emp of filteredEmployees) {
        for (const rec of emp.invalidRecords) {
          sheet.addRow({
            name: emp.name,
            email: emp.email || '',
            designation: emp.designation || '',
            workingUnderPartner: emp.workingUnderPartner || '',
            date: rec.date,
            checkin: rec.checkin || '',
            checkout: rec.checkout || '',
            issue: rec.issue === 'missing-checkin' ? 'Missing Check-in' : 'Missing Check-out',
            notificationCount: rec.notificationCount || 0,
            lastNotifiedAt: rec.lastNotifiedAt
              ? new Date(rec.lastNotifiedAt).toLocaleString()
              : '',
          });
        }
      }
      styleListExportSheet(
        sheet,
        `Invalid attendance records — ${formatMonthYear(selectedMonth)}`,
        new Set(['name', 'email', 'designation', 'workingUnderPartner'])
      );
      const buffer = await workbook.xlsx.writeBuffer();
      await downloadWorkbook(buffer as ArrayBuffer, `Invalid_Attendance_${selectedMonth}.xlsx`);
    } catch {
      setError('Failed to export Excel');
    } finally {
      setExporting(null);
    }
  };

  const monthOptions = useMemo(() => {
    const options: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return options;
  }, []);

  const formatMonthYear = (my: string) => {
    const [year, month] = my.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatMissingDate = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const getIssueLabel = (issue: InvalidRecord['issue']) => {
    switch (issue) {
      case 'missing-checkin':
        return 'Missing Check-in';
      case 'missing-checkout':
        return 'Missing Check-out';
    }
  };

  const getIssueColor = (issue: InvalidRecord['issue']) => {
    switch (issue) {
      case 'missing-checkin':
        return 'border-amber-200 bg-amber-50 text-amber-950';
      case 'missing-checkout':
        return 'border-orange-200 bg-orange-50 text-orange-950';
    }
  };

  const inputCls =
    'w-full rounded-md border border-blue-200/65 bg-panel py-2 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const selectCls =
    'rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  const tabBtn = (active: boolean) =>
    `rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
      active ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <section
      className="rounded-xl border border-blue-200/65 bg-panel shadow-sm"
      aria-labelledby="invalid-attendance-heading"
    >
      <div className="border-b border-slate-200 p-6">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50">
              <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="invalid-attendance-heading" className="text-lg font-semibold text-slate-900">
                Invalid attendance records
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                {view === 'invalid'
                  ? 'Employees with missing check-in or check-out for machine attendance.'
                  : 'Active employees with no month file, or missing days that other employees already have.'}
              </p>
              <ol
                className="mt-3 flex list-none flex-wrap gap-2 text-xs text-slate-700"
                aria-label="Invalid attendance workflow"
              >
                {INVALID_ATTENDANCE_WORKFLOW_STEPS.map((t, i) => (
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
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="invalid-attendance-month" className="sr-only">
              Month
            </label>
            <select
              id="invalid-attendance-month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className={selectCls}
            >
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {formatMonthYear(month)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                fetchInvalidRecords();
                onRefresh?.();
              }}
              disabled={loading}
              className="rounded-md border border-blue-200/65 bg-panel p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
              title="Refresh list"
              aria-label="Refresh invalid attendance list"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            </button>
          </div>
        </div>

        <div className="relative">
          <label htmlFor="invalid-attendance-search" className="sr-only">
            Search by name, designation, or partner
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden
          />
          <input
            id="invalid-attendance-search"
            type="search"
            placeholder="Search by name, designation, or partner…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={inputCls}
          />
        </div>

        <div
          className="mt-4 inline-flex flex-wrap gap-1 rounded-lg border border-blue-200/65 bg-panel p-0.5 shadow-sm"
          role="tablist"
          aria-label="Attendance issue type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'invalid'}
            onClick={() => setView('invalid')}
            className={tabBtn(view === 'invalid')}
          >
            Invalid punches ({filteredEmployees.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'missing'}
            onClick={() => setView('missing')}
            className={tabBtn(view === 'missing')}
          >
            Not recorded ({filteredMissingMonth.length})
          </button>
        </div>

        {error && (
          <div
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            role="alert"
          >
            {error}
          </div>
        )}
        {successMessage && (
          <div
            className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            role="status"
            aria-live="polite"
          >
            {successMessage}
          </div>
        )}
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-600">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
            <span role="status">Loading records…</span>
          </div>
        ) : view === 'missing' ? (
          <div>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50">
                    <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Employee active but attendance not recorded
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {filteredMissingMonth.length} active employee
                      {filteredMissingMonth.length === 1 ? '' : 's'} with no month file, or missing
                      days that other employees already have (up to yesterday).
                    </p>
                  </div>
                </div>
                {filteredMissingMonth.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={exportMissingMonthExcel}
                      disabled={exporting !== null}
                      className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                    >
                      {exporting === 'missing' ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 text-slate-600" aria-hidden />
                      )}
                      <span>Export Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={sendMissingBulkNotifications}
                      disabled={sendingMissingBulk || loading}
                      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sendingMissingBulk ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Mail className="h-4 w-4" aria-hidden />
                      )}
                      <span>Notify all ({filteredMissingMonth.length})</span>
                    </button>
                  </div>
                )}
              </div>

              {filteredMissingMonth.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                  All active employees have attendance recorded for {formatMonthYear(selectedMonth)}.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredMissingMonth.map((employee) => {
                    const expanded = expandedMissingEmployee === employee.userId;
                    const missingCount = employee.missingDays?.length || 0;
                    return (
                      <div
                        key={employee.userId}
                        className="overflow-hidden rounded-lg border border-blue-200/65 bg-panel shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                          <div
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md py-1 transition-colors hover:bg-slate-50 sm:gap-4"
                            onClick={() =>
                              setExpandedMissingEmployee(expanded ? null : employee.userId)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpandedMissingEmployee(expanded ? null : employee.userId);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-expanded={expanded}
                            aria-controls={`missing-days-${employee.userId}`}
                            id={`missing-emp-${employee.userId}`}
                          >
                            <span className="text-slate-500" aria-hidden>
                              {expanded ? (
                                <ChevronDown className="h-5 w-5" />
                              ) : (
                                <ChevronRight className="h-5 w-5" />
                              )}
                            </span>
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100">
                              <User className="h-5 w-5 text-slate-600" aria-hidden />
                            </div>
                            <div className="min-w-0 text-left">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="font-medium text-slate-900">{employee.name}</span>
                                <span className="font-mono text-xs text-slate-500">
                                  {employee.odId || '—'}
                                </span>
                              </div>
                              <div className="text-xs text-slate-600">
                                {[employee.designation, employee.workingUnderPartner]
                                  .filter(Boolean)
                                  .join(' • ') || employee.email}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            {(employee.notificationCount || 0) > 0 && (
                              <span
                                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
                                title={
                                  employee.lastNotifiedAt
                                    ? `Last notified ${new Date(employee.lastNotifiedAt).toLocaleString()}`
                                    : undefined
                                }
                              >
                                Notified · {employee.notificationCount}×
                              </span>
                            )}
                            {employee.wholeMonthMissing && (
                              <span className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-900">
                                No month file
                              </span>
                            )}
                            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-sm font-medium text-amber-900">
                              {missingCount} day{missingCount === 1 ? '' : 's'}
                            </span>
                            <button
                              type="button"
                              onClick={() => sendMissingNotification(employee.userId)}
                              disabled={sendingMissingNotification.has(employee.userId)}
                              className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                            >
                              {sendingMissingNotification.has(employee.userId) ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                              ) : (
                                <Send className="h-4 w-4 text-slate-600" aria-hidden />
                              )}
                              <span>Notify</span>
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div
                            id={`missing-days-${employee.userId}`}
                            className="border-t border-slate-200 bg-slate-50/80 p-4"
                            role="region"
                            aria-labelledby={`missing-emp-${employee.userId}`}
                          >
                            <div className="grid gap-2">
                              {(employee.missingDays || []).map((day) => (
                                <div
                                  key={day.date}
                                  className="flex flex-col gap-2 rounded-lg border border-blue-200/65 bg-panel p-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                                    <span className="font-mono text-sm text-slate-900">
                                      {day.date}
                                    </span>
                                    <span className="text-sm text-slate-600">
                                      {formatMissingDate(day.date)}
                                    </span>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <span className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-900">
                                      Not recorded
                                    </span>
                                    {(day.notificationCount || 0) > 0 && (
                                      <span
                                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
                                        title={
                                          day.lastNotifiedAt
                                            ? `Last notified ${new Date(day.lastNotifiedAt).toLocaleString()}`
                                            : undefined
                                        }
                                      >
                                        Notified · {day.notificationCount}×
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
        ) : (
          <div>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Missing check-in or check-out
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {filteredEmployees.length} employee
                    {filteredEmployees.length === 1 ? '' : 's'} with incomplete punch times for{' '}
                    {formatMonthYear(selectedMonth)}.
                  </p>
                </div>
                {filteredEmployees.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={exportInvalidExcel}
                      disabled={exporting !== null}
                      className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                    >
                      {exporting === 'invalid' ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 text-slate-600" aria-hidden />
                      )}
                      <span>Export Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={sendBulkNotifications}
                      disabled={sendingBulk || loading}
                      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sendingBulk ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Mail className="h-4 w-4" aria-hidden />
                      )}
                      <span>Notify all ({filteredEmployees.length})</span>
                    </button>
                  </div>
                )}
              </div>

              {filteredEmployees.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                  No invalid punch records for {formatMonthYear(selectedMonth)}.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
                      <div className="text-2xl font-bold tabular-nums text-amber-800">
                        {filteredEmployees.length}
                      </div>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Employees with issues
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
                      <div className="text-2xl font-bold tabular-nums text-rose-700">
                        {filteredEmployees.reduce((sum, emp) => sum + emp.invalidRecords.length, 0)}
                      </div>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Total invalid rows
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
                      <div className="text-2xl font-bold tabular-nums text-emerald-800">
                        {filteredEmployees.filter((emp) => (emp.notificationCount || 0) > 0).length}
                      </div>
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Notified employees
                      </div>
                    </div>
                  </div>

                  {filteredEmployees.map((employee) => {
                    const expanded = expandedEmployee === employee.userId;
                    return (
                      <div
                        key={employee.userId}
                        className="overflow-hidden rounded-lg border border-blue-200/65 bg-panel shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                          <div
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md py-1 transition-colors hover:bg-slate-50 sm:gap-4"
                            onClick={() =>
                              setExpandedEmployee(expanded ? null : employee.userId)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpandedEmployee(expanded ? null : employee.userId);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-expanded={expanded}
                            aria-controls={`invalid-records-${employee.userId}`}
                            id={`invalid-emp-${employee.userId}`}
                          >
                            <span className="text-slate-500" aria-hidden>
                              {expanded ? (
                                <ChevronDown className="h-5 w-5" />
                              ) : (
                                <ChevronRight className="h-5 w-5" />
                              )}
                            </span>
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100">
                              <User className="h-5 w-5 text-slate-600" aria-hidden />
                            </div>
                            <div className="min-w-0 text-left">
                              <div className="font-medium text-slate-900">{employee.name}</div>
                              <div className="text-xs text-slate-600">
                                {employee.designation} • {employee.workingUnderPartner}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            {(employee.notificationCount || 0) > 0 && (
                              <span
                                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
                                title={
                                  employee.lastNotifiedAt
                                    ? `Last notified ${new Date(employee.lastNotifiedAt).toLocaleString()}`
                                    : undefined
                                }
                              >
                                Notified · {employee.notificationCount}×
                              </span>
                            )}
                            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-sm font-medium text-amber-900">
                              {employee.invalidRecords.length} issues
                            </span>
                            <button
                              type="button"
                              onClick={() => sendNotification(employee.userId)}
                              disabled={sendingNotification.has(employee.userId)}
                              className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                            >
                              {sendingNotification.has(employee.userId) ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                              ) : (
                                <Send className="h-4 w-4 text-slate-600" aria-hidden />
                              )}
                              <span>Notify</span>
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div
                            id={`invalid-records-${employee.userId}`}
                            className="border-t border-slate-200 bg-slate-50/80 p-4"
                            role="region"
                            aria-labelledby={`invalid-emp-${employee.userId}`}
                          >
                            <div className="grid gap-2">
                              {employee.invalidRecords.map((record, idx) => (
                                <div
                                  key={idx}
                                  className="flex flex-col gap-2 rounded-lg border border-blue-200/65 bg-panel p-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                                      <span className="font-mono text-sm text-slate-900">
                                        {record.date}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                                      <span className="text-sm text-slate-700">
                                        In:{' '}
                                        <span
                                          className={
                                            record.issue === 'missing-checkin'
                                              ? 'font-medium text-rose-700'
                                              : 'text-emerald-800'
                                          }
                                        >
                                          {record.checkin || '—'}
                                        </span>
                                        <span className="text-slate-400"> / </span>
                                        Out:{' '}
                                        <span
                                          className={
                                            record.issue === 'missing-checkout'
                                              ? 'font-medium text-rose-700'
                                              : 'text-emerald-800'
                                          }
                                        >
                                          {record.checkout || '—'}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-md border px-2 py-1 text-xs font-medium ${getIssueColor(record.issue)}`}
                                    >
                                      {getIssueLabel(record.issue)}
                                    </span>
                                    {(record.notificationCount || 0) > 0 && (
                                      <span
                                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
                                        title={
                                          record.lastNotifiedAt
                                            ? `Last notified ${new Date(record.lastNotifiedAt).toLocaleString()}`
                                            : undefined
                                        }
                                      >
                                        Notified · {record.notificationCount}×
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
        )}
      </div>
    </section>
  );
};
