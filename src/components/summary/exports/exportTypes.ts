import type { AttendanceSummaryView, User } from '@/types/ui';
import type { EnrichedSummary, SummaryFilterType } from '../types';

export interface SummaryPeriodBase {
  filterType: SummaryFilterType;
  selectedYear: number;
  selectedMonth: number;
  currentWeekStart: string;
  rangeEnd: string;
}

export interface SummaryExportContext {
  filteredSummaries: EnrichedSummary[];
  allUsers?: User[];
  holidays: { date: string; name: string }[];
  filterType: SummaryFilterType;
  selectedYear: number;
  selectedMonth: number;
  currentWeekStart: string;
  rangeStart: string;
  rangeEnd: string;
  selectedEmployeeIds: Set<string>;
  summaryPeriodBase: SummaryPeriodBase;
  resolveWorkPartner: (user: User | undefined, monthYear?: string) => string;
  resolveDesignation: (user: User | undefined, monthYear?: string) => string;
  countTotalSundaysInPeriod: () => number;
  /** Partner-set allowed hours per day (userId:YYYY-MM-DD). */
  excessDayAllowanceMap?: Record<string, number>;
  /** Monthly excess caps (userId:YYYY-MM). */
  excessAllowanceMap?: Record<string, number>;
  /** Day-approval display totals (userId:YYYY-MM). */
  excessDisplayMap?: Record<string, number>;
}

export type { AttendanceSummaryView };
