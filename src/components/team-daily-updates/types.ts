import type { TeamDailyUpdateEntry } from "@/lib/teamDailyUpdates";

export interface TeamDailyUpdatesSectionProps {
  viewerUserId: string;
  onSelectMember?: (userId: string) => void;
  /** When false, only the body renders (e.g. inside a modal). Default true. */
  showHeader?: boolean;
  /** Called after each successful fetch (e.g. to refresh header badge for today). */
  onLoaded?: (payload: DailyUpdatesPayload) => void;
}

export interface DailyUpdatesPayload {
  date: string;
  from: string;
  to: string;
  entries: TeamDailyUpdateEntry[];
  summary: {
    total: number;
    onLeave: number;
    away: number;
    pending: number;
  };
}
