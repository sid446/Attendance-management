import { type TeamDailyUpdateCategory } from "@/lib/teamDailyUpdates";

export const DISPLAY_ORDER: TeamDailyUpdateCategory[] = [
  "leave",
  "wfh",
  "outstation",
  "half_day",
  "other_approved",
  "pending",
  "pending_hr",
];

export const DATE_INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground disabled:opacity-50";
