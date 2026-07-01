import mongoose from 'mongoose';
import AttendanceRequest from '@/models/AttendanceRequest';
import { isLeaveRequestType } from '@/lib/attendanceRequestValues';

const INVALIDATION_NOTE =
  'Invalidated: employee attended (machine punch supersedes approved leave)';

/**
 * Mark an approved leave request as Invalidated (kept for audit; no longer applied).
 */
export async function invalidateSupersededLeaveRequest(
  request:
    | { _id?: mongoose.Types.ObjectId | string; requestedStatus?: string }
    | mongoose.Types.ObjectId
    | string
    | null
    | undefined,
  options?: { reason?: string }
): Promise<boolean> {
  if (!request) return false;

  const id =
    typeof request === 'string' || request instanceof mongoose.Types.ObjectId
      ? request
      : request._id;
  if (!id) return false;

  const doc = await AttendanceRequest.findById(id);
  if (!doc || doc.status !== 'Approved') return false;
  if (!isLeaveRequestType(String(doc.requestedStatus || ''))) return false;

  const note = String(options?.reason || INVALIDATION_NOTE).trim();
  doc.status = 'Invalidated';
  doc.partnerRemarks = doc.partnerRemarks
    ? `${doc.partnerRemarks} | ${note}`
    : note;
  await doc.save();

  try {
    const lm = await import('@/lib/leaveManagement');
    await lm.removePaidLeaveForDate(doc.userId, doc.date);
  } catch (e) {
    console.error('Failed to reverse leave balance after request invalidation:', e);
  }

  return true;
}

/** Invalidate approved leave for a user/date when attendance shows physical presence. */
export async function invalidateApprovedLeaveIfSuperseded(
  userId: mongoose.Types.ObjectId | string,
  date: string
): Promise<boolean> {
  const userObjectId =
    userId instanceof mongoose.Types.ObjectId
      ? userId
      : new mongoose.Types.ObjectId(String(userId));

  const doc = await AttendanceRequest.findOne({
    userId: userObjectId,
    date,
    status: 'Approved',
  });

  if (!doc || !isLeaveRequestType(String(doc.requestedStatus || ''))) {
    return false;
  }

  return invalidateSupersededLeaveRequest(doc);
}
