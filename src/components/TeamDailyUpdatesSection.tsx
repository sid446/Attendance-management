"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plane,
  Home,
  Clock,
  ClipboardList,
  UserRound,
} from "lucide-react";
import { employeeCredentialsInit } from "@/lib/employeeCredentialsInit";
import { EmployeeSummaryMonthPicker } from "@/components/EmployeeSummaryMonthPicker";
import { istDateString } from "@/lib/attendanceRequestWindow";
import {
  DAILY_UPDATE_GROUP_META,
  groupDailyUpdates,
  type TeamDailyUpdateCategory,
  type TeamDailyUpdateEntry,
} from "@/lib/teamDailyUpdates";

interface TeamDailyUpdatesSectionProps {
  viewerUserId: string;
  onSelectMember?: (userId: string) => void;
  /** When false, only the body renders (e.g. inside a modal). Default true. */
  showHeader?: boolean;
  /** Called after each successful fetch (e.g. to refresh header badge for today). */
  onLoaded?: (payload: DailyUpdatesPayload) => void;
}

interface DailyUpdatesPayload {
  date: string;
  entries: TeamDailyUpdateEntry[];
  summary: {
    total: number;
    onLeave: number;
    away: number;
    pending: number;
  };
}

function shiftIstDate(date: string, deltaDays: number): string {
  const parsed = new Date(`${date}T12:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return istDateString();
  parsed.setDate(parsed.getDate() + deltaDays);
  return istDateString(parsed);
}

function clampDateToMonthYear(date: string, monthYear: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthYear)) return date;
  const dayNum = parseInt(date.slice(8, 10), 10);
  const day = Number.isFinite(dayNum) && dayNum >= 1 ? dayNum : 1;
  const [ys, ms] = monthYear.split("-");
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  const lastDay = new Date(y, m, 0).getDate();
  return `${monthYear}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function istWeekdayIndex(date: string): number {
  const label = new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "Asia/Kolkata",
  });
  const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const idx = order.indexOf(label);
  return idx >= 0 ? idx : 0;
}

function startOfIstWeek(date: string): string {
  const weekday = istWeekdayIndex(date);
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return shiftIstDate(date, mondayOffset);
}

function formatWeekdayShort(date: string): string {
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short",
    timeZone: "Asia/Kolkata",
  });
}

