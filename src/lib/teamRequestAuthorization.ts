import User from '@/models/User';
import {
  getApprovableTeamMembersForViewer,
  getVisibleTeamMembersForViewer,
  viewerAccessAllowsRequestApproval,
} from '@/lib/teamVisibilityForViewer';

export function normalizePartnerName(name: string): string {
  return String(name || '').replace(/[.\s]/g, '').toLowerCase();
}

export async function resolveViewerUserIdFromPartnerEmail(partnerEmail: string): Promise<string | null> {
  const email = String(partnerEmail || '').trim().toLowerCase();
  if (!email) return null;
  const user = await User.findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
    .select('_id')
    .lean();
  return user?._id ? String(user._id) : null;
}

export async function getVisibleTeamMemberIdSet(viewerUserId: string): Promise<Set<string>> {
  const { members } = await getVisibleTeamMembersForViewer(viewerUserId);
  return new Set(members.map((member) => member._id).filter(Boolean));
}

export async function getApprovableTeamMemberIdSet(viewerUserId: string): Promise<Set<string>> {
  const members = await getApprovableTeamMembersForViewer(viewerUserId);
  return new Set(members.map((member) => member._id).filter(Boolean));
}

export async function canViewerAccessTeamMember(
  viewerUserId: string,
  targetUserId: string
): Promise<boolean> {
  if (!viewerUserId || !targetUserId) return false;
  if (String(viewerUserId) === String(targetUserId)) return true;
  const visibleIds = await getVisibleTeamMemberIdSet(viewerUserId);
  return visibleIds.has(String(targetUserId));
}

/**
 * Whether a partner/team viewer may act on an attendance request.
 * Matches legacy partner inbox rules plus Team Attendance Access people
 * when that rule allows approval.
 */
export async function isAuthorizedPartnerForRequest(
  viewerUserId: string,
  claims: { partnerName: string; partnerEmail: string },
  reqRecord: { userId: unknown; partnerName?: unknown }
): Promise<boolean> {
  const requestUser = await User.findById(reqRecord.userId).select('attendanceEmail').lean();
  const requestApproverEmail = String(requestUser?.attendanceEmail || '').trim().toLowerCase();
  const partnerEmail = String(claims.partnerEmail || '').trim().toLowerCase();
  if (requestApproverEmail && partnerEmail && requestApproverEmail === partnerEmail) {
    return true;
  }

  if (viewerUserId) {
    const approvableIds = await getApprovableTeamMemberIdSet(viewerUserId);
    if (approvableIds.has(String(reqRecord.userId || ''))) {
      return true;
    }
    if (!(await viewerAccessAllowsRequestApproval(viewerUserId))) {
      return false;
    }
  }

  return (
    normalizePartnerName(String(reqRecord.partnerName || '')) ===
    normalizePartnerName(claims.partnerName)
  );
}
