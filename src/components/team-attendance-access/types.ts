import type { User } from '@/types/ui';

export interface TeamAttendanceAccessSectionProps {
  allUsers: User[];
}

export interface TeamAttendanceAccessRule {
  _id?: string;
  viewerUserId: string | User | { _id: string; name?: string; email?: string };
  includeOwnTeam: boolean;
  extraUserIds?: Array<string | User | { _id: string; name?: string }>;
  extraPartnerNames?: string[];
  canApproveRequests: boolean;
  canApproveSelf: boolean;
  isActive: boolean;
}
