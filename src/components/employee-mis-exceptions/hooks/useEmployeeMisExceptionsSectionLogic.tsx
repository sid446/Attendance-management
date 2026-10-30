'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MisExceptionType } from '@/lib/employeeMisExceptions';
import { buildBiometricMissingByDay, buildEarlyInLateOutByDay, MIS_EXCEPTION_LABELS, MIS_EXCEPTION_TYPES } from '@/lib/employeeMisExceptions';
import type { MisRow, MisCounts, MisLabels, FilterValue } from '../types';
import { FILTER_ALL } from '../constants';
import { formatEarlyInLateOutDetail } from '../utils/employeeMisExceptionsUtils';

export function useEmployeeMisExceptionsSectionLogic() {
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
          typeFilter === 'missing-biometric' ? row.missingBiometricDates : undefined,
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

  const renderEmployeeList = (list: MisRow[]) => (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
      {list.map((row) => {
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
                      Missing biometric{' '}
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
  );

  const employeeListEmpty = displayRows.length === 0;

  return {
    loading,
    counts,
    expandedDate,
    setExpandedDate,
    searchTerm,
    setSearchTerm,
    typeFilter,
    setTypeFilter,
    selectedMonth,
    setSelectedMonth,
    error,
    fetchData,
    monthOptions,
    formatMonthYear,
    formatDateLabel,
    isBiometricDayView,
    isEarlyInLateOutDayView,
    isDayGroupedView,
    labelFor,
    monthAffectsList,
    displayRows,
    exceptionTypes,
    biometricDayRows,
    earlyInLateOutDayRows,
    emptyMessage,
    inputCls,
    selectCls,
    renderEmployeeList,
    employeeListEmpty,
  } as const;
}
