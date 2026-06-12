import mongoose from 'mongoose';
import User from '@/models/User';
import {
  getExcessHoursManageableMembersForViewer,
  type VisibleTeamMember,
} from '@/lib/teamVisibilityForViewer';

interface LeanUser {
  _id?: unknown;
  name?: unknown;
  email?: unknown;
  odId?: unknown;
  employeeCode?: unknown;
  workingUnderPartner?: unknown;
  isActive?: boolean;
}

export function visibleMemberToApiUser(member: VisibleTeamMember): LeanUser {
  return {
    _id: member._id,
    name: member.name,
    email: member.email,
    odId: member.odId,
    employeeCode: member.employeeCode,
    workingUnderPartner: member.workingUnderPartner,
    isActive: true,
  };
}

/** Work-partner team + attendance-approver inbox (+ admin extras when team access is active). */
export async function getExcessHoursTeamForViewer(
  viewerUserId: string
): Promise<VisibleTeamMember[]> {
  return getExcessHoursManageableMembersForViewer(viewerUserId);
}

export async function assertViewerCanManageTeamMember(
  viewerUserId: string,
  employeeId: string
): Promise<{ viewer: LeanUser; employee: VisibleTeamMember } | null> {
  if (!mongoose.Types.ObjectId.isValid(viewerUserId) || !mongoose.Types.ObjectId.isValid(employeeId)) {
    return null;
  }

  const viewer = (await User.findById(viewerUserId).lean()) as LeanUser | null;
  if (!viewer) return null;

  const members = await getExcessHoursManageableMembersForViewer(viewerUserId);
  const employee = members.find((m) => m._id === employeeId);
  if (!employee) return null;

  return { viewer, employee };
}
