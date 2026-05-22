export const isLeaveRequestType = (requestedStatus: string): boolean => {
  const status = requestedStatus.toLowerCase();
  return status.includes('leave') || requestedStatus === 'On leave';
};

export const isFixedValueType = (requestedStatus: string): boolean => {
  const status = requestedStatus.toLowerCase();
  return status.includes('half') || status.includes('leave') || requestedStatus === 'On leave';
};

/** Align with partner review-all: WFH 0.75, OS/outstation/client/onsite 1.2, else 1; half 0.5; leave none. */
export const getDefaultValueForType = (requestedStatus: string): string => {
  const status = requestedStatus.toLowerCase();
  if (status.includes('half')) return '0.5';
  if (isLeaveRequestType(requestedStatus)) return '';
  if (status.includes('wfh')) return '0.75';
  if (
    status.includes('outstation') ||
    status.includes('client place') ||
    status.includes('clientplace') ||
    status.includes('onsite') ||
    status.includes('os-p')
  ) {
    return '1.2';
  }
  return '1';
};

export const getMaxValueForType = (requestedStatus: string): number | null => {
  const status = requestedStatus.toLowerCase();
  if (status.includes('half')) return 0.5;
  if (isLeaveRequestType(requestedStatus)) return null;
  if (status.includes('wfh')) return 0.75;
  if (
    status.includes('outstation') ||
    status.includes('client place') ||
    status.includes('clientplace') ||
    status.includes('onsite') ||
    status.includes('os-p')
  ) {
    return 1.2;
  }
  return 1;
};

/** Resolve numeric attendance value for approve (leave → undefined). */
export const resolveApproveValueNumber = (requestedStatus: string, raw?: string): number | undefined => {
  if (isLeaveRequestType(requestedStatus)) return undefined;
  const trimmed = String(raw ?? '').trim().replace(',', '.');
  const defStr = getDefaultValueForType(requestedStatus);
  let n = trimmed === '' ? NaN : parseFloat(trimmed);
  if (!Number.isFinite(n)) n = defStr === '' ? NaN : parseFloat(defStr);
  if (!Number.isFinite(n)) return undefined;
  const max = getMaxValueForType(requestedStatus);
  if (max != null) n = Math.min(Math.max(0, n), max);
  return n;
};
