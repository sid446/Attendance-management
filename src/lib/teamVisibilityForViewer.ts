import mongoose from 'mongoose';
import TeamAttendanceAccess from '@/models/TeamAttendanceAccess';
import User from '@/models/User';

function normalizeName(value: unknown): string {
  return String(value || '').replace(/[.\s]/g, '').toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface VisibleTeamMember {
  _id: string;
  name: string;
  email: string;
  odId: string;
  employeeCode: string;
  workingUnderPartner: string;
}

interface VisibleUser {
  _id?: unknown;
  name?: unknown;
  email?: unknown;
  attendanceEmail?: unknown;
  workingUnderPartner?: unknown;
  odId?: unknown;
  employeeCode?: unknown;
}

function toMember(user: VisibleUser): VisibleTeamMember {
  return {
    _id: String(user._id || ''),
    name: String(user.name || ''),
    email: String(user.email || ''),
    odId: String(user.odId || ''),
    employeeCode: String(user.employeeCode || ''),
    workingUnderPartner: String(user.workingUnderPartner || ''),
  };
}

/** Same visible team as Team Attendance Access (own team + approver inbox + admin extras). */
export async function getVisibleTeamMembersForViewer(
  viewerUserId: string
): Promise<{ members: VisibleTeamMember[]; includeViewerSelf: boolean }> {
  const viewer = await User.findById(viewerUserId).lean();
  if (!viewer) return { members: [], includeViewerSelf: false };

  const rule = await TeamAttendanceAccess.findOne({ viewerUserId }).lean();
  if (rule && rule.isActive === false) {
    return { members: [], includeViewerSelf: false };
  }

  const includeOwnTeam = rule ? rule.includeOwnTeam !== false : true;
  const viewerData = viewer as VisibleUser;
  const visible = new Map<string, VisibleUser>();

  const addUsers = (users: VisibleUser[], opts?: { includeViewer?: boolean }) => {
    users.forEach((user) => {
      const id = String(user?._id || '');
      if (!id) return;
      if (!opts?.includeViewer && id === viewerUserId) return;
      visible.set(id, user);
    });
  };

  if (includeOwnTeam) {
    const normalizedViewerName = normalizeName(viewerData.name);
    const ownTeam = await User.find({ isActive: true }).sort({ name: 1 }).lean();
    addUsers(
      (ownTeam as VisibleUser[]).filter((user) => {
        const workingUnder = normalizeName(user.workingUnderPartner);
        return workingUnder && workingUnder === normalizedViewerName;
      })
    );
  }

  // Approver inbox: employees whose attendanceEmail matches this viewer's login email only.
  // Do not use viewer.attendanceEmail — that is who approves the viewer, not their inbox.
  const viewerLoginEmail = String(viewerData.email || '').trim().toLowerCase();
  if (viewerLoginEmail) {
    addUsers(
      (await User.find({
        isActive: true,
        attendanceEmail: new RegExp(`^${escapeRegex(viewerLoginEmail)}$`, 'i'),
      })
        .sort({ name: 1 })
        .lean()) as VisibleUser[]
    );
  }

  const extraUserIds = (rule?.extraUserIds || [])
    .map((id: unknown) => String(id || '').trim())
    .filter((id: string) => mongoose.Types.ObjectId.isValid(id));

  const includeViewerSelf = extraUserIds.some((id) => id === viewerUserId);

  if (extraUserIds.length > 0) {
    addUsers(
      (await User.find({ _id: { $in: extraUserIds }, isActive: true }).sort({ name: 1 }).lean()) as VisibleUser[],
      { includeViewer: includeViewerSelf }
    );
  }

  const extraPartnerNames = Array.isArray(rule?.extraPartnerNames) ? rule.extraPartnerNames : [];
  if (extraPartnerNames.length > 0) {
    const partnerPatterns = extraPartnerNames
      .map((name: unknown) => String(name || '').trim())
      .filter(Boolean)
      .map((name: string) => new RegExp(`^${escapeRegex(name)}$`, 'i'));

    if (partnerPatterns.length > 0) {
      addUsers(
        (await User.find({
          isActive: true,
          workingUnderPartner: { $in: partnerPatterns },
        })
          .sort({ name: 1 })
          .lean()) as VisibleUser[]
      );
    }
  }

  if (!includeViewerSelf) {
    visible.delete(viewerUserId);
  }

  const members = Array.from(visible.values())
    .map(toMember)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { members, includeViewerSelf };
}

function teamAccessRuleAllowsApproval(rule: { canApproveRequests?: boolean } | null | undefined): boolean {
  return !rule || rule.canApproveRequests !== false;
}

export async function viewerAccessAllowsRequestApproval(viewerUserId: string): Promise<boolean> {
  if (!viewerUserId) return true;
  const rule = await TeamAttendanceAccess.findOne({ viewerUserId }).lean();
  return teamAccessRuleAllowsApproval(rule);
}

/**
 * Members whose attendance requests this viewer may review/approve.
 * Official attendance-email inbox is always included.
 * Extra Team Attendance Access people are included only when canApproveRequests is on.
 */
export async function getApprovableTeamMembersForViewer(
  viewerUserId: string
): Promise<VisibleTeamMember[]> {
  const rule = await TeamAttendanceAccess.findOne({ viewerUserId }).lean();
  if (teamAccessRuleAllowsApproval(rule)) {
    const { members } = await getVisibleTeamMembersForViewer(viewerUserId);
    return members;
  }
  return getApproverInboxMembersForViewer(viewerUserId);
}

/** Employees whose attendanceEmail matches the viewer's login email. */
export async function getApproverInboxMembersForViewer(
  viewerUserId: string
): Promise<VisibleTeamMember[]> {
  const viewer = await User.findById(viewerUserId).lean();
  if (!viewer) return [];

  const viewerLoginEmail = String((viewer as VisibleUser).email || '').trim().toLowerCase();
  if (!viewerLoginEmail) return [];

  const inboxUsers = (await User.find({
    isActive: true,
    attendanceEmail: new RegExp(`^${escapeRegex(viewerLoginEmail)}$`, 'i'),
  })
    .sort({ name: 1 })
    .lean()) as VisibleUser[];

  return inboxUsers.map(toMember);
}

/** Direct reports where the viewer is the Work Partner. */
export async function getOwnTeamMembersForViewer(
  viewerUserId: string
): Promise<VisibleTeamMember[]> {
  const viewer = await User.findById(viewerUserId).lean();
  if (!viewer) return [];

  const normalizedViewerName = normalizeName((viewer as VisibleUser).name);
  if (!normalizedViewerName) return [];

  const activeUsers = await User.find({ isActive: true }).sort({ name: 1 }).lean();
  return (activeUsers as VisibleUser[])
    .filter((user) => {
      const workingUnder = normalizeName(user.workingUnderPartner);
      return workingUnder && workingUnder === normalizedViewerName;
    })
    .map(toMember);
}

/**
 * Excess-hour management: approver inbox + work-partner team always;
 * plus admin Team Attendance Access extras when that rule is active.
 */
export async function getExcessHoursManageableMembersForViewer(
  viewerUserId: string
): Promise<VisibleTeamMember[]> {
  const visible = new Map<string, VisibleTeamMember>();

  const addMembers = (members: VisibleTeamMember[]) => {
    members.forEach((member) => {
      if (member._id && member._id !== viewerUserId) {
        visible.set(member._id, member);
      }
    });
  };

  addMembers(await getApproverInboxMembersForViewer(viewerUserId));
  addMembers(await getOwnTeamMembersForViewer(viewerUserId));

  const rule = await TeamAttendanceAccess.findOne({ viewerUserId }).lean();
  if (rule && rule.isActive !== false) {
    const { members } = await getVisibleTeamMembersForViewer(viewerUserId);
    addMembers(members);
  }

  return Array.from(visible.values()).sort((a, b) => a.name.localeCompare(b.name));
}
