export interface TeamMember {
  _id: string;
  name: string;
  email: string;
  odId: string;
  employeeCode: string;
  attendanceEmail: string;
  workingUnderPartner: string;
  resolvedApprover?: {
    userId: string | null;
    name: string;
    email: string;
  };
}

export interface ApproverGroup {
  approverUserId: string | null;
  approverName: string;
  approverEmail: string;
  members: TeamMember[];
}

export interface ApproverOption {
  _id: string;
  name: string;
  email: string;
  attendanceEmail: string;
  odId: string;
  employeeCode: string;
}

export interface ManageAttendanceApproverSectionProps {
  viewerUserId: string;
}
