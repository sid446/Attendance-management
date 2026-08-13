/**
 * Daywise "Source" column: how a day was last updated (request approval / HR edit).
 */

export type AttendanceEditSourceInfo = {
  approvedBy?: string | null;
  approvedByEmail?: string | null;
  updatedBy?: string | null;
  updatedByEmail?: string | null;
};

/** Stamp approval/edit attribution onto a daily attendance record. */
export function applyAttendanceEditSource(
  rec: Record<string, unknown>,
  info: { approvedBy?: string | null; approvedByEmail?: string | null }
): void {
  const by = String(info.approvedBy || '').trim();
  const email = String(info.approvedByEmail || '').trim().toLowerCase();
  if (by) {
    rec.approvedBy = by;
    rec.updatedBy = by;
  }
  if (email) {
    rec.approvedByEmail = email;
    rec.updatedByEmail = email;
  } else if (by.toLowerCase() === 'hr') {
    // Keep prior email if HR approved without a new email in this call
  }
}

/**
 * Human-readable Source cell for daywise export.
 * - Unedited biometric: ThumbMachine
 * - Partner request: Approved by Arif
 * - HR: Approved by HR (email@…)
 */
export function formatDaywiseSourceLabel(info: AttendanceEditSourceInfo | null | undefined): string {
  if (!info) return 'ThumbMachine';

  const by = String(info.approvedBy || info.updatedBy || '').trim();
  const email = String(info.approvedByEmail || info.updatedByEmail || '')
    .trim()
    .toLowerCase();

  if (!by && !email) return 'ThumbMachine';

  if (by.toLowerCase() === 'location punch') {
    return 'Location punch';
  }

  const isHr = by.toLowerCase() === 'hr' || by.toLowerCase() === 'hr admin';

  if (isHr) {
    if (email) return `Approved by HR (${email})`;
    return 'Approved by HR';
  }

  if (by) {
    return `Approved by ${by}`;
  }

  if (email) {
    return `Approved by HR (${email})`;
  }

  return 'ThumbMachine';
}

export function daywiseSourceLookupKey(userId: string, dateIso: string): string {
  return `${String(userId)}|${String(dateIso).slice(0, 10)}`;
}
