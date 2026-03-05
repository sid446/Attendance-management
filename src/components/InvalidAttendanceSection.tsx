import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Mail, Search, RefreshCw, X, Clock, Check, User, Calendar, Send, Loader2 } from 'lucide-react';

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
      case 'missing-checkin': return 'text-amber-400 bg-amber-400/10 border-amber-500/30';
      case 'missing-checkout': return 'text-orange-400 bg-orange-400/10 border-orange-500/30';
    }
  };

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm">
      {/* Header */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-50">Invalid Attendance Records</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Employees with missing check-in or check-out times
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Month Selector */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              {monthOptions.map(month => (
                <option key={month} value={month}>{formatMonthYear(month)}</option>
              ))}
            </select>

            {/* Refresh Button */}
            <button
              onClick={fetchInvalidRecords}
              disabled={loading}
              className="p-2 bg-slate-800 border border-slate-700 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Send Bulk Notifications */}
            {filteredEmployees.length > 0 && (
              <button
                onClick={sendBulkNotifications}
                disabled={sendingBulk || loading}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingBulk ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                <span>Notify All ({filteredEmployees.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, designation, or partner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Messages */}
        {error && (
          <div className="mt-4 px-4 py-3 bg-rose-950/40 border border-rose-700/60 text-rose-100 rounded-md text-sm">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mt-4 px-4 py-3 bg-emerald-950/40 border border-emerald-700/60 text-emerald-100 rounded-md text-sm">
            {successMessage}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="text-center py-12">
            <Check className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-slate-400">No invalid attendance records found for {formatMonthYear(selectedMonth)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                <div className="text-2xl font-bold text-amber-400">{filteredEmployees.length}</div>
                <div className="text-xs text-slate-400">Employees with Issues</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                <div className="text-2xl font-bold text-rose-400">
                  {filteredEmployees.reduce((sum, emp) => sum + emp.invalidRecords.length, 0)}
                </div>
                <div className="text-xs text-slate-400">Total Invalid Records</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                <div className="text-2xl font-bold text-emerald-400">
                  {filteredEmployees.filter(emp => emp.notificationSent).length}
                </div>
                <div className="text-xs text-slate-400">Notified</div>
              </div>
            </div>

            {/* Employee List */}
            {filteredEmployees.map((employee) => (
              <div
                key={employee.userId}
                className="bg-slate-800/30 border border-slate-700/50 rounded-lg overflow-hidden"
              >
                {/* Employee Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
                  onClick={() => setExpandedEmployee(
                    expandedEmployee === employee.userId ? null : employee.userId
                  )}
                >
                  <div className="flex items-center gap-4">
                    <button className="text-slate-400">
                      {expandedEmployee === employee.userId ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                    </button>
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                      <User className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-100">{employee.name}</div>
                      <div className="text-xs text-slate-400">
                        {employee.designation} • {employee.workingUnderPartner}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {employee.notificationSent && (
                      <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">
                        Notified
                      </span>
                    )}
                    <span className="text-sm font-medium text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
                      {employee.invalidRecords.length} issues
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        sendNotification(employee.userId);
                      }}
                      disabled={sendingNotification.has(employee.userId)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-md transition-colors disabled:opacity-50"
                    >
                      {sendingNotification.has(employee.userId) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>Notify</span>
                    </button>
                  </div>
                </div>

                {/* Expanded Records */}
                {expandedEmployee === employee.userId && (
                  <div className="border-t border-slate-700/50 bg-slate-900/30 p-4">
                    <div className="grid gap-2">
                      {employee.invalidRecords.map((record, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              <span className="font-mono text-sm text-slate-200">{record.date}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-slate-400" />
                              <span className="text-sm text-slate-300">
                                In: <span className={record.issue === 'missing-checkin' ? 'text-rose-400' : 'text-emerald-400'}>{record.checkin || '—'}</span>
                                {' '}/{' '}
                                Out: <span className={record.issue === 'missing-checkout' ? 'text-rose-400' : 'text-emerald-400'}>{record.checkout || '—'}</span>
                              </span>
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded border ${getIssueColor(record.issue)}`}>
                            {getIssueLabel(record.issue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
