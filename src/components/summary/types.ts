import type { AttendanceSummaryView } from '@/types/ui';

export type SummaryFilterType = 'month' | 'range' | 'week';

export type SummaryDetailRow = { date: string; info: string; subInfo?: string };

export type NumericFilter = { operator: string; value: number };

export type SummaryDetailModalState = {
  isOpen: boolean;
  title: string;
  data: SummaryDetailRow[];
};

export type EnrichedSummary = AttendanceSummaryView & {
  calcScheduled?: number;
  calcDefinedSchedule?: number;
  calcExcessDeficit?: number;
  calcLate?: number;
  rank?: number;
};

export interface SummarySectionProps {
  summaries: AttendanceSummaryView[];
  allUsers?: import('@/types/ui').User[];
  holidays?: { date: string; name: string }[];
  isLoading?: boolean;
  onFilterChange: (filter: string | { start: string; end: string } | { startDate: string; endDate: string }) => void;
  onEmployeeClick: (userId: string, monthYear: string) => void;
  onEmployeeDetailClick?: (userId: string) => void;
  onRefreshUsers?: () => void;
  uploadTotal?: number;
  uploadSaved?: number;
  uploadFailed?: number;
  initialMonthYear?: string;
  hideDetailedExport?: boolean;
}
