import type { SummaryAlignedMetrics } from "@/lib/attendanceSummaryMetrics";

export interface PartnerTeamRow {
  userId: string;
  name: string;
  code: string;
  metrics: SummaryAlignedMetrics;
}

export interface PartnerTeamOverviewProps {
  monthYear: string;
  rows: PartnerTeamRow[];
  /** Jump to calendar for this employee */
  onSelectMember?: (userId: string) => void;
}

export type LeaderboardSortMode = "present" | "absent" | "leave" | "excess" | "late";

export type LeaderboardSortDirection = "asc" | "desc";
