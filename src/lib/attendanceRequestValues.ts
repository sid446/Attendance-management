import { isArticleEmployee, type ArticleEmployeeLike } from '@/lib/isArticleEmployee';
import {
  PRESENCE_CREDIT_ABSOLUTE_MAX,
  builtinPresenceCredit,
  clampPresenceCredit,
  formatPresenceCredit,
  presenceKindForStatus,
  resolvePresenceCredit,
  type PresenceCreditEmployee,
  type PresenceCreditKind,
  type PresenceCreditRuleLike,
} from '@/lib/presenceCredit';

export const isLeaveRequestType = (requestedStatus: string): boolean => {
  const status = requestedStatus.toLowerCase();
  return status.includes('leave') || requestedStatus === 'On leave';
};

export const isFixedValueType = (requestedStatus: string): boolean => {
  const status = requestedStatus.toLowerCase();
  return status.includes('half') || status.includes('leave') || requestedStatus === 'On leave';
};

export type ApproveValueContext = {
  isArticle?: boolean;
  employee?: PresenceCreditEmployee | ArticleEmployeeLike;
  date?: string | Date;
  rules?: PresenceCreditRuleLike[];
  /** Cap already resolved for this request's WFH or OSP status. */
  presenceCredit?: number;
  /** HR may enter above the configured cap, up to 1.2. */
  allowAboveCap?: boolean;
};

function resolveIsArticle(ctx?: ApproveValueContext): boolean {
  if (ctx?.isArticle != null) return ctx.isArticle;
  if (ctx?.employee) return isArticleEmployee(ctx.employee);
  return false;
}

function creditEmployee(ctx?: ApproveValueContext): PresenceCreditEmployee | undefined {
  if (ctx?.employee) return ctx.employee;
  if (ctx?.isArticle != null) return { employmentType: ctx.isArticle ? 'article' : 'staff' };
  return undefined;
}

function configuredCredit(kind: PresenceCreditKind, ctx?: ApproveValueContext): number {
  if (ctx?.rules && ctx.date) {
    return resolvePresenceCredit(ctx.rules, creditEmployee(ctx), ctx.date, kind);
  }
  if (ctx?.presenceCredit != null && Number.isFinite(ctx.presenceCredit)) {
    return clampPresenceCredit(ctx.presenceCredit);
  }
  return builtinPresenceCredit(kind, creditEmployee(ctx), ctx?.date);
}

function isClientPlaceType(requestedStatus: string): boolean {
  const status = requestedStatus.toLowerCase();
  return status.includes('client place') || status.includes('clientplace');
}

function isOutstationType(requestedStatus: string): boolean {
  const status = requestedStatus.toLowerCase();
  return (
    status.includes('outstation') ||
    status.includes('onsite') ||
    status.includes('os-p')
  );
}

/**
 * Default approve value. WFH and OSP use the date-effective rule when rules or a
 * resolved presenceCredit are on the context; otherwise 0.75 (0.5 for articles
 * and interns from 1 Oct 2026) / 1 / 1.2.
 * Client place stays 1. Half day is 0.5. Leave has no value.
 */
export const getDefaultValueForType = (
  requestedStatus: string,
  ctx?: ApproveValueContext
): string => {
  const status = requestedStatus.toLowerCase();
  if (status.includes('half')) return '0.5';
  if (isLeaveRequestType(requestedStatus)) return '';
  const kind = presenceKindForStatus(requestedStatus);
  if (kind) return formatPresenceCredit(configuredCredit(kind, ctx));
  if (isClientPlaceType(requestedStatus)) return '1';
  if (isOutstationType(requestedStatus)) {
    return resolveIsArticle(ctx) ? '1.2' : '1';
  }
  return '1';
};

export const getMaxValueForType = (
  requestedStatus: string,
  ctx?: ApproveValueContext
): number | null => {
  const status = requestedStatus.toLowerCase();
  if (status.includes('half')) return 0.5;
  if (isLeaveRequestType(requestedStatus)) return null;
  const kind = presenceKindForStatus(requestedStatus);
  if (kind) {
    if (ctx?.allowAboveCap) return PRESENCE_CREDIT_ABSOLUTE_MAX;
    return configuredCredit(kind, ctx);
  }
  if (isClientPlaceType(requestedStatus)) return 1;
  if (isOutstationType(requestedStatus)) {
    return resolveIsArticle(ctx) ? 1.2 : 1;
  }
  return 1;
};

export const getDefaultNumericValueForType = (
  requestedStatus: string,
  ctx?: ApproveValueContext
): number | undefined => {
  const def = getDefaultValueForType(requestedStatus, ctx);
  if (def === '') return undefined;
  const n = parseFloat(def);
  return Number.isFinite(n) ? n : undefined;
};

/** Use the submitted number when present, otherwise the default, then clamp to the cap. */
export const clampApproveAttendanceValue = (
  requestedStatus: string,
  raw: unknown,
  ctx?: ApproveValueContext
): number | undefined => {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return getDefaultNumericValueForType(requestedStatus, ctx);
  }
  return resolveApproveValueNumber(requestedStatus, String(raw), ctx);
};

/** Resolve numeric attendance value for approve (leave → undefined). */
export const resolveApproveValueNumber = (
  requestedStatus: string,
  raw?: string,
  ctx?: ApproveValueContext
): number | undefined => {
  if (isLeaveRequestType(requestedStatus)) return undefined;
  const trimmed = String(raw ?? '').trim().replace(',', '.');
  const defStr = getDefaultValueForType(requestedStatus, ctx);
  let n = trimmed === '' ? NaN : parseFloat(trimmed);
  if (!Number.isFinite(n)) n = defStr === '' ? NaN : parseFloat(defStr);
  if (!Number.isFinite(n)) return undefined;
  const max = getMaxValueForType(requestedStatus, ctx);
  if (max != null) n = Math.min(Math.max(0, n), max);
  return n;
};
