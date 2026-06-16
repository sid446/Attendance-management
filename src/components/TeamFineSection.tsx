'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  IndianRupee,
  Info,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import type { User } from '@/types/ui';

interface FineRecord {
  serialNo: string;
  date: string;
  consecutiveDay: number;
  fineAmount: number;
  isWarning: boolean;
  status: 'pending' | 'paid' | 'waived';
  penaltyImposedBy?: string;
  reason?: string;
  remark?: string;
  paymentDate?: string;
  paymentMode?: string;
}

interface Fine {
  _id: string;
  userId: {
    _id: string;
    name: string;
    odId: string;
    employeeCode?: string;
    category?: string;
  };
  monthYear: string;
  category: 'Staff' | 'Article';
  fineRecords: FineRecord[];
  totalFine: number;
  totalWarnings: number;
}

export interface TeamFineSectionProps {
  monthYear: string;
  teamMembers: User[];
}

export function TeamFineSection({ monthYear, teamMembers }: TeamFineSectionProps) {
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Staff' | 'Article'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'waived'>('all');

  const teamIdSet = useMemo(
    () => new Set(teamMembers.map((m) => String(m._id))),
    [teamMembers]
  );

  const fetchFines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/fines?monthYear=${encodeURIComponent(monthYear)}`);
      const data = await response.json();
      if (data.success) {
        setFines(Array.isArray(data.fines) ? data.fines : []);
      } else {
        setError(data.error || 'Failed to fetch fines');
      }
    } catch {
      setError('Failed to fetch fines');
    } finally {
      setLoading(false);
    }
  }, [monthYear]);

  useEffect(() => {
    if (teamMembers.length === 0) {
      setFines([]);
      return;
    }
    fetchFines();
  }, [teamMembers.length, fetchFines]);

  const teamFines = useMemo(() => {
    return fines.filter((fine) => {
      const uid = String(fine.userId?._id ?? '');
      return teamIdSet.has(uid);
    });
  }, [fines, teamIdSet]);

  const filteredFines = useMemo(() => {
    return teamFines.filter((fine) => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const code = (fine.userId?.employeeCode || fine.userId?.odId || '').toLowerCase();
        const matchName = fine.userId?.name?.toLowerCase().includes(search);
        const matchId = fine.userId?.odId?.toLowerCase().includes(search) || code.includes(search);
        if (!matchName && !matchId) return false;
      }
      if (categoryFilter !== 'all' && fine.category !== categoryFilter) return false;
      if (statusFilter !== 'all') {
        const hasMatchingStatus = fine.fineRecords.some((r) => r.status === statusFilter);
        if (!hasMatchingStatus) return false;
      }
      return true;
    });
  }, [teamFines, searchTerm, categoryFilter, statusFilter]);

  const totals = useMemo(() => {
    return filteredFines.reduce(
      (acc, fine) => ({
        totalFines: acc.totalFines + fine.totalFine,
        totalWarnings: acc.totalWarnings + fine.totalWarnings,
        employeesWithFines: acc.employeesWithFines + (fine.totalFine > 0 ? 1 : 0),
        employeesWithWarnings: acc.employeesWithWarnings + (fine.totalWarnings > 0 ? 1 : 0),
      }),
      { totalFines: 0, totalWarnings: 0, employeesWithFines: 0, employeesWithWarnings: 0 }
    );
  }, [filteredFines]);

  const toggleRow = (fineId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(fineId)) next.delete(fineId);
      else next.add(fineId);
      return next;
    });
  };

  const selectCls =
    'rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const inputCls =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const thBase = 'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

  if (teamMembers.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
        No team members to show fines for.
      </p>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="team-fines-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="team-fines-heading" className="text-base font-semibold text-foreground">
            Team fines
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Late-arrival fines and warnings for your direct reports ({monthYear}).
          </p>
        </div>
        <button
          type="button"
          onClick={fetchFines}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-surface/70 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3">
        <div className="flex items-start gap-2 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <p className="text-xs text-muted-foreground sm:text-sm">
            View only — fines are calculated and updated by HR. Staff: 2 late = warning, 3–7 = ₹50, 8+ = ₹100.
            Article: 2 late = warning, 3–7 = ₹25, 8+ = ₹50.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-1 flex items-center gap-1.5 text-amber-700">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Warnings</span>
          </div>
          <div className="text-xl font-bold tabular-nums">{totals.totalWarnings}</div>
          <div className="text-[10px] text-muted-foreground">{totals.employeesWithWarnings} employees</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-1 flex items-center gap-1.5 text-rose-700">
            <IndianRupee className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Total fines</span>
          </div>
          <div className="text-xl font-bold tabular-nums">₹{totals.totalFines}</div>
          <div className="text-[10px] text-muted-foreground">{totals.employeesWithFines} employees</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-1 flex items-center gap-1.5 text-blue-700">
            <Users className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Staff</span>
          </div>
          <div className="text-xl font-bold tabular-nums">
            ₹{teamFines.filter((f) => f.category === 'Staff').reduce((s, f) => s + f.totalFine, 0)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-1 flex items-center gap-1.5 text-violet-700">
            <Users className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Article</span>
          </div>
          <div className="text-xl font-bold tabular-nums">
            ₹{teamFines.filter((f) => f.category === 'Article').reduce((s, f) => s + f.totalFine, 0)}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            placeholder="Search name or ID…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`${inputCls} pl-9`}
            aria-label="Search team fines"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as 'all' | 'Staff' | 'Article')}
          className={selectCls}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          <option value="Staff">Staff</option>
          <option value="Article">Article</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'paid' | 'waived')}
          className={selectCls}
          aria-label="Filter by status"
        >
          <option value="all">All status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="waived">Waived</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" aria-hidden />
          Loading fines…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="border-b border-border bg-background/80">
              <tr>
                <th className={`${thBase} w-8`} scope="col">
                  <span className="sr-only">Expand</span>
                </th>
                <th className={`${thBase}`} scope="col">
                  Employee
                </th>
                <th className={`${thBase}`} scope="col">
                  Category
                </th>
                <th className={`${thBase} text-center`} scope="col">
                  Warnings
                </th>
                <th className={`${thBase} text-center`} scope="col">
                  Records
                </th>
                <th className={`${thBase} text-right`} scope="col">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/80">
              {filteredFines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {teamFines.length === 0
                      ? 'No fine records for your team this month.'
                      : 'No matching records.'}
                  </td>
                </tr>
              ) : (
                filteredFines.map((fine) => (
                  <React.Fragment key={fine._id}>
                    <tr
                      className="cursor-pointer transition-colors hover:bg-background/80"
                      onClick={() => toggleRow(fine._id)}
                    >
                      <td className="px-3 py-2.5">
                        {expandedRows.has(fine._id) ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground">{fine.userId?.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {fine.userId?.employeeCode || fine.userId?.odId}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            fine.category === 'Staff'
                              ? 'bg-blue-100 text-blue-900'
                              : 'bg-violet-100 text-violet-900'
                          }`}
                        >
                          {fine.category}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        {fine.totalWarnings > 0 ? (
                          <span className="font-medium text-amber-700">{fine.totalWarnings}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                        {fine.fineRecords.filter((r) => !r.isWarning).length}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-rose-700">
                        {fine.totalFine > 0 ? `₹${fine.totalFine}` : '₹0'}
                      </td>
                    </tr>
                    {expandedRows.has(fine._id) && (
                      <tr className="bg-background/50">
                        <td colSpan={6} className="px-3 py-3">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {fine.fineRecords.map((record, idx) => (
                              <div
                                key={idx}
                                className={`rounded-lg border p-2.5 text-xs ${
                                  record.isWarning
                                    ? 'border-amber-200 bg-amber-50/80'
                                    : 'border-rose-200 bg-rose-50/60'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="font-mono text-[10px] text-emerald-800">
                                      {record.serialNo || '—'}
                                    </div>
                                    <div className="font-medium text-foreground">
                                      {new Date(record.date + 'T12:00:00').toLocaleDateString('en-IN', {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                      })}
                                    </div>
                                  </div>
                                  {record.isWarning ? (
                                    <span className="font-medium text-amber-800">Warning</span>
                                  ) : (
                                    <span className="font-bold text-rose-700">₹{record.fineAmount}</span>
                                  )}
                                </div>
                                <div className="mt-1.5 space-y-0.5 text-muted-foreground">
                                  {record.reason && <div>Reason: {record.reason}</div>}
                                  {record.remark && <div>Remark: {record.remark}</div>}
                                </div>
                                <span
                                  className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    record.status === 'paid'
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : record.status === 'waived'
                                        ? 'bg-blue-100 text-blue-900'
                                        : 'bg-slate-100 text-slate-800'
                                  }`}
                                >
                                  {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
