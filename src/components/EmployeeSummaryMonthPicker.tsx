"use client";

import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

export interface EmployeeSummaryMonthPickerProps {
  monthYear: string;
  onMonthYearChange: (monthYear: string) => void;
  /** When true, controls are non-interactive (e.g. while attendance is loading). */
  disabled?: boolean;
  /** Optional label above the controls (default matches Dashboard). */
  label?: string;
  className?: string;
}

/**
 * Month/year controls shared by Dashboard summary and Team attendance
 * (same UX as the original Dashboard “Summary month” block).
 */
export function EmployeeSummaryMonthPicker({
  monthYear,
  onMonthYearChange,
  disabled = false,
  label = "Summary month",
  className = "",
}: EmployeeSummaryMonthPickerProps) {
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

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 sm:p-4 ${className}`}>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrevYear}
            disabled={disabled}
            className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            title="Previous year"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <select
            value={selectedYear}
            onChange={(e) => setYm(parseInt(e.target.value, 10), selectedMonth)}
            disabled={disabled}
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
            disabled={disabled}
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
            disabled={disabled}
            className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <select
            value={selectedMonth}
            onChange={(e) => setYm(selectedYear, parseInt(e.target.value, 10))}
            disabled={disabled}
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
            disabled={disabled}
            className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
