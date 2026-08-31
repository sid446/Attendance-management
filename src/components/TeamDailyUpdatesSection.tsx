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
import { istDateString } from "@/lib/attendanceRequestWindow";
import {
  DAILY_UPDATE_GROUP_META,
  TEAM_DAILY_UPDATES_MAX_RANGE_DAYS,
  clampDailyUpdateRange,
  enumerateYyyyMmDd,
  formatDailyUpdateRangeLabel,
  groupDailyUpdates,
  mergeConsecutiveDailyUpdates,
  shiftIstYyyyMmDd,
  type TeamDailyUpdateCategory,
  type TeamDailyUpdateEntry,
  type TeamDailyUpdateRangeEntry,
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
  from: string;
  to: string;
  entries: TeamDailyUpdateEntry[];
  summary: {
    total: number;
    onLeave: number;
    away: number;
    pending: number;
  };
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
  return shiftIstYyyyMmDd(date, mondayOffset);
}

function formatDateHeading(from: string, to: string): string {
  const today = istDateString();
  if (from === to) {
    const yesterday = shiftIstYyyyMmDd(today, -1);
    const tomorrow = shiftIstYyyyMmDd(today, 1);
    const formatted = formatDailyUpdateRangeLabel(from, to);
    if (from === today) return `Today · ${formatted}`;
    if (from === yesterday) return `Yesterday · ${formatted}`;
    if (from === tomorrow) return `Tomorrow · ${formatted}`;
    return formatted;
  }
  return formatDailyUpdateRangeLabel(from, to);
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

const DATE_INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground disabled:opacity-50";

export function TeamDailyUpdatesSection({
  viewerUserId,
  onSelectMember,
  showHeader = true,
  onLoaded,
}: TeamDailyUpdatesSectionProps) {
  const [fromDate, setFromDate] = useState(() => istDateString());
  const [toDate, setToDate] = useState(() => istDateString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DailyUpdatesPayload | null>(null);

  const applyRange = useCallback((nextFrom: string, nextTo: string) => {
    const clamped = clampDailyUpdateRange(nextFrom, nextTo);
    setFromDate(clamped.from);
    setToDate(clamped.to);
  }, []);

  const fetchUpdates = useCallback(async () => {
    if (!viewerUserId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        viewerUserId,
        from: fromDate,
        to: toDate,
      });
      const res = await fetch(
        `/api/employee/team-daily-updates?${params.toString()}`,
        employeeCredentialsInit({ cache: "no-store" })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load daily updates");
      }
      const data = json.data as DailyUpdatesPayload;
      setPayload({
        ...data,
        from: data.from || data.date,
        to: data.to || data.date,
      });
      onLoaded?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [viewerUserId, fromDate, toDate, onLoaded]);

  useEffect(() => {
    void fetchUpdates();
  }, [fetchUpdates]);

  const rangeEntries = useMemo(
    () => mergeConsecutiveDailyUpdates(payload?.entries ?? []),
    [payload?.entries]
  );

  const grouped = useMemo(() => groupDailyUpdates(rangeEntries), [rangeEntries]);

  const visibleGroups = DISPLAY_ORDER.filter((key) => grouped[key].length > 0);

  const today = istDateString();
  const isSingleDay = fromDate === toDate;
  const isTodayRange = fromDate === today && toDate === today;
  const rangeDayCount = enumerateYyyyMmDd(fromDate, toDate).length || 1;
  const rangeHeading = formatDateHeading(fromDate, toDate);

  const shiftRange = (direction: -1 | 1) => {
    applyRange(
      shiftIstYyyyMmDd(fromDate, direction * rangeDayCount),
      shiftIstYyyyMmDd(toDate, direction * rangeDayCount)
    );
  };

  const setThisWeek = () => {
    const start = startOfIstWeek(today);
    applyRange(start, shiftIstYyyyMmDd(start, 6));
  };

  const setNextSevenDays = () => {
    applyRange(today, shiftIstYyyyMmDd(today, 6));
  };

  const periodSelection = (
    <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="daily-updates-from" className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            From
          </label>
          <input
            id="daily-updates-from"
            type="date"
            value={fromDate}
            onChange={(e) => {
              const next = e.target.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(next)) applyRange(next, toDate);
            }}
            disabled={loading}
            className={DATE_INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="daily-updates-to" className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            To
          </label>
          <input
            id="daily-updates-to"
            type="date"
            value={toDate}
            onChange={(e) => {
              const next = e.target.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(next)) applyRange(fromDate, next);
            }}
            disabled={loading}
            className={DATE_INPUT_CLASS}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => shiftRange(-1)}
          disabled={loading}
          className="rounded-lg border border-border bg-background p-2 text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Previous period"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => shiftRange(1)}
          disabled={loading}
          className="rounded-lg border border-border bg-background p-2 text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Next period"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {!isTodayRange && (
          <button
            type="button"
            onClick={() => applyRange(today, today)}
            disabled={loading}
            className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-medium text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Today
          </button>
        )}
        <button
          type="button"
          onClick={setThisWeek}
          disabled={loading}
          className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-medium text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          This week
        </button>
        <button
          type="button"
          onClick={setNextSevenDays}
          disabled={loading}
          className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-medium text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next 7 days
        </button>
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground sm:text-right">
          {rangeHeading}
          {rangeDayCount > 1 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              · {rangeDayCount} days
            </span>
          )}
        </p>
      </div>
      {rangeDayCount >= TEAM_DAILY_UPDATES_MAX_RANGE_DAYS && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Range is limited to {TEAM_DAILY_UPDATES_MAX_RANGE_DAYS} days.
        </p>
      )}
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
        ) : !payload || rangeEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/70" aria-hidden />
            <p className="mt-3 text-sm font-medium text-foreground">
              {isSingleDay ? "No updates for this day" : "No updates for this period"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              No approved leave, WFH, travel, or pending requests for your visible team on{" "}
              {rangeHeading}.
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
                        <li key={`${entry.userId}:${entry.dateFrom}:${entry.dateTo}:${entry.requestedStatus}:${entry.requestStatus}`}>
                          {onSelectMember ? (
                            <button
                              type="button"
                              onClick={() => onSelectMember(entry.userId)}
                              className="flex w-full items-start gap-3 bg-background/30 px-3 py-3 text-left hover:bg-background/60 sm:px-4"
                            >
                              <EntryBody entry={entry} showDates={!isSingleDay} />
                            </button>
                          ) : (
                            <div className="flex items-start gap-3 bg-background/30 px-3 py-3 sm:px-4">
                              <EntryBody entry={entry} showDates={!isSingleDay} />
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
          for the selected dates (IST).
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

function EntryBody({
  entry,
  showDates,
}: {
  entry: TeamDailyUpdateRangeEntry;
  showDates: boolean;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{entry.name}</div>
        <div className="text-xs text-muted-foreground">
          {entry.odId || entry.employeeCode || "—"}
        </div>
        {showDates && (
          <div className="mt-1 text-xs font-medium text-foreground">
            {formatDailyUpdateRangeLabel(entry.dateFrom, entry.dateTo)}
          </div>
        )}
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
