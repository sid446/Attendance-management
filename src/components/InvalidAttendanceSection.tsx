import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Mail, Search, RefreshCw, Clock, Check, User, Calendar, Send, Loader2 } from 'lucide-react';

interface InvalidRecord {
  date: string;
  checkin: string;
  checkout: string;
  issue: 'missing-checkin' | 'missing-checkout';
  monthYear: string;
}

interface EmployeeWithInvalidRecords {
  userId: string;
  name: string;
  email: string;
  designation: string;
  workingUnderPartner: string;
  attendanceEmail: string;
  invalidRecords: InvalidRecord[];
  notificationSent?: boolean;
  lastNotifiedAt?: string;
}

interface InvalidAttendanceSectionProps {
  onRefresh?: () => void;
}

const INVALID_ATTENDANCE_WORKFLOW_STEPS = ['Pick month', 'Review rows', 'Notify employees'] as const;

export const InvalidAttendanceSection: React.FC<InvalidAttendanceSectionProps> = ({ onRefresh }) => {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeWithInvalidRecords[]>([]);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [sendingNotification, setSendingNotification] = useState<Set<string>>(new Set());
  const [sendingBulk, setSendingBulk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch invalid attendance records
  const fetchInvalidRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/attendance/invalid-records?monthYear=${selectedMonth}`);
      const result = await response.json();
      if (result.success) {
        setEmployees(result.data);
      } else {
        setError(result.error || 'Failed to fetch invalid records');
      }
    } catch (err) {
      setError('Failed to fetch invalid records');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchInvalidRecords();
  }, [fetchInvalidRecords]);

  // Filter employees by search term
  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return employees;
    const term = searchTerm.toLowerCase();
    return employees.filter(emp =>
      emp.name.toLowerCase().includes(term) ||
      emp.designation?.toLowerCase().includes(term) ||
      emp.workingUnderPartner?.toLowerCase().includes(term)
    );
  }, [employees, searchTerm]);

  // Send notification to a single employee
  const sendNotification = async (employeeId: string) => {
    setSendingNotification(prev => new Set(prev).add(employeeId));
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/attendance/notify-invalid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeIds: [employeeId], monthYear: selectedMonth })
      });
      const result = await response.json();
      if (result.success) {
        setSuccessMessage(`Notification sent successfully`);
        // Update local state to show notification was sent
        setEmployees(prev => prev.map(emp =>
          emp.userId === employeeId
            ? { ...emp, notificationSent: true, lastNotifiedAt: new Date().toISOString() }
            : emp
        ));
      } else {
        setError(result.error || 'Failed to send notification');
      }
    } catch (err) {
      setError('Failed to send notification');
    } finally {
      setSendingNotification(prev => {
        const next = new Set(prev);
        next.delete(employeeId);
        return next;
      });
    }
  };

  // Send notifications to all employees with invalid records
  const sendBulkNotifications = async () => {
    setSendingBulk(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const employeeIds = filteredEmployees.map(emp => emp.userId);
      const response = await fetch('/api/attendance/notify-invalid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeIds, monthYear: selectedMonth })
      });
      const result = await response.json();
      if (result.success) {
        setSuccessMessage(`Notifications sent to ${result.sentCount} employees`);
        // Update local state
        setEmployees(prev => prev.map(emp =>
          employeeIds.includes(emp.userId)
            ? { ...emp, notificationSent: true, lastNotifiedAt: new Date().toISOString() }
            : emp
        ));
      } else {
        setError(result.error || 'Failed to send notifications');
      }
    } catch (err) {
      setError('Failed to send notifications');
    } finally {
      setSendingBulk(false);
    }
  };

  // Generate month options for selector
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

  const getIssueLabel = (issue: InvalidRecord['issue']) => {
    switch (issue) {
      case 'missing-checkin': return 'Missing Check-in';
      case 'missing-checkout': return 'Missing Check-out';
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
                Employees with missing check-in or check-out for machine attendance.
              </p>
              <ol className="mt-3 flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Invalid attendance workflow">
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
              onClick={fetchInvalidRecords}
              disabled={loading}
              className="rounded-md border border-blue-200/65 bg-panel p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
              title="Refresh list"
              aria-label="Refresh invalid attendance list"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            </button>

            {filteredEmployees.length > 0 && (
              <button
                type="button"
                onClick={sendBulkNotifications}
                disabled={sendingBulk || loading}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendingBulk ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
                <span>Notify all ({filteredEmployees.length})</span>
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <label htmlFor="invalid-attendance-search" className="sr-only">
            Search by name, designation, or partner
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            id="invalid-attendance-search"
            type="search"
            placeholder="Search by name, designation, or partner…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={inputCls}
          />
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
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
        ) : filteredEmployees.length === 0 ? (
          <div className="py-12 text-center">
            <Check className="mx-auto mb-3 h-12 w-12 text-emerald-600" aria-hidden />
            <p className="text-slate-600">
              No invalid attendance records for <span className="font-medium text-slate-800">{formatMonthYear(selectedMonth)}</span>.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="text-2xl font-bold tabular-nums text-amber-800">{filteredEmployees.length}</div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Employees with issues</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="text-2xl font-bold tabular-nums text-rose-700">
                  {filteredEmployees.reduce((sum, emp) => sum + emp.invalidRecords.length, 0)}
                </div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total invalid rows</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="text-2xl font-bold tabular-nums text-emerald-800">
                  {filteredEmployees.filter((emp) => emp.notificationSent).length}
                </div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Notified</div>
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
                      onClick={() => setExpandedEmployee(expanded ? null : employee.userId)}
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
                        {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
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
                      {employee.notificationSent && (
                        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900">
                          Notified
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
                                <span className="font-mono text-sm text-slate-900">{record.date}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                                <span className="text-sm text-slate-700">
                                  In:{' '}
                                  <span
                                    className={
                                      record.issue === 'missing-checkin' ? 'font-medium text-rose-700' : 'text-emerald-800'
                                    }
                                  >
                                    {record.checkin || '—'}
                                  </span>
                                  <span className="text-slate-400"> / </span>
                                  Out:{' '}
                                  <span
                                    className={
                                      record.issue === 'missing-checkout' ? 'font-medium text-rose-700' : 'text-emerald-800'
                                    }
                                  >
                                    {record.checkout || '—'}
                                  </span>
                                </span>
                              </div>
                            </div>
                            <span
                              className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${getIssueColor(record.issue)}`}
                            >
                              {getIssueLabel(record.issue)}
                            </span>
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
    </section>
  );
};
