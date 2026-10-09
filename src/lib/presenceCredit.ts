import {
  isArticleEmployee,
  isInternOrArticleEmployee,
  type ArticleEmployeeLike,
} from '@/lib/isArticleEmployee';

export const BUILTIN_WFH_CREDIT = 0.75;
/** Articles and interns from 1 Oct 2026. Employees stay on BUILTIN_WFH_CREDIT. */
export const BUILTIN_WFH_INTERN_ARTICLE_CREDIT = 0.5;
export const INTERN_ARTICLE_WFH_FROM = '2026-10-01';
export const BUILTIN_OSP_STAFF_CREDIT = 1;
export const BUILTIN_OSP_ARTICLE_CREDIT = 1.2;
export const PRESENCE_CREDIT_ABSOLUTE_MAX = 1.2;

export type PresenceCreditKind = 'wfh' | 'osp';
export type PresenceCreditScope = 'everyone' | 'articles' | 'staff' | 'team' | 'people';

export type PresenceCreditEmployee = ArticleEmployeeLike & {
  _id?: unknown;
  team?: unknown;
};

export type PresenceCreditRuleLike = {
  _id?: string;
  kind: PresenceCreditKind;
  scope: PresenceCreditScope;
  credit: number;
  effectiveFrom: string;
  team?: string;
  userIds?: string[];
};

const SCOPES: PresenceCreditScope[] = ['everyone', 'articles', 'staff', 'team', 'people'];
const KINDS: PresenceCreditKind[] = ['wfh', 'osp'];

export function clampPresenceCredit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(PRESENCE_CREDIT_ABSOLUTE_MAX, Math.max(0, value));
}

export function formatPresenceCredit(value: number): string {
  const rounded = Math.round(clampPresenceCredit(value) * 1000) / 1000;
  return String(rounded);
}