function formatDayNum(date: string): string {
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function formatDateHeading(date: string): string {
  const d = new Date(`${date}T12:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return date;
  const today = istDateString();
  const yesterday = shiftIstDate(today, -1);
  const tomorrow = shiftIstDate(today, 1);
  const formatted = d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  if (date === today) return `Today · ${formatted}`;
  if (date === yesterday) return `Yesterday · ${formatted}`;
  if (date === tomorrow) return `Tomorrow · ${formatted}`;
  return formatted;
}

function groupIcon(category: TeamDailyUpdateCategory) {
  switch (category) {
    case "leave":
      return UserRound;
    case "wfh":
      return Home;
    case "outstation":
      return Plane;
    case "half_day":
      return Clock;
    case "pending":
    case "pending_hr":
      return ClipboardList;
    default:
      return CalendarDays;
  }
}

/** Matches ManageExcessHourAllowanceSection badge tones. */
function groupPanelClass(tone: (typeof DAILY_UPDATE_GROUP_META)[TeamDailyUpdateCategory]["tone"]) {
  switch (tone) {
    case "rose":
      return "border-rose-500/30 bg-rose-950/20";
    case "sky":
      return "border-sky-500/30 bg-sky-950/20";
    case "violet":
      return "border-violet-500/30 bg-violet-950/20";
    case "amber":
      return "border-amber-500/30 bg-amber-950/20";
    case "emerald":
      return "border-emerald-500/30 bg-emerald-950/20";
    default:
      return "border-border bg-background/40";
  }
}

function groupTitleClass(tone: (typeof DAILY_UPDATE_GROUP_META)[TeamDailyUpdateCategory]["tone"]) {
  switch (tone) {
    case "rose":
      return "text-rose-700";
    case "sky":
      return "text-sky-700";
    case "violet":
      return "text-violet-700";
    case "amber":
      return "text-amber-700";
    case "emerald":
      return "text-emerald-700";
    default:
      return "text-foreground";
  }
}

function summaryChipClass(kind: "leave" | "away" | "pending") {
  switch (kind) {
    case "leave":
      return "border-rose-500/30 bg-rose-950/20 text-rose-700";
    case "away":
      return "border-sky-500/30 bg-sky-950/20 text-sky-700";
    case "pending":
      return "border-amber-500/30 bg-amber-950/20 text-amber-700";
  }
}

const DISPLAY_ORDER: TeamDailyUpdateCategory[] = [
  "leave",
  "wfh",
  "outstation",
  "half_day",
  "other_approved",
  "pending",
  "pending_hr",
];

export function TeamDailyUpdatesSection({
  viewerUserId,
  onSelectMember,
  showHeader = true,
  onLoaded,
}: TeamDailyUpdatesSectionProps) {
  const [date, setDate] = useState(() => istDateString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DailyUpdatesPayload | null>(null);

  const fetchUpdates = useCallback(async () => {
    if (!viewerUserId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/employee/team-daily-updates?viewerUserId=${encodeURIComponent(viewerUserId)}&date=${encodeURIComponent(date)}`,
        employeeCredentialsInit({ cache: "no-store" })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load daily updates");
      }
      const data = json.data as DailyUpdatesPayload;
      setPayload(data);
      onLoaded?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [viewerUserId, date, onLoaded]);

  useEffect(() => {
    void fetchUpdates();
  }, [fetchUpdates]);

  const grouped = useMemo(
    () => groupDailyUpdates(payload?.entries ?? []),
    [payload?.entries]
  );

  const visibleGroups = DISPLAY_ORDER.filter((key) => grouped[key].length > 0);

  const today = istDateString();
  const weekDates = useMemo(() => {
    const start = startOfIstWeek(date);
    return Array.from({ length: 7 }, (_, i) => shiftIstDate(start, i));
  }, [date]);

  const periodSelection = (
    <div className="space-y-3">
      <EmployeeSummaryMonthPicker
        monthYear={date.slice(0, 7)}
        onMonthYearChange={(monthYear) => setDate((current) => clampDateToMonthYear(current, monthYear))}
        disabled={loading}
        label="Period"
      />
      <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Day
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDate((d) => shiftIstDate(d, -1))}
            disabled={loading}
            className="rounded-lg border border-border bg-background p-2 text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <label className="sr-only" htmlFor="daily-updates-date">
            Select date
          </label>
          <input
            id="daily-updates-date"
            type="date"
            value={date}
            onChange={(e) => {
              const next = e.target.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(next)) setDate(next);
            }}
            disabled={loading}
            className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setDate((d) => shiftIstDate(d, 1))}
            disabled={loading}
            className="rounded-lg border border-border bg-background p-2 text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {date !== today && (
            <button
              type="button"
              onClick={() => setDate(today)}
              disabled={loading}
              className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-medium text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Today
            </button>
          )}
          <p className="min-w-0 flex-1 text-sm font-medium text-foreground sm:text-right">
            {formatDateHeading(date)}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1" role="group" aria-label="Week">
          {weekDates.map((weekDate) => {
            const selected = weekDate === date;
            const isToday = weekDate === today;
            return (
              <button
                key={weekDate}
                type="button"
                onClick={() => setDate(weekDate)}
                disabled={loading}
                className={`rounded-lg border px-1 py-2 text-center disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "border-sky-500/50 bg-sky-950/30 text-foreground shadow-sm"
                    : isToday
                      ? "border-border bg-background text-foreground hover:bg-surface/70"
                      : "border-transparent bg-background/60 text-muted-foreground hover:border-border hover:bg-surface/70 hover:text-foreground"
                }`}
                aria-pressed={selected}
                aria-label={formatDateHeading(weekDate)}
              >
                <span className="block text-[10px] font-medium uppercase tracking-wide">
                  {formatWeekdayShort(weekDate)}
                </span>
                <span className="mt-0.5 block text-sm font-semibold">{formatDayNum(weekDate)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const body = (
      <div className={`space-y-4 ${showHeader ? 'p-4 sm:p-5' : 'p-0'}`}>
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading team updates…
          </div>
        ) : !payload || payload.entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/70" aria-hidden />
            <p className="mt-3 text-sm font-medium text-foreground">No updates for this day</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No approved leave, WFH, travel, or pending requests for your visible team on{" "}
              {date}.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {payload.summary.onLeave > 0 && (
                <span
                  className={`rounded-md border px-2.5 py-1 font-medium ${summaryChipClass("leave")}`}
                >
                  {payload.summary.onLeave} on leave
                </span>
              )}
              {payload.summary.away > payload.summary.onLeave && (
                <span
                  className={`rounded-md border px-2.5 py-1 font-medium ${summaryChipClass("away")}`}
                >
                  {payload.summary.away} away / adjusted
                </span>
              )}
              {payload.summary.pending > 0 && (
                <span
                  className={`rounded-md border px-2.5 py-1 font-medium ${summaryChipClass("pending")}`}
                >
                  {payload.summary.pending} pending
                </span>
              )}
            </div>

            <div className="space-y-3">
              {visibleGroups.map((category) => {
                const meta = DAILY_UPDATE_GROUP_META[category];
                const Icon = groupIcon(category);
                const rows = grouped[category];

                return (
                  <div
                    key={category}
                    className={`overflow-hidden rounded-lg border ${groupPanelClass(meta.tone)}`}
                  >
                    <div
                      className={`flex items-start gap-2 border-b border-border/50 px-3 py-2.5 sm:px-4 ${groupTitleClass(meta.tone)}`}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{meta.title}</div>
                        <div className="text-xs text-muted-foreground">{meta.description}</div>
                      </div>
                      <span className="shrink-0 rounded-full border border-border bg-background/80 px-2 py-0.5 text-xs font-medium text-foreground">
                        {rows.length}
                      </span>
                    </div>
                    <ul className="divide-y divide-border/70">
                      {rows.map((entry) => (
                        <li key={`${entry.userId}:${entry.requestedStatus}:${entry.requestStatus}`}>
                          {onSelectMember ? (
                            <button
                              type="button"
                              onClick={() => onSelectMember(entry.userId)}
                              className="flex w-full items-start gap-3 bg-background/30 px-3 py-3 text-left hover:bg-background/60 sm:px-4"
                            >
                              <EntryBody entry={entry} />
                            </button>
                          ) : (
                            <div className="flex items-start gap-3 bg-background/30 px-3 py-3 sm:px-4">
                              <EntryBody entry={entry} />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
  );

  if (!showHeader) {
    return (
      <div className="space-y-4">
        {periodSelection}
        {body}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)]">
      <header className="border-b border-border bg-background/60 px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Daily updates</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Who on your team is on leave, WFH, outstation, or has an approved or pending request
          for the selected day (IST).
        </p>
        <div className="mt-4">{periodSelection}</div>
      </header>
      {body}
    </section>
  );
}

function statusBadgeClass(entry: TeamDailyUpdateEntry): string {
  if (entry.requestStatus === "Pending") {
    return "text-amber-700 bg-amber-950/20 border-amber-500/30";
  }
  if (entry.requestStatus === "PendingHr") {
    return "text-muted-foreground bg-background border-border";
  }
  if (entry.source === "attendance") {
    return "text-muted-foreground bg-background border-border";
  }
  return "text-emerald-700 bg-emerald-950/20 border-emerald-500/30";
}

function statusBadgeLabel(entry: TeamDailyUpdateEntry): string {
  if (entry.requestStatus === "Pending") return "Pending";
  if (entry.requestStatus === "PendingHr") return "HR pending";
  if (entry.source === "attendance") return "In records";
  return entry.approvedBy ? `By ${entry.approvedBy}` : "Approved";
}

function EntryBody({ entry }: { entry: TeamDailyUpdateEntry }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{entry.name}</div>
        <div className="text-xs text-muted-foreground">
          {entry.odId || entry.employeeCode || "—"}
        </div>
        <div className="mt-1 text-sm text-foreground">{entry.label}</div>
        {(entry.startTime || entry.endTime) && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {entry.startTime || "—"} – {entry.endTime || "—"}
          </div>
        )}
        {entry.reason && (
          <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{entry.reason}</div>
        )}
      </div>
      <span
        className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusBadgeClass(entry)}`}
      >
        {statusBadgeLabel(entry)}
      </span>
    </>
  );
}
