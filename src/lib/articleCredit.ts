import { User } from '@/types/ui';
import {
  resolveDisplayExcess,
  type ExcessAllowanceLookup,
  type ExcessDisplayLookup,
} from '@/lib/excessHourAllowance';

/**
 * How the weekday (hours-per-day) figure used for the hours -> days conversion is chosen.
 * - 'schedule': derive from each user's most recent Monday schedule, falling back to
 *   defaultWeekdayHours when unavailable/invalid (current behavior).
 * - 'fixed': always use defaultWeekdayHours.
 */
export type WeekdayHoursMode = 'schedule' | 'fixed';

/**
 * Tunable constants for the article-credit rule. The formula itself never changes:
 *   finalCredit = creditAsOnJan26 - leaveTakenAfterJan26 + excessDays
 *   excessDays  = sum(displayExcessHours for months >= cutoffMonth) / weekdayHours
 */
export interface ArticleCreditConfig {
  /** Inclusive lower bound (YYYY-MM) for months that contribute excess hours. */
  cutoffMonth: string;
  /** Fallback hours-per-day for the hours -> days conversion. Must be > 0. */
  defaultWeekdayHours: number;
  /** Whether weekday hours are derived per-user from schedule or fixed. */
  weekdayHoursMode: WeekdayHoursMode;
  /** When true, finalCredit is clamped to a minimum of 0. */
  floorFinalCreditAtZero: boolean;
}

/** Defaults reproduce the previous hard-coded behavior exactly. */
export const DEFAULT_ARTICLE_CREDIT_CONFIG: ArticleCreditConfig = {
  cutoffMonth: '2026-01',
  defaultWeekdayHours: 8,
  weekdayHoursMode: 'schedule',
  floorFinalCreditAtZero: false,
};

export interface ArticleCreditRow {
  empId: string;
  name: string;
  creditAsOnJan26: number;
  leaveTakenBeforeJan26: number; // From leaveBalance.used
  leaveTakenAfterJan26: number; // From leaveBalance.usedAfterJan26
  totalExcessHours: number; // Sum of excessHour from summary of each month from cutoff
  totalExcessDays: number; // Excess hours converted to days
  finalCredit: number;
}

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * Validate/clamp an arbitrary partial config, falling back to defaults for any
 * missing or invalid field. Safe to call on untrusted request bodies.
 */
export function sanitizeArticleCreditConfig(
  partial?: Partial<ArticleCreditConfig> | null
): ArticleCreditConfig {
  const cfg: ArticleCreditConfig = { ...DEFAULT_ARTICLE_CREDIT_CONFIG };
  if (partial && typeof partial === 'object') {
    if (typeof partial.cutoffMonth === 'string' && MONTH_RE.test(partial.cutoffMonth.trim())) {
      cfg.cutoffMonth = partial.cutoffMonth.trim();
    }
    if (
      typeof partial.defaultWeekdayHours === 'number' &&
      Number.isFinite(partial.defaultWeekdayHours) &&
      partial.defaultWeekdayHours > 0
    ) {
      cfg.defaultWeekdayHours = Number(partial.defaultWeekdayHours);
    }
    if (partial.weekdayHoursMode === 'schedule' || partial.weekdayHoursMode === 'fixed') {
      cfg.weekdayHoursMode = partial.weekdayHoursMode;
    }
    if (typeof partial.floorFinalCreditAtZero === 'boolean') {
      cfg.floorFinalCreditAtZero = partial.floorFinalCreditAtZero;
    }
  }
  return cfg;
}

/** Resolve the weekday (hours-per-day) figure for a user under the given config. */
function resolveWeekdayHours(user: User, config: ArticleCreditConfig): number {
  let weekdayHours = config.defaultWeekdayHours;

  if (config.weekdayHoursMode === 'schedule') {
    const schedules = (user as unknown as { schedules?: unknown }).schedules;
    if (Array.isArray(schedules) && schedules.length > 0) {
      const sortedSchedules = schedules
        .slice()
        .sort(
          (a: any, b: any) =>
            new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
        );
      const mondaySchedule = sortedSchedules[0]?.daily?.monday;
      if (mondaySchedule?.inTime && mondaySchedule?.outTime) {
        const [inH, inM] = mondaySchedule.inTime.split(':').map(Number);
        const [outH, outM] = mondaySchedule.outTime.split(':').map(Number);
        const h = outH + outM / 60 - (inH + inM / 60);
        weekdayHours = h > 0 ? h : config.defaultWeekdayHours;
      }
    }
  }

  if (!(weekdayHours > 0)) weekdayHours = config.defaultWeekdayHours;
  return weekdayHours;
}

/**
 * Compute a single article-credit row. Pure function: all inputs are passed in so
 * it can be reused by the table, the Excel export, and (potentially) the server.
 */
export function calculateArticleCredit(
  user: User,
  attendanceRecords: any[],
  config: ArticleCreditConfig = DEFAULT_ARTICLE_CREDIT_CONFIG,
  allowanceMap?: ExcessAllowanceLookup,
  displayMap?: ExcessDisplayLookup
): ArticleCreditRow {
  const creditAsOnJan26 = user.articleCreditsAsOnJan26 || 0;
  const leaveTakenBeforeJan26 = user.leaveBalance?.used || 0; // Leaves taken before cutoff
  const leaveTakenAfterJan26 = user.leaveBalance?.usedAfterJan26 || 0; // Leaves taken on/after cutoff
  let totalExcessHours = 0; // Sum of excessHour from summary of each month from cutoff

  const cutoff = config.cutoffMonth;

  attendanceRecords.forEach((month: any) => {
    const monthYear = month.monthYear || '';
    // String comparison works for YYYY-MM: "2026-01" >= cutoff
    const isOnOrAfterCutoff = monthYear >= cutoff;

    // Add excess hours from summary if month is on or after cutoff (partner cap applied)
    if (isOnOrAfterCutoff && typeof month.summary?.excessHour === 'number') {
      const raw = month.summary.excessHour;
      totalExcessHours += resolveDisplayExcess(
        raw,
        String(user._id),
        monthYear,
        allowanceMap,
        displayMap
      );
    }
  });

  const weekdayHours = resolveWeekdayHours(user, config);
  const totalExcessDays = totalExcessHours / weekdayHours;

  // Final credit: creditAsOnJan26 - leaveTakenAfterJan26 + totalExcessDays
  let finalCredit = creditAsOnJan26 - leaveTakenAfterJan26 + totalExcessDays;
  if (config.floorFinalCreditAtZero) finalCredit = Math.max(0, finalCredit);

  return {
    empId: user.employeeCode || user.odId || '',
    name: user.name,
    creditAsOnJan26,
    leaveTakenBeforeJan26,
    leaveTakenAfterJan26,
    totalExcessHours: Number(totalExcessHours.toFixed(2)),
    totalExcessDays: Number(totalExcessDays.toFixed(2)),
    finalCredit: Number(finalCredit.toFixed(2)),
  };
}
