"use client";

import React, { useMemo, useState } from "react";
import type { SummaryAlignedMetrics } from "@/lib/attendanceSummaryMetrics";
import { formatHoursMinutes } from "@/lib/attendanceSummaryMetrics";
import { Trophy, AlertTriangle, BarChart3 } from "lucide-react";

export interface PartnerTeamRow {
  userId: string;
  name: string;
  code: string;
  metrics: SummaryAlignedMetrics;
}

export interface PartnerTeamOverviewProps {
  monthYear: string;
  rows: PartnerTeamRow[];
  /** Jump to calendar for this employee */
  onSelectMember?: (userId: string) => void;
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

/**
 * Compare two rows for leaderboard order (higher rank = better attendance quality).
 * Primary: equivalent present rate = (present + ½ half days) / working days in records —
 * fair when people have different numbers of eligible working days (e.g. join dates).
 * Tiebreak: fewer absences → fewer lates → more raw present days.
 */
function compareLeaderboardQuality(a: PartnerTeamRow, b: PartnerTeamRow): number {
  const ma = a.metrics;
  const mb = b.metrics;
  const wa = ma.workingDaysInRecords;
  const wb = mb.workingDaysInRecords;
  const sa = ma.totalPresent + 0.5 * ma.totalHalfDay;
  const sb = mb.totalPresent + 0.5 * mb.totalHalfDay;

  if (wa > 0 && wb > 0) {
    const cross = sb * wa - sa * wb;
    if (cross !== 0) return cross;
  } else if (wa > 0 && wb <= 0) return -1;
  else if (wa <= 0 && wb > 0) return 1;

  if (ma.totalAbsent !== mb.totalAbsent) return ma.totalAbsent - mb.totalAbsent;
  if (ma.calcLate !== mb.calcLate) return ma.calcLate - mb.calcLate;
  return mb.totalPresent - ma.totalPresent;
}

function attendanceQualityRate(m: SummaryAlignedMetrics): number | null {
  const w = m.workingDaysInRecords;
  if (w <= 0) return null;
  return (m.totalPresent + 0.5 * m.totalHalfDay) / w;
}

/** Needs attention: absent >> late >> half day (one absent outweighs many lates or half days). */
const ATTENTION_W_ABSENT = 100;
const ATTENTION_W_LATE = 50;
const ATTENTION_W_HALF = 10;

function needsAttentionScore(m: SummaryAlignedMetrics): number {
  return (
    m.totalAbsent * ATTENTION_W_ABSENT +
    m.calcLate * ATTENTION_W_LATE +
    m.totalHalfDay * ATTENTION_W_HALF
  );
}

export type LeaderboardSortMode = "present" | "absent" | "leave" | "excess" | "late";

/** Present-equivalent days (half day = ½). */
function presentEquivHalf(m: SummaryAlignedMetrics): number {
  return m.totalPresent + 0.5 * m.totalHalfDay;
}

function comparePresentMode(a: PartnerTeamRow, b: PartnerTeamRow): number {
  const pa = presentEquivHalf(a.metrics);
  const pb = presentEquivHalf(b.metrics);
  if (Math.abs(pb - pa) > 1e-9) return pb - pa;
  if (a.metrics.totalAbsent !== b.metrics.totalAbsent) return a.metrics.totalAbsent - b.metrics.totalAbsent;
  return compareLeaderboardQuality(a, b);
}

function compareAbsentMode(a: PartnerTeamRow, b: PartnerTeamRow): number {
  if (a.metrics.totalAbsent !== b.metrics.totalAbsent) return a.metrics.totalAbsent - b.metrics.totalAbsent;
  const pa = presentEquivHalf(a.metrics);
  const pb = presentEquivHalf(b.metrics);
  if (Math.abs(pb - pa) > 1e-9) return pb - pa;
  return compareLeaderboardQuality(a, b);
}

function compareLeaveMode(a: PartnerTeamRow, b: PartnerTeamRow): number {
  const la = a.metrics.leaveFullDaysConsumed;
  const lb = b.metrics.leaveFullDaysConsumed;
  if (la !== lb) return la - lb;
  if (a.metrics.totalAbsent !== b.metrics.totalAbsent) return a.metrics.totalAbsent - b.metrics.totalAbsent;
  const pa = presentEquivHalf(a.metrics);
  const pb = presentEquivHalf(b.metrics);
  if (Math.abs(pb - pa) > 1e-9) return pb - pa;
  return compareLeaderboardQuality(a, b);
}

function compareExcessMode(a: PartnerTeamRow, b: PartnerTeamRow): number {
  const exA = a.metrics.calcExcessDeficit;
  const exB = b.metrics.calcExcessDeficit;
  if (Math.abs(exB - exA) > 1e-6) return exB - exA;
  const pa = presentEquivHalf(a.metrics);
  const pb = presentEquivHalf(b.metrics);
  if (Math.abs(pb - pa) > 1e-9) return pb - pa;
  return a.metrics.totalAbsent - b.metrics.totalAbsent;
}

function compareLateMode(a: PartnerTeamRow, b: PartnerTeamRow): number {
  if (a.metrics.calcLate !== b.metrics.calcLate) return a.metrics.calcLate - b.metrics.calcLate;
  return compareAbsentMode(a, b);
}

/** Anyone with 0 present days is sorted last in every mode (never showed up). */
function compareWithZeroPresentLast(
  a: PartnerTeamRow,
  b: PartnerTeamRow,
  inner: (a: PartnerTeamRow, b: PartnerTeamRow) => number
): number {
  const aNever = a.metrics.totalPresent === 0 ? 1 : 0;
  const bNever = b.metrics.totalPresent === 0 ? 1 : 0;
  if (aNever !== bNever) return aNever - bNever;
  return inner(a, b);
}

const LEADERBOARD_SORT_MODES: LeaderboardSortMode[] = [
  "present",
  "absent",
  "leave",
  "excess",
  "late",
];

const LEADERBOARD_MODE_HINT: Record<LeaderboardSortMode, string> = {
  present:
    "Most present days first (½ per half day), then fewer absences. 0 present → last.",
  absent:
    "Fewest absent days first, then more present days. 0 present → last.",
  leave:
    "Fewest full leave days used first, then fewer absences, then more present. 0 present → last.",
  excess:
    "Highest excess vs scheduled first (month total; + worked more, − short). Then present, then absent. 0 present → last.",
  late:
    "Fewest late arrivals first, then fewer absences, then more present. 0 present → last.",
};

const LEADERBOARD_MODE_LABEL: Record<LeaderboardSortMode, string> = {
  present: "Present",
  absent: "Absent",
  leave: "Leave",
  excess: "Excess / deficit",
  late: "Late",
};

export function PartnerTeamOverview({
  monthYear,
  rows,
  onSelectMember,
}: PartnerTeamOverviewProps) {
  const period = formatMonthLabel(monthYear);
  const [leaderMode, setLeaderMode] = useState<LeaderboardSortMode>("present");

  const sortedLeaderboard = useMemo(() => {
    const cmp =
      leaderMode === "present"
        ? comparePresentMode
        : leaderMode === "absent"
          ? compareAbsentMode
          : leaderMode === "leave"
            ? compareLeaveMode
            : leaderMode === "excess"
              ? compareExcessMode
              : compareLateMode;
    return [...rows].sort((a, b) => compareWithZeroPresentLast(a, b, cmp));
  }, [rows, leaderMode]);

  const attentionList = useMemo(() => {
    return [...rows]
      .map((r) => ({
        ...r,
        score: needsAttentionScore(r.metrics),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ma = a.metrics;
        const mb = b.metrics;
        if (mb.totalAbsent !== ma.totalAbsent) return mb.totalAbsent - ma.totalAbsent;
        if (mb.calcLate !== ma.calcLate) return mb.calcLate - ma.calcLate;
        return mb.totalHalfDay - ma.totalHalfDay;
      });
  }, [rows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.present += r.metrics.totalPresent;
        acc.absent += r.metrics.totalAbsent;
        acc.late += r.metrics.calcLate;
        acc.leave += r.metrics.leaveFullDaysConsumed;
        acc.half += r.metrics.totalHalfDay;
        return acc;
      },
      { present: 0, absent: 0, late: 0, leave: 0, half: 0 }
    );
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
        No attendance rows for your team in {period || "this month"} yet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" aria-hidden />
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Team overview
            </h3>
            {period && (
              <p className="text-xs text-muted-foreground">
                Same summary rules as admin · {period}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-md border border-border bg-background px-2 py-1">
            Σ Present <strong className="text-emerald-700">{totals.present}</strong>
          </span>
          <span className="rounded-md border border-border bg-background px-2 py-1">
            Σ Absent <strong className="text-rose-700">{totals.absent}</strong>
          </span>
          <span className="rounded-md border border-border bg-background px-2 py-1">
            Σ Late <strong className="text-amber-700">{totals.late}</strong>
          </span>
          <span className="rounded-md border border-border bg-background px-2 py-1">
            Σ Leave <strong className="text-sky-700">{totals.leave}</strong>
          </span>
          <span className="rounded-md border border-border bg-background px-2 py-1">
            Σ Half <strong className="text-muted-foreground">{totals.half}</strong>
          </span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-2 text-foreground">
                <Trophy className="h-4 w-4 shrink-0 text-amber-500/90" aria-hidden />
                <span className="text-sm font-medium">Leaderboard</span>
              </div>
              <div
                className="flex flex-wrap gap-0.5 rounded-lg border border-border bg-background p-0.5"
                role="group"
                aria-label="Leaderboard ranking type"
              >
                {LEADERBOARD_SORT_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={leaderMode === mode}
                    onClick={() => setLeaderMode(mode)}
                    className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${
                      leaderMode === mode
                        ? "bg-surface text-foreground shadow-[inset_0_0_0_1px_rgba(147,197,253,0.35)]"
                        : "text-muted-foreground hover:bg-surface/70 hover:text-foreground"
                    }`}
                  >
                    {LEADERBOARD_MODE_LABEL[mode]}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              {LEADERBOARD_MODE_HINT[leaderMode]}
            </p>
          </div>
          <ol className="space-y-2">
            {sortedLeaderboard.map((r, i) => {
              const qRate = attendanceQualityRate(r.metrics);
              const ex = r.metrics.calcExcessDeficit;
              const equiv = presentEquivHalf(r.metrics);
              const m = r.metrics;

              let titleHint = r.name;
              let badge: React.ReactNode = null;
              if (leaderMode === "present") {
                titleHint = `${r.name} — ${equiv} present-equivalent days (P ${m.totalPresent}, ½×${m.totalHalfDay})`;
                badge = (
                  <span
                    className="rounded bg-emerald-500/15 px-1.5 py-px font-mono text-[10px] tabular-nums text-emerald-800"
                    title="Present-equivalent days (half day = ½)"
                  >
                    P {equiv % 1 === 0 ? String(equiv) : equiv.toFixed(1)}
                  </span>
                );
              } else if (leaderMode === "absent") {
                titleHint = `${r.name} — ${m.totalAbsent} absent day${m.totalAbsent === 1 ? "" : "s"} this month`;
                badge = (
                  <span
                    className="rounded bg-rose-500/15 px-1.5 py-px font-mono text-[10px] tabular-nums text-rose-800"
                    title="Absent days (lower is better)"
                  >
                    A {m.totalAbsent}
                  </span>
                );
              } else if (leaderMode === "leave") {
                titleHint = `${r.name} — ${m.leaveFullDaysConsumed} full leave day${m.leaveFullDaysConsumed === 1 ? "" : "s"} consumed`;
                badge = (
                  <span
                    className="rounded bg-sky-500/15 px-1.5 py-px font-mono text-[10px] tabular-nums text-sky-900"
                    title="Full leave days consumed (lower is better)"
                  >
                    Lv {m.leaveFullDaysConsumed}
                  </span>
                );
              } else if (leaderMode === "excess") {
                titleHint = `${r.name} — month ${ex > 0 ? "+" : ex < 0 ? "−" : ""}${formatHoursMinutes(Math.abs(ex))} vs scheduled`;
                badge = (
                  <span
                    className={`rounded px-1.5 py-px font-mono text-[10px] tabular-nums ${
                      ex > 0
                        ? "bg-emerald-500/15 text-emerald-800"
                        : ex < 0
                          ? "bg-rose-500/15 text-rose-800"
                          : "bg-background text-muted-foreground border border-border"
                    }`}
                    title="Excess (+) or deficit (−) vs scheduled hours this month"
                  >
                    {ex > 0 ? "+" : ex < 0 ? "−" : ""}
                    {formatHoursMinutes(Math.abs(ex))}
                  </span>
                );
              } else {
                titleHint = `${r.name} — ${m.calcLate} late arrival${m.calcLate === 1 ? "" : "s"} this month`;
                badge = (
                  <span
                    className="rounded bg-amber-500/15 px-1.5 py-px font-mono text-[10px] tabular-nums text-amber-800"
                    title="Late count (lower is better)"
                  >
                    Lt {m.calcLate}
                  </span>
                );
              }

              return (
              <li key={r.userId}>
                <button
                  type="button"
                  onClick={() => onSelectMember?.(r.userId)}
                  title={titleHint}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition hover:bg-surface/70"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0
                        ? "bg-amber-500/15 text-amber-800"
                        : i === 1
                          ? "bg-surface text-foreground shadow-[inset_0_0_0_1px_rgba(147,197,253,0.25)]"
                          : i === 2
                            ? "bg-orange-500/15 text-orange-800"
                            : "bg-background text-muted-foreground border border-border"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {r.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="font-mono text-[10px] text-muted-foreground">{r.code}</p>
                      {badge}
                      {qRate != null && leaderMode !== "excess" && (
                        <span
                          className="rounded bg-background px-1.5 py-px font-mono text-[10px] tabular-nums text-muted-foreground border border-border"
                          title="% of working days (present + ½ per half day)"
                        >
                          {Math.round(qRate * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    <span className="text-emerald-700">
                      P {r.metrics.totalPresent}
                    </span>
                    <span className="mx-1 text-muted-foreground/50">·</span>
                    <span className="text-rose-700">
                      A {r.metrics.totalAbsent}
                    </span>
                    <span className="mx-1 text-muted-foreground/50">·</span>
                    <span className="text-amber-700">
                      L {r.metrics.calcLate}
                    </span>
                  </div>
                  <div className="hidden w-20 shrink-0 text-right font-mono text-[10px] text-muted-foreground sm:block">
                    {r.metrics.calcExcessDeficit > 0 ? "+" : r.metrics.calcExcessDeficit < 0 ? "−" : ""}
                    {formatHoursMinutes(Math.abs(r.metrics.calcExcessDeficit))}
                  </div>
                </button>
              </li>
            );
            })}
          </ol>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2 text-foreground">
            <AlertTriangle className="h-4 w-4 text-orange-600" aria-hidden />
            <span className="text-sm font-medium">Needs attention</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              weight: absent » late » half day
            </span>
          </div>
          {attentionList.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
              No absent, late, or half-day flags this month.
            </p>
          ) : (
            <ul className="space-y-2">
              {attentionList.slice(0, 8).map((r) => (
                <li key={r.userId}>
                  <button
                    type="button"
                    onClick={() => onSelectMember?.(r.userId)}
                    title={`A${r.metrics.totalAbsent} · L${r.metrics.calcLate} · H${r.metrics.totalHalfDay} — score ${r.score} (100×A + 50×L + 10×H)`}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm hover:bg-surface/70"
                  >
                    <span className="truncate text-foreground">{r.name}</span>
                    <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 font-mono text-xs text-muted-foreground">
                      <span className="text-rose-700">A{r.metrics.totalAbsent}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="text-amber-700">L{r.metrics.calcLate}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="text-muted-foreground">H{r.metrics.totalHalfDay}</span>
                      <span className="ml-0.5 text-orange-700">{r.score}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
