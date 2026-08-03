'use client';

import React from 'react';
import { BarChart3, ChevronDown, ChevronUp, Eye, Maximize2, Minimize2 } from 'lucide-react';
import { BulkLeaveManager } from '../BulkLeaveManager';
import { formatHoursMinutes } from '@/lib/attendanceSummaryMetrics';
import { SUMMARY_TABLE_CHUNK } from './constants';
import { useSummarySectionLogic } from './hooks/useSummarySectionLogic';
import {
  SummaryHeader,
  SummaryStatsCards,
  SummaryPeriodControls,
} from './components';
import {
  SummaryAdvancedFiltersModal,
  SummaryDetailModal,
  SummaryRangeModal,
} from './components/modal';
import type { SummarySectionProps } from './types';

export type { SummarySectionProps } from './types';

export const SummarySection: React.FC<SummarySectionProps> = (props) => {
  const s = useSummarySectionLogic(props);

  return (
    <section className="space-y-5 text-slate-900" aria-labelledby="attendance-summary-heading">
      {/* Page header  title, hint, workflow */}
      <SummaryHeader currentPeriodLabel={s.currentPeriodLabel} />

      <SummaryPeriodControls
        currentDate={s.currentDate}
        filterType={s.filterType}
        setFilterType={s.setFilterType}
        switchToMonth={s.switchToMonth}
        setRangeModalOpen={s.setRangeModalOpen}
        handlePrevWeek={s.handlePrevWeek}
        handlePrevMonth={s.handlePrevMonth}
        handleNextWeek={s.handleNextWeek}
        handleNextMonth={s.handleNextMonth}
        currentPeriodLabel={s.currentPeriodLabel}
        selectedYear={s.selectedYear}
        setSelectedYear={s.setSelectedYear}
        selectedMonth={s.selectedMonth}
        setSelectedMonth={s.setSelectedMonth}
        searchTerm={s.searchTerm}
        setSearchTerm={s.setSearchTerm}
        handleExport={s.handleExport}
        handleDetailedExport={s.handleDetailedExport}
        handleDayWiseExport={s.handleDayWiseExport}
        hideDetailedExport={s.hideDetailedExport}
        selectedCount={s.selectedEmployees.size}
        onBulkStatus={() => s.setIsBulkManagerOpen(true)}
        onOpenFilters={() => s.setShowAdvancedFilters(true)}
        hasActiveFilters={s.hasActiveFilters}
      />

      {/* KPI strip calm metrics */}
      <SummaryStatsCards stats={s.stats} />


      {/* Employee table */}
      <section className="overflow-hidden rounded-md border border-blue-200/65 bg-panel shadow-sm" aria-labelledby="summary-employees-heading">
        <div className="flex flex-col gap-2 border-b border-blue-200/50 bg-sky-100/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="summary-employees-heading" className="text-sm font-semibold text-slate-900">
              Employees
            </h2>
            <p className="text-xs text-slate-500">
              {s.isLoading ? 'Loading' : `${s.filteredSummaries.length} in this period`}
              {!s.isLoading && s.filteredSummaries.length > 0 && s.displayedSummaries.length < s.filteredSummaries.length && (
                <span className="text-slate-500"> · Showing {s.displayedSummaries.length}</span>
              )}
            </p>
          </div>
          {!s.isLoading && s.filteredSummaries.length > 0 && (
            <button
              type="button"
              onClick={() => s.setSummaryTableFullscreen(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:border-slate-300 hover:bg-slate-100"
              title="Open table full screen to scroll all columns"
            >
              <Maximize2 className="h-4 w-4 text-slate-500" aria-hidden />
              Full screen
            </button>
          )}
        </div>
        {s.isLoading ? (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center text-sm text-slate-500">
             <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" aria-hidden />
             <p>Loading summary</p>
          </div>
        ) : s.filteredSummaries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center text-sm text-slate-500">
            <BarChart3 className="h-10 w-10 text-slate-400" aria-hidden />
            <p>No rows for <span className="text-slate-600">{s.currentPeriodLabel}</span>.</p>
            {s.uploadTotal > 0 && (
              <p className="text-xs text-slate-500">Last upload: {s.uploadSaved} saved, {s.uploadFailed} failed.</p>
            )}
          </div>
        ) : (
          <>
            {s.summaryTableFullscreen && (
              <div className="min-h-[min(70dvh,520px)] rounded-md border border-dashed border-blue-200/50 bg-sky-100/50/70 px-4 py-8 text-center">
                <p className="text-sm text-slate-500">Table is open in full screen.</p>
                <button
                  type="button"
                  onClick={() => s.setSummaryTableFullscreen(false)}
                  className="mt-2 text-sm font-medium text-blue-700 hover:underline"
                >
                  Return here
                </button>
              </div>
            )}
            <div
              className={
                s.summaryTableFullscreen
                  ? 'fixed inset-0 z-50 flex flex-col bg-slate-100'
                  : 'overflow-x-auto'
              }
            >
              {s.summaryTableFullscreen && (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-blue-200/65 bg-panel px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">Employees  full screen</p>
                    <p className="truncate text-xs text-slate-500">
                      Scroll horizontally for all columns · {s.currentPeriodLabel} · Esc to close
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => s.setSummaryTableFullscreen(false)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                  >
                    <Minimize2 className="h-4 w-4 text-slate-500" aria-hidden />
                    Exit
                  </button>
                </div>
              )}
              <div className={s.summaryTableFullscreen ? 'min-h-0 flex-1 overflow-auto' : undefined}>
            <table className={`w-full text-left text-sm ${s.summaryTableFullscreen ? 'min-w-[1360px]' : 'min-w-[1180px]'}`}>
              <thead className="border-b border-blue-200/50 bg-sky-100/50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <input
                      type="checkbox"
                      checked={s.selectedEmployees.size === s.filteredSummaries.length && s.filteredSummaries.length > 0}
                      onChange={(e) => s.handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                      aria-label="Select all rows"
                    />
                  </th>
                  <th className="px-2 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-slate-500">Open</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('employeeCode')}>
                    <div className="flex items-center gap-1">Code{s.sortField === 'employeeCode' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-600 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('userName')}>
                    <div className="flex items-center gap-1">Employee{s.sortField === 'userName' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('team')}>
                    <div className="flex items-center gap-1">Team{s.sortField === 'team' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('designation')}>
                    <div className="flex items-center gap-1">Designation{s.sortField === 'designation' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Days</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Holidays</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Working</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-600 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('totalPresent')}>
                    <div className="flex items-center gap-1 justify-end">Present{s.sortField === 'totalPresent' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('calcPresentWeekoff')}>
                    <div className="flex items-center gap-1 justify-end" title="Present on Sunday, holiday, or weekoff">P. Weekoff{s.sortField === 'calcPresentWeekoff' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('totalHalfDay')}>
                    <div className="flex items-center gap-1 justify-end">Half{s.sortField === 'totalHalfDay' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('totalAbsent')}>
                    <div className="flex items-center gap-1 justify-end">Absent{s.sortField === 'totalAbsent' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('calcLate')}>
                    <div className="flex items-center gap-1 justify-end">Late{s.sortField === 'calcLate' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('totalLeave')}>
                    <div className="flex items-center gap-1 justify-end">Leave{s.sortField === 'totalLeave' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('calcScheduled')}>
                    <div className="flex items-center gap-1 justify-end">Sched.{s.sortField === 'calcScheduled' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('definedSchedule')}>
                    <div className="flex items-center gap-1 justify-end">Defined{s.sortField === 'definedSchedule' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('totalHour')}>
                    <div className="flex items-center gap-1 justify-end">Worked{s.sortField === 'totalHour' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-600 cursor-pointer hover:bg-slate-100 select-none" onClick={() => s.handleSort('calcExcessDeficit')}>
                    <div className="flex items-center gap-1 justify-end">+ hrs{s.sortField === 'calcExcessDeficit' && (s.sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(s.displayedSummaries as any[]).map((item) => (
                  <tr
                    key={item.id}
                    className="group transition-colors hover:bg-sky-100/55"
                  >
                    <td className="px-4 py-2.5 text-left" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={s.selectedEmployees.has(item.userId)}
                        onChange={(e) => s.handleSelectEmployee(item.userId, e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                        aria-label={`Select ${item.userName}`}
                      />
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => s.onEmployeeClick(item.userId, item.monthYear)}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        title={`Monthly calendar for ${item.userName}`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-left font-mono text-xs text-slate-500">{item.employeeCode || item.odId || '-'}</td>
                    <td className="px-4 py-2.5">
                      <button type="button" className="text-left font-medium text-slate-800 hover:text-blue-700 cursor-pointer" onClick={() => s.onEmployeeDetailClick?.(item.userId)}>{item.userName}</button>
                      <div className="font-mono text-[10px] text-slate-500 hidden md:block">{item.employeeCode || item.odId || item.userId}</div>
                    </td>
                    <td className="px-4 py-2.5 text-left text-sm text-slate-500">{item.team || ''}</td>
                    <td className="px-4 py-2.5 text-left text-sm text-slate-500">{item.designation || ''}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500">{Object.keys(item.recordDetails || {}).length}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500">
                        {(() => {
                          // Count s.holidays: Sundays + dates in holiday database
                          const records = item.recordDetails || {};
                          const holidayDates = new Set(s.holidays.map(h => h.date));
                          let holidayCount = 0;
                          Object.keys(records).forEach((dateStr) => {
                            const d = new Date(dateStr);
                            if (d.getDay() === 0) {
                              // Sunday
                              holidayCount++;
                            } else if (holidayDates.has(dateStr)) {
                              // Holiday from database
                              holidayCount++;
                            }
                          });
                          return holidayCount;
                        })()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500 cursor-pointer hover:bg-sky-100/55" onClick={(e) => s.openDetail(e, 'WorkingDays', item)}>
                        {(() => {
                          // Count working days: exclude s.holidays (from DB), Sundays, and weekoff types
                          const records = item.recordDetails || {};
                          const holidayDates = new Set(s.holidays.map(h => h.date));
                          const workingDays = Object.entries(records).filter(([dateStr, rec]: [string, any]) => {
                            const d = new Date(dateStr);
                            if (d.getDay() === 0) return false; // Exclude Sundays
                            if (holidayDates.has(dateStr)) return false; // Exclude s.holidays from DB
                            if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) return false;
                            return true;
                          }).length;
                          return workingDays > 0 ? (
                            <span className="underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-slate-700" title="How working days were counted">{workingDays}</span>
                          ) : '-';
                        })()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-800 cursor-pointer hover:bg-sky-100/55" onClick={(e) => item.summary.totalPresent > 0 && s.openDetail(e, 'Present', item)}>
                        {item.summary.totalPresent > 0 ? (
                           <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Day-by-day present">{item.summary.totalPresent}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-600 cursor-pointer hover:bg-sky-100/55" onClick={(e) => (item.calcPresentWeekoff || 0) > 0 && s.openDetail(e, 'PresentWeekoff', item)}>
                        {(item.calcPresentWeekoff || 0) > 0 ? (
                           <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Present on Sunday, holiday, or weekoff">{item.calcPresentWeekoff}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500 cursor-pointer hover:bg-sky-100/55" onClick={(e) => item.summary.totalHalfDay > 0 && s.openDetail(e, 'HalfDay', item)}>
                        {item.summary.totalHalfDay > 0 ? (
                          <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Half-day breakdown">
                            {item.summary.totalHalfDay}
                            {(() => {
                              // Count 'Half Day - weekdays' in recordDetails
                              const halfDayWeekdays = Object.values(item.recordDetails || {}).filter((r: any) => r.typeOfPresence === 'Half Day - weekdays').length;
                              return halfDayWeekdays > 0 ? (
                                <span className="block text-xs font-normal text-slate-500">Weekdays: {halfDayWeekdays}</span>
                              ) : null;
                            })()}
                          </span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-600 cursor-pointer hover:bg-sky-100/55" onClick={(e) => item.summary.totalAbsent > 0 && s.openDetail(e, 'Absent', item)}>
                        {item.summary.totalAbsent > 0 ? (
                           <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Absent days">{item.summary.totalAbsent}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums" onClick={(e) => item.calcLate > 0 && s.openDetail(e, 'Late', item)}>
                      {item.calcLate > 0 ? (
                        <span className="cursor-pointer rounded border border-blue-200/65 bg-panel px-1.5 py-0.5 text-slate-800 hover:border-slate-300" title="Late arrival dates">{item.calcLate}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500 cursor-pointer hover:bg-sky-100/55" onClick={(e) => s.calculateLeaveConsumed(item) > 0 && s.openDetail(e, 'Leave', item)}>
                        {s.calculateLeaveConsumed(item) > 0 ? (
                           <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Leave days">{s.calculateLeaveConsumed(item)}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500 cursor-pointer hover:bg-sky-100/55" onClick={(e) => item.calcScheduled > 0 && s.openDetail(e, 'ScheduledHours', item)}>
                        {item.calcScheduled > 0 ? (
                           <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Scheduled hours breakdown">{formatHoursMinutes(item.calcScheduled)}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500">
                        {(item.calcDefinedSchedule || 0) > 0 ? (
                            <span 
                              className="cursor-pointer underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-slate-700" 
                              title="Defined schedule hours"
                              onClick={(e) => s.openDetail(e, 'DefinedSchedule', item)}
                            >
                              {formatHoursMinutes(item.calcDefinedSchedule)}
                            </span>
                          ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-700 cursor-pointer hover:bg-sky-100/55" onClick={(e) => item.summary.totalHour > 0 && s.openDetail(e, 'WorkHours', item)}>
                        {item.summary.totalHour > 0 ? (
                           <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Worked hours by day">{formatHoursMinutes(item.summary.totalHour)}</span>
                        ) : '0h 0m'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums cursor-pointer hover:bg-sky-100/55"
                        onClick={() => {
                          const breakdown = s.getExcessResultForItem(item).breakdown;
                          s.setDetailModal({
                            isOpen: true,
                            title: `Excess / deficit  ${item.userName}`,
                            data: breakdown
                          });
                        }}
                    >
                       {item.calcExcessDeficit !== undefined ? (
                         <span className={item.calcExcessDeficit >= 0 ? "text-emerald-700" : "text-slate-500"}>
                           {/* Always use backend decimal value, format as H:MM */}
                           {item.calcExcessDeficit > 0 ? "+" : item.calcExcessDeficit < 0 ? "-" : ""}
                           {formatHoursMinutes(Math.abs(item.calcExcessDeficit))}
                         </span>
                       ) : '-'}
                    </td>
                  </tr>
                ))}
                {s.filteredSummaries.length > s.displayedSummaries.length && (
                  <tr ref={s.tableLoadMoreSentinelRef}>
                    <td colSpan={18} className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"
                            aria-hidden
                          />
                          Showing {s.displayedSummaries.length} of {s.filteredSummaries.length}  scroll for more
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            s.setTableVisibleCount((c) =>
                              Math.min(
                                c + s.SUMMARY_TABLE_CHUNK,
                                s.filteredSummaries.length
                              )
                            )
                          }
                          className="rounded-md border border-blue-200/65 bg-panel px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100"
                        >
                          Load {s.SUMMARY_TABLE_CHUNK} more
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            s.setTableVisibleCount(s.filteredSummaries.length)
                          }
                          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100/80"
                        >
                          Show all
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
              </div>
            </div>
          </>
        )}
      </section>

      <BulkLeaveManager 
        isOpen={s.isBulkManagerOpen}
        onClose={() => s.setIsBulkManagerOpen(false)}
        users={s.usersForBulk}
        currentMonthYear={s.currentMonthYear}
        onUpdateComplete={() => s.onFilterChange(s.currentMonthYear)}
      />

      <SummaryDetailModal
        isOpen={s.detailModal.isOpen}
        onClose={() => s.setDetailModal(prev => ({ ...prev, isOpen: false }))}
        title={s.detailModal.title}
        data={s.detailModal.data}
      />

      <SummaryRangeModal
        isOpen={s.rangeModalOpen}
        onClose={() => s.setRangeModalOpen(false)}
        defaultDateIso={s.currentDate.toISOString().split('T')[0]}
        onApplyCustom={s.applyRange}
        onSelectLast3Months={s.setLast3Months}
        onSelectLast6Months={s.setLast6Months}
        onSelectLast12Months={s.setLast12Months}
        onSelectLastMonth={s.setLastMonth}
        onSelectCurrentMonth={s.setCurrentMonth}
      />

      <SummaryAdvancedFiltersModal
        isOpen={s.showAdvancedFilters}
        onClose={() => s.setShowAdvancedFilters(false)}
        teams={s.getUniqueTeams()}
        designations={s.getUniqueDesignations()}
        teamFilter={s.teamFilter}
        designationFilter={s.designationFilter}
        onTeamFilterChange={s.setTeamFilter}
        onDesignationFilterChange={s.setDesignationFilter}
        lateFilter={s.lateFilter}
        onLateFilterChange={s.setLateFilter}
        presentFilter={s.presentFilter}
        onPresentFilterChange={s.setPresentFilter}
        absentFilter={s.absentFilter}
        onAbsentFilterChange={s.setAbsentFilter}
        leaveFilter={s.leaveFilter}
        onLeaveFilterChange={s.setLeaveFilter}
        halfDayFilter={s.halfDayFilter}
        onHalfDayFilterChange={s.setHalfDayFilter}
        workHoursFilter={s.workHoursFilter}
        onWorkHoursFilterChange={s.setWorkHoursFilter}
        excessFilter={s.excessFilter}
        onExcessFilterChange={s.setExcessFilter}
        onClearAll={s.clearAllFilters}
      />
    </section>
  );
};