/** YYYY-MM-DD in local time for Date values, so attendance dates do not shift. */
export function toAttendanceDateKey(date: string | Date | null | undefined): string {
  if (date == null) return '';
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function presenceKindForStatus(requestedStatus: string): PresenceCreditKind | null {
  const status = String(requestedStatus || '').toLowerCase();
  if (status.includes('wfh') || status.includes('work from home')) return 'wfh';
  if (status.includes('client place') || status.includes('clientplace')) return null;
  if (status.includes('outstation') || status.includes('onsite') || status.includes('os-p')) return 'osp';
  return null;
}

export function builtinPresenceCredit(
  kind: PresenceCreditKind,
  employee?: PresenceCreditEmployee | null,
  date?: string | Date | null
): number {
  if (kind === 'wfh') {
    const key = toAttendanceDateKey(date);
    if (key >= INTERN_ARTICLE_WFH_FROM && isInternOrArticleEmployee(employee)) {
      return BUILTIN_WFH_INTERN_ARTICLE_CREDIT;
    }
    return BUILTIN_WFH_CREDIT;
  }
  return isArticleEmployee(employee) ? BUILTIN_OSP_ARTICLE_CREDIT : BUILTIN_OSP_STAFF_CREDIT;
}

function ruleSpecificity(
  rule: PresenceCreditRuleLike,
  employee: PresenceCreditEmployee | null | undefined,
  article: boolean
): number | null {
  if (rule.scope === 'people') {
    const ids = (rule.userIds || []).map((id) => String(id));
    const userId = String(employee?._id || '');
    if (!userId || !ids.includes(userId)) return null;
    return ids.length === 1 ? 5 : 4;
  }
  if (rule.scope === 'team') {
    const team = String(employee?.team || '').trim().toLowerCase();
    const ruleTeam = String(rule.team || '').trim().toLowerCase();
    if (!team || !ruleTeam || team !== ruleTeam) return null;
    return 3;
  }
  if (rule.scope === 'articles') return article ? 2 : null;
  if (rule.scope === 'staff') return article ? null : 2;
  if (rule.scope === 'everyone') return 1;
  return null;
}

/**
 * Most specific matching scope wins. Inside that scope, the latest effectiveFrom
 * on or before the attendance date wins. Otherwise the built-in credit.
 */
export function resolvePresenceCredit(
  rules: PresenceCreditRuleLike[] | null | undefined,
  employee: PresenceCreditEmployee | null | undefined,
  date: string | Date,
  kind: PresenceCreditKind
): number {
  const dateKey = toAttendanceDateKey(date);
  // Articles and interns share the articles scope. Employees stay on staff.
  const article = isInternOrArticleEmployee(employee);
  let bestSpec = 0;
  let bestFrom = '';
  let bestCredit: number | null = null;

  for (const rule of rules || []) {
    if (rule.kind !== kind) continue;
    const from = toAttendanceDateKey(rule.effectiveFrom);
    if (!from || !dateKey || from > dateKey) continue;
    const spec = ruleSpecificity(rule, employee, article);
    if (spec == null) continue;
    if (spec > bestSpec || (spec === bestSpec && from > bestFrom)) {
      bestSpec = spec;
      bestFrom = from;
      bestCredit = clampPresenceCredit(Number(rule.credit));
    }
  }

  // A wide 0.75 rule is the old employee default. From 1 Oct 2026 it does not
  // keep articles and interns on 0.75. A team, articles, or person rule still wins.
  let credit = bestCredit != null ? bestCredit : builtinPresenceCredit(kind, employee, date);
  if (
    kind === 'wfh' &&
    bestSpec <= 1 &&
    isInternOrArticleEmployee(employee) &&
    dateKey >= INTERN_ARTICLE_WFH_FROM &&
    Math.abs(credit - BUILTIN_WFH_CREDIT) <= 0.001
  ) {
    credit = BUILTIN_WFH_INTERN_ARTICLE_CREDIT;
  }
  return credit;
}

/**
 * From 1 Oct 2026 a saved WFH credit above the limit is brought down to it.
 * A value already within the limit stays as it was entered.
 */
export function effectiveWfhAttendanceValue(
  stored: number,
  employee: PresenceCreditEmployee | null | undefined,
  date: string | Date,
  rules?: PresenceCreditRuleLike[] | null
): number {
  if (!Number.isFinite(stored)) return stored;
  const key = toAttendanceDateKey(date);
  if (!key || key < INTERN_ARTICLE_WFH_FROM) return stored;
  const limit = resolvePresenceCredit(rules, employee, date, 'wfh');
  if (stored > limit + 0.001) return limit;
  return stored;
}

export function sanitizePresenceCreditRule(
  body: unknown
): { ok: true; rule: Omit<PresenceCreditRuleLike, '_id'> } | { ok: false; error: string } {
  const raw = (body || {}) as Record<string, unknown>;
  const kind = String(raw.kind || '').trim() as PresenceCreditKind;
  const scope = String(raw.scope || '').trim() as PresenceCreditScope;
  if (!KINDS.includes(kind)) return { ok: false, error: 'Kind must be WFH or OSP' };
  if (!SCOPES.includes(scope)) return { ok: false, error: 'Choose who this rule applies to' };

  const credit = Number(raw.credit);
  if (!Number.isFinite(credit) || credit < 0 || credit > PRESENCE_CREDIT_ABSOLUTE_MAX) {
    return { ok: false, error: 'Credit must be between 0 and 1.2' };
  }

  const effectiveFrom = toAttendanceDateKey(String(raw.effectiveFrom || ''));
  if (!effectiveFrom) return { ok: false, error: 'Effective date is required' };

  const team = String(raw.team || '').trim();
  const userIds = Array.isArray(raw.userIds)
    ? Array.from(new Set(raw.userIds.map((id) => String(id).trim()).filter(Boolean)))
    : [];

  if (scope === 'team' && !team) return { ok: false, error: 'Choose a team' };
  if (scope === 'people' && userIds.length === 0) return { ok: false, error: 'Choose at least one person' };

  return {
    ok: true,
    rule: {
      kind,
      scope,
      credit: clampPresenceCredit(credit),
      effectiveFrom,
      team: scope === 'team' ? team : '',
      userIds: scope === 'people' ? userIds : [],
    },
  };
}
