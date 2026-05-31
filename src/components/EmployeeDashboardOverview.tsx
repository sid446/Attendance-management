"use client";
import React, { useMemo, useState } from "react";
import type { AttendanceSummaryView, User } from "@/types/ui";
import {
  Mail,
  Hash,
  Briefcase,
  Users,
  Inbox,
  Loader2,
  X,
} from "lucide-react";
import type { SummaryAlignedMetrics } from "@/lib/attendanceSummaryMetrics";
import {
  formatHoursMinutes,
  getSummaryMetricDays,
  SUMMARY_METRIC_DAY_LABELS,
  type SummaryMetricDayKind,
} from "@/lib/attendanceSummaryMetrics";
import { EmployeeDashboardCharts } from "@/components/EmployeeDashboardCharts";
import { EmployeeSummaryMonthPicker } from "@/components/EmployeeSummaryMonthPicker";

function formatMonthLabel(monthYear: string): string {
  const [ys, ms] = monthYear.split("-");
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  if (!y || !m) return "";
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface EmployeeDashboardOverviewProps {
  user: User;
  monthYear: string;
  onMonthYearChange: (monthYear: string) => void;
  alignedMetrics: SummaryAlignedMetrics | null;
  summary: AttendanceSummaryView | null;
  holidays?: { date: string }[];
  chartDailySeries?: { date: string; hours: number }[];
  requestsPending: number;
  isLoadingMetrics: boolean;
}

export function EmployeeDashboardOverview({
  user,
  monthYear,
  onMonthYearChange,
  alignedMetrics,
  summary,
  holidays = [],
  chartDailySeries = [],
  requestsPending,
  isLoadingMetrics,
}: EmployeeDashboardOverviewProps) {
  const periodLabel = formatMonthLabel(monthYear);
  const [activeMetric, setActiveMetric] = useState<SummaryMetricDayKind | null>(null);

  const joiningLabel = user.joiningDate
    ? new Date(user.joiningDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const m = alignedMetrics;

  const metricDays = useMemo(() => {
    if (!activeMetric || !summary) return [];
    return getSummaryMetricDays(activeMetric, summary, user, holidays);
  }, [activeMetric, summary, user, holidays]);

  const metricCount = (kind: SummaryMetricDayKind): number => {
    if (!m) return 0;
    switch (kind) {
      case "total-days":
        return m.totalDaysInRecords;
      case "holidays":
        return m.holidaysInRecords;
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

  return (
    <div className="space-y-4">
      <EmployeeSummaryMonthPicker
        monthYear={monthYear}
        onMonthYearChange={onMonthYearChange}
        disabled={isLoadingMetrics}
      />

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
      <div className="lg:col-span-4">
        <div className="h-full rounded-xl border border-border bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)]">
          <div className="flex items-start gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-background text-lg font-semibold tracking-tight text-foreground ring-1 ring-border"
              aria-hidden
            >
              {initials(user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-foreground">
                {user.name}
              </h2>
              {periodLabel && (
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">{periodLabel}</p>
              )}
              {user.designation && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Briefcase className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{user.designation}</span>
                </p>
              )}
              {user.team && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{user.team}</span>
                </p>
              )}
            </div>
          </div>

          <dl className="mt-5 space-y-2.5 border-t border-border pt-5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                Email
              </dt>
              <dd className="truncate text-right text-foreground" title={user.email}>
                {user.email}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <Hash className="h-3.5 w-3.5" />
                Code
              </dt>
              <dd className="font-mono text-xs text-foreground">
                {user.employeeCode?.trim() || user.odId || "—"}
              </dd>
            </div>
            {joiningLabel && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Joined</dt>
                <dd className="text-foreground">{joiningLabel}</dd>
              </div>
            )}
          </dl>

        </div>
      </div>

      <div className="lg:col-span-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
              Attendance summary
              {periodLabel ? (
                <span className="font-normal text-muted-foreground"> · {periodLabel}</span>
              ) : null}
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Same rules as the admin <span className="text-muted-foreground">Attendance Summary</span>.
              Tap Present, Absent, Late, Leave, Working days, or Holidays to see dates.
            </p>
          </div>
          {isLoadingMetrics && (
            <span className="text-xs text-muted-foreground">Updating…</span>
          )}
        </div>

        {isLoadingMetrics && !m ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
            Loading summary…
          </div>
        ) : !m ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No attendance data for this month yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {cell("total-days", "Total days", String(m.totalDaysInRecords), "Days with rows")}
            {cell("holidays", "Holidays", String(m.holidaysInRecords), "Sun + company holiday dates")}
            {cell("working-days", "Working days", String(m.workingDaysInRecords), "Excl. sun / holiday / week-off")}
            {cell("present", "Present", String(m.totalPresent))}
            {cell("half-days", "Half days", String(m.totalHalfDay))}
            {cell("absent", "Absent", String(m.totalAbsent))}
            {cell("late", "Late", String(m.calcLate))}
            {cell("leave", "Leave", String(m.leaveFullDaysConsumed), "Full leave days (value = 1)")}
            {cell(null, "Scheduled", formatHoursMinutes(m.calcScheduledHours), "Expected hours (eligible days)")}
            {cell(null, "Work hours", formatHoursMinutes(m.totalHour), "Sum of daily hours (excl. Sun / holiday / week-off rows)")}
            {cell(
              null,
              "Excess / short",
              `${m.calcExcessDeficit > 0 ? "+" : m.calcExcessDeficit < 0 ? "-" : ""}${formatHoursMinutes(Math.abs(m.calcExcessDeficit))}`,
              "Worked - scheduled"
            )}
            <div className="col-span-2 rounded-lg border border-border bg-background px-3 py-2.5 sm:col-span-3 lg:col-span-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Requests pending
              </p>
              <p className="mt-0.5 flex items-center gap-2 font-mono text-sm font-semibold text-foreground">
                <Inbox className="h-4 w-4 text-muted-foreground" aria-hidden />
                {String(requestsPending)}
              </p>
            </div>
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <EmployeeDashboardCharts metrics={m} dailySeries={chartDailySeries} />
            </div>
          </div>
        )}
      </div>
    </div>

      {activeMetric && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="metric-days-title"
          onClick={() => setActiveMetric(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h4 id="metric-days-title" className="text-base font-semibold text-foreground">
                  {SUMMARY_METRIC_DAY_LABELS[activeMetric]}
                </h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {periodLabel} · {metricDays.length} day{metricDays.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveMetric(null)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-2 py-2">
              {metricDays.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                  No days in this category for {periodLabel || "this month"}.
                </p>
              ) : (
                <ul className="space-y-1">
                  {metricDays.map((row) => (
                    <li
                      key={row.date}
                      className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-background/80"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{row.dateLabel}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{row.date}</p>
                      </div>
                      {row.detail ? (
                        <p className="max-w-[55%] text-right text-xs text-muted-foreground">
                          {row.detail}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
