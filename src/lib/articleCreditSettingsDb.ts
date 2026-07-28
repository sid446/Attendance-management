import ArticleCreditSettings from '@/models/ArticleCreditSettings';
import {
  DEFAULT_ARTICLE_CREDIT_CONFIG,
  sanitizeArticleCreditConfig,
  type ArticleCreditConfig,
} from '@/lib/articleCredit';

/**
 * Load the global article-credit config, merged over defaults and sanitized.
 * Returns DEFAULT_ARTICLE_CREDIT_CONFIG when no settings document exists.
 */
export async function loadArticleCreditConfig(): Promise<ArticleCreditConfig> {
  const doc = await ArticleCreditSettings.findOne({ scope: 'global' }).lean();
  if (!doc) return { ...DEFAULT_ARTICLE_CREDIT_CONFIG };
  return sanitizeArticleCreditConfig({
    cutoffMonth: doc.cutoffMonth,
    defaultWeekdayHours: doc.defaultWeekdayHours,
    weekdayHoursMode: doc.weekdayHoursMode,
    floorFinalCreditAtZero: doc.floorFinalCreditAtZero,
  });
}

/**
 * Upsert the global article-credit config. The payload is sanitized before saving,
 * so any invalid/missing field falls back to the default.
 */
export async function saveArticleCreditConfig(
  config: Partial<ArticleCreditConfig>,
  updatedBy: string
): Promise<ArticleCreditConfig> {
  const clean = sanitizeArticleCreditConfig(config);

  await ArticleCreditSettings.findOneAndUpdate(
    { scope: 'global' },
    {
      $set: {
        scope: 'global',
        cutoffMonth: clean.cutoffMonth,
        defaultWeekdayHours: clean.defaultWeekdayHours,
        weekdayHoursMode: clean.weekdayHoursMode,
        floorFinalCreditAtZero: clean.floorFinalCreditAtZero,
        updatedBy,
      },
    },
    { upsert: true, new: true }
  );

  return loadArticleCreditConfig();
}
