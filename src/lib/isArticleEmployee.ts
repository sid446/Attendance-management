/** User fields used to detect articleship (employment type, designation, or category). */
export type ArticleEmployeeLike = {
  employmentType?: unknown;
  designation?: unknown;
  category?: unknown;
} | null | undefined;

/**
 * True when the person is an article trainee.
 * Supports prefixed designations (e.g. "CA Article") via substring match on "article".
 */
export function isArticleEmployee(user: ArticleEmployeeLike): boolean {
  if (!user) return false;
  const employmentType = String(user.employmentType || '').trim().toLowerCase();
  const designation = String(user.designation || '').trim().toLowerCase();
  const category = String(user.category || '').trim().toLowerCase();
  return (
    employmentType.includes('article') ||
    designation.includes('article') ||
    category.includes('article')
  );
}

/** Article-specific per-day excess hours from schedule vs actual punch times. */
export function calculateArticleDayExcessMinutes(
  scheduledInTime: string,
  scheduledOutTime: string,
  inTime: string,
  outTime: string
): number {
  const [schInH, schInM] = scheduledInTime.split(':').map(Number);
  const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
  const [actInH, actInM] = inTime.split(':').map(Number);
  const [actOutH, actOutM] = outTime.split(':').map(Number);
  const schInMin = schInH * 60 + schInM;
  const schOutMin = schOutH * 60 + schOutM;
  const actInMin = actInH * 60 + actInM;
  const actOutMin = actOutH * 60 + actOutM;

  let excess = 0;
  if (actInMin < schInMin) {
    excess += schInMin - actInMin;
  }
  if (actOutMin > schOutMin) {
    const late = actOutMin - schOutMin;
    if (late > 30) excess += late;
  }
  return excess;
}
