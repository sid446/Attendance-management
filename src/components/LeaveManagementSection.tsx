import React, { useState, useEffect } from 'react';
import { Calendar, Users, TrendingUp, TrendingDown, AlertCircle, RefreshCw, Search } from 'lucide-react';

interface LeaveBalance {
  userId: string;
  userName: string;
  employeeCode?: string;
  team?: string;
  employmentType?: string;
  balanceAsOfJan26: number;
  earned: number;
  used: number; // Leaves taken before 1st Jan 2026
  usedAfterJan26: number; // Leaves taken on or after 1st Jan 2026
  remaining: number;
  lastUpdated: Date;
  monthlyEarned: number;
}

interface LeaveManagementSectionProps {
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const LEAVE_MANAGEMENT_WORKFLOW_STEPS = ['Pick tab & filters', 'Review balances', 'Refresh from server'] as const;

export const LeaveManagementSection: React.FC<LeaveManagementSectionProps> = ({
  isLoading,
  error,
  onRefresh
}) => {
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'balanceAsOfJan26' | 'earned' | 'remaining' | 'used'>('earned');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'articles' | 'employees'>('all');

  const fetchLeaveBalances = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/leave/balances');
      if (!response.ok) {
        throw new Error('Failed to fetch leave balances');
      }
      const data = await response.json();
      if (data.success) {
        setLeaveBalances(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch leave balances');
      }
    } catch (err) {
      console.error('Error fetching leave balances:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaveBalances();
  }, []);

  const filteredAndSortedBalances = leaveBalances
    .filter(balance => {
      const matchesTab = activeTab === 'all' || 
        (activeTab === 'articles' && balance.employmentType?.toLowerCase() === 'article') ||
        (activeTab === 'employees' && balance.employmentType?.toLowerCase() !== 'article');
      
      const matchesTeam = filterTeam === 'all' || balance.team === filterTeam;
      
      const matchesSearch = balance.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (balance.employeeCode && balance.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()));
      
      return matchesTab && matchesTeam && matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'balanceAsOfJan26':
          return b.balanceAsOfJan26 - a.balanceAsOfJan26;
        case 'earned':
          return b.earned - a.earned;
        case 'remaining':
          return b.remaining - a.remaining;
        case 'used':
          return b.used - a.used;
        case 'name':
        default:
          return a.userName.localeCompare(b.userName);
      }
    });

  const teams = Array.from(new Set(leaveBalances.map(b => b.team).filter(Boolean)));

  const totalStats = filteredAndSortedBalances.reduce(
    (acc, balance) => ({
      totalBalanceAsOfJan26: acc.totalBalanceAsOfJan26 + balance.balanceAsOfJan26,
      totalEarned: acc.totalEarned + balance.earned,
      totalUsed: acc.totalUsed + balance.used,
      totalUsedAfterJan26: acc.totalUsedAfterJan26 + (balance.usedAfterJan26 || 0),
      totalRemaining: acc.totalRemaining + balance.remaining,
    }),
    { totalBalanceAsOfJan26: 0, totalEarned: 0, totalUsed: 0, totalUsedAfterJan26: 0, totalRemaining: 0 }
  );

  const selectCls =
    'rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  const handleRefresh = () => {
    void fetchLeaveBalances();
    onRefresh();
  };

  return (
    <section className="space-y-5 text-slate-900" aria-labelledby="leave-management-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h2 id="leave-management-heading" className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Calendar className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
            Leave management
          </h2>
          <p className="max-w-2xl text-sm text-slate-600">
            {activeTab === 'all' && 'Track earned, used, and remaining leave balances for everyone in view.'}
            {activeTab === 'articles' &&
              'Article staff: opening balance and usage; no monthly earn after 1 Jan 2026 in this view.'}
            {activeTab === 'employees' && 'Regular employees: full earned / used / remaining picture.'}
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
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
          disabled={loading || isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${loading || isLoading ? 'animate-spin text-blue-600' : 'text-slate-600'}`} aria-hidden />
          Refresh
        </button>
      </header>

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
        className={`grid grid-cols-1 gap-3 ${activeTab === 'articles' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-5'}`}
      >
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-700" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Balance as of 1 Jan 26</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">{totalStats.totalBalanceAsOfJan26}</div>
          <div className="mt-1 text-xs text-slate-500">Opening balance</div>
        </div>

        {activeTab !== 'articles' && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-700" aria-hidden />
              <span className="text-sm font-medium text-slate-700">Earned (after Jan)</span>
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{totalStats.totalEarned}</div>
            <div className="mt-1 text-xs text-slate-500">Earned after 1 Jan 2026</div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-rose-700" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Used (before 1 Jan)</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">{totalStats.totalUsed}</div>
          <div className="mt-1 text-xs text-slate-500">Leave before 1 Jan 2026</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-amber-800" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Used (after 1 Jan)</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">{totalStats.totalUsedAfterJan26}</div>
          <div className="mt-1 text-xs text-slate-500">Leave on/after 1 Jan 2026</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-sky-700" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Total remaining</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">{totalStats.totalRemaining}</div>
          <div className="mt-1 text-xs text-slate-500">Available leave balance</div>
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
            onChange={(e) => setSortBy(e.target.value as 'name' | 'balanceAsOfJan26' | 'earned' | 'remaining' | 'used')}
            className={selectCls}
          >
            <option value="name">Name</option>
            <option value="balanceAsOfJan26">Balance as of Jan 26</option>
            <option value="earned">Earned</option>
            <option value="remaining">Remaining</option>
            <option value="used">Used (before Jan)</option>
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
          <p className="text-xs text-slate-600">Totals above respect the current tab, team, and search.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
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
                  Earned (after Jan)
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Used (before 1 Jan)
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Used (after 1 Jan)
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
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-600">
                    <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" aria-hidden />
                    <span role="status">Loading leave balances…</span>
                  </td>
                </tr>
              ) : filteredAndSortedBalances.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-600">
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
                        {balance.balanceAsOfJan26}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {balance.employmentType?.toLowerCase() === 'article' ? (
                        <span className="text-xs italic text-slate-500">N/A</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-emerald-900">
                          {balance.earned}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-rose-900">
                        {balance.used}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-amber-950">
                        {balance.usedAfterJan26 || 0}
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
                        {balance.remaining}
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