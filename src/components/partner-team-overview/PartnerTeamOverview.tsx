"use client";

import React from "react";
import { formatHoursMinutes } from "@/lib/attendanceSummaryMetrics";
import { Trophy, AlertTriangle, BarChart3, ArrowUp, ArrowDown } from "lucide-react";
import type { PartnerTeamOverviewProps } from './types';
import { LEADERBOARD_SORT_MODES, LEADERBOARD_MODE_LABEL, DEFAULT_SORT_DIRECTION, LEADERBOARD_MODE_HINT } from './constants';
import { usePartnerTeamOverviewLogic } from './hooks';

export type { PartnerTeamRow, PartnerTeamOverviewProps, LeaderboardSortMode, LeaderboardSortDirection } from './types';

export function PartnerTeamOverview({
  monthYear,
  rows,
  onSelectMember,
}: PartnerTeamOverviewProps) {
  const {
    period,
    leaderMode,
    leaderDirection,
    handleLeaderModeClick,
    sortedLeaderboard,
    attentionList,
    totals,
  } = usePartnerTeamOverviewLogic({ monthYear, rows });

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
                {LEADERBOARD_SORT_MODES.map((mode) => {
                  const isActive = leaderMode === mode;
                  const DirectionIcon =
                    leaderDirection === "asc" ? ArrowUp : ArrowDown;
                  return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={isActive}
                    aria-label={`${LEADERBOARD_MODE_LABEL[mode]} — sort ${
                      isActive ? leaderDirection : DEFAULT_SORT_DIRECTION[mode]
                    }`}
                    onClick={() => handleLeaderModeClick(mode)}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${
                      isActive
                        ? "bg-surface text-foreground shadow-[inset_0_0_0_1px_rgba(147,197,253,0.35)]"
                        : "text-muted-foreground hover:bg-surface/70 hover:text-foreground"
                    }`}
                  >
                    {LEADERBOARD_MODE_LABEL[mode]}
                    {isActive && (
                      <DirectionIcon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                    )}
                  </button>
                );
                })}
              </div>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              {LEADERBOARD_MODE_HINT[leaderMode][leaderDirection]} Tap the active filter again to reverse order.
            </p>
          </div>
          <ol className="space-y-2">
            {sortedLeaderboard.map((r, i) => {
              const ex = r.metrics.calcExcessDeficit;
              const m = r.metrics;

              let titleHint = r.name;
              let badge: React.ReactNode = null;
              if (leaderMode === "present") {
                titleHint = `${r.name} — ${m.totalPresent} present day${m.totalPresent === 1 ? "" : "s"} this month`;
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
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    <div>
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
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {r.metrics.calcExcessDeficit > 0 ? "+" : r.metrics.calcExcessDeficit < 0 ? "−" : ""}
                      {formatHoursMinutes(Math.abs(r.metrics.calcExcessDeficit))}
                    </div>
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
