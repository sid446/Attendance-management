'use client';

import React from 'react';
import {
  formatHoursMinutes,
  type SummaryAlignedMetrics,
} from '@/lib/attendanceSummaryMetrics';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="whitespace-nowrap">
      <span className="font-semibold text-slate-900">{label}:</span>{' '}
      <span className="font-mono tabular-nums text-slate-800">{value}</span>
    </div>
  );
}

export interface SummaryAlignedMetricsStripProps {
  metrics: SummaryAlignedMetrics;
  className?: string;
}

/** Compact summary row — same rules as admin Attendance Summary / employee dashboard overview. */
export function SummaryAlignedMetricsStrip({
  metrics,
  className = '',
}: SummaryAlignedMetricsStripProps) {
  const excessSign =
    metrics.calcExcessDeficit > 0 ? '+' : metrics.calcExcessDeficit < 0 ? '-' : '';
  const excessVal = `${excessSign}${formatHoursMinutes(Math.abs(metrics.calcExcessDeficit))}`;

  return (
    <div
      className={`mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 ${className}`.trim()}
    >
      <Metric label="Present" value={String(metrics.totalPresent)} />
      <Metric label="Half days" value={String(metrics.totalHalfDay)} />
      <Metric label="Absent" value={String(metrics.totalAbsent)} />
      <Metric label="Late" value={String(metrics.calcLate)} />
      <Metric label="Leave" value={String(metrics.leaveFullDaysConsumed)} />
      <Metric label="Sched." value={formatHoursMinutes(metrics.calcScheduledHours)} />
      <Metric label="Worked" value={formatHoursMinutes(metrics.totalHour)} />
      <Metric label="Excess / short" value={excessVal} />
    </div>
  );
}
