import React, { useState, useEffect } from 'react';
import { Calendar, Users, TrendingUp, TrendingDown, AlertCircle, RefreshCw, Search } from 'lucide-react';

interface LeaveBalance {
  userId: string;
  userName: string;
  employeeCode?: string;
  team?: string;
  earned: number;
  used: number;
  remaining: number;
  lastUpdated: Date;
  monthlyEarned: number;
}

interface LeaveManagementSectionProps {
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const LeaveManagementSection: React.FC<LeaveManagementSectionProps> = ({
  isLoading,
  error,
  onRefresh
}) => {
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'remaining' | 'earned' | 'used'>('earned');
  const [searchTerm, setSearchTerm] = useState<string>('');

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
    .filter(balance => 
      (filterTeam === 'all' || balance.team === filterTeam) &&
      (balance.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
       (balance.employeeCode && balance.employeeCode.toLowerCase().includes(searchTerm.toLowerCase())))
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'remaining':
          return b.remaining - a.remaining;
        case 'earned':
          return b.earned - a.earned;
        case 'used':
          return b.used - a.used;
        case 'name':
        default:
          return a.userName.localeCompare(b.userName);
      }
    });

  const teams = Array.from(new Set(leaveBalances.map(b => b.team).filter(Boolean)));

  const totalStats = leaveBalances.reduce(
    (acc, balance) => ({
      totalEarned: acc.totalEarned + balance.earned,
      totalUsed: acc.totalUsed + balance.used,
      totalRemaining: acc.totalRemaining + balance.remaining,
    }),
    { totalEarned: 0, totalUsed: 0, totalRemaining: 0 }
  );

  return (
    <div className="flex-1 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            Leave Management
          </h2>
          <p className="text-sm text-slate-400 mt-1">Track earned, used, and remaining leave balances for all employees</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchLeaveBalances}
            className="px-4 py-2 bg-slate-700 text-slate-300 font-medium rounded-md hover:bg-slate-600 transition-colors flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium text-slate-300">Total Earned</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">{totalStats.totalEarned}</div>
          <div className="text-xs text-slate-500 mt-1">Across all employees</div>
        </div>

        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-rose-400" />
            <span className="text-sm font-medium text-slate-300">Total Used</span>
          </div>
          <div className="text-2xl font-bold text-rose-400">{totalStats.totalUsed}</div>
          <div className="text-xs text-slate-500 mt-1">Leave days taken</div>
        </div>

        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-5 h-5 text-sky-400" />
            <span className="text-sm font-medium text-slate-300">Total Remaining</span>
          </div>
          <div className="text-2xl font-bold text-sky-400">{totalStats.totalRemaining}</div>
          <div className="text-xs text-slate-500 mt-1">Available leave balance</div>
        </div>
      </div>

      {/* Filters and Sort */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or code"
            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-md text-slate-100 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-300">Team:</label>
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-md text-slate-100 text-sm"
          >
            <option value="all">All Teams</option>
            {teams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-300">Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-md text-slate-100 text-sm"
          >
            <option value="name">Name</option>
            <option value="remaining">Remaining</option>
            <option value="earned">Earned</option>
            <option value="used">Used</option>
          </select>
        </div>
      </div>

      {/* Leave Balances Table */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Team</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">Earned</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">Used</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">Remaining</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">Monthly Rate</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading leave balances...
                  </td>
                </tr>
              ) : filteredAndSortedBalances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                    No leave balances found
                  </td>
                </tr>
              ) : (
                filteredAndSortedBalances.map((balance) => (
                  <tr key={balance.userId} className="hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-slate-100">{balance.userName}</div>
                        {balance.employeeCode && (
                          <div className="text-xs text-slate-400">{balance.employeeCode}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{balance.team || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {balance.earned}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        {balance.used}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        balance.remaining > 0
                          ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                          : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {balance.remaining}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-slate-300">{balance.monthlyEarned}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {new Date(balance.lastUpdated).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}
    </div>
  );
};