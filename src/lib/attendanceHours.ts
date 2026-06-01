/** True when a punch time is present and not the empty placeholder. */
export function isValidPunchTime(time?: string | null): boolean {
  const t = String(time ?? '').trim();
  return t !== '' && t !== '00:00';
}

function minutesBetween(start: string, end: string): number | null {
  if (!isValidPunchTime(start) || !isValidPunchTime(end)) return null;

  const [inH, inM] = start.split(':').map(Number);
  const [outH, outM] = end.split(':').map(Number);
  if ([inH, inM, outH, outM].some((n) => Number.isNaN(n))) return null;

  const startMinutes = inH * 60 + inM;
  const endMinutes = outH * 60 + outM;
  if (endMinutes <= startMinutes) return null;

  return endMinutes - startMinutes;
}

/** True when exactly one of in/out is a real punch (missed entry on the other side). */
export function isSinglePunch(checkin: string, checkout: string): boolean {
  return isValidPunchTime(checkin) !== isValidPunchTime(checkout);
}

/**
 * Hours between check-in and check-out (HH:mm).
 * Both punches required; if only in or only out is present, returns 0.
 */
export function calculateTotalHours(
  checkin: string,
  checkout: string,
  _options?: { scheduledIn?: string; scheduledOut?: string }
): number {
  const hasIn = isValidPunchTime(checkin);
  const hasOut = isValidPunchTime(checkout);

  if (!hasIn || !hasOut) {
    return 0;
  }

  const diff = minutesBetween(checkin, checkout);
  return diff !== null ? Number((diff / 60).toFixed(2)) : 0;
}
