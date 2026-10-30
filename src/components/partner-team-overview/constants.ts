import type { LeaderboardSortMode, LeaderboardSortDirection } from './types';

/** Needs attention: absent >> late >> half day (one absent outweighs many lates or half days). */
export const ATTENTION_W_ABSENT = 100;

export const ATTENTION_W_LATE = 50;

export const ATTENTION_W_HALF = 10;

export const LEADERBOARD_SORT_MODES: LeaderboardSortMode[] = [
  "present",
  "absent",
  "leave",
  "excess",
  "late",
];

export const DEFAULT_SORT_DIRECTION: Record<LeaderboardSortMode, LeaderboardSortDirection> = {
  present: "desc",
  absent: "asc",
  leave: "asc",
  excess: "desc",
  late: "asc",
};

export const LEADERBOARD_MODE_HINT: Record<
  LeaderboardSortMode,
  Record<LeaderboardSortDirection, string>
> = {
  present: {
    desc: "Most present days first (½ per half day), then fewer absences.",
    asc: "Fewest present days first, then fewer absences.",
  },
  absent: {
    asc: "Fewest absent days first, then more present days.",
    desc: "Most absent days first, then fewer present days.",
  },
  leave: {
    asc: "Fewest full leave days used first, then fewer absences.",
    desc: "Most full leave days used first, then more absences.",
  },
  excess: {
    desc: "Highest excess vs scheduled first (+ worked more, − short).",
    asc: "Lowest excess / highest deficit vs scheduled first.",
  },
  late: {
    asc: "Fewest late arrivals first, then fewer absences.",
    desc: "Most late arrivals first, then more absences.",
  },
};

export const LEADERBOARD_MODE_LABEL: Record<LeaderboardSortMode, string> = {
  present: "Present",
  absent: "Absent",
  leave: "Leave",
  excess: "Excess / deficit",
  late: "Late",
};
