import { isArticleEmployee, type ArticleEmployeeLike } from '@/lib/isArticleEmployee';

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
  employee?: ArticleEmployeeLike;
};

function resolveIsArticle(ctx?: ApproveValueContext): boolean {
  if (ctx?.isArticle != null) return ctx.isArticle;
  if (ctx?.employee) return isArticleEmployee(ctx.employee);
  return false;
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
 * Default approve value: WFH 0.75; client place 1; outstation 1.2 (article) or 1 (staff); half 0.5; leave none; else 1.
 */
export const getDefaultValueForType = (
  requestedStatus: string,
  ctx?: ApproveValueContext
): string => {
  const status = requestedStatus.toLowerCase();
  if (status.includes('half')) return '0.5';
  if (isLeaveRequestType(requestedStatus)) return '';
  if (status.includes('wfh')) return '0.75';
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
  if (status.includes('wfh')) return 0.75;
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
