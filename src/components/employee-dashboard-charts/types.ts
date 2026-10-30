import type { SummaryAlignedMetrics } from "@/lib/attendanceSummaryMetrics";

export interface EmployeeDashboardChartsProps {
  metrics: SummaryAlignedMetrics;
  /** Non–holiday-like days with hours, sorted by date */
  dailySeries: { date: string; hours: number }[];
}
