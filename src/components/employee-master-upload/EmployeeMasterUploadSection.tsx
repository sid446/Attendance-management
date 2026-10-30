import React from 'react';
import { Upload, FileSpreadsheet, Users, Download } from 'lucide-react';
import { UploadErrorLogPanel } from '@/components/upload-error-log-panel';
import type { EmployeeMasterUploadSectionProps } from './types';
import { BASIC_MASTER_WORKFLOW_STEPS, EXCLUDED_COLUMNS, SCHEDULE_UPLOAD_WORKFLOW_STEPS } from './constants';
import { useEmployeeMasterUploadSectionLogic } from './hooks';

export const EmployeeMasterUploadSection: React.FC<EmployeeMasterUploadSectionProps> = ({ onRefreshUsers }) => {
  const {
    mode,
    setMode,
    deactivateMissing,
    setDeactivateMissing,
    effectiveFrom,
    setEffectiveFrom,
    scheduleEffectiveFrom,
    setScheduleEffectiveFrom,
    isUploading,
    isScheduleUploading,
    error,
    scheduleError,
    stats,
    scheduleStats,
    masterGroupedErrors,
    scheduleGroupedErrors,
    handleDownloadMasterFormat,
    handleDownloadScheduleFormat,
    handleUpload,
    handleScheduleUpload,
  } = useEmployeeMasterUploadSectionLogic({ onRefreshUsers });

  return (
    <section
      className="rounded-md border border-blue-200/65 bg-panel p-5 shadow-sm sm:p-6"
      aria-labelledby="employee-master-upload-heading"
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <header className="min-w-0 flex-1 space-y-2">
          <h2 id="employee-master-upload-heading" className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            Employee master upload
          </h2>
          <p className="max-w-2xl text-sm text-slate-600">
            Bulk update or add rows from one spreadsheet. Leave-only and some schedule columns are not read here—see the
            excluded list and use the schedule section below for timings.
          </p>
          <ol className="flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Basic master upload workflow">
            {BASIC_MASTER_WORKFLOW_STEPS.map((t, i) => (
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
        </header>
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <FileSpreadsheet className="h-4 w-4 text-blue-600" aria-hidden />
          <span>.xlsx / .xls</span>
        </div>
      </div>

      <fieldset className="mb-5 border-0 p-0">
        <legend className="mb-2 text-xs font-medium text-slate-600">Upload mode</legend>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-800">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="basic-master-mode"
              checked={mode === 'update'}
              onChange={() => setMode('update')}
              className="border-slate-300 text-blue-600 focus:ring-blue-500/40"
            />
            Update existing rows
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="basic-master-mode"
              checked={mode === 'add'}
              onChange={() => setMode('add')}
              className="border-slate-300 text-blue-600 focus:ring-blue-500/40"
            />
            Add new entries only
          </label>
        </div>
      </fieldset>

      <div className="mb-5">
        <label htmlFor="basic-master-effective-from" className="mb-2 block text-xs font-medium text-slate-600">
          Effective from (for dated fields)
        </label>
        <input
          id="basic-master-effective-from"
          type="date"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          className="w-full max-w-xs rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <p className="mt-1 text-[11px] text-slate-600">Defaults to today; change before upload if you need a back-dated effective date.</p>
      </div>

      {mode === 'update' && (
        <div className="mb-5 rounded-md border border-amber-200/80 bg-amber-50/50 px-4 py-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={deactivateMissing}
              onChange={(e) => setDeactivateMissing(e.target.checked)}
              className="mt-0.5 border-slate-300 text-blue-600 focus:ring-blue-500/40"
            />
            <span>
              <span className="font-medium">Mark missing employees inactive</span>
              <span className="mt-1 block text-xs text-slate-600">
                Active employees not in this file are set inactive with inactive date = effective from above
                (left or no longer on master). Rows in the file reactivate previously inactive employees.
              </span>
            </span>
          </label>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40">
          <span className="flex items-center gap-2 text-sm text-slate-700">
            <Upload className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
            <span>Choose employee master Excel</span>
          </span>
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" disabled={isUploading} />
        </label>
        <button
          type="button"
          onClick={handleDownloadMasterFormat}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200/65 bg-panel px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <Download className="h-4 w-4 text-blue-600" aria-hidden />
          Download master format
        </button>
      </div>

      <div className="mb-5 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <div className="mb-1 font-medium text-slate-800">Columns ignored in this basic upload</div>
        <p className="leading-relaxed">{EXCLUDED_COLUMNS.join(', ')}</p>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      )}

      {stats && (
        <div
          className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
          role="status"
          aria-live="polite"
        >
          <div className="font-semibold">Upload complete ({stats.mode})</div>
          <div className="mt-1">
            Updated: {stats.updated || 0}, Created: {stats.created || 0}, Failed: {stats.failed || 0}
            {(stats.reactivated > 0 || stats.deactivated > 0) && (
              <>
                {', '}
                Reactivated: {stats.reactivated || 0}, Deactivated: {stats.deactivated || 0}
              </>
            )}
          </div>
          <div className="mt-1">Effective from: {stats.effectiveFrom || effectiveFrom}</div>
          {Array.isArray(stats.deactivatedNames) && stats.deactivatedNames.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-slate-700">Marked inactive (not in file):</div>
              <ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto text-xs text-slate-800">
                {stats.deactivatedNames.map((name: string, idx: number) => (
                  <li key={idx}>{name}</li>
                ))}
              </ul>
              {stats.deactivated > stats.deactivatedNames.length && (
                <p className="mt-1 text-xs text-slate-600">
                  …and {stats.deactivated - stats.deactivatedNames.length} more
                </p>
              )}
            </div>
          )}
          {stats.failed > 0 && (
            <p className="mt-2 text-xs text-red-800">See error details in the log section below.</p>
          )}
        </div>
      )}

      <UploadErrorLogPanel
        groupedErrors={masterGroupedErrors}
        logType="employee-master"
        sectionTitle="Master upload history & logs"
        currentErrorsLabel="Current master upload errors"
        exportFilePrefix="Employee_Master_Upload"
      />

      <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-[11px] text-slate-700">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" aria-hidden />
        <span>
          Partner and salary-style fields keep an effective-date history when saved from{' '}
          <span className="font-medium">Employees</span>.
        </span>
      </div>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <h3 className="mb-1 text-base font-semibold text-slate-900">Schedule bulk upload</h3>
        <p className="mb-3 max-w-2xl text-sm text-slate-600">
          Second file: rows with Name, optional Employee Code, Sch-In / Sch-Out, or Monday–Sunday
          cells such as <span className="font-mono text-slate-800">10:00 - 17:00</span>.
        </p>
        <ol className="mb-5 flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Schedule upload workflow">
          {SCHEDULE_UPLOAD_WORKFLOW_STEPS.map((t, i) => (
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

        <div className="mb-4">
          <label htmlFor="schedule-effective-from" className="mb-2 block text-xs font-medium text-slate-600">
            Schedule effective from
          </label>
          <input
            id="schedule-effective-from"
            type="date"
            value={scheduleEffectiveFrom}
            onChange={(e) => setScheduleEffectiveFrom(e.target.value)}
            className="w-full max-w-xs rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40">
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <Upload className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              <span>Choose schedule Excel</span>
            </span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleScheduleUpload}
              className="hidden"
              disabled={isScheduleUploading}
            />
          </label>
          <button
            type="button"
            onClick={handleDownloadScheduleFormat}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200/65 bg-panel px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <Download className="h-4 w-4 text-blue-600" aria-hidden />
            Download schedule format
          </button>
        </div>

        {scheduleError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
            {scheduleError}
          </div>
        )}

        {scheduleStats && (
          <div
            className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            role="status"
            aria-live="polite"
          >
            <div className="font-semibold">Schedule upload complete</div>
            <div className="mt-1">
              Updated: {scheduleStats.updated || 0}, Failed: {scheduleStats.failed || 0}
            </div>
            <div className="mt-1">Effective from: {scheduleStats.effectiveFrom || scheduleEffectiveFrom}</div>
            {scheduleStats.failed > 0 && (
              <p className="mt-2 text-xs text-red-800">See error details in the log section below.</p>
            )}
          </div>
        )}

        <UploadErrorLogPanel
          groupedErrors={scheduleGroupedErrors}
          logType="employee-schedule"
          sectionTitle="Schedule upload history & logs"
          currentErrorsLabel="Current schedule upload errors"
          exportFilePrefix="Employee_Schedule_Upload"
        />
      </div>
    </section>
  );
};
