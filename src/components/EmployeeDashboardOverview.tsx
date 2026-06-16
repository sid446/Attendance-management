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
import type { EmployeeAttendanceRequest } from "@/types/employeeAttendanceRequest";
import { isExtraWorkRequest } from "@/lib/extraWorkRequest";

function formatRequestDate(dateStr: string): string {
  const iso = dateStr.split("T")[0];
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function pendingStatusLabel(status: EmployeeAttendanceRequest["status"]): string {
  if (status === "PendingHr") return "Waiting for HR";
  if (status === "Pending") return "Waiting for partner";
  return status;
}

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
  pendingRequests?: EmployeeAttendanceRequest[];
  /** Direct reports (partners only); shown below profile on desktop. */
  teamMembers?: User[];
  teamMembersLoading?: boolean;
  isLoadingMetrics: boolean;
  /** Open team member profile + month calendar (Team attendance tab). */
  onSelectTeamMember?: (userId: string) => void;
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
  pendingRequests = [],
  teamMembers = [],
  teamMembersLoading = false,
  isLoadingMetrics,
  onSelectTeamMember,
}: EmployeeDashboardOverviewProps) {
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

      <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch lg:gap-6">
      <div className="flex min-h-0 lg:col-span-4">
        <div
          className={`h-full min-h-0 w-full rounded-xl border border-border bg-surface p-5 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)] ${
            sortedTeamMembers.length > 0
              ? "flex flex-col lg:grid lg:grid-rows-[auto_auto_minmax(min-content,1fr)]"
              : "flex flex-col"
          }`}
        >
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

          {sortedTeamMembers.length > 0 ? (
            <div className="mt-5 flex min-h-0 flex-col overflow-hidden border-t border-border pt-4 lg:min-h-0">
              <p className="mb-2 flex shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Team
                <span className="font-normal normal-case text-muted-foreground">
                  ({sortedTeamMembers.length})
                </span>
              </p>
              {onSelectTeamMember && (
                <p className="mb-2 text-[10px] text-muted-foreground">Tap a member to view their calendar.</p>
              )}
              {teamMembersLoading ? (
                <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading team…
                </div>
              ) : (
                <>
                  <ul className="mt-2 space-y-1.5 lg:hidden">
                    {sortedTeamMembers.map((member) => {
                      const employeeId =
                        member.employeeCode?.trim() || member.odId?.trim() || "—";
                      return (
                        <li key={member._id}>
                          <button
                            type="button"
                            onClick={() => onSelectTeamMember?.(member._id)}
                            className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition hover:bg-surface/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
                          >
                            <span className="font-mono text-[10px] text-muted-foreground">{employeeId}</span>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                              {member.name}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-2 hidden min-h-0 flex-1 overflow-y-auto rounded-lg border border-border lg:block">
                    <table className="w-full min-w-0 text-left text-[11px]">
                      <thead className="sticky top-0 z-[1] bg-surface text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <tr className="border-b border-border">
                          <th className="px-2 py-1.5 font-medium">ID</th>
                          <th className="px-2 py-1.5 font-medium">Name</th>
                          <th className="px-2 py-1.5 font-medium">Email</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/80">
                        {sortedTeamMembers.map((member) => {
                          const employeeId =
                            member.employeeCode?.trim() || member.odId?.trim() || "—";
                          return (
                            <tr
                              key={member._id}
                              className={`bg-background/50 ${onSelectTeamMember ? "cursor-pointer hover:bg-background focus-within:bg-background" : "hover:bg-background"}`}
                              onClick={() => onSelectTeamMember?.(member._id)}
                              onKeyDown={(e) => {
                                if (!onSelectTeamMember) return;
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  onSelectTeamMember(member._id);
                                }
                              }}
                              tabIndex={onSelectTeamMember ? 0 : undefined}
                              role={onSelectTeamMember ? "button" : undefined}
                            >
                              <td className="whitespace-nowrap px-2 py-1.5 font-mono text-muted-foreground">
                                {employeeId}
                              </td>
                              <td className="max-w-[7rem] truncate px-2 py-1.5 font-medium text-foreground" title={member.name}>
                                {member.name}
                              </td>
                              <td
                                className="max-w-[8rem] truncate px-2 py-1.5 text-muted-foreground"
                                title={member.email}
                              >
                                {member.email || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : null}

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
            {cell("holidays", "Holidays", String(m.holidaysInRecords), "Week off (Sun) + company holidays")}
            {cell("working-days", "Working days", String(m.workingDaysInRecords), "Excl. sun / holiday / week-off")}
            {cell("present", "Present", String(m.totalPresent))}
            {cell("half-days", "Half days", String(m.totalHalfDay))}
            {cell("absent", "Absent", String(m.totalAbsent))}
            {cell("late", "Late", String(m.calcLate))}
            {cell("leave", "Leave", String(m.leaveFullDaysConsumed), "Full leave days (value = 1)")}
            {cell(null, "Scheduled", formatHoursMinutes(m.calcScheduledHours), "Expected hours (eligible days)")}
            {cell(null, "Work hours", formatHoursMinutes(m.totalHour), "Sum on scheduled days only (same as admin Summary)")}
            {cell(
              null,
              "Excess / short",
              `${m.calcExcessDeficit > 0 ? "+" : m.calcExcessDeficit < 0 ? "-" : ""}${formatHoursMinutes(Math.abs(m.calcExcessDeficit))}`,
              "Worked - scheduled"
            )}
            {requestsPending > 0 ? (
              <button
                type="button"
                onClick={() => setShowPendingRequests(true)}
                className="col-span-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left transition hover:border-amber-300/60 hover:bg-amber-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 sm:col-span-3 lg:col-span-4"
                aria-label={`${requestsPending} requests pending. Show details.`}
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Requests pending
                </p>
                <p className="mt-0.5 flex items-center gap-2 font-mono text-sm font-semibold text-foreground">
                  <Inbox className="h-4 w-4 text-amber-600" aria-hidden />
                  {String(requestsPending)}
                </p>
                <p className="mt-1 text-[10px] font-medium text-amber-800">Tap for details</p>
              </button>
            ) : (
              <div className="col-span-2 rounded-lg border border-border bg-background px-3 py-2.5 sm:col-span-3 lg:col-span-4">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Requests pending
                </p>
                <p className="mt-0.5 flex items-center gap-2 font-mono text-sm font-semibold text-foreground">
                  <Inbox className="h-4 w-4 text-muted-foreground" aria-hidden />
                  0
                </p>
              </div>
            )}
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <EmployeeDashboardCharts metrics={m} dailySeries={chartDailySeries} />
            </div>
          </div>
        )}
      </div>
    </div>

      {showPendingRequests && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pending-requests-title"
          onClick={() => setShowPendingRequests(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h4 id="pending-requests-title" className="text-base font-semibold text-foreground">
                  Pending requests
                </h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {periodLabel} · {pendingRequests.length} request
                  {pendingRequests.length === 1 ? "" : "s"} awaiting approval
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPendingRequests(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-2 py-2">
              <ul className="space-y-2">
                {[...pendingRequests]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((req) => (
                    <li
                      key={req._id}
                      className="rounded-lg border border-border bg-background px-3 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {formatRequestDate(req.date)}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {req.date.split("T")[0]}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                          {pendingStatusLabel(req.status)}
                        </span>
                      </div>
                      <dl className="mt-2 space-y-1 text-xs">
                        <div className="flex gap-2">
                          <dt className="shrink-0 text-muted-foreground">Type</dt>
                          <dd className="font-medium text-foreground">
                            {isExtraWorkRequest(req) ? (
                              <span className="text-orange-800">Extra work hours</span>
                            ) : (
                              req.requestedStatus
                            )}
                          </dd>
                        </div>
                        {req.originalStatus ? (
                          <div className="flex gap-2">
                            <dt className="shrink-0 text-muted-foreground">Current</dt>
                            <dd className="text-foreground">{req.originalStatus}</dd>
                          </div>
                        ) : null}
                        {req.startTime && req.endTime ? (
                          <div className="flex gap-2">
                            <dt className="shrink-0 text-muted-foreground">Time</dt>
                            <dd className="font-mono text-foreground">
                              {req.startTime} – {req.endTime}
                            </dd>
                          </div>
                        ) : null}
                        {req.reason?.trim() ? (
                          <div>
                            <dt className="text-muted-foreground">Reason</dt>
                            <dd className="mt-0.5 text-foreground">{req.reason.trim()}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      )}

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
