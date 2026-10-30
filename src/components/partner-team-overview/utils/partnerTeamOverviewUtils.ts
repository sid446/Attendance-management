import type { SummaryAlignedMetrics } from "@/lib/attendanceSummaryMetrics";
import type { PartnerTeamRow } from '../types';
import { ATTENTION_W_ABSENT, ATTENTION_W_LATE, ATTENTION_W_HALF } from '../constants';

export function formatMonthLabel(monthYear: string): string {
  const [ys, ms] = monthYear.split("-");
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  if (!y || !m) return "";
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Compare two rows for leaderboard order (higher rank = better attendance quality).
 * Primary: equivalent present rate = (present + ½ half days) / working days in records —
 * fair when people have different numbers of eligible working days (e.g. join dates).
 * Tiebreak: fewer absences → fewer lates → more raw present days.
 */
export function compareLeaderboardQuality(a: PartnerTeamRow, b: PartnerTeamRow): number {
  const ma = a.metrics;
  const mb = b.metrics;
  const wa = ma.workingDaysInRecords;
  const wb = mb.workingDaysInRecords;
  const sa = ma.totalPresent + 0.5 * ma.totalHalfDay;
  const sb = mb.totalPresent + 0.5 * mb.totalHalfDay;

  if (wa > 0 && wb > 0) {
    const cross = sb * wa - sa * wb;
    if (cross !== 0) return cross;
  } else if (wa > 0 && wb <= 0) return -1;
  else if (wa <= 0 && wb > 0) return 1;

  if (ma.totalAbsent !== mb.totalAbsent) return ma.totalAbsent - mb.totalAbsent;
  if (ma.calcLate !== mb.calcLate) return ma.calcLate - mb.calcLate;
  return mb.totalPresent - ma.totalPresent;
}

export function needsAttentionScore(m: SummaryAlignedMetrics): number {
  return (
    m.totalAbsent * ATTENTION_W_ABSENT +
    m.calcLate * ATTENTION_W_LATE +
    m.totalHalfDay * ATTENTION_W_HALF
  );
}

/** Present-equivalent days (half day = ½). */
export function presentEquivHalf(m: SummaryAlignedMetrics): number {
  return m.totalPresent + 0.5 * m.totalHalfDay;
}

export function comparePresentMode(a: PartnerTeamRow, b: PartnerTeamRow): number {
  const pa = presentEquivHalf(a.metrics);
  const pb = presentEquivHalf(b.metrics);
  if (Math.abs(pb - pa) > 1e-9) return pb - pa;
  if (a.metrics.totalAbsent !== b.metrics.totalAbsent) return a.metrics.totalAbsent - b.metrics.totalAbsent;
  return compareLeaderboardQuality(a, b);
}

export function compareAbsentMode(a: PartnerTeamRow, b: PartnerTeamRow): number {
  if (a.metrics.totalAbsent !== b.metrics.totalAbsent) return a.metrics.totalAbsent - b.metrics.totalAbsent;
  const pa = presentEquivHalf(a.metrics);
  const pb = presentEquivHalf(b.metrics);
  if (Math.abs(pb - pa) > 1e-9) return pb - pa;
  return compareLeaderboardQuality(a, b);
}

export function compareLeaveMode(a: PartnerTeamRow, b: PartnerTeamRow): number {
  const la = a.metrics.leaveFullDaysConsumed;
  const lb = b.metrics.leaveFullDaysConsumed;
  if (la !== lb) return la - lb;
  if (a.metrics.totalAbsent !== b.metrics.totalAbsent) return a.metrics.totalAbsent - b.metrics.totalAbsent;
  const pa = presentEquivHalf(a.metrics);
  const pb = presentEquivHalf(b.metrics);
  if (Math.abs(pb - pa) > 1e-9) return pb - pa;
  return compareLeaderboardQuality(a, b);
}

export function compareExcessMode(a: PartnerTeamRow, b: PartnerTeamRow): number {
  const exA = a.metrics.calcExcessDeficit;
  const exB = b.metrics.calcExcessDeficit;
  if (Math.abs(exB - exA) > 1e-6) return exB - exA;
  const pa = presentEquivHalf(a.metrics);
  const pb = presentEquivHalf(b.metrics);
  if (Math.abs(pb - pa) > 1e-9) return pb - pa;
  return a.metrics.totalAbsent - b.metrics.totalAbsent;
}

export function compareLateMode(a: PartnerTeamRow, b: PartnerTeamRow): number {
  if (a.metrics.calcLate !== b.metrics.calcLate) return a.metrics.calcLate - b.metrics.calcLate;
  return compareAbsentMode(a, b);
}

/** Anyone with 0 present days is sorted last in every mode (never showed up). */
export function compareWithZeroPresentLast(
  a: PartnerTeamRow,
  b: PartnerTeamRow,
  inner: (a: PartnerTeamRow, b: PartnerTeamRow) => number
): number {
  const aNever = a.metrics.totalPresent === 0 ? 1 : 0;
  const bNever = b.metrics.totalPresent === 0 ? 1 : 0;
  if (aNever !== bNever) return aNever - bNever;
  return inner(a, b);
}
