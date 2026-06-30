export interface AttendanceRequest {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    designation?: string;
    employmentType?: string;
    category?: string;
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
  requestSource?: 'employee' | 'hr_direct';
  hrEditHistory?: {
    editedAt?: string;
    editedBy?: string;
    editedByEmail?: string;
    previousStatus?: string;
    previousStartTime?: string;
    previousEndTime?: string;
    previousValue?: string;
    newStatus?: string;
    newStartTime?: string;
    newEndTime?: string;
    newValue?: string;
    remarks?: string;
    changeSummary?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface DateRangeGroup {
  userName: string;
  userId: string;
  designation?: string;
  employmentType?: string;
  category?: string;
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

export type RequestSortOption =
  | 'date_desc'
  | 'date_asc'
  | 'employee_asc'
  | 'employee_desc'
  | 'status'
  | 'type_asc'
  | 'submitted_desc';

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
