"use client";

import { useMemo, useState } from "react";
import type { LeaderboardSortMode, LeaderboardSortDirection, PartnerTeamOverviewProps } from '../types';
import { DEFAULT_SORT_DIRECTION } from '../constants';
import { formatMonthLabel, comparePresentMode, compareAbsentMode, compareLeaveMode, compareExcessMode, compareLateMode, compareWithZeroPresentLast, needsAttentionScore } from '../utils/partnerTeamOverviewUtils';

export function usePartnerTeamOverviewLogic({ monthYear, rows }: Pick<PartnerTeamOverviewProps, 'monthYear' | 'rows'>) {
  const period = formatMonthLabel(monthYear);
  const [leaderMode, setLeaderMode] = useState<LeaderboardSortMode>("present");
  const [leaderDirection, setLeaderDirection] = useState<LeaderboardSortDirection>(
    DEFAULT_SORT_DIRECTION.present
  );

  const handleLeaderModeClick = (mode: LeaderboardSortMode) => {
    if (mode === leaderMode) {
      setLeaderDirection((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setLeaderMode(mode);
    setLeaderDirection(DEFAULT_SORT_DIRECTION[mode]);
  };

  const sortedLeaderboard = useMemo(() => {
    const cmp =
      leaderMode === "present"
        ? comparePresentMode
        : leaderMode === "absent"
          ? compareAbsentMode
          : leaderMode === "leave"
            ? compareLeaveMode
            : leaderMode === "excess"
              ? compareExcessMode
              : compareLateMode;
    const dirMul = leaderDirection === DEFAULT_SORT_DIRECTION[leaderMode] ? 1 : -1;
    return [...rows].sort(
      (a, b) => dirMul * compareWithZeroPresentLast(a, b, cmp)
    );
  }, [rows, leaderMode, leaderDirection]);

  const attentionList = useMemo(() => {
    return [...rows]
      .map((r) => ({
        ...r,
        score: needsAttentionScore(r.metrics),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ma = a.metrics;
        const mb = b.metrics;
        if (mb.totalAbsent !== ma.totalAbsent) return mb.totalAbsent - ma.totalAbsent;
        if (mb.calcLate !== ma.calcLate) return mb.calcLate - ma.calcLate;
        return mb.totalHalfDay - ma.totalHalfDay;
      });
  }, [rows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.present += r.metrics.totalPresent;
        acc.absent += r.metrics.totalAbsent;
        acc.late += r.metrics.calcLate;
        acc.leave += r.metrics.leaveFullDaysConsumed;
        acc.half += r.metrics.totalHalfDay;
        return acc;
      },
      { present: 0, absent: 0, late: 0, leave: 0, half: 0 }
    );
  }, [rows]);

  return {
    period,
    leaderMode,
    leaderDirection,
    handleLeaderModeClick,
    sortedLeaderboard,
    attentionList,
    totals,
  } as const;
}
