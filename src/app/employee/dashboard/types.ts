import type { AttendanceRecord, AttendanceSummaryView, User } from '@/types/ui';
import type { EmployeeAttendanceRequest } from '@/types/employeeAttendanceRequest';

export type ExtraWorkSlotDraft = {
  id: string;
  startTime: string;
  endTime: string;
  reason: string;
  copyPreviousReason: boolean;
};

export type TeamAccessFetchResult = {
  members: User[];
  includeViewerSelf: boolean;
  approverInboxCount: number;
  canApproveRequests: boolean;
};

export type SubordinateAttendancePack = {
  summary: AttendanceSummaryView | null;
  employeeDays: AttendanceRecord[];
  userForMetrics?: User;
  requests: EmployeeAttendanceRequest[];
  /** Set after correction requests are fetched for the member calendar. */
  requestsLoaded?: boolean;
};

export type EmployeeDashboardTab =
  | 'dashboard'
  | 'attendance'
  | 'clientPunch'
  | 'fines'
  | 'employees'
  | 'manageApprovers'
  | 'manageExcessHours';
