export interface EmployeeSummaryMonthPickerProps {
  monthYear: string;
  onMonthYearChange: (monthYear: string) => void;
  /** When true, controls are non-interactive (e.g. while attendance is loading). */
  disabled?: boolean;
  /** Optional label above the controls (default matches Dashboard). */
  label?: string;
  className?: string;
}
