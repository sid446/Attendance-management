'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  ClipboardList,
  Loader2,
} from 'lucide-react';
import type { EarlyInLateOutHit, MisExceptionType } from '@/lib/employeeMisExceptions';
import {
  buildBiometricMissingByDay,
  buildEarlyInLateOutByDay,
  MIS_EXCEPTION_LABELS,
  MIS_EXCEPTION_TYPES,
} from '@/lib/employeeMisExceptions';

type MisRow = {
  userId: string;
  odId: string;
  name: string;
  email: string;
  designation: string;
  workingUnderPartner: string;
  registeredUnderPartner: string;
  attendanceEmail: string;
  exceptions: MisExceptionType[];
  missingBiometricDates?: string[];
  earlyInLateOutHits?: EarlyInLateOutHit[];
};

type MisCounts = Record<MisExceptionType, number>;

type MisLabels = Record<MisExceptionType, string>;

const FILTER_ALL = 'all' as const;
type FilterValue = typeof FILTER_ALL | MisExceptionType;

function formatEarlyInLateOutReason(reason: EarlyInLateOutHit['reason']): string {
  switch (reason) {
    case 'early-in':
      return 'In ≤ 8 AM';
    case 'late-out':
      return 'Out ≥ 8 PM';
    case 'both':
      return 'In ≤ 8 AM and out ≥ 8 PM';
  }
}

function formatEarlyInLateOutDetail(hit: EarlyInLateOutHit): string {
  const parts = [hit.date, formatEarlyInLateOutReason(hit.reason)];
  if (hit.inTime) parts.push(`in ${hit.inTime}`);
  if (hit.outTime) parts.push(`out ${hit.outTime}`);
  return parts.join(' · ');
}

