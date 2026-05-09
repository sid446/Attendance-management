"use client";
import React from "react";
import type { User } from "@/types/ui";
import {
  Mail,
  Hash,
  Briefcase,
  Users,
  Inbox,
  Loader2,
} from "lucide-react";
import type { SummaryAlignedMetrics } from "@/lib/attendanceSummaryMetrics";
import { formatHoursMinutes } from "@/lib/attendanceSummaryMetrics";
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
  /** Updates global month and refetches (same as Attendance tab). */
  onMonthYearChange: (monthYear: string) => void;
  /** Same calculations as admin Attendance Summary for this month */
  alignedMetrics: SummaryAlignedMetrics | null;
  /** Per-day worked hours (non–holiday-like), for cumulative chart */
  chartDailySeries?: { date: string; hours: number }[];
  requestsPending: number;
  isLoadingMetrics: boolean;
}

export function EmployeeDashboardOverview({
  user,
  monthYear,
  onMonthYearChange,
  alignedMetrics,
  chartDailySeries = [],
  requestsPending,
  isLoadingMetrics,
}: EmployeeDashboardOverviewProps) {
  const periodLabel = formatMonthLabel(monthYear);

  const joiningLabel = user.joiningDate
    ? new Date(user.joiningDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const m = alignedMetrics;

  const cell = (label: string, value: string, hint?: string) => (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );

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
              Same rules as the admin <span className="text-muted-foreground">Attendance Summary</span>{" "}
              (working days exclude Sundays, company holidays in the calendar, and week-off types).
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
            {(
              [
                ["total-days", cell("Total days", String(m.totalDaysInRecords), "Days with rows")],
                ["holidays", cell("Holidays", String(m.holidaysInRecords), "Sun + company holiday dates")],
                ["working-days", cell("Working days", String(m.workingDaysInRecords), "Excl. sun / holiday / week-off")],
                ["present", cell("Present", String(m.totalPresent))],
                ["half-days", cell("Half days", String(m.totalHalfDay))],
                ["absent", cell("Absent", String(m.totalAbsent))],
                ["late", cell("Late", String(m.calcLate))],
                ["leave", cell("Leave", String(m.leaveFullDaysConsumed), "Full leave days (value = 1)")],
                ["scheduled", cell("Scheduled", formatHoursMinutes(m.calcScheduledHours), "Expected hours (eligible days)")],
                [
                  "work-hours",
                  cell(
                    "Work hours",
                    formatHoursMinutes(m.totalHour),
                    "Sum of daily hours (excl. Sun / holiday / week-off rows)"
                  ),
                ],
                [
                  "excess-short",
                  cell(
                    "Excess / short",
                    `${m.calcExcessDeficit > 0 ? "+" : m.calcExcessDeficit < 0 ? "-" : ""}${formatHoursMinutes(Math.abs(m.calcExcessDeficit))}`,
                    "Worked - scheduled"
                  ),
                ],
              ] as [string, React.ReactNode][]
            ).map(([key, content]) => (
              <React.Fragment key={String(key)}>{content}</React.Fragment>
            ))}
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
    </div>
  );
}
