import type { AttendanceCalcPolicy } from '@/lib/attendanceCalcPolicy';

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

/** Intern, and not already an article trainee. */
export function isInternEmployee(user: ArticleEmployeeLike): boolean {
  if (!user || isArticleEmployee(user)) return false;
  const employmentType = String(user.employmentType || '').trim().toLowerCase();
  const designation = String(user.designation || '').trim().toLowerCase();
  const category = String(user.category || '').trim().toLowerCase();
  return (
    employmentType.includes('intern') ||
    designation.includes('intern') ||
    category.includes('intern')
  );
}

/** Intern category/designation, or article trainee (salary group “Articles / Interns”). */
export function isInternOrArticleEmployee(user: ArticleEmployeeLike): boolean {
  if (!user) return false;
  return isArticleEmployee(user) || isInternEmployee(user);
}

/** Articles always. Interns only when the policy says they follow article rules. */
export function usesArticleCalculationRules(
  user: ArticleEmployeeLike,
  policy?: Pick<AttendanceCalcPolicy, 'internUsesArticleRules'> | null
): boolean {
  if (isArticleEmployee(user)) return true;
  return Boolean(policy?.internUsesArticleRules && isInternEmployee(user));
}
