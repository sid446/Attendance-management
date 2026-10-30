import { useState, useEffect, useMemo, useCallback } from 'react';
import { downloadWorkbook } from '@/components/summary/exports/downloadWorkbook';
import type { EmployeeWithInvalidRecords, MissingMonthEmployee, InvalidRecord, OpenRequestFields } from '../types';
import { styleListExportSheet } from '../utils/invalidAttendanceUtils';

export function useInvalidAttendanceSectionLogic() {
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
    setSuccessMessage(null);
    try {
      const [invalidRes, missingRes] = await Promise.all([
        fetch(`/api/attendance/invalid-records?monthYear=${selectedMonth}`),
        fetch(`/api/attendance/missing-month?monthYear=${selectedMonth}`),
      ]);
      const invalidResult = await invalidRes.json();
      const missingResult = await missingRes.json();

      if (invalidResult.success) {
        setEmployees(invalidResult.data);
        const repaired = invalidResult.equalPunchRepair?.daysFixed ?? 0;
        if (repaired > 0) {
          setSuccessMessage(
            `Fixed ${repaired} day${repaired === 1 ? '' : 's'} where in and out were the same (16:00 rule applied).`
          );
        }
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
        { header: 'Request raised', key: 'requestRaised', width: 18 },
        { header: 'Request status', key: 'requestStatus', width: 16 },
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
            requestRaised: day.requestRaised ? 'Yes' : 'No',
            requestStatus: day.requestRaised
              ? day.requestStatus === 'PendingHr'
                ? 'Pending HR'
                : 'Pending'
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
        { header: 'Request raised', key: 'requestRaised', width: 18 },
        { header: 'Request status', key: 'requestStatus', width: 16 },
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
            requestRaised: rec.requestRaised ? 'Yes' : 'No',
            requestStatus: rec.requestRaised
              ? rec.requestStatus === 'PendingHr'
                ? 'Pending HR'
                : 'Pending'
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

  const requestRaisedLabel = (status?: 'Pending' | 'PendingHr') =>
    status === 'PendingHr' ? 'Request raised · Pending HR' : 'Request raised · Pending';

  const requestRaisedBadge = (fields: OpenRequestFields) => {
    if (!fields.requestRaised) return null;
    return (
      <span
        className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-950"
        title={
          fields.requestedStatus
            ? `Employee requested: ${fields.requestedStatus}`
            : 'Employee has raised a request for this date'
        }
      >
        {requestRaisedLabel(fields.requestStatus)}
      </span>
    );
  };

  const inputCls =
    'w-full rounded-md border border-blue-200/65 bg-panel py-2 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const selectCls =
    'rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  const tabBtn = (active: boolean) =>
    `rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
      active ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return {
    loading,
    expandedEmployee,
    setExpandedEmployee,
    expandedMissingEmployee,
    setExpandedMissingEmployee,
    searchTerm,
    setSearchTerm,
    selectedMonth,
    setSelectedMonth,
    sendingNotification,
    sendingMissingNotification,
    sendingBulk,
    sendingMissingBulk,
    exporting,
    view,
    setView,
    error,
    successMessage,
    fetchInvalidRecords,
    filteredEmployees,
    filteredMissingMonth,
    sendNotification,
    sendBulkNotifications,
    sendMissingNotification,
    sendMissingBulkNotifications,
    exportMissingMonthExcel,
    exportInvalidExcel,
    monthOptions,
    formatMonthYear,
    formatMissingDate,
    getIssueLabel,
    getIssueColor,
    requestRaisedBadge,
    inputCls,
    selectCls,
    tabBtn,
  } as const;
}
