export interface AttendanceRequest {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    designation?: string;
  };
  userName: string;
  partnerName: string;
  date: string;
  monthYear: string;
  requestedStatus: string;
  originalStatus: string;
  reason?: string;
  partnerRemarks?: string;
  partnerApprovedAt?: string;
  partnerProposedValue?: string;
  status: 'Pending' | 'PendingHr' | 'Approved' | 'Rejected';
  startTime?: string;
  endTime?: string;
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByEmail?: string;
  rejectedAt?: string;
  hrRemarks?: string;
  hrValue?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DateRangeGroup {
  userName: string;
  userId: string;
  designation?: string;
  partnerName: string;
  requestedStatus: string;
  reason?: string;
  partnerRemarks?: string;
  partnerApprovedAt?: string;
  partnerProposedValue?: string;
  status: 'Pending' | 'PendingHr' | 'Approved' | 'Rejected';
  dates: string[];
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByEmail?: string;
  rejectedAt?: string;
  hrValue?: string;
  hrRemarks?: string;
  createdAt: string;
  ids: string[];
}

export type RequestStatusFilter = 'all' | 'Pending' | 'Approved' | 'Rejected';

export type RequestDisplayRow =
  | { type: 'range'; item: DateRangeGroup }
  | { type: 'individual'; item: AttendanceRequest };

export interface AttendanceRequestsSectionProps {
  userId?: string;
  partnerName?: string;
  isEmployeeView?: boolean;
  isAdminView?: boolean;
  userRole?: 'HR' | 'Partner';
  onRequestUpdate?: () => void;
}

export interface RequestsAdminActionsProps {
  isAdminView?: boolean;
  hrAdminHighlight?: boolean;
  processingRequest?: string | null;
  openApprovalModal?: (requestId: string | string[], action: 'approve' | 'reject') => void;
}
