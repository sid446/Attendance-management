/** Attendance day fields used to detect machine / punch presence. */
export type AttendancePunchLike = {
  checkin?: string;
  checkout?: string;
  editedCheckin?: string;
  editedCheckout?: string;
  inTime?: string;
  outTime?: string;
  totalHour?: number;
};

function effectiveIn(rec: AttendancePunchLike | null | undefined): string {
  return String(rec?.editedCheckin ?? rec?.checkin ?? rec?.inTime ?? '').trim();
}

function effectiveOut(rec: AttendancePunchLike | null | undefined): string {
  return String(rec?.editedCheckout ?? rec?.checkout ?? rec?.outTime ?? '').trim();
}

function isValidPunch(time: string): boolean {
  return !!time && time !== '00:00';
}

/**
 * True when the person physically attended (machine punch or worked hours),
 * even if an approved leave request exists for the same day.
 */
export function hasPhysicalAttendancePresence(
  rec: AttendancePunchLike | null | undefined
): boolean {
  if (!rec) return false;
  const inT = effectiveIn(rec);
  const outT = effectiveOut(rec);
  if (isValidPunch(inT) || isValidPunch(outT)) return true;
  if (Number(rec.totalHour ?? 0) > 0) return true;
  return false;
}
