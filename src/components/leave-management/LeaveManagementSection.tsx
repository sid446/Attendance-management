import React from 'react';
import { Calendar, TrendingUp, TrendingDown, AlertCircle, RefreshCw, Search, Upload, Download } from 'lucide-react';
import type { LeaveManagementSectionProps } from './types';
import { LEAVE_MANAGEMENT_WORKFLOW_STEPS } from './constants';
import { formatMonthLabel, formatLeaveValue, addMonthYear, clampMonthYear } from './utils';
import { UploadPreviewDialog, LeaveAdjLwpInput } from './components';
import { useLeaveManagementSectionLogic } from './hooks';

export const LeaveManagementSection: React.FC<LeaveManagementSectionProps> = ({
  isLoading,
  error,
  onRefresh
}) => {
  const {
    leaveBalances,
    loading,
    filterTeam,
    setFilterTeam,
    fromMonth,
    monthFilter,
    exporting,
    sortBy,
    setSortBy,
    searchTerm,
    setSearchTerm,
    activeTab,
    setActiveTab,
    fileInputRef,
    adjFileInputRef,
    uploadBusy,
    uploadError,
    uploadNotice,
    preview,
    savingAdjUserId,
    monthOptions,
    earliestMonth,
    latestMonth,
    periodLabel,
    applyPeriod,
    filteredAndSortedBalances,
    teams,
    totalStats,
    selectCls,
    handleRefresh,
    exportToExcel,
    handleFileSelected,
    handleAdjFileSelected,
    saveLeaveAdjLwp,
    applyUpload,
    cancelUpload,
  } = useLeaveManagementSectionLogic({ onRefresh });

  return (
    <section className="space-y-5 text-slate-900" aria-labelledby="leave-management-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h2 id="leave-management-heading" className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Calendar className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
            Leave management
          </h2>
          <p className="max-w-2xl text-sm text-slate-600">
            {activeTab === 'all' &&
              `Track earned, used, and remaining leave balances for ${periodLabel}.`}
            {activeTab === 'articles' &&
              'Article staff: opening balance and usage; no monthly earn after 1 Jan 2026 in this view.'}
            {activeTab === 'employees' &&
              `Regular employees: earned / used / remaining for ${periodLabel}.`}
          </p>
          <ol className="flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Leave management workflow">
            {LEAVE_MANAGEMENT_WORKFLOW_STEPS.map((t, i) => (
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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelected}
            className="hidden"
          />
          <input
            ref={adjFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleAdjFileSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
            disabled={uploadBusy || loading || isLoading}
            title='Excel with columns "Employee Name" and "Leaves B/F"'
          >
            <Upload className={`h-4 w-4 ${uploadBusy ? 'animate-pulse text-blue-600' : 'text-slate-600'}`} aria-hidden />
            {uploadBusy ? 'Working…' : 'Upload B/F'}
          </button>
          <button
            type="button"
            onClick={() => adjFileInputRef.current?.click()}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
            disabled={uploadBusy || loading || isLoading}
            title={`Excel with columns "Employee Name" and "Leave Adj/LWP" — applied as this month's change for ${formatMonthLabel(monthFilter)}`}
          >
            <Upload className={`h-4 w-4 ${uploadBusy ? 'animate-pulse text-blue-600' : 'text-slate-600'}`} aria-hidden />
            Upload Adj/LWP
          </button>
          <button
            type="button"
            onClick={() => void exportToExcel()}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
            disabled={exporting || loading || isLoading || filteredAndSortedBalances.length === 0}
            title={`Export filtered leave balances for ${periodLabel}`}
          >
            <Download className={`h-4 w-4 ${exporting ? 'animate-pulse text-blue-600' : 'text-slate-600'}`} aria-hidden />
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
            disabled={loading || isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${loading || isLoading ? 'animate-spin text-blue-600' : 'text-slate-600'}`} aria-hidden />
            Refresh
          </button>
        </div>
      </header>

      {uploadError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {uploadError}
        </div>
      )}
      {uploadNotice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          {uploadNotice}
        </div>
      )}

      {preview && <UploadPreviewDialog preview={preview} busy={uploadBusy} onApply={applyUpload} onCancel={cancelUpload} />}

      <div
        className="inline-flex flex-wrap gap-1 rounded-lg border border-blue-200/65 bg-panel p-0.5 shadow-sm"
        role="tablist"
        aria-label="Employee category"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          onClick={() => setActiveTab('all')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
            activeTab === 'all' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          All ({leaveBalances.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'articles'}
          onClick={() => setActiveTab('articles')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
            activeTab === 'articles' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          Articles ({leaveBalances.filter((b) => b.employmentType?.toLowerCase() === 'article').length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'employees'}
          onClick={() => setActiveTab('employees')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
            activeTab === 'employees' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          Regular ({leaveBalances.filter((b) => b.employmentType?.toLowerCase() !== 'article').length})
        </button>
      </div>

      <div
        className={`grid grid-cols-1 gap-3 ${activeTab === 'articles' ? 'sm:grid-cols-2 lg:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'}`}
      >
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-700" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Balance as of 1 Jan 26</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {formatLeaveValue(totalStats.totalBalanceAsOfJan26)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Opening balance</div>
        </div>

        {activeTab !== 'articles' && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-700" aria-hidden />
              <span className="text-sm font-medium text-slate-700">Earned through {formatMonthLabel(monthFilter)}</span>
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {formatLeaveValue(totalStats.totalEarned)}
            </div>
            <div className="mt-1 text-xs text-slate-500">From Jan 2026 through this month</div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-violet-700" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Adj this month</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {formatLeaveValue(totalStats.totalLeaveAdjLwpThisMonth)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Change in {formatMonthLabel(monthFilter)} (editable)</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-violet-700" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Adj till this month</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {formatLeaveValue(totalStats.totalLeaveAdjLwp)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Sum from Jan 2026 through {formatMonthLabel(monthFilter)} (not editable)</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-amber-800" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Used through {formatMonthLabel(monthFilter)}</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {formatLeaveValue(totalStats.totalUsedAfterJan26)}
          </div>
          <div className="mt-1 text-xs text-slate-500">From Jan 2026 through this month</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-sky-700" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Total remaining</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {formatLeaveValue(totalStats.totalRemaining)}
          </div>
          <div className="mt-1 text-xs text-slate-500">As of {formatMonthLabel(monthFilter)}</div>
        </div>
      </div>

      <div className="flex flex-col flex-wrap gap-3 rounded-xl border border-blue-200/65 bg-panel p-4 shadow-sm md:flex-row md:items-end">
        <div className="relative min-w-[200px] flex-1 md:max-w-xs">
          <label htmlFor="leave-management-search" className="sr-only">
            Search by name or employee code
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden
          />
          <input
            id="leave-management-search"
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full rounded-md border border-blue-200/65 bg-panel py-2 pl-10 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="leave-management-from" className="text-xs font-medium text-slate-600">
            From
          </label>
          <select
            id="leave-management-from"
            value={fromMonth}
            onChange={(e) => applyPeriod(e.target.value, monthFilter)}
            className={selectCls}
          >
            {monthOptions.map((my) => (
              <option key={my} value={my}>
                {formatMonthLabel(my)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="leave-management-to" className="text-xs font-medium text-slate-600">
            To
          </label>
          <select
            id="leave-management-to"
            value={monthFilter}
            onChange={(e) => applyPeriod(fromMonth, e.target.value)}
            className={selectCls}
          >
            {monthOptions.map((my) => (
              <option key={my} value={my}>
                {formatMonthLabel(my)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">Period</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => applyPeriod(latestMonth, latestMonth)}
              className={
                fromMonth === latestMonth && monthFilter === latestMonth
                  ? 'rounded-md bg-blue-600 px-2.5 py-2 text-xs font-medium text-white shadow-sm'
                  : 'rounded-md border border-blue-200/65 bg-panel px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50'
              }
            >
              This month
            </button>
            <button
              type="button"
              onClick={() => applyPeriod(addMonthYear(latestMonth, -2), latestMonth)}
              className={
                fromMonth === clampMonthYear(addMonthYear(latestMonth, -2), monthOptions) &&
                monthFilter === latestMonth
                  ? 'rounded-md bg-blue-600 px-2.5 py-2 text-xs font-medium text-white shadow-sm'
                  : 'rounded-md border border-blue-200/65 bg-panel px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50'
              }
            >
              Last 3 months
            </button>
            <button
              type="button"
              onClick={() => applyPeriod(earliestMonth, latestMonth)}
              className={
                fromMonth === earliestMonth && monthFilter === latestMonth
                  ? 'rounded-md bg-blue-600 px-2.5 py-2 text-xs font-medium text-white shadow-sm'
                  : 'rounded-md border border-blue-200/65 bg-panel px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50'
              }
            >
              YTD
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="leave-management-team" className="text-xs font-medium text-slate-600">
            Team
          </label>
          <select
            id="leave-management-team"
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            className={selectCls}
          >
            <option value="all">All teams</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="leave-management-sort" className="text-xs font-medium text-slate-600">
            Sort by
          </label>
          <select
            id="leave-management-sort"
            value={sortBy}
            onChange={(e) =>
              setSortBy(
                e.target.value as
                  | 'name'
                  | 'balanceAsOfJan26'
                  | 'earned'
                  | 'remaining'
                  | 'leaveAdjLwp'
                  | 'leaveAdjLwpThisMonth'
              )
            }
            className={selectCls}
          >
            <option value="name">Name</option>
            <option value="balanceAsOfJan26">Balance as of Jan 26</option>
            <option value="earned">Earned</option>
            <option value="remaining">Remaining</option>
            <option value="leaveAdjLwpThisMonth">Adj this month</option>
            <option value="leaveAdjLwp">Adj till this month</option>
          </select>
        </div>
      </div>

      <section
        className="overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-sm"
        aria-labelledby="leave-balances-table-heading"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 id="leave-balances-table-heading" className="text-sm font-semibold text-slate-900">
            Leave balances
          </h3>
          <p className="text-xs text-slate-600">
            Showing balances through {formatMonthLabel(monthFilter)}, not the latest overall total.
            Type Adj this month; Adj till this month is the running total through that month and cannot
            be edited. Totals above respect the current tab, team, and search.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Employee
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Type
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Team
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Balance 1 Jan 26
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Earned through month
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Adj this month
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Adj till this month
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Used through month
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Balance
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Last updated
                </th>
              </tr>
            </thead>
            <tbody>
              {loading || isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-600">
                    <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" aria-hidden />
                    <span role="status">Loading leave balances…</span>
                  </td>
                </tr>
              ) : filteredAndSortedBalances.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-600">
                    <AlertCircle className="mx-auto mb-2 h-6 w-6 text-slate-400" aria-hidden />
                    No leave balances match your filters.
                  </td>
                </tr>
              ) : (
                filteredAndSortedBalances.map((balance) => (
                  <tr key={balance.userId} className="border-b border-slate-200 transition-colors hover:bg-slate-50/90">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-slate-900">{balance.userName}</div>
                        {balance.employeeCode && <div className="text-xs text-slate-500">{balance.employeeCode}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${
                          balance.employmentType?.toLowerCase() === 'article'
                            ? 'border-violet-200 bg-violet-50 text-violet-900'
                            : 'border-blue-200 bg-blue-50 text-blue-900'
                        }`}
                      >
                        {balance.employmentType?.toLowerCase() === 'article' ? 'Article' : 'Employee'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{balance.team || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-blue-900">
                        {formatLeaveValue(balance.balanceAsOfJan26)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {balance.employmentType?.toLowerCase() === 'article' ? (
                        <span className="text-xs italic text-slate-500">N/A</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-emerald-900">
                          {formatLeaveValue(balance.earned)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <LeaveAdjLwpInput
                        key={`${balance.userId}-${monthFilter}`}
                        userId={balance.userId}
                        value={balance.leaveAdjLwpThisMonth ?? 0}
                        disabled={savingAdjUserId === balance.userId || uploadBusy}
                        onSave={saveLeaveAdjLwp}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-700"
                        title="Adj/LWP from Jan 2026 through the selected month"
                      >
                        {formatLeaveValue(balance.leaveAdjLwp ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-amber-950">
                        {formatLeaveValue(balance.usedAfterJan26 || 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums ${
                          balance.remaining > 0
                            ? 'border-sky-200 bg-sky-50 text-sky-900'
                            : 'border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                      >
                        {formatLeaveValue(balance.remaining)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{new Date(balance.lastUpdated).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      )}
    </section>
  );
};
