'use client';

import React from 'react';
import { RefreshCw, Download, Mail, Search, IndianRupee, Lock, Unlock, ChevronDown, ChevronUp, Users, AlertCircle, AlertTriangle, Calendar, Plus, Trash2 } from 'lucide-react';
import { formatMonthLabel, inr, PAYROLL_BULK_BUILTIN_FIELDS, PAYROLL_BULK_BUILTIN_LABELS, isPayrollLineFrozen, type PayrollExtraKind, type PayrollGroup } from '@/lib/salaryCalculation';
import { formatHoursMinutes } from '@/lib/attendanceSummaryMetrics';
import type { IssuePanelKind } from './types';
import { WORKFLOW, GROUPS, GROUP_LABEL } from './constants';
import { uid, payrollExcessHours, formatIssueDate, invalidIssueLabel } from './utils';
import { OverrideForm } from './components';
import { useSalarySectionLogic } from './hooks';

export const SalarySection: React.FC = () => {
  const {
    now,
    month,
    setMonth,
    year,
    setYear,
    doc,
    loading,
    generating,
    error,
    notice,
    search,
    setSearch,
    groupFilter,
    setGroupFilter,
    selected,
    expanded,
    setExpanded,
    savingId,
    emailBusy,
    slipBusy,
    draftOverrides,
    setDraftOverrides,
    extraLabel,
    setExtraLabel,
    extraKind,
    setExtraKind,
    bulkField,
    setBulkField,
    bulkAmount,
    setBulkAmount,
    bulkScope,
    setBulkScope,
    bulkDesignation,
    setBulkDesignation,
    extrasBusy,
    freezeBusy,
    invalidByUser,
    emptyByUser,
    issuePanel,
    setIssuePanel,
    monthYear,
    finalized,
    generate,
    lines,
    extraFields,
    designations,
    filtered,
    draftPreview,
    draftUnsaved,
    stats,
    toggleSelect,
    selectFiltered,
    saveLineOverrides,
    saveOverrides,
    addExtraField,
    removeExtraField,
    applyBulkExtra,
    setStatus,
    setLineFreeze,
    exportExcel,
    downloadPayslip,
    emailPayslips,
    selectCls,
    inputCls,
    grouped,
  } = useSalarySectionLogic();

  return (
    <section className="space-y-5 p-6 text-slate-900" aria-labelledby="salary-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 id="salary-heading" className="text-2xl font-bold tracking-tight text-slate-900">
            Salary
          </h2>
          <p className="text-sm text-slate-600">
            Monthly payroll from attendance, leave, and the employee master. For non-articles, Summary excess hours
            convert to overtime days; they are added to pay only after you approve them. Articles get no overtime.
          </p>
          <ol className="flex flex-wrap gap-2" aria-label="Workflow">
            {WORKFLOW.map((label, i) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <select id="salary-month" value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          <select id="salary-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
            {Array.from({ length: 6 }, (_, i) => {
              const y = now.getFullYear() - 2 + i;
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating || finalized}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating…' : 'Generate'}
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={!doc}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export Excel
          </button>
          {finalized ? (
            <button
              type="button"
              onClick={() => void setStatus('reopen')}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900"
            >
              <Unlock className="h-4 w-4" />
              Re-open
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void setStatus('finalize')}
              disabled={!doc}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
            >
              <Lock className="h-4 w-4" />
              Finalize
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[
          { label: 'People', value: String(stats.headcount), icon: Users },
          { label: 'Gross payable', value: inr(stats.payable), icon: IndianRupee, preview: draftUnsaved },
          { label: 'Bank payment', value: inr(stats.bank), icon: IndianRupee, preview: draftUnsaved },
          { label: 'Cash off', value: inr(stats.cash), icon: IndianRupee, preview: draftUnsaved },
          { label: 'Unsent slips', value: String(stats.unsent), icon: Mail },
          { label: 'Frozen', value: String(stats.frozen), icon: Lock },
          { label: 'Invalid / missed', value: String(stats.withInvalid), icon: AlertTriangle, warn: stats.withInvalid > 0 },
          { label: 'No entry', value: String(stats.withEmpty), icon: Calendar, empty: stats.withEmpty > 0 },
        ].map((c) => {
          const warn = 'warn' in c && c.warn;
          const empty = 'empty' in c && c.empty;
          const preview = 'preview' in c && c.preview;
          return (
          <div
            key={c.label}
            className={`rounded-xl border p-4 shadow-sm ${
              warn
                ? 'border-amber-300 bg-amber-50'
                : empty
                  ? 'border-rose-300 bg-rose-50'
                  : preview
                    ? 'border-amber-200 bg-amber-50/60'
                    : 'border-blue-200/65 bg-panel'
            }`}
          >
            <p className={`text-xs font-medium uppercase tracking-wide ${warn ? 'text-amber-800' : empty ? 'text-rose-800' : 'text-slate-500'}`}>
              {c.label}
              {preview ? <span className="ml-1 font-normal normal-case text-amber-800">· not saved</span> : null}
            </p>
            <p className={`mt-1 text-lg font-semibold ${warn ? 'text-amber-900' : empty ? 'text-rose-900' : 'text-slate-900'}`}>
              {c.value}
            </p>
          </div>
          );
        })}
      </div>

      {doc?.calendar && (
        <p className="text-xs text-slate-500">
          Calendar: {doc.calendar.totalDays} days · {doc.calendar.sundays} Sundays · {doc.calendar.ohd} OHD · office
          working {Math.max(0, doc.calendar.totalDays - doc.calendar.sundays - doc.calendar.ohd)}
          {finalized ? ' · Finalized' : ' · Draft'}
          {stats.frozen > 0 ? ` · ${stats.frozen} employee${stats.frozen === 1 ? '' : 's'} frozen` : ''}
          {stats.withInvalid > 0
            ? ` · ${stats.withInvalid} with invalid / missed entry dates`
            : ''}
          {stats.withEmpty > 0 ? ` · ${stats.withEmpty} with empty dates (no entry)` : ''}
        </p>
      )}

      {doc && (
        <div className="grid gap-4 rounded-xl border border-blue-200/65 bg-panel p-4 shadow-sm lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Edit extras</h3>
            <p className="text-xs text-slate-500">
              Add a named extra. It appears on every employee. Earnings increase bank payment; deductions reduce it.
              Built-in TDS, ESI employee, advances, and laptop adjustment are already deductions.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[12rem] flex-1 text-xs text-slate-600">
                Name
                <input
                  className={`${inputCls} mt-1`}
                  disabled={finalized || extrasBusy}
                  placeholder="e.g. Senior Software Engineer allowance"
                  value={extraLabel}
                  onChange={(e) => setExtraLabel(e.target.value)}
                />
              </label>
              <label className="text-xs text-slate-600">
                Type
                <select
                  className={`${selectCls} mt-1`}
                  disabled={finalized || extrasBusy}
                  value={extraKind}
                  onChange={(e) => setExtraKind(e.target.value as PayrollExtraKind)}
                >
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </select>
              </label>
              <button
                type="button"
                disabled={finalized || extrasBusy}
                onClick={() => void addExtraField()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add for everyone
              </button>
            </div>
            {extraFields.length === 0 ? (
              <p className="text-xs text-slate-500">No custom extras this month. Built-in TDS, advances, ESI still apply.</p>
            ) : (
              <ul className="space-y-1">
                {extraFields.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    <span>
                      {f.label}{' '}
                      <span className="text-slate-400">({f.kind})</span>
                    </span>
                    <button
                      type="button"
                      disabled={finalized || extrasBusy}
                      onClick={() => void removeExtraField(f)}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove extra
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {extraFields.length > 0 && (
              <p className="text-xs text-slate-500">
                Open any employee (chevron on the right) to type an amount, or use Apply to people.
              </p>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Apply to people</h3>
            <p className="text-xs text-slate-500">
              Set or clear the same amount on all employees, the selected rows, or one designation.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-600">
                Field
                <select
                  className={`${selectCls} mt-1 w-full`}
                  disabled={finalized || extrasBusy}
                  value={bulkField}
                  onChange={(e) => setBulkField(e.target.value)}
                >
                  {PAYROLL_BULK_BUILTIN_FIELDS.map((key) => (
                    <option key={key} value={key}>
                      {PAYROLL_BULK_BUILTIN_LABELS[key]}
                    </option>
                  ))}
                  {extraFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Amount
                <input
                  type="number"
                  step="0.01"
                  className={`${inputCls} mt-1`}
                  disabled={finalized || extrasBusy}
                  value={bulkAmount}
                  onChange={(e) => setBulkAmount(e.target.value)}
                />
              </label>
              <label className="text-xs text-slate-600">
                Apply to
                <select
                  className={`${selectCls} mt-1 w-full`}
                  disabled={finalized || extrasBusy}
                  value={bulkScope}
                  onChange={(e) => setBulkScope(e.target.value as 'all' | 'selected' | 'designation')}
                >
                  <option value="all">All employees</option>
                  <option value="selected">Selected rows ({selected.size})</option>
                  <option value="designation">One designation</option>
                </select>
              </label>
              {bulkScope === 'designation' && (
                <label className="text-xs text-slate-600">
                  Designation
                  <select
                    className={`${selectCls} mt-1 w-full`}
                    disabled={finalized || extrasBusy}
                    value={bulkDesignation}
                    onChange={(e) => setBulkDesignation(e.target.value)}
                  >
                    <option value="">Pick designation</option>
                    {designations.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={finalized || extrasBusy || !doc}
                onClick={() => void applyBulkExtra(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {extrasBusy ? 'Working…' : 'Apply amount'}
              </button>
              <button
                type="button"
                disabled={finalized || extrasBusy || !doc || !bulkField}
                onClick={() => void applyBulkExtra(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-900 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Remove amount
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Search name, team, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value as 'all' | PayrollGroup)} className={selectCls}>
          <option value="all">All groups</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {GROUP_LABEL[g]}
            </option>
          ))}
        </select>
        <button type="button" onClick={selectFiltered} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          Select filtered
        </button>
        <button
          type="button"
          onClick={() => void emailPayslips([...selected], 'selected employees')}
          disabled={emailBusy || selected.size === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900 disabled:opacity-50"
        >
          <Mail className="h-4 w-4" />
          Email selected ({selected.size})
        </button>
        <button
          type="button"
          onClick={() => void emailPayslips(filtered.map(uid), 'all filtered')}
          disabled={emailBusy || filtered.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Mail className="h-4 w-4" />
          Email filtered ({filtered.length})
        </button>
        <button
          type="button"
          onClick={() =>
            void setLineFreeze(
              [...selected].filter((id) => !lines.find((l) => uid(l) === id)?.frozen),
              'finalize',
              `${selected.size} selected`
            )
          }
          disabled={finalized || freezeBusy !== null || selected.size === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
        >
          <Lock className="h-4 w-4" />
          Freeze selected
        </button>
        <button
          type="button"
          onClick={() =>
            void setLineFreeze(
              [...selected].filter((id) => Boolean(lines.find((l) => uid(l) === id)?.frozen)),
              'reopen',
              'selected frozen employees'
            )
          }
          disabled={finalized || freezeBusy !== null || selected.size === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 disabled:opacity-50"
        >
          <Unlock className="h-4 w-4" />
          Unfreeze selected
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {!loading && !doc && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          No payroll for {formatMonthLabel(monthYear)} yet. Click Generate.
        </p>
      )}

      {grouped.map(({ group, rows }) => (
        <div key={group} className="overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
            {GROUP_LABEL[group]} ({rows.length})
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Working</th>
                  <th className="px-3 py-2">Net days</th>
                  <th className="px-3 py-2">Basic</th>
                  <th className="px-3 py-2">Payable</th>
                  <th className="px-3 py-2">Bank</th>
                  <th className="px-3 py-2">Diff</th>
                  <th className="px-3 py-2">Slip</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((line) => {
                  const id = uid(line);
                  const open = expanded === id;
                  const unsavedRow = open && draftUnsaved;
                  const checkWarn = Math.abs(Number(line.checking || 0)) > 0.05;
                  const lineLocked = isPayrollLineFrozen(line, doc?.status);
                  const invalidDays = invalidByUser.get(id) || [];
                  const emptyIssue = emptyByUser.get(id);
                  const emptyDates = emptyIssue?.dates || [];
                  const hasInvalid = invalidDays.length > 0;
                  const hasEmpty = emptyDates.length > 0;
                  const invalidOpen = issuePanel?.id === id && issuePanel.kind === 'invalid';
                  const emptyOpen = issuePanel?.id === id && issuePanel.kind === 'empty';
                  const toggleIssue = (kind: IssuePanelKind) => {
                    setIssuePanel((prev) =>
                      prev?.id === id && prev.kind === kind ? null : { id, kind }
                    );
                  };
                  return (
                    <React.Fragment key={id}>
                      <tr
                        className={`border-b ${
                          hasInvalid
                            ? 'border-amber-200 bg-amber-50 hover:bg-amber-100/80'
                            : hasEmpty
                              ? 'border-rose-200 bg-rose-50 hover:bg-rose-100/80'
                              : `border-slate-100 hover:bg-slate-50/80 ${line.frozen ? 'bg-slate-50' : ''}`
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(id)} onChange={() => toggleSelect(id)} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-slate-900">{line.name}</span>
                            {line.frozen ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                <Lock className="h-2.5 w-2.5" />
                                Frozen
                              </span>
                            ) : null}
                            {hasInvalid ? (
                              <button
                                type="button"
                                title="Show invalid / missed-entry dates"
                                onClick={() => toggleIssue('invalid')}
                                aria-expanded={invalidOpen}
                                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${
                                  invalidOpen ? 'bg-amber-800' : 'bg-amber-600 hover:bg-amber-700'
                                }`}
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {invalidDays.length} invalid
                              </button>
                            ) : null}
                            {hasEmpty ? (
                              <button
                                type="button"
                                title="Show dates with no attendance entry"
                                onClick={() => toggleIssue('empty')}
                                aria-expanded={emptyOpen}
                                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${
                                  emptyOpen ? 'bg-rose-800' : 'bg-rose-600 hover:bg-rose-700'
                                }`}
                              >
                                <Calendar className="h-2.5 w-2.5" />
                                {emptyDates.length} no entry
                              </button>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-500">
                            {line.designation || line.category} · {line.verticalHead || line.team || '—'}
                            {line.isNewJoin ? ' · New join' : ''}
                            {line.isArticle && line.articleshipYear ? ` · Year ${line.articleshipYear}` : ''}
                            {(() => {
                              if (line.isArticle) return '';
                              const excess = payrollExcessHours(line);
                              const suggested = Number(line.overtimeSuggested || 0);
                              const inPay = Number(line.overtimeDays || 0);
                              if (inPay > 0) {
                                return ` · OT ${inPay}d in pay (${formatHoursMinutes(excess)} excess)`;
                              }
                              if (suggested > 0 || excess > 0) {
                                return ` · ${formatHoursMinutes(excess)} excess → ${suggested}d OT (not in pay)`;
                              }
                              return '';
                            })()}
                          </div>
                        </td>
                        <td className="px-3 py-2">{line.weekdaysWorking}</td>
                        <td className={`px-3 py-2 ${open && unsavedRow ? 'font-medium text-amber-900' : ''}`}>
                          {line.netWorkingDays}
                        </td>
                        <td className="px-3 py-2">{inr(line.basic)}</td>
                        <td className={`px-3 py-2 font-medium ${open && unsavedRow ? 'text-amber-900' : ''}`}>
                          {inr(line.payableMonth)}
                        </td>
                        <td className={`px-3 py-2 ${open && unsavedRow ? 'font-medium text-amber-900' : ''}`}>
                          {inr(line.bankPayment)}
                        </td>
                        <td className={`px-3 py-2 ${Math.abs(line.diff) > 0.5 ? 'text-rose-700' : 'text-slate-500'}`}>
                          {line.diff}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {line.payslipSentAt ? 'Sent' : '—'}
                          {checkWarn ? <span className="ml-1 text-amber-700">check</span> : null}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title="Download the payslip that is emailed"
                              disabled={slipBusy !== null}
                              onClick={() => void downloadPayslip(id, line.name)}
                              className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Download className={`h-4 w-4 ${slipBusy === id ? 'animate-pulse' : ''}`} />
                            </button>
                            <button
                              type="button"
                              title={line.frozen ? 'Unfreeze this employee' : 'Freeze this employee'}
                              disabled={finalized || freezeBusy !== null}
                              onClick={() =>
                                void setLineFreeze(
                                  [id],
                                  line.frozen ? 'reopen' : 'finalize',
                                  line.name
                                )
                              }
                              className={`rounded-md border p-1 disabled:opacity-50 ${
                                line.frozen
                                  ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {line.frozen ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setExpanded(open ? null : id);
                                setDraftOverrides({
                                  ...(line.overrides || {}),
                                  customAmounts: { ...(line.overrides?.customAmounts || {}) },
                                });
                              }}
                              className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                            >
                              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {(invalidOpen || emptyOpen) && (
                        <tr className={invalidOpen ? 'bg-amber-50/90' : 'bg-rose-50/90'}>
                          <td colSpan={10} className="px-4 py-3">
                            {invalidOpen ? (
                              <div>
                                <p className="mb-2 text-xs font-semibold text-amber-900">
                                  Invalid / missed-entry days for {line.name}
                                </p>
                                <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                  {invalidDays.map((day) => (
                                    <li
                                      key={day.date}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs"
                                    >
                                      <span className="font-medium text-slate-900">
                                        {formatIssueDate(day.date)}
                                        <span className="ml-1.5 font-mono text-slate-500">{day.date}</span>
                                      </span>
                                      <span className="text-slate-600">
                                        In:{' '}
                                        <span
                                          className={
                                            day.issue === 'missing-checkin' ? 'font-semibold text-rose-700' : ''
                                          }
                                        >
                                          {day.checkin || '—'}
                                        </span>
                                        {' / '}
                                        Out:{' '}
                                        <span
                                          className={
                                            day.issue === 'missing-checkout' ? 'font-semibold text-rose-700' : ''
                                          }
                                        >
                                          {day.checkout || '—'}
                                        </span>
                                      </span>
                                      <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900">
                                        {invalidIssueLabel(day.issue)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <div>
                                <p className="mb-2 text-xs font-semibold text-rose-900">
                                  Empty dates (no entry) for {line.name}
                                  {emptyIssue?.wholeMonthMissing ? ' · whole month missing' : ''}
                                </p>
                                <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                  {emptyDates.map((date) => (
                                    <li
                                      key={date}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                                    >
                                      <span className="font-medium text-slate-900">
                                        {formatIssueDate(date)}
                                        <span className="ml-1.5 font-mono text-slate-500">{date}</span>
                                      </span>
                                      <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-medium text-rose-900">
                                        No entry
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      {open && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={10} className="px-4 py-4">
                            {line.frozen ? (
                              <p className="mb-3 text-xs text-amber-800">
                                This employee is frozen. Unfreeze to edit numbers. Generate and bulk extras skip them.
                              </p>
                            ) : null}
                            {hasInvalid ? (
                              <p className="mb-3 text-xs text-amber-800">
                                {invalidDays.length} invalid or missed-entry day{invalidDays.length === 1 ? '' : 's'} this
                                month. Tap the Invalid badge to see each date.
                              </p>
                            ) : null}
                            {hasEmpty ? (
                              <p className="mb-3 text-xs text-rose-800">
                                {emptyDates.length} empty date{emptyDates.length === 1 ? '' : 's'} with no attendance
                                entry. Tap the No entry badge to see each date.
                              </p>
                            ) : null}
                            <OverrideForm
                              line={line}
                              extraFields={extraFields}
                              draft={draftOverrides}
                              setDraft={setDraftOverrides}
                              preview={uid(line) === expanded ? draftPreview : null}
                              unsaved={uid(line) === expanded && draftUnsaved}
                              disabled={lineLocked}
                              saving={savingId === id}
                              onSave={() => void saveOverrides(line)}
                              onApproveOvertime={() =>
                                void saveLineOverrides(
                                  line,
                                  { ...draftOverrides, overtimeDays: Number(line.overtimeSuggested || 0) },
                                  `Overtime added to pay for ${line.name}.`
                                )
                              }
                              onRemoveOvertime={() =>
                                void saveLineOverrides(
                                  line,
                                  { ...draftOverrides, overtimeDays: null },
                                  `Overtime removed from pay for ${line.name}.`
                                )
                              }
                              inputCls={inputCls}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
};
