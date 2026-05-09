"use client";

import React, { useMemo } from "react";
import type { SummaryAlignedMetrics } from "@/lib/attendanceSummaryMetrics";
import { formatHoursMinutes } from "@/lib/attendanceSummaryMetrics";

export interface EmployeeDashboardChartsProps {
  metrics: SummaryAlignedMetrics;
  /** Non–holiday-like days with hours, sorted by date */
  dailySeries: { date: string; hours: number }[];
}

export function EmployeeDashboardCharts({
  metrics: m,
  dailySeries,
}: EmployeeDashboardChartsProps) {
  const hourMax = useMemo(() => {
    const w = Math.max(0, m.totalHour);
    const s = Math.max(0, m.calcScheduledHours);
    return Math.max(w, s, 1);
  }, [m.totalHour, m.calcScheduledHours]);

  const workedPct = (m.totalHour / hourMax) * 100;
  const schedPct = (m.calcScheduledHours / hourMax) * 100;

  const dayBars = useMemo(
    () => [
      // Use solid fills (better contrast on light surfaces)
      { label: "Present", value: m.totalPresent, className: "bg-emerald-500" },
      { label: "Absent", value: m.totalAbsent, className: "bg-rose-500" },
      { label: "Half", value: m.totalHalfDay, className: "bg-amber-500" },
      { label: "Leave", value: m.leaveFullDaysConsumed, className: "bg-sky-500" },
    ],
    [m]
  );

  const dayMax = useMemo(
    () => Math.max(...dayBars.map((b) => b.value), 1),
    [dayBars]
  );

  const cumulative = useMemo(() => {
    let cum = 0;
    return dailySeries.map((d) => {
      cum += d.hours;
      return cum;
    });
  }, [dailySeries]);

  const sparkline = useMemo(() => {
    if (cumulative.length === 0) return null;
    const w = 320;
    const h = 72;
    const pad = 4;
    const maxC = Math.max(cumulative[cumulative.length - 1]!, 0.01);
    const n = cumulative.length;
    const pts = cumulative.map((cum, i) => {
      const x =
        n <= 1 ? w / 2 : pad + (i * (w - pad * 2)) / (n - 1);
      const y = h - pad - (cum / maxC) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const points = n === 1 ? `${pts[0]} ${pts[0]}` : pts.join(" ");
    return { w, h, points, maxC };
  }, [cumulative]);

  return (
    <div className="mt-4 space-y-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Visual summary
      </h4>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-[11px] font-medium text-muted-foreground">Hours vs scheduled</p>
          <p className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground">
            Worked
          </p>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-emerald-500/90 transition-[width] duration-300"
              style={{ width: `${Math.min(100, workedPct)}%` }}
              title={formatHoursMinutes(m.totalHour)}
            />
          </div>
          <p className="mt-0.5 font-mono text-xs text-foreground">
            {formatHoursMinutes(m.totalHour)}
          </p>
          <p className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground">
            Scheduled
          </p>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-muted-foreground/50 transition-[width] duration-300"
              style={{ width: `${Math.min(100, schedPct)}%` }}
              title={formatHoursMinutes(m.calcScheduledHours)}
            />
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {formatHoursMinutes(m.calcScheduledHours)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-[11px] font-medium text-muted-foreground">Day outcomes</p>
          <div
            className="mt-4 flex h-36 items-end justify-between gap-2 px-1"
            role="img"
            aria-label="Bar chart of present, absent, half day, and leave counts"
          >
            {dayBars.map((b) => (
              <div
                key={b.label}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <div className="flex h-28 w-full items-end justify-center">
                  <div
                    className={`w-full max-w-[3rem] rounded-t-md ${b.className}`}
                    style={{
                      height:
                        b.value === 0
                          ? "4px"
                          : `${Math.max(10, (b.value / dayMax) * 100)}%`,
                    }}
                    title={`${b.label}: ${b.value}`}
                  />
                </div>
                <span className="text-center text-[10px] text-muted-foreground">
                  {b.label}
                </span>
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {b.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {sparkline && (
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-[11px] font-medium text-muted-foreground">
            Cumulative worked hours (month)
          </p>
          <svg
            width="100%"
            height={sparkline.h}
            viewBox={`0 0 ${sparkline.w} ${sparkline.h}`}
            className="mt-2 text-emerald-400/90"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Cumulative hours trend, ending at ${formatHoursMinutes(sparkline.maxC)}`}
          >
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={sparkline.points}
            />
          </svg>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Each step is a working day (excludes Sunday, holidays, and week-off types in the
            calendar).
          </p>
        </div>
      )}
    </div>
  );
}
