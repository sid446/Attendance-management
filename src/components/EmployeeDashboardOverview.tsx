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
    <div className="rounded-lg border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-zinc-100">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] text-zinc-600">{hint}</p> : null}
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
        <div className="h-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-lg font-semibold tracking-tight text-zinc-100 ring-1 ring-zinc-700/80"
              aria-hidden
            >
              {initials(user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-zinc-50">
                {user.name}
              </h2>
              {periodLabel && (
                <p className="mt-0.5 text-xs font-medium text-zinc-500">{periodLabel}</p>
              )}
              {user.designation && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-400">
                  <Briefcase className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{user.designation}</span>
                </p>
              )}
              {user.team && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                  <Users className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{user.team}</span>
                </p>
              )}
            </div>
          </div>

          <dl className="mt-5 space-y-2.5 border-t border-zinc-800/80 pt-5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-2 text-zinc-500">
                <Mail className="h-3.5 w-3.5" />
                Email
              </dt>
              <dd className="truncate text-right text-zinc-300" title={user.email}>
                {user.email}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-2 text-zinc-500">
                <Hash className="h-3.5 w-3.5" />
                Code
              </dt>
              <dd className="font-mono text-xs text-zinc-300">
                {user.employeeCode?.trim() || user.odId || "—"}
              </dd>
            </div>
            {joiningLabel && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-zinc-500">Joined</dt>
                <dd className="text-zinc-300">{joiningLabel}</dd>
              </div>
            )}
          </dl>

        </div>
      </div>

      <div className="lg:col-span-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-zinc-200 sm:text-lg">
              Attendance summary
              {periodLabel ? (
                <span className="font-normal text-zinc-500"> · {periodLabel}</span>
              ) : null}
            </h3>
            <p className="mt-1 text-[11px] text-zinc-600">
              Same rules as the admin <span className="text-zinc-500">Attendance Summary</span>{" "}
              (working days exclude Sundays, company holidays in the calendar, and week-off types).
            </p>
          </div>
          {isLoadingMetrics && (
            <span className="text-xs text-zinc-500">Updating…</span>
          )}
        </div>

        {isLoadingMetrics && !m ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-zinc-800 py-12 text-sm text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-hidden />
            Loading summary…
          </div>
        ) : !m ? (
          <p className="rounded-lg border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-500">
            No attendance data for this month yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {[
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
            ].map(([key, content]) => (
              <React.Fragment key={key}>{content}</React.Fragment>
            ))}
            <div className="col-span-2 rounded-lg border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5 sm:col-span-3 lg:col-span-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Requests pending
              </p>
              <p className="mt-0.5 flex items-center gap-2 font-mono text-sm font-semibold text-zinc-100">
                <Inbox className="h-4 w-4 text-zinc-500" aria-hidden />
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
