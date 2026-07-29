/** UI labels and mapped backend statuses that require in/out times on correction/future requests. */
export function requiresAttendanceRequestTimePair(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, '');

  return (
    normalized.startsWith('present - in office') ||
    compact.startsWith('present-inoffice') ||
    normalized.startsWith('half day') ||
    compact.startsWith('halfday') ||
    normalized.startsWith('wfh') ||
    compact.startsWith('wfh') ||
    normalized.startsWith('present - outstation') ||
    compact.startsWith('present-outstation') ||
    normalized.startsWith('present - client place') ||
    compact.startsWith('present-clientplace')
  );
}

/**
 * WFH / outstation / client place: employee enters hours; in/out are derived (read-only).
 * Present - in office and Half Day still use manual time pickers.
 */
export function usesWorkHoursInputForRequest(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, '');
  return (
    normalized.startsWith('wfh') ||
    compact.startsWith('wfh') ||
    normalized.startsWith('present - outstation') ||
    compact.startsWith('present-outstation') ||
    normalized.startsWith('present - client place') ||
    compact.startsWith('present-clientplace')
  );
}
