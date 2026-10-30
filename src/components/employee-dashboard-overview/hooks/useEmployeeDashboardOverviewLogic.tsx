"use client";

import { useMemo, useState } from "react";
import { getSummaryMetricDays, type SummaryMetricDayKind } from "@/lib/attendanceSummaryMetrics";
import type { EmployeeDashboardOverviewProps } from '../types';
import { formatMonthLabel } from '../utils/employeeDashboardOverviewUtils';

export function useEmployeeDashboardOverviewLogic({
  user,
  monthYear,
  alignedMetrics,
  summary,
  holidays = [],
  teamMembers = [],
}: Pick<EmployeeDashboardOverviewProps, 'user' | 'monthYear' | 'alignedMetrics' | 'summary' | 'holidays' | 'teamMembers'>) {
  const periodLabel = formatMonthLabel(monthYear);
  const [activeMetric, setActiveMetric] = useState<SummaryMetricDayKind | null>(null);
  const [showPendingRequests, setShowPendingRequests] = useState(false);

  const joiningLabel = user.joiningDate
    ? new Date(user.joiningDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const m = alignedMetrics;

  const sortedTeamMembers = useMemo(() => {
    return [...teamMembers].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }, [teamMembers]);

  const metricDays = useMemo(() => {
    if (!activeMetric || !summary) return [];
    return getSummaryMetricDays(activeMetric, summary, user, holidays);
  }, [activeMetric, summary, user, holidays]);

  const metricCount = (kind: SummaryMetricDayKind): number => {
    if (!m) return 0;
    switch (kind) {
      case "total-days":
        return m.totalDaysInMonth;
      case "holidays":
        return m.holidaysInRecords;
      case "scheduled-working-days":
        return m.scheduledWorkingDaysInMonth;
      case "working-days":
        return m.workingDaysInRecords;
      case "present":
        return m.totalPresent;
      case "half-days":
        return m.totalHalfDay;
      case "absent":
        return m.totalAbsent;
      case "late":
        return m.calcLate;
      case "leave":
        return m.leaveFullDaysConsumed;
      case "absent-leave":
        return m.absentOrLeaveDays;
      case "worked-on-holiday":
        return m.workedOnHolidayDays;
      default:
        return 0;
    }
  };

  const cell = (
    kind: SummaryMetricDayKind | null,
    label: string,
    value: string,
    hint?: string
  ) => {
    const clickable = kind != null && summary != null && metricCount(kind) > 0;
    const inner = (
      <>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p> : null}
        {clickable ? (
          <p className="mt-1 text-[10px] font-medium text-sky-700">Tap for dates</p>
        ) : null}
      </>
    );

    if (clickable && kind) {
      return (
        <button
          type="button"
          onClick={() => setActiveMetric(kind)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left transition hover:border-sky-300/60 hover:bg-sky-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
          aria-label={`${label}: ${value}. Show dates.`}
        >
          {inner}
        </button>
      );
    }

    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2.5">
        {inner}
      </div>
    );
  };

  return {
    periodLabel,
    activeMetric,
    setActiveMetric,
    showPendingRequests,
    setShowPendingRequests,
    joiningLabel,
    m,
    sortedTeamMembers,
    metricDays,
    cell,
  } as const;
}
