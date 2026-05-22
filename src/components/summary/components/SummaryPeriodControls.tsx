'use client';

import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, Download, Filter, ListChecks, Search } from 'lucide-react';
import type { SummaryFilterType } from '../types';

export interface SummaryPeriodControlsProps {
  currentDate: Date;
  filterType: SummaryFilterType;
  setFilterType: (t: SummaryFilterType) => void;
  switchToMonth: () => void;
  setRangeModalOpen: (open: boolean) => void;
  handlePrevWeek: () => void;
  handlePrevMonth: () => void;
  handleNextWeek: () => void;
  handleNextMonth: () => void;
  currentPeriodLabel: string;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  selectedMonth: number;
  setSelectedMonth: (m: number) => void;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  handleExport: () => void;
  handleDetailedExport: () => void;
  handleDayWiseExport: () => void;
  hideDetailedExport?: boolean;
  selectedCount: number;
  onBulkStatus: () => void;
  onOpenFilters: () => void;
  hasActiveFilters: () => boolean;
}

export const SummaryPeriodControls: React.FC<SummaryPeriodControlsProps> = (props) => {
  const {
    currentDate,
    filterType,
    setFilterType,
    switchToMonth,
    setRangeModalOpen,
    handlePrevWeek,
    handlePrevMonth,
    handleNextWeek,
    handleNextMonth,
    currentPeriodLabel,
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    searchTerm,
    setSearchTerm,
    handleExport,
    handleDetailedExport,
    handleDayWiseExport,
    hideDetailedExport,
    selectedCount,
    onBulkStatus,
    onOpenFilters,
    hasActiveFilters,
  } = props;

  return (
          <div className="rounded-md border border-blue-200/65 bg-panel p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="inline-flex rounded-md border border-blue-200/65 bg-panel p-0.5" role="group" aria-label="Period type">
                  <button
                    type="button"
                    onClick={switchToMonth}
                    className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                      filterType === 'month' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('week')}
                    className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                      filterType === 'week' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Week
                  </button>
                  <button
                    type="button"
                    onClick={() => setRangeModalOpen(true)}
                    className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                      filterType === 'range' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Custom range
                  </button>
                </div>

                <div className="flex items-center rounded-md border border-blue-200/65 bg-panel">
                  <button
                    type="button"
                    onClick={filterType === 'week' ? handlePrevWeek : handlePrevMonth}
                    className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-l-md transition-colors"
                    aria-label="Previous period"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm text-slate-800">
                    <Calendar className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    <span className="truncate font-medium">{currentPeriodLabel}</span>
                  </div>
                  <button
                    type="button"
                    onClick={filterType === 'week' ? handleNextWeek : handleNextMonth}
                    className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-r-md transition-colors"
                    aria-label="Next period"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {filterType !== 'week' && (
                  <div className="flex gap-2">
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      aria-label="Year"
                    >
                      {Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i).map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      className="rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      aria-label="Month"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="relative w-full lg:max-w-xs">
                <label htmlFor="summary-employee-search" className="sr-only">
                  Search by employee name or code
                </label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                <input
                  id="summary-employee-search"
                  type="search"
                  placeholder="Search by employee name or code"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-md border border-blue-200/65 bg-panel py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 transition-colors"
              >
                <Download className="h-4 w-4 text-slate-500" />
                Export summary
              </button>
              {!hideDetailedExport && (
                <button
                  type="button"
                  onClick={handleDetailedExport}
                  className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <Download className="h-4 w-4 text-slate-500" />
                  Export detailed
                </button>
              )}
              <button
                type="button"
                onClick={handleDayWiseExport}
                disabled={selectedCount === 0}
                className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                title={selectedCount === 0 ? 'Select one or more rows first' : undefined}
              >
                <Download className="h-4 w-4 text-slate-500" />
                Day-wise (selected)
              </button>
              <button
                type="button"
                onClick={onBulkStatus}
                className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 transition-colors"
              >
                <ListChecks className="h-4 w-4 text-slate-500" />
                Bulk status
              </button>
              <button
                type="button"
                onClick={onOpenFilters}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  hasActiveFilters()
                    ? 'border-blue-500/50 bg-blue-50 text-blue-700 hover:bg-blue-100/80'
                    : 'border-blue-200/65 bg-panel text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Filter className="h-4 w-4 text-slate-500" />
                Filters
              </button>
            </div>
          </div>
  );
};
