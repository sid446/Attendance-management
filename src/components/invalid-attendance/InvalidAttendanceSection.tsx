import React from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Mail, Search, RefreshCw, Clock, User, Calendar, Send, Loader2, FileSpreadsheet } from 'lucide-react';
import type { InvalidAttendanceSectionProps } from './types';
import { INVALID_ATTENDANCE_WORKFLOW_STEPS } from './constants';
import { useInvalidAttendanceSectionLogic } from './hooks';

export const InvalidAttendanceSection: React.FC<InvalidAttendanceSectionProps> = ({
  onRefresh,
}) => {
  const {
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
  } = useInvalidAttendanceSectionLogic();

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
                  : 'Active employees with a defined schedule who have no month file, or missing days that other employees already have.'}
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
                      {filteredMissingMonth.length === 1 ? '' : 's'} with a defined schedule and no
                      month file, or missing days that other employees already have (up to
                      yesterday).
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
                            {(employee.missingDays || []).some((d) => d.requestRaised) && (
                              <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-950">
                                Request raised ·{' '}
                                {
                                  (employee.missingDays || []).filter((d) => d.requestRaised)
                                    .length
                                }
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
                                    {requestRaisedBadge(day)}
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
                            {employee.invalidRecords.some((r) => r.requestRaised) && (
                              <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-950">
                                Request raised ·{' '}
                                {employee.invalidRecords.filter((r) => r.requestRaised).length}
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
                                    {record.checkin &&
                                      record.checkout &&
                                      record.checkin === record.checkout &&
                                      record.checkin !== '00:00' && (
                                        <span
                                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
                                          title="In and out are the same punch — usually an exit-only machine row"
                                        >
                                          Same in/out punch
                                        </span>
                                      )}
                                    {requestRaisedBadge(record)}
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
