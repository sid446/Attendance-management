'use client';

import React, { RefObject, useMemo } from 'react';
import { Download, LayoutGrid, Search, Table, Upload, X } from 'lucide-react';
import { REQUESTS_WORKFLOW_STEPS, SELECT_INPUT_CLASS } from '../constants';
import type { AttendanceRequest, RequestSortOption, RequestStatusFilter } from '../types';
import { REQUEST_SORT_OPTIONS } from '../utils/requestSorting';

export interface RequestsHeaderProps {
  isEmployeeView?: boolean;
  isAdminView?: boolean;
  requests: AttendanceRequest[];
  viewMode: 'cards' | 'table';
  onViewModeChange: (mode: 'cards' | 'table') => void;
  monthFilter: string;
  onMonthFilterChange: (value: string) => void;
  leaveTypeFilter: string;
  onLeaveTypeFilterChange: (value: string) => void;
  partnerFilter: string;
  onPartnerFilterChange: (value: string) => void;
  uniquePartners: string[];
  statusFilter: RequestStatusFilter;
  onStatusFilterChange: (value: RequestStatusFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  sortBy: RequestSortOption;
  onSortByChange: (value: RequestSortOption) => void;
  filteredCount: number;
  totalRowCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onExport: () => void;
  excelUploading: boolean;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  onExcelUpload: (file: File) => void;
}

export const RequestsHeader: React.FC<RequestsHeaderProps> = ({
  isEmployeeView = false,
  isAdminView = false,
  requests,
  viewMode,
  onViewModeChange,
  monthFilter,
  onMonthFilterChange,
  leaveTypeFilter,
  onLeaveTypeFilterChange,
  partnerFilter,
  onPartnerFilterChange,
  uniquePartners,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchQueryChange,
  sortBy,
  onSortByChange,
  filteredCount,
  totalRowCount,
  hasActiveFilters,
  onClearFilters,
  onExport,
  excelUploading,
  uploadInputRef,
  onExcelUpload,
}) => {
  const statusCounts = useMemo(() => {
    let approved = 0;
    let pending = 0;
    for (const req of requests) {
      if (req.status === 'Approved') approved += 1;
      else if (req.status === 'Pending' || req.status === 'PendingHr') pending += 1;
    }
    return {
      raised: requests.length,
      approved,
      pending,
    };
  }, [requests]);

  return (
    <header className="mb-5 space-y-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 id="attendance-requests-heading" className="text-xl font-semibold text-slate-900">
            {isEmployeeView ? 'My attendance requests' : 'Attendance requests'}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {isEmployeeView
              ? 'Track the status of your attendance correction requests.'
              : 'Review and manage employee attendance correction requests.'}
          </p>
          <ol
            className="mt-3 flex list-none flex-wrap gap-2 text-xs text-slate-700"
            aria-label="Requests workflow"
          >
            {REQUESTS_WORKFLOW_STEPS.map((t, i) => (
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

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div
            className="flex flex-wrap items-center justify-end gap-2"
            role="status"
            aria-label="Request status summary"
          >
            <div className="min-w-[5.5rem] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center shadow-sm">
              <div className="text-lg font-bold tabular-nums text-slate-900">{statusCounts.raised}</div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Raised
              </div>
            </div>
            <div className="min-w-[5.5rem] rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center shadow-sm">
              <div className="text-lg font-bold tabular-nums text-emerald-800">
                {statusCounts.approved}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-700/80">
                Approved
              </div>
            </div>
            <div className="min-w-[5.5rem] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center shadow-sm">
              <div className="text-lg font-bold tabular-nums text-amber-900">
                {statusCounts.pending}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-amber-800/80">
                Pending
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="sr-only">View layout</span>
            <div
              className="inline-flex rounded-md border border-blue-200/65 bg-panel p-0.5 shadow-sm"
              role="group"
              aria-label="View layout"
            >
              <button
                type="button"
                onClick={() => onViewModeChange('cards')}
                className={`rounded-md p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                  viewMode === 'cards'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('table')}
                className={`rounded-md p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Table view"
              >
                <Table className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={onExport}
              className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              title="Export to Excel"
            >
              <Download className="h-4 w-4 text-slate-500" aria-hidden />
              Export Excel
            </button>
            {isAdminView && (
              <>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onExcelUpload(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={excelUploading}
                  className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                  title="Upload partner decision Excel and apply actions"
                >
                  <Upload className="h-4 w-4 text-slate-500" aria-hidden />
                  {excelUploading ? 'Uploading…' : 'Upload Excel'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder={
                isEmployeeView
                  ? 'Search by date, status, type, reason…'
                  : 'Search employee, partner, date, status, reason, email…'
              }
              className="w-full rounded-md border border-blue-200/65 bg-panel py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              aria-label="Search requests"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={monthFilter}
              onChange={(e) => onMonthFilterChange(e.target.value)}
              className={SELECT_INPUT_CLASS}
              aria-label="Filter by month"
            >
              <option value="all">All months</option>
              {Array.from(new Set(requests.map((r) => r.monthYear)))
                .sort()
                .reverse()
                .map((monthYear) => {
                  const [year, month] = monthYear.split('-');
                  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString(
                    'default',
                    {
                      month: 'long',
                    }
                  );
                  return (
                    <option key={monthYear} value={monthYear}>
                      {monthName} {year}
                    </option>
                  );
                })}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as RequestStatusFilter)}
              className={SELECT_INPUT_CLASS}
              aria-label="Filter by status"
            >
              <option value="all">All status</option>
              <option value="Pending">Pending / HR review</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
            <select
              value={leaveTypeFilter}
              onChange={(e) => onLeaveTypeFilterChange(e.target.value)}
              className={SELECT_INPUT_CLASS}
              aria-label="Filter by request type"
            >
              <option value="all">All request types</option>
              {Array.from(new Set(requests.map((r) => r.requestedStatus)))
                .sort()
                .map((leaveType) => (
                  <option key={leaveType} value={leaveType}>
                    {leaveType}
                  </option>
                ))}
            </select>
            {!isEmployeeView && uniquePartners.length > 1 && (
              <select
                value={partnerFilter}
                onChange={(e) => onPartnerFilterChange(e.target.value)}
                className={SELECT_INPUT_CLASS}
                aria-label="Filter by partner"
              >
                <option value="all">All partners</option>
                {uniquePartners.map((partner) => (
                  <option key={partner} value={partner}>
                    {partner}
                  </option>
                ))}
              </select>
            )}
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value as RequestSortOption)}
              className={SELECT_INPUT_CLASS}
              aria-label="Sort requests"
            >
              {REQUEST_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Sort: {option.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-600 lg:text-right">
            Showing <span className="font-semibold text-slate-900">{filteredCount}</span> of{' '}
            <span className="font-semibold text-slate-900">{totalRowCount}</span> request
            {totalRowCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>
    </header>
  );
};
