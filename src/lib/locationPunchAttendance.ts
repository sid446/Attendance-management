export const LOCATION_PUNCH_SOURCE = 'Location punch';
export const LOCATION_PUNCH_REMARK_PREFIX = 'Location verified at:';

export function isClientPlacePresenceType(type: unknown): boolean {
  const t = String(type || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!t) return false;
  if (t === 'cp-p' || t.includes('(cp-p)')) return true;
  return t.includes('clientplace') || t.includes('client place');
}

/** True when the day was marked via client-location punch (type or remarks). */
export function isLocationPunchAttendanceRecord<
  T extends { typeOfPresence?: unknown; remarks?: unknown },
>(rec: T | null | undefined): rec is T {
  if (!rec) return false;
  if (isClientPlacePresenceType(rec.typeOfPresence)) return true;
  return /location verified/i.test(String(rec.remarks || ''));
}

export function locationPunchSourceLabel(
  rec: { remarks?: unknown; typeOfPresence?: unknown } | null | undefined
): string | null {
  if (!rec) return null;
  const remarks = String(rec.remarks || '');
  const named = remarks.match(/Location verified at:\s*(.+?)(?:\s*\||$)/i);
  if (named?.[1]?.trim()) {
    return `${LOCATION_PUNCH_SOURCE} (${named[1].trim()})`;
  }
  if (isLocationPunchAttendanceRecord(rec)) return LOCATION_PUNCH_SOURCE;
  return null;
}
