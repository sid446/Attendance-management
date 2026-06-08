import mongoose from 'mongoose';
import User from '@/models/User';
import {
  getVisibleTeamMembersForViewer,
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

/** Same team scope as Team attendance / Daily updates (partner + attendance approver inbox). */
export async function getExcessHoursTeamForViewer(
  viewerUserId: string
): Promise<VisibleTeamMember[]> {
  const { members } = await getVisibleTeamMembersForViewer(viewerUserId);
  return members;
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

  const { members } = await getVisibleTeamMembersForViewer(viewerUserId);
  const employee = members.find((m) => m._id === employeeId);
  if (!employee) return null;

  return { viewer, employee };
}