export const EmployeeMisExceptionsSection: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MisRow[]>([]);
  const [counts, setCounts] = useState<MisCounts | null>(null);
  const [labels, setLabels] = useState<MisLabels | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterValue>(FILTER_ALL);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ monthYear: selectedMonth });
      const response = await fetch(`/api/employees/mis-exceptions?${params}`);
      const result = await response.json();
      if (result.success) {
        setRows(result.data);
        setCounts(result.counts);
        setLabels(result.labels ?? MIS_EXCEPTION_LABELS);
      } else {
        setError(result.error || 'Failed to load MIS exceptions');
      }
    } catch {
      setError('Failed to load MIS exceptions');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

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
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatDateLabel = (dateKey: string) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const isBiometricDayView = typeFilter === 'missing-biometric';
  const isEarlyInLateOutDayView = typeFilter === 'early-in-late-out';
  const isDayGroupedView = isBiometricDayView || isEarlyInLateOutDayView;

  const labelFor = (type: MisExceptionType) => exceptionLabels[type] ?? type;

  const monthAffectsList =
    typeFilter === FILTER_ALL ||
    typeFilter === 'missing-biometric' ||
    typeFilter === 'missing-attendance' ||
    typeFilter === 'early-in-late-out';

  const searchFilteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.odId.toLowerCase().includes(term) ||
        r.designation?.toLowerCase().includes(term) ||
        r.workingUnderPartner?.toLowerCase().includes(term) ||
        r.registeredUnderPartner?.toLowerCase().includes(term) ||
        r.email?.toLowerCase().includes(term)
    );
  }, [rows, searchTerm]);

  const displayRows = useMemo(() => {
    if (typeFilter === FILTER_ALL) return searchFilteredRows;
    return searchFilteredRows
      .filter((row) => row.exceptions.includes(typeFilter))
      .map((row) => ({
        ...row,
        exceptions: [typeFilter],
        missingBiometricDates:
          typeFilter === 'missing-biometric' || typeFilter === 'missing-attendance'
            ? row.missingBiometricDates
            : undefined,
        earlyInLateOutHits:
          typeFilter === 'early-in-late-out' ? row.earlyInLateOutHits : undefined,
      }));
  }, [searchFilteredRows, typeFilter]);

  const exceptionTypes = MIS_EXCEPTION_TYPES;
  const exceptionLabels = labels ?? MIS_EXCEPTION_LABELS;

  const biometricDayRows = useMemo(
    () => buildBiometricMissingByDay(displayRows),
    [displayRows]
  );

  const earlyInLateOutDayRows = useMemo(
    () => buildEarlyInLateOutByDay(displayRows),
    [displayRows]
  );

  const emptyMessage = useMemo(() => {
    if (typeFilter === 'missing-biometric') {
      return `No days with missing biometric uploads for ${formatMonthYear(selectedMonth)}.`;
    }
    if (typeFilter === 'early-in-late-out') {
      return `No days with in time ≤ 8 AM or out time ≥ 8 PM for ${formatMonthYear(selectedMonth)}.`;
    }
    if (typeFilter === FILTER_ALL) {
      return `No active employees with MIS exceptions for ${formatMonthYear(selectedMonth)}.`;
    }
    return `No active employees with “${labelFor(typeFilter)}”.`;
  }, [typeFilter, selectedMonth, labels]);

  useEffect(() => {
    setExpandedId(null);
    setExpandedDate(null);
  }, [typeFilter, selectedMonth]);

  const exceptionBadgeClass = (type: MisExceptionType) => {
    switch (type) {
      case 'missing-attendance':
        return 'border-red-200 bg-red-50 text-red-950';
      case 'missing-biometric':
        return 'border-rose-200 bg-rose-50 text-rose-900';
      case 'early-in-late-out':
        return 'border-indigo-200 bg-indigo-50 text-indigo-950';
      case 'no-schedule':
        return 'border-amber-200 bg-amber-50 text-amber-950';
      case 'no-pl-partner':
        return 'border-violet-200 bg-violet-50 text-violet-950';
      case 'approver-same-as-employee':
        return 'border-orange-200 bg-orange-50 text-orange-950';
      case 'non-asija-email':
        return 'border-sky-200 bg-sky-50 text-sky-950';
    }
  };

  const inputCls =
    'w-full rounded-md border border-blue-200/65 bg-panel py-2 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const selectCls =
    'rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  return (
    <section
      className="rounded-xl border border-blue-200/65 bg-panel shadow-sm"
      aria-labelledby="mis-exceptions-heading"
    >
      <div className="border-b border-slate-200 p-6">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50">
              <ClipboardList className="h-5 w-5 text-violet-700" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="mis-exceptions-heading" className="text-lg font-semibold text-slate-900">
                Employee MIS exceptions
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Active employees with master data or biometric gaps the system should flag for HR.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {monthAffectsList && (
              <>
                <label htmlFor="mis-month" className="sr-only">
                  Month
                </label>
                <select
                  id="mis-month"
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
              </>
            )}
            <button
              type="button"
              onClick={() => void fetchData()}
              disabled={loading}
              className="rounded-md border border-blue-200/65 bg-panel p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
              title="Refresh"
              aria-label="Refresh MIS exceptions"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            </button>
          </div>
        </div>

        {counts && (
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
            {exceptionTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(typeFilter === type ? FILTER_ALL : type)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  typeFilter === type
                    ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-500/25'
                    : 'border-slate-200 bg-slate-50 hover:bg-white'
                }`}
              >
                <div className="font-medium text-slate-900">{counts[type] ?? 0}</div>
                <div className="text-xs text-slate-600">{labelFor(type)}</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="mis-search" className="sr-only">
              Search
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              id="mis-search"
              type="search"
              placeholder={
                isDayGroupedView
                  ? 'Search employee name, ID, designation, partner…'
                  : 'Search name, ID, designation, partner…'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={inputCls}
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as FilterValue)}
            className={selectCls}
            aria-label="Filter by exception type"
          >
            <option value={FILTER_ALL}>All exception types</option>
            {exceptionTypes.map((type) => (
              <option key={type} value={type}>
                {labelFor(type)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Loading exceptions…
          </div>
        ) : isEarlyInLateOutDayView ? (
          earlyInLateOutDayRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-600">{emptyMessage}</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {earlyInLateOutDayRows.map((day) => {
                const expanded = expandedDate === day.date;
                return (
                  <li key={day.date}>
                    <button
                      type="button"
                      onClick={() => setExpandedDate(expanded ? null : day.date)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
                      aria-expanded={expanded}
                    >
                      {expanded ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium text-slate-900">
                            {formatDateLabel(day.date)}
                          </span>
                          <span className="font-mono text-xs text-slate-500">{day.date}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {day.employees.length} employee
                          {day.employees.length === 1 ? '' : 's'} with in ≤ 8 AM or out ≥ 8 PM
                        </p>
                      </div>
                    </button>
                    {expanded && (
                      <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 pl-11">
                        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                          {day.employees.map((emp) => (
                            <li
                              key={emp.userId}
                              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 text-sm"
                            >
                              <span className="font-medium text-slate-900">{emp.name}</span>
                              <span className="font-mono text-xs text-slate-500">
                                {emp.odId || '—'}
                              </span>
                              <span className="w-full text-xs text-indigo-900 sm:w-auto">
                                {formatEarlyInLateOutReason(emp.reason)}
                                {emp.inTime ? ` · in ${emp.inTime}` : ''}
                                {emp.outTime ? ` · out ${emp.outTime}` : ''}
                              </span>
                              {(emp.designation || emp.workingUnderPartner) && (
                                <span className="w-full text-xs text-slate-600 sm:w-auto">
                                  {[emp.designation, emp.workingUnderPartner]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        ) : isBiometricDayView ? (
          biometricDayRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-600">{emptyMessage}</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {biometricDayRows.map((day) => {
                const expanded = expandedDate === day.date;
                return (
                  <li key={day.date}>
                    <button
                      type="button"
                      onClick={() => setExpandedDate(expanded ? null : day.date)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
                      aria-expanded={expanded}
                    >
                      {expanded ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium text-slate-900">
                            {formatDateLabel(day.date)}
                          </span>
                          <span className="font-mono text-xs text-slate-500">{day.date}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {day.employees.length} employee
                          {day.employees.length === 1 ? '' : 's'} missing biometric
                        </p>
                      </div>
                    </button>
                    {expanded && (
                      <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 pl-11">
                        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                          {day.employees.map((emp) => (
                            <li
                              key={emp.userId}
                              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 text-sm"
                            >
                              <span className="font-medium text-slate-900">{emp.name}</span>
                              <span className="font-mono text-xs text-slate-500">
                                {emp.odId || '—'}
                              </span>
                              {(emp.designation || emp.workingUnderPartner) && (
                                <span className="w-full text-xs text-slate-600 sm:w-auto">
                                  {[emp.designation, emp.workingUnderPartner]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        ) : displayRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-600">{emptyMessage}</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {displayRows.map((row) => {
              const expanded = expandedId === row.userId;
              return (
                <li key={row.userId}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : row.userId)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    aria-expanded={expanded}
                  >
                    {expanded ? (
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    ) : (
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-slate-900">{row.name}</span>
                        <span className="font-mono text-xs text-slate-500">{row.odId || '—'}</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {row.designation || '—'}
                        {row.workingUnderPartner ? ` · ${row.workingUnderPartner}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.exceptions.map((ex) => (
                          <span
                            key={ex}
                            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${exceptionBadgeClass(ex)}`}
                          >
                            {labelFor(ex)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                  {expanded && (
                    <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 pl-11 text-sm text-slate-700">
                      <dl className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Email</dt>
                          <dd>{row.email || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Attendance approver</dt>
                          <dd>{row.attendanceEmail || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Registered under partner</dt>
                          <dd>{row.registeredUnderPartner || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Working under partner</dt>
                          <dd>{row.workingUnderPartner || '—'}</dd>
                        </div>
                      </dl>
                      {row.exceptions.includes('missing-attendance') && (
                        <p className="mt-3 text-xs text-red-900">
                          This active employee has no attendance uploaded for{' '}
                          {formatMonthYear(selectedMonth)} (no month record or empty file). Upload
                          machine/biometric data for the month.
                        </p>
                      )}
                      {row.exceptions.includes('no-schedule') && (
                        <p className="mt-3 text-xs text-amber-900">
                          No attendance timing schedule is defined on this employee record (no uploaded
                          weekday in/out times in schedules).
                        </p>
                      )}
                      {row.exceptions.includes('no-pl-partner') && (
                        <p className="mt-3 text-xs text-violet-900">
                          {!row.registeredUnderPartner && !row.workingUnderPartner
                            ? 'Registered Under Partner and Working Under Partner are both missing.'
                            : !row.registeredUnderPartner
                              ? 'Registered Under Partner is missing.'
                              : 'Working Under Partner is missing.'}
                        </p>
                      )}
                      {row.exceptions.includes('approver-same-as-employee') && (
                        <p className="mt-3 text-xs text-orange-900">
                          Employee email and attendance email are the same ({row.email}) — attendance
                          should be approved by a different person (partner/approver email).
                        </p>
                      )}
                      {row.exceptions.includes('non-asija-email') && (
                        <p className="mt-3 text-xs text-sky-900">
                          Employee login email ({row.email || '—'}) must end with @asija.in.
                        </p>
                      )}
                      {row.missingBiometricDates && row.missingBiometricDates.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-slate-500">
                            {row.exceptions.includes('missing-attendance')
                              ? 'Days missing attendance'
                              : 'Missing biometric'}{' '}
                            ({row.missingBiometricDates.length} day
                            {row.missingBiometricDates.length === 1 ? '' : 's'} in{' '}
                            {formatMonthYear(selectedMonth)})
                          </p>
                          <p className="mt-1 font-mono text-xs leading-relaxed text-slate-800">
                            {row.missingBiometricDates.join(', ')}
                          </p>
                        </div>
                      )}
                      {row.earlyInLateOutHits && row.earlyInLateOutHits.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-slate-500">
                            In ≤ 8 AM or out ≥ 8 PM ({row.earlyInLateOutHits.length} day
                            {row.earlyInLateOutHits.length === 1 ? '' : 's'} in{' '}
                            {formatMonthYear(selectedMonth)})
                          </p>
                          <ul className="mt-1 space-y-1 text-xs leading-relaxed text-slate-800">
                            {row.earlyInLateOutHits.map((hit) => (
                              <li key={hit.date} className="font-mono">
                                {formatEarlyInLateOutDetail(hit)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
