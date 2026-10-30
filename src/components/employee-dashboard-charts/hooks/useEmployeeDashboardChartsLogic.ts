"use client";

import { useMemo } from "react";
import type { EmployeeDashboardChartsProps } from '../types';

export function useEmployeeDashboardChartsLogic({ metrics: m, dailySeries }: EmployeeDashboardChartsProps) {
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
      { label: "Absent / leave", value: m.absentOrLeaveDays, className: "bg-rose-500" },
      { label: "Half", value: m.totalHalfDay, className: "bg-amber-500" },
      { label: "Worked on holiday", value: m.workedOnHolidayDays, className: "bg-sky-500" },
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

  return {
    workedPct,
    schedPct,
    dayBars,
    dayMax,
    sparkline,
  } as const;
}
