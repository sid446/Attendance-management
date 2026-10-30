"use client";

import { useMemo } from "react";
import type { EmployeeSummaryMonthPickerProps } from '../types';

export function useEmployeeSummaryMonthPickerLogic({ monthYear, onMonthYearChange }: Pick<EmployeeSummaryMonthPickerProps, 'monthYear' | 'onMonthYearChange'>) {
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

  return {
    selectedYear,
    selectedMonth,
    yearOptions,
    setYm,
    goPrevMonth,
    goNextMonth,
    goPrevYear,
    goNextYear,
  } as const;
}
