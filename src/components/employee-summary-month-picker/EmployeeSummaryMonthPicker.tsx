"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { EmployeeSummaryMonthPickerProps } from './types';
import { MONTHS } from './constants';
import { useEmployeeSummaryMonthPickerLogic } from './hooks';

export type { EmployeeSummaryMonthPickerProps } from './types';

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
  const {
    selectedYear,
    selectedMonth,
    yearOptions,
    setYm,
    goPrevMonth,
    goNextMonth,
    goPrevYear,
    goNextYear,
  } = useEmployeeSummaryMonthPickerLogic({ monthYear, onMonthYearChange });

  return (
    <div className={`rounded-xl border border-border bg-surface p-3 sm:p-4 ${className}`}>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrevYear}
            disabled={disabled}
            className="rounded-lg border border-border bg-background p-2 text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
            title="Previous year"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <select
            value={selectedYear}
            onChange={(e) => setYm(parseInt(e.target.value, 10), selectedMonth)}
            disabled={disabled}
            className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground disabled:opacity-50"
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
            className="rounded-lg border border-border bg-background p-2 text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="rounded-lg border border-border bg-background p-2 text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <select
            value={selectedMonth}
            onChange={(e) => setYm(selectedYear, parseInt(e.target.value, 10))}
            disabled={disabled}
            className="min-w-[8.5rem] rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground disabled:opacity-50 sm:min-w-[10rem]"
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
            className="rounded-lg border border-border bg-background p-2 text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
