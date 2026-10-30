'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, IndianRupee, RefreshCw } from 'lucide-react';
import type { EmployeeFineSummaryCardProps, EmployeeFineDoc } from '../types';
import { fetchOwnFine, recordTotals } from '../utils/employeeFineUtils';

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
