"use client";
import React, { useMemo } from "react";
import type { User } from "@/types/ui";
import {
  Mail,
  Hash,
  Briefcase,
  Users,
  Inbox,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { SummaryAlignedMetrics } from "@/lib/attendanceSummaryMetrics";
import { formatHoursMinutes } from "@/lib/attendanceSummaryMetrics";
import { EmployeeDashboardCharts } from "@/components/EmployeeDashboardCharts";

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

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
] as const;

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

  const [selectedYear, selectedMonth] = useMemo(() => {
    if (monthYear && /^\d{4}-\d{2}$/.test(monthYear)) {
      const [ys, ms] = monthYear.split("-");
      const y = parseInt(ys, 10);
      const m = parseInt(ms, 10);
      if (y && m >= 1 && m <= 12) return [y, m] as const;
    }
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1] as const;
  }, [monthYear]);

  const yearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    const set = new Set<number>();
    for (let i = -2; i <= 2; i++) set.add(cy + i);
    set.add(selectedYear);
    return Array.from(set).sort((a, b) => a - b);
  }, [selectedYear]);

  const setYm = (y: number, mo: number) => {
    onMonthYearChange(`${y}-${String(mo).padStart(2, "0")}`);
  };

  const goPrevMonth = () => {
    let y = selectedYear;
    let mo = selectedMonth - 1;
    if (mo < 1) {
      mo = 12;
      y -= 1;
    }
    setYm(y, mo);
  };

  const goNextMonth = () => {
    let y = selectedYear;
    let mo = selectedMonth + 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
    setYm(y, mo);
  };

  const goPrevYear = () => setYm(selectedYear - 1, selectedMonth);
  const goNextYear = () => setYm(selectedYear + 1, selectedMonth);

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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 sm:p-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Summary month
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrevYear}
              disabled={isLoadingMetrics}
              className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              title="Previous year"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <select
              value={selectedYear}
              onChange={(e) => setYm(parseInt(e.target.value, 10), selectedMonth)}
              disabled={isLoadingMetrics}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-50"
              aria-label="Year"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={goNextYear}
              disabled={isLoadingMetrics}
              className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              title="Next year"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrevMonth}
              disabled={isLoadingMetrics}
              className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              title="Previous month"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <select
              value={selectedMonth}
              onChange={(e) => setYm(selectedYear, parseInt(e.target.value, 10))}
              disabled={isLoadingMetrics}
              className="min-w-[8.5rem] rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-50 sm:min-w-[10rem]"
              aria-label="Month"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={goNextMonth}
              disabled={isLoadingMetrics}
              className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              title="Next month"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

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
                cell("Total days", String(m.totalDaysInRecords), "Days with rows"),
                cell("Holidays", String(m.holidaysInRecords), "Sun + company holiday dates"),
                cell("Working days", String(m.workingDaysInRecords), "Excl. sun / holiday / week-off"),
                cell("Present", String(m.totalPresent)),
                cell("Half days", String(m.totalHalfDay)),
                cell("Absent", String(m.totalAbsent)),
                cell("Late", String(m.calcLate)),
                cell("Leave", String(m.leaveFullDaysConsumed), "Full leave days (value = 1)"),
                cell("Scheduled", formatHoursMinutes(m.calcScheduledHours), "Expected hours (eligible days)"),
                cell(
                  "Work hours",
                  formatHoursMinutes(m.totalHour),
                  "Sum of daily hours (excl. Sun / holiday / week-off rows)"
                ),
                cell(
                  "Excess / short",
                  `${m.calcExcessDeficit > 0 ? "+" : m.calcExcessDeficit < 0 ? "-" : ""}${formatHoursMinutes(Math.abs(m.calcExcessDeficit))}`,
                  "Worked - scheduled"
                ),
              ]}
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
