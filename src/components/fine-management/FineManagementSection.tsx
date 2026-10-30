'use client';

import React from 'react';
import { RefreshCw, AlertTriangle, IndianRupee, Download, Check, X, ChevronDown, ChevronUp, Info, Users, AlertCircle, FileText, Search, Mail } from 'lucide-react';
import { getWorkingUnderPartnerForDate, lastDayOfMonthYear } from '@/lib/userFieldHistory';
import type { FineManagementProps } from './types';
import { FINE_MANAGEMENT_WORKFLOW_STEPS } from './constants';
import { useFineManagementSectionLogic } from './hooks';

export const FineManagementSection: React.FC<FineManagementProps> = ({
  selectedMonth = new Date().getMonth() + 1,
  selectedYear = new Date().getFullYear(),
}) => {
  const {
    fines,
    loading,
    calculating,
    error,
    expandedRows,
    showManualFineForm,
    setShowManualFineForm,
    manualFineEmployeeId,
    setManualFineEmployeeId,
    manualFineEmployeeQuery,
    setManualFineEmployeeQuery,
    showEmployeeSuggestions,
    setShowEmployeeSuggestions,
    employeePickerRef,
    manualFineReason,
    setManualFineReason,
    manualFineAmount,
    setManualFineAmount,
    manualFineRemark,
    setManualFineRemark,
    imposingFine,
    searchTerm,
    setSearchTerm,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    teamFilter,
    setTeamFilter,
    month,
    setMonth,
    year,
    setYear,
    selectedUserIds,
    emailBusy,
    emailingUserId,
    emailNotice,
    monthYear,
    calculateFines,
    updateFineStatus,
    manualFineEmployeeMatches,
    selectManualFineEmployee,
    imposeManualFine,
    toggleRow,
    getFineUserId,
    toggleSelectUser,
    filteredFines,
    filteredUserIds,
    allFilteredSelected,
    toggleSelectAllFiltered,
    emailFineNotices,
    totals,
    exportToExcel,
    generatePenaltySlip,
    generateAllPenaltySlips,
    selectCls,
    inputCls,
    thBase,
  } = useFineManagementSectionLogic({ selectedMonth, selectedYear });

  return (
    <section className="space-y-5 p-6 text-slate-900" aria-labelledby="fine-management-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 id="fine-management-heading" className="text-2xl font-bold tracking-tight text-slate-900">
            Fine management
          </h2>
          <p className="text-sm text-slate-600">
            Manage late arrival fines and warnings. Calculate adds new late days without removing paid, waived, or manual fines.
          </p>
          <ol className="flex flex-wrap gap-2" aria-label="Workflow">
            {FINE_MANAGEMENT_WORKFLOW_STEPS.map((label, i) => (
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
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="fine-month" className="sr-only">
              Month
            </label>
            <select
              id="fine-month"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className={selectCls}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
            <label htmlFor="fine-year" className="sr-only">
              Year
            </label>
            <select id="fine-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
              {Array.from({ length: 5 }, (_, i) => (
                <option key={2024 + i} value={2024 + i}>
                  {2024 + i}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={calculateFines}
            disabled={calculating}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
            title="Adds new late fines from attendance. Paid, waived, and manual fines are kept."
          >
            <RefreshCw className={`h-4 w-4 ${calculating ? 'animate-spin' : ''}`} aria-hidden />
            {calculating ? 'Calculating…' : 'Calculate fines'}
          </button>
          <button
            type="button"
            onClick={exportToExcel}
            disabled={filteredFines.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-slate-600" aria-hidden />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() =>
              void emailFineNotices([...selectedUserIds], 'selected employees')
            }
            disabled={emailBusy || selectedUserIds.size === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-900 shadow-sm transition-colors hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/25 disabled:opacity-50"
            title="Email pending fine notices to selected employees"
          >
            <Mail className={`h-4 w-4 ${emailBusy ? 'animate-pulse' : ''}`} aria-hidden />
            Email selected ({selectedUserIds.size})
          </button>
          <button
            type="button"
            onClick={() => void emailFineNotices(filteredUserIds, 'all filtered')}
            disabled={emailBusy || filteredUserIds.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:opacity-50"
            title="Email pending fine notices to all employees in the current filter"
          >
            <Mail className={`h-4 w-4 ${emailBusy ? 'animate-pulse' : ''}`} aria-hidden />
            Email all filtered ({filteredUserIds.length})
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-blue-200/65 bg-panel p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Impose manual fine</h3>
          <button
            type="button"
            onClick={() => setShowManualFineForm(!showManualFineForm)}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-expanded={showManualFineForm}
            aria-controls="manual-fine-panel"
          >
            {showManualFineForm ? (
              <ChevronUp className="h-5 w-5" aria-hidden />
            ) : (
              <ChevronDown className="h-5 w-5" aria-hidden />
            )}
            <span className="sr-only">{showManualFineForm ? 'Collapse' : 'Expand'} manual fine form</span>
          </button>
        </div>
        {showManualFineForm && (
          <div id="manual-fine-panel" className="space-y-4">
            <div ref={employeePickerRef} className="relative">
              <label htmlFor="manual-fine-employee" className="mb-1 block text-sm font-medium text-slate-700">
                Search employee
              </label>
              <input
                id="manual-fine-employee"
                type="text"
                placeholder="Search by name or ID…"
                value={manualFineEmployeeQuery}
                onChange={(e) => {
                  setManualFineEmployeeQuery(e.target.value);
                  setManualFineEmployeeId('');
                  setShowEmployeeSuggestions(true);
                }}
                onFocus={() => setShowEmployeeSuggestions(true)}
                className={inputCls}
                autoComplete="off"
                role="combobox"
                aria-expanded={showEmployeeSuggestions}
                aria-controls="employee-suggestions"
                aria-autocomplete="list"
              />
              {showEmployeeSuggestions && (
                <ul
                  id="employee-suggestions"
                  role="listbox"
                  className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                >
                  {manualFineEmployeeMatches.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-slate-500">No employees found</li>
                  ) : (
                    manualFineEmployeeMatches.map((employee) => (
                      <li key={employee._id} role="option" aria-selected={manualFineEmployeeId === employee._id}>
                        <button
                          type="button"
                          onClick={() => selectManualFineEmployee(employee)}
                          className={`flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50 ${
                            manualFineEmployeeId === employee._id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <span className="text-sm font-medium text-slate-900">{employee.name}</span>
                          {employee.odId ? (
                            <span className="text-xs text-slate-500">{employee.odId}</span>
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="manual-fine-reason" className="mb-1 block text-sm font-medium text-slate-700">
                  Reason <span className="text-rose-600">*</span>
                </label>
                <input
                  id="manual-fine-reason"
                  type="text"
                  placeholder="Enter reason for fine"
                  value={manualFineReason}
                  onChange={(e) => setManualFineReason(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="manual-fine-amount" className="mb-1 block text-sm font-medium text-slate-700">
                  Fine amount (₹) <span className="text-rose-600">*</span>
                </label>
                <input
                  id="manual-fine-amount"
                  type="number"
                  placeholder="Enter amount"
                  value={manualFineAmount}
                  onChange={(e) => setManualFineAmount(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label htmlFor="manual-fine-remark" className="mb-1 block text-sm font-medium text-slate-700">
                Remark (optional)
              </label>
              <textarea
                id="manual-fine-remark"
                placeholder="Additional remarks"
                value={manualFineRemark}
                onChange={(e) => setManualFineRemark(e.target.value)}
                className={inputCls}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowManualFineForm(false)}
                className="rounded-lg border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={imposeManualFine}
                disabled={imposingFine}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:opacity-50"
              >
                {imposingFine ? 'Imposing…' : 'Impose fine'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
          <div className="text-sm text-slate-800">
            <h3 className="mb-2 font-semibold text-slate-900">Fine rules (late attendance)</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <span className="font-medium text-slate-900">Employee</span>
                <ul className="ml-2 mt-1 list-inside list-disc space-y-0.5 text-slate-700">
                  <li>2 late in a month: Warning</li>
                  <li>3–7 late in a month: ₹50 fine</li>
                  <li>8 or more late in a month: ₹100 fine</li>
                </ul>
              </div>
              <div>
                <span className="font-medium text-slate-900">Article</span>
                <ul className="ml-2 mt-1 list-inside list-disc space-y-0.5 text-slate-700">
                  <li>2 late in a month: Warning</li>
                  <li>3–7 late in a month: ₹25 fine</li>
                  <li>8 or more late in a month: ₹50 fine</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium text-slate-800">Total warnings</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{totals.totalWarnings}</div>
          <div className="text-xs text-slate-600">{totals.employeesWithWarnings} employees</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-rose-700">
            <IndianRupee className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium text-slate-800">Total fines</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">₹{totals.totalFines}</div>
          <div className="text-xs text-slate-600">{totals.employeesWithFines} employees</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-blue-700">
            <Users className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium text-slate-800">Staff fines</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            ₹{fines.filter((f) => f.category === 'Staff').reduce((s, f) => s + f.totalFine, 0)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-violet-700">
            <Users className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium text-slate-800">Article fines</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            ₹{fines.filter((f) => f.category === 'Article').reduce((s, f) => s + f.totalFine, 0)}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-blue-200/65 bg-panel p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <label htmlFor="fine-search" className="sr-only">
            Search by name or ID
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id="fine-search"
            type="text"
            placeholder="Search by name or ID…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`${inputCls} pl-9`}
          />
        </div>
        <label htmlFor="fine-category-filter" className="sr-only">
          Category
        </label>
        <select
          id="fine-category-filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as 'all' | 'Staff' | 'Article')}
          className={`${selectCls} min-w-[10rem]`}
        >
          <option value="all">All categories</option>
          <option value="Staff">Staff</option>
          <option value="Article">Article</option>
        </select>
        <label htmlFor="fine-team-filter" className="sr-only">
          Team
        </label>
        <select
          id="fine-team-filter"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className={`${selectCls} min-w-[10rem]`}
        >
          <option value="all">All teams</option>
          {Array.from(
            new Set(
              fines
                .map((f) =>
                  f.userId
                    ? getWorkingUnderPartnerForDate(
                        f.userId,
                        lastDayOfMonthYear(f.monthYear || monthYear)
                      )
                    : ''
                )
                .filter(Boolean)
            )
          ).map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
        </select>
        <label htmlFor="fine-status-filter" className="sr-only">
          Status
        </label>
        <select
          id="fine-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'paid' | 'waived')}
          className={`${selectCls} min-w-[10rem]`}
        >
          <option value="all">All status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="waived">Waived</option>
        </select>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 shadow-sm"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {emailNotice && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm"
        >
          <Mail className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
          <span>{emailNotice}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12" aria-live="polite">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
          <span className="sr-only">Loading fines</span>
        </div>
      )}

      {!loading && (
        <div className="overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-sm">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={`${thBase} w-10 text-center`} scope="col">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    disabled={filteredUserIds.length === 0 || emailBusy}
                    aria-label="Select all filtered employees"
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                  />
                </th>
                <th className={`${thBase} w-8 text-left`} scope="col">
                  <span className="sr-only">Expand</span>
                </th>
                <th className={`${thBase} text-left`} scope="col">
                  Employee
                </th>
                <th className={`${thBase} text-left`} scope="col">
                  Category
                </th>
                <th className={`${thBase} text-left`} scope="col">
                  Team
                </th>
                <th className={`${thBase} text-center`} scope="col">
                  Warnings
                </th>
                <th className={`${thBase} text-center`} scope="col">
                  Fine records
                </th>
                <th className={`${thBase} text-right`} scope="col">
                  Total fine
                </th>
                <th className={`${thBase} text-center`} scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFines.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-600">
                    {fines.length === 0
                      ? 'No fine records found. Click “Calculate fines” to generate.'
                      : 'No matching records found.'}
                  </td>
                </tr>
              ) : (
                filteredFines.map((fine) => {
                  const userId = getFineUserId(fine);
                  const pendingCount = fine.fineRecords.filter((r) => r.status === 'pending').length;
                  const rowEmailing = emailBusy && emailingUserId === userId;
                  return (
                  <React.Fragment key={fine._id}>
                    <tr
                      className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                        expandedRows.has(fine._id) ? 'bg-slate-50/80' : ''
                      }`}
                      onClick={() => toggleRow(fine._id)}
                    >
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={userId ? selectedUserIds.has(userId) : false}
                          onChange={() => toggleSelectUser(userId)}
                          disabled={!userId || emailBusy}
                          aria-label={`Select ${fine.userId?.name || 'employee'}`}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {expandedRows.has(fine._id) ? (
                          <ChevronUp className="h-4 w-4 text-slate-500" aria-hidden />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{fine.userId?.name}</div>
                        <div className="text-xs text-slate-600">{fine.userId?.odId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            fine.category === 'Staff'
                              ? 'border border-blue-200 bg-blue-50 text-blue-900'
                              : 'border border-violet-200 bg-violet-50 text-violet-900'
                          }`}
                        >
                          {fine.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {fine.userId
                          ? getWorkingUnderPartnerForDate(
                              fine.userId,
                              lastDayOfMonthYear(fine.monthYear || monthYear)
                            ) || '—'
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {fine.totalWarnings > 0 && (
                          <span className="font-medium text-amber-700">{fine.totalWarnings}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {fine.fineRecords.filter((r) => !r.isWarning).length}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {fine.totalFine > 0 ? (
                          <span className="font-bold text-rose-700">₹{fine.totalFine}</span>
                        ) : (
                          <span className="text-slate-500">₹0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex flex-wrap items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => void emailFineNotices([userId], fine.userId?.name || 'employee')}
                            disabled={!userId || emailBusy || pendingCount === 0}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-900 transition-colors hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/25 disabled:opacity-50"
                            title={
                              pendingCount === 0
                                ? 'No pending fines/warnings to email'
                                : 'Email pending fine notice to this employee'
                            }
                          >
                            <Mail className={`h-3 w-3 ${rowEmailing ? 'animate-pulse' : ''}`} aria-hidden />
                            {rowEmailing ? 'Sending…' : 'Email'}
                          </button>
                          {fine.fineRecords.filter((r) => !r.isWarning).length > 0 && (
                            <button
                              type="button"
                              onClick={() => generateAllPenaltySlips(fine)}
                              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-900 transition-colors hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                              title="Generate all penalty slips"
                            >
                              <FileText className="h-3 w-3" aria-hidden />
                              Slips
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expandedRows.has(fine._id) && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="border-t border-slate-100 px-4 py-4">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {fine.fineRecords.map((record, idx) => (
                              <div
                                key={idx}
                                className={`rounded-lg border p-3 shadow-sm ${
                                  record.isWarning
                                    ? 'border-amber-200 bg-amber-50/80'
                                    : 'border-rose-200 bg-rose-50/60'
                                }`}
                              >
                                <div className="mb-2 flex items-start justify-between">
                                  <div>
                                    <div className="mb-1 font-mono text-xs text-emerald-700">{record.serialNo}</div>
                                    <div className="font-medium text-slate-900">
                                      {new Date(record.date).toLocaleDateString('en-IN', {
                                        weekday: 'short',
                                        day: 'numeric',
                                        month: 'short',
                                      })}
                                    </div>
                                    <div className="text-xs text-slate-600">Consecutive day: {record.consecutiveDay}</div>
                                  </div>
                                  <div className="text-right">
                                    {record.isWarning ? (
                                      <span className="flex items-center gap-1 font-medium text-amber-800">
                                        <AlertTriangle className="h-4 w-4" aria-hidden /> Warning
                                      </span>
                                    ) : (
                                      <span className="font-bold text-rose-700">₹{record.fineAmount}</span>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-2 space-y-1 text-xs text-slate-700">
                                  {record.reason && (
                                    <div>
                                      <span className="font-medium text-slate-600">Reason:</span> {record.reason}
                                    </div>
                                  )}
                                  {record.vertical && (
                                    <div>
                                      <span className="font-medium text-slate-600">Vertical:</span> {record.vertical}
                                    </div>
                                  )}
                                  {record.penaltyImposedBy && (
                                    <div>
                                      <span className="font-medium text-slate-600">Imposed by:</span>{' '}
                                      {record.penaltyImposedBy}
                                    </div>
                                  )}
                                  {record.remark && (
                                    <div>
                                      <span className="font-medium text-slate-600">Remark:</span> {record.remark}
                                    </div>
                                  )}
                                  {record.paymentDate && (
                                    <div>
                                      <span className="font-medium text-slate-600">Payment:</span> {record.paymentDate}{' '}
                                      ({record.paymentMode || 'N/A'})
                                    </div>
                                  )}
                                </div>

                                <div className="mt-2 flex items-center justify-between">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                      record.status === 'pending'
                                        ? 'border border-blue-200/65 bg-panel text-slate-800'
                                        : record.status === 'paid'
                                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                                          : 'border border-blue-200 bg-blue-50 text-blue-900'
                                    }`}
                                  >
                                    {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                                  </span>

                                  <div className="flex gap-1">
                                    {!record.isWarning && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          generatePenaltySlip(fine, record);
                                        }}
                                        className="rounded-md border border-violet-200 bg-panel p-1 text-violet-800 transition-colors hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                                        title="Generate penalty slip"
                                      >
                                        <FileText className="h-3 w-3" aria-hidden />
                                      </button>
                                    )}

                                    {!record.isWarning && record.status === 'pending' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateFineStatus(fine._id, record.date, 'paid');
                                          }}
                                          className="rounded-md border border-emerald-200 bg-panel p-1 text-emerald-800 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                                          title="Mark as paid"
                                        >
                                          <Check className="h-3 w-3" aria-hidden />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateFineStatus(fine._id, record.date, 'waived');
                                          }}
                                          className="rounded-md border border-blue-200 bg-panel p-1 text-blue-800 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                          title="Waive fine"
                                        >
                                          <X className="h-3 w-3" aria-hidden />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default FineManagementSection;
