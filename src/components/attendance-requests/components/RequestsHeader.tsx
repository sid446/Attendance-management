'use client';

import React, { RefObject } from 'react';
import { Download, LayoutGrid, Table, Upload } from 'lucide-react';
import { REQUESTS_WORKFLOW_STEPS, SELECT_INPUT_CLASS } from '../constants';
import type { AttendanceRequest, RequestStatusFilter } from '../types';

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
  statusFilter: RequestStatusFilter;
  onStatusFilterChange: (value: RequestStatusFilter) => void;
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
  statusFilter,
  onStatusFilterChange,
  onExport,
  excelUploading,
  uploadInputRef,
  onExcelUpload,
}) => (
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
        <ol className="mt-3 flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Requests workflow">
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

      <div className="flex flex-wrap items-center gap-2">
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
        <select
          value={monthFilter}
          onChange={(e) => onMonthFilterChange(e.target.value)}
          className={SELECT_INPUT_CLASS}
          aria-label="Filter by month"
        >
          <option value="all">All Months</option>
          {Array.from(new Set(requests.map((r) => r.monthYear)))
            .sort()
            .reverse()
            .map((monthYear) => {
              const [year, month] = monthYear.split('-');
              const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', {
                month: 'long',
              });
              return (
                <option key={monthYear} value={monthYear}>
                  {monthName} {year}
                </option>
              );
            })}
        </select>
        <select
          value={leaveTypeFilter}
          onChange={(e) => onLeaveTypeFilterChange(e.target.value)}
          className={SELECT_INPUT_CLASS}
          aria-label="Filter by request type"
        >
          <option value="all">All Leave Types</option>
          {Array.from(new Set(requests.map((r) => r.requestedStatus)))
            .sort()
            .map((leaveType) => (
              <option key={leaveType} value={leaveType}>
                {leaveType}
              </option>
            ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as RequestStatusFilter)}
          className={SELECT_INPUT_CLASS}
          aria-label="Filter by status"
        >
          <option value="all">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
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
  </header>
);
