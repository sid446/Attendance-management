import { isHrModifiedAttendanceRecord } from '@/lib/attendanceRequestDayDisplay';
import { LOCATION_PUNCH_SOURCE } from '@/lib/locationPunchAttendance';
import { normalizeTimeToHHmm } from '@/lib/attendanceHours';

export type FixedUploadSkipReason =
  | 'unchanged'
  | 'approvedRequest'
  | 'onLeave'
  | 'locationPunch'
  | 'hrEdited';

export type FixedUploadSkipCounts = Record<FixedUploadSkipReason, number>;

export function emptyFixedUploadSkipCounts(): FixedUploadSkipCounts {
  return {
    unchanged: 0,
    approvedRequest: 0,
    onLeave: 0,
    locationPunch: 0,
    hrEdited: 0,
  };
}

function punchKey(raw: unknown): string {
  const n = normalizeTimeToHHmm(String(raw ?? ''));
  if (!n || n === '00:00') return '00:00';
  return n;
}

function presenceType(raw: unknown): string {
  return String(raw || '').trim();
}

function isOnLeavePresence(type: string): boolean {
  const t = type.toLowerCase();
  return t === 'on leave' || t === 'leave';
}

/** Sheet says the person actually worked (not absent/leave/holiday). */
function isWorkingPresence(type: string): boolean {
  const t = presenceType(type).toLowerCase();
  if (!t) return false;
  if (t === 'a' || t === 'absent' || t === 'on leave' || t === 'leave') return false;
  if (t === 'holiday' || t === 'sunday' || t === 'weekoff' || t === 'ohd') return false;
  return true;
}

/** GPS / location-verified days only — not every client-place row from the sheet. */
function isProtectedLocationPunch(rec: Record<string, unknown>): boolean {
  if (/location verified/i.test(String(rec.remarks || ''))) return true;
  const source = String(rec.approvedBy || rec.updatedBy || '');
  return source === LOCATION_PUNCH_SOURCE;
}

/** Existing times after HR/GPS edits, else raw punches. */
function existingPunches(rec: Record<string, unknown>): { inTime: string; outTime: string } {
  const inTime = punchKey(rec.editedCheckin || rec.checkin);
  const outTime = punchKey(rec.editedCheckout || rec.checkout);
  return { inTime, outTime };
}

export function fixedIncomingEqualsExisting(
  existing: Record<string, unknown> | null | undefined,
  incomingType: string,
  incomingIn: string,
  incomingOut: string
): boolean {
  if (!existing) return false;
  const existingType = presenceType(existing.typeOfPresence);
  if (existingType !== presenceType(incomingType)) return false;
  const have = existingPunches(existing);
  return have.inTime === punchKey(incomingIn) && have.outTime === punchKey(incomingOut);
}

/**
 * Why a fixed-sheet row must not overwrite an existing day.
 * Order: approved request, leave, GPS, HR edit, then identical payload.
 */
export function fixedUploadSkipReason(options: {
  existing?: Record<string, unknown> | null;
  hasApprovedRequest: boolean;
  incomingType: string;
  incomingIn: string;
  incomingOut: string;
}): FixedUploadSkipReason | null {
  const existing = options.existing;
  if (options.hasApprovedRequest) return 'approvedRequest';
  if (!existing) return null;

  const type = presenceType(existing.typeOfPresence);
  // Keep system-paid On leave when the sheet still says Absent.
  // If the sheet says Present/WFH/etc., allow overwrite so leave credit is returned.
  if (isOnLeavePresence(type) && !isWorkingPresence(options.incomingType)) return 'onLeave';
  if (isProtectedLocationPunch(existing)) return 'locationPunch';
  if (isHrModifiedAttendanceRecord(existing)) return 'hrEdited';
  if (
    fixedIncomingEqualsExisting(
      existing,
      options.incomingType,
      options.incomingIn,
      options.incomingOut
    )
  ) {
    return 'unchanged';
  }
  return null;
}
