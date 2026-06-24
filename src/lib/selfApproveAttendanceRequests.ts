import AttendanceRequest from '@/models/AttendanceRequest';
import { applyApprovedRequestToAttendance } from '@/lib/applyApprovedAttendanceRequest';
import { isAttendanceDatePartnerOnlyIst } from '@/lib/attendanceRequestApprovalWindow';
import { isAttendanceApproverSameAsEmployee } from '@/lib/employeeMisExceptions';

export type SelfApproveRequestInput = {
  requestId: string;
  date: string;
};

/** Same title-case name used for partner review tokens. */
export function formatPartnerNameForReview(name: string): string {
  let n = name.replace(/\./g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Login email equals attendance email — employee is their own attendance approver. */
export function isSelfApproverUser(user: {
  email?: unknown;
  attendanceEmail?: unknown;
}): boolean {
  return isAttendanceApproverSameAsEmployee(user);
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/** Request IDs eligible for partner self auto-approve (current/previous IST month only). */
export function filterSelfApprovableRequestIds(
  items: SelfApproveRequestInput[],
  user: { email?: unknown; attendanceEmail?: unknown }
): string[] {
  if (!isSelfApproverUser(user)) return [];

  const loginEmail = normalizeEmail(user.email);
  const attendanceEmail = normalizeEmail(user.attendanceEmail);
  if (!loginEmail || !attendanceEmail || loginEmail !== attendanceEmail) return [];

  return items
    .filter((item) => isAttendanceDatePartnerOnlyIst(String(item.date || '')))
    .map((item) => String(item.requestId))
    .filter(Boolean);
}

/** Pending-queue rows where requester email === attendanceEmail === token inbox. */
export function filterSelfApprovablePendingRequestIds(
  requests: Array<{
    _id: unknown;
    date: unknown;
    userId?: { email?: unknown; attendanceEmail?: unknown } | null;
  }>,
  tokenEmail: string
): string[] {
  const inbox = normalizeEmail(tokenEmail);
  if (!inbox) return [];

  return requests
    .filter((row) => {
      const userDoc = row.userId;
      const userEmail = normalizeEmail(userDoc?.email);
      const attendanceEmail = normalizeEmail(userDoc?.attendanceEmail);
      if (!userEmail || !attendanceEmail) return false;
      if (!isAttendanceDatePartnerOnlyIst(String(row.date || ''))) return false;
      return userEmail === inbox && attendanceEmail === inbox;
    })
    .map((row) => String(row._id))
    .filter(Boolean);
}

/**
 * Auto-approve self requests and apply them directly to attendance records.
 * Returns IDs that were approved and applied successfully.
 */
export async function autoApproveSelfRequests(
  items: SelfApproveRequestInput[],
  user: { name?: unknown; email?: unknown; attendanceEmail?: unknown },
  _origin?: string
): Promise<string[]> {
  const ids = filterSelfApprovableRequestIds(items, user);
  if (ids.length === 0) return [];

  const partnerEmail = normalizeEmail(user.email);
  const partnerName = formatPartnerNameForReview(String(user.name || ''));
  const remark = 'Auto-approved (self)';
  const approvedIds: string[] = [];

  for (const id of ids) {
    try {
      const reqRecord = await AttendanceRequest.findById(id);
      if (!reqRecord || reqRecord.status !== 'Pending') continue;

      reqRecord.status = 'Approved';
      reqRecord.approvedBy = partnerName;
      reqRecord.approvedByEmail = partnerEmail;
      reqRecord.approvedAt = new Date();
      reqRecord.partnerRemarks = remark;
      reqRecord.partnerProposedValue = '1';
      await reqRecord.save();

      await applyApprovedRequestToAttendance(reqRecord, { attendanceValue: 1 });
      approvedIds.push(id);
    } catch (error) {
      console.error('Auto-approve (self) failed for request', id, error);
    }
  }

  return approvedIds;
}
