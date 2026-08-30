'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  IndianRupee,
  Info,
  RefreshCw,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { employeeCredentialsInit } from '@/lib/employeeCredentialsInit';
import { EmployeeSummaryMonthPicker } from '@/components/EmployeeSummaryMonthPicker';

export interface FineRecord {
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
  vertical?: string;
}

export interface EmployeeFineDoc {
  _id: string;
  monthYear: string;
  category: 'Staff' | 'Article';
  fineRecords: FineRecord[];
  totalFine: number;
  totalWarnings: number;
}

function formatRecordDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusClass(status: FineRecord['status']): string {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-900';
  if (status === 'waived') return 'bg-blue-100 text-blue-900';
  return 'bg-slate-100 text-slate-800';
}

function paymentModeLabel(mode?: string): string {
  if (!mode) return '';
  return mode.replace(/_/g, ' ');
}

async function fetchOwnFine(monthYear: string): Promise<EmployeeFineDoc | null> {
  const response = await fetch(
    `/api/employee/fines?monthYear=${encodeURIComponent(monthYear)}`,
    employeeCredentialsInit({ cache: 'no-store' })
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Failed to fetch fines (${response.status})`);
  }
  return data.fine ?? null;
}

function recordTotals(fine: EmployeeFineDoc | null) {
  const records = fine?.fineRecords ?? [];
  const pendingAmount = records
    .filter((r) => !r.isWarning && r.status === 'pending')
    .reduce((s, r) => s + (r.fineAmount || 0), 0);
  const paidAmount = records
    .filter((r) => !r.isWarning && r.status === 'paid')
    .reduce((s, r) => s + (r.fineAmount || 0), 0);
  const waivedAmount = records
    .filter((r) => !r.isWarning && r.status === 'waived')
    .reduce((s, r) => s + (r.fineAmount || 0), 0);
  return {
    totalFine: fine?.totalFine ?? 0,
    totalWarnings: fine?.totalWarnings ?? 0,
    recordCount: records.length,
    pendingAmount,
    paidAmount,
    waivedAmount,
  };
}

export interface EmployeeFineSummaryCardProps {
  monthYear: string;
  onViewDetails: () => void;
}

/** Compact dashboard card: this month's totals + link to full detail. */
export function EmployeeFineSummaryCard({ monthYear, onViewDetails }: EmployeeFineSummaryCardProps) {
  const [fine, setFine] = useState<EmployeeFineDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchOwnFine(monthYear)
      .then((doc) => {
        if (!cancelled) setFine(doc);
      })
      .catch(() => {
        if (!cancelled) setFine(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthYear]);

  const totals = recordTotals(fine);

  return (
    <button
      type="button"
      onClick={onViewDetails}
      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left transition hover:border-rose-300/60 hover:bg-rose-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
      aria-label="View your fine details"
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        My fines
      </p>
      {loading ? (
        <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm font-semibold text-foreground">
          <span className="inline-flex items-center gap-1">
            <IndianRupee className="h-4 w-4 text-rose-700" aria-hidden />
            ₹{totals.totalFine}
          </span>
          <span className="inline-flex items-center gap-1 font-sans text-xs font-medium text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {totals.totalWarnings} warning{totals.totalWarnings === 1 ? '' : 's'}
          </span>
          {totals.pendingAmount > 0 && (
            <span className="font-sans text-xs font-medium text-rose-800">
              ₹{totals.pendingAmount} pending
            </span>
          )}
        </p>
      )}
      <p className="mt-1 text-[10px] font-medium text-rose-800">Tap for details</p>
    </button>
  );
}

export interface EmployeeFineSectionProps {
  monthYear: string;
  onMonthYearChange: (monthYear: string) => void;
  userCategory?: string;
}

export function EmployeeFineSection({
  monthYear,
  onMonthYearChange,
  userCategory,
}: EmployeeFineSectionProps) {
  const [fine, setFine] = useState<EmployeeFineDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'waived'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const doc = await fetchOwnFine(monthYear);
      setFine(doc);
    } catch (err) {
      setFine(null);
      setError(err instanceof Error ? err.message : 'Failed to fetch fines');
    } finally {
      setLoading(false);
    }
  }, [monthYear]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => recordTotals(fine), [fine]);

  const filteredRecords = useMemo(() => {
    const records = fine?.fineRecords ?? [];
    if (statusFilter === 'all') return records;
    return records.filter((r) => r.status === statusFilter);
  }, [fine, statusFilter]);

  const category = fine?.category || (userCategory === 'Article' ? 'Article' : 'Staff');
  const selectCls =
    'rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  return (
    <section className="space-y-4" aria-labelledby="my-fines-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="my-fines-heading" className="text-base font-semibold text-foreground sm:text-lg">
            My fines
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Late-arrival fines and warnings for {monthYear}. View only — HR calculates and updates these.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-surface/70 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </button>
      </div>

      <EmployeeSummaryMonthPicker
        monthYear={monthYear}
        onMonthYearChange={onMonthYearChange}
        disabled={loading}
        label="Fine month"
      />

      <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3">
        <div className="flex items-start gap-2 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <div className="text-xs text-muted-foreground sm:text-sm">
            <p className="font-medium text-foreground">
              Fine rules ({category === 'Article' ? 'Article' : 'Employee'})
            </p>
            {category === 'Article' ? (
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li>2 late in a month: Warning</li>
                <li>3–7 late in a month: ₹25 fine</li>
                <li>8 or more late in a month: ₹50 fine</li>
              </ul>
            ) : (
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li>2 late in a month: Warning</li>
                <li>3–7 late in a month: ₹50 fine</li>
                <li>8 or more late in a month: ₹100 fine</li>
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-1 flex items-center gap-1.5 text-amber-700">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Warnings</span>
          </div>
          <div className="text-xl font-bold tabular-nums">{totals.totalWarnings}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-1 flex items-center gap-1.5 text-rose-700">
            <IndianRupee className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Total fine</span>
          </div>
          <div className="text-xl font-bold tabular-nums">₹{totals.totalFine}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-1 flex items-center gap-1.5 text-slate-700">
            <Clock className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Pending</span>
          </div>
          <div className="text-xl font-bold tabular-nums">₹{totals.pendingAmount}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-1 flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Paid</span>
          </div>
          <div className="text-xl font-bold tabular-nums">₹{totals.paidAmount}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="my-fine-status" className="text-xs font-medium text-muted-foreground">
          Status
        </label>
        <select
          id="my-fine-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className={selectCls}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="waived">Waived</option>
        </select>
        {totals.waivedAmount > 0 && statusFilter === 'all' && (
          <span className="text-xs text-muted-foreground">₹{totals.waivedAmount} waived</span>
        )}
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
      ) : filteredRecords.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {totals.recordCount === 0
            ? 'No fines or warnings for this month.'
            : 'No records match this status filter.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRecords.map((record, idx) => (
            <article
              key={`${record.serialNo || record.date}-${idx}`}
              className={`rounded-xl border p-3 shadow-sm ${
                record.isWarning ? 'border-amber-200 bg-amber-50/80' : 'border-rose-200 bg-rose-50/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-[10px] text-emerald-800">{record.serialNo || '—'}</div>
                  <h3 className="font-medium text-foreground">{formatRecordDate(record.date)}</h3>
                  {record.consecutiveDay > 0 && (
                    <p className="text-xs text-muted-foreground">Late day {record.consecutiveDay} this month</p>
                  )}
                </div>
                {record.isWarning ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-800">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    Warning
                  </span>
                ) : (
                  <span className="text-base font-bold tabular-nums text-rose-700">₹{record.fineAmount}</span>
                )}
              </div>

              <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                {record.reason && (
                  <div>
                    <dt className="inline font-medium text-foreground">Reason: </dt>
                    <dd className="inline">{record.reason}</dd>
                  </div>
                )}
                {record.remark && (
                  <div>
                    <dt className="inline font-medium text-foreground">Remark: </dt>
                    <dd className="inline">{record.remark}</dd>
                  </div>
                )}
                {record.penaltyImposedBy && (
                  <div>
                    <dt className="inline font-medium text-foreground">Imposed by: </dt>
                    <dd className="inline">{record.penaltyImposedBy}</dd>
                  </div>
                )}
                {record.vertical && (
                  <div>
                    <dt className="inline font-medium text-foreground">Vertical: </dt>
                    <dd className="inline">{record.vertical}</dd>
                  </div>
                )}
                {record.paymentDate && (
                  <div>
                    <dt className="inline font-medium text-foreground">Payment: </dt>
                    <dd className="inline">
                      {record.paymentDate}
                      {record.paymentMode ? ` (${paymentModeLabel(record.paymentMode)})` : ''}
                    </dd>
                  </div>
                )}
              </dl>

              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(record.status)}`}
              >
                {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default EmployeeFineSection;
