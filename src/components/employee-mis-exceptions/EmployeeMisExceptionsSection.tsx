'use client';

import React from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, Search, ClipboardList, Loader2 } from 'lucide-react';
import type { FilterValue } from './types';
import { FILTER_ALL } from './constants';
import { formatEarlyInLateOutReason } from './utils';
import { useEmployeeMisExceptionsSectionLogic } from './hooks';

export const EmployeeMisExceptionsSection: React.FC = () => {
  const {
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
  } = useEmployeeMisExceptionsSectionLogic();

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
        ) : employeeListEmpty ? (
          <p className="py-12 text-center text-sm text-slate-600">{emptyMessage}</p>
        ) : (
          renderEmployeeList(displayRows)
        )}
      </div>
    </section>
  );
};
