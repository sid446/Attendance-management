/** Leave day amounts always display with exactly two decimal places. */
export const formatLeaveValue = (value: number | null | undefined): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
};

export function currentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Months from Jan 2026 through the current month (newest first). */
export function leaveMonthOptions(): string[] {
  const options: string[] = [];
  const end = currentMonthYear();
  let y = 2026;
  let m = 1;
  while (true) {
    const my = `${y}-${String(m).padStart(2, '0')}`;
    if (my > end) break;
    options.push(my);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return options.reverse();
}

export function formatMonthLabel(monthYear: string): string {
  const [year, month] = monthYear.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function addMonthYear(monthYear: string, delta: number): string {
  const [year, month] = monthYear.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatPeriodLabel(fromMonth: string, monthFilter: string): string {
  if (fromMonth === monthFilter) return formatMonthLabel(monthFilter);
  return `${formatMonthLabel(fromMonth)} – ${formatMonthLabel(monthFilter)}`;
}

export function clampMonthYear(monthYear: string, options: string[]): string {
  if (options.includes(monthYear)) return monthYear;
  const sorted = [...options].sort();
  if (sorted.length === 0) return monthYear;
  if (monthYear < sorted[0]) return sorted[0];
  return sorted[sorted.length - 1];
}
