import type React from 'react';
import type { AttendanceSummaryView, AttendanceRecord, User } from '@/types/ui';
import type { SummaryMetricsOptions, SummaryAlignedMetrics } from '@/lib/attendanceSummaryMetrics';

export interface ApprovedRequest {
  _id: string;
  date: string;
  requestedStatus: string;
  requestType?: 'correction' | 'extra_work';
  originalStatus?: string;
  reason?: string;
  startTime?: string;
  endTime?: string;
  extraWorkSlots?: { startTime: string; endTime: string; reason: string }[];
  status: 'Pending' | 'PendingHr' | 'Approved' | 'Rejected' | 'Invalidated';
  partnerName?: string;
  partnerRemarks?: string;
  partnerApprovedAt?: string;
  partnerProposedValue?: string;
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
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByEmail?: string;
  rejectedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CellStyleResult = {
  borderClass: string;
  bgClass: string;
  badgeClass: string;
  Icon: React.ElementType;
  /** When set, replaces `status` for display (e.g. on leave vs unpaid leave). */
  statusLabel?: string;
};

export type DayActivityModalData = {
  date: string;
  request: ApprovedRequest | null;
  record: AttendanceRecord | null;
};

export type ExtraWorkTimeLine = { startTime: string; endTime: string; pending?: boolean };

export interface EmployeeMonthViewProps {
  summaries: AttendanceSummaryView[];
  users: User[]; // All available users for dropdown
  selectedEmployeeId: string | null;
  setSelectedEmployeeId: (id: string | null) => void;
  selectedMonthYear: string;
  onMonthYearChange: (val: string) => void;
  employeeDays: AttendanceRecord[];
  isLoading: boolean;
  error: string | null;
  onLoadAttendance: (employeeId: string, monthYear: string) => void;
  onDayClick?: (date: string, currentStatus: string) => void; // Added for interactivity
  selectionStart?: string | null;
  onSelectionStartChange?: (date: string | null) => void;
  onApplyFutureRequest?: () => void; // Callback to open future request modal
  showEmployeeSelector?: boolean; // When true, always show employee dropdown using users list (for admin views)
  approvedRequests?: ApprovedRequest[]; // For admin view: show indicators for approved/edited days
  /** When false, hides the top summary strip (e.g. when shown in a dashboard overview). Default true. */
  showSummaryStrip?: boolean;
  /** Company holidays — required for summary counts aligned with Attendance Summary. */
  holidays?: { date: string }[];
  /** Options passed to computeSummaryAlignedMetrics (e.g. team single-punch rule, excess caps). */
  summaryMetricsOptions?: SummaryMetricsOptions;
  /** Precomputed metrics; when set, skips internal calculation. */
  alignedMetrics?: SummaryAlignedMetrics | null;
  sectionTitle?: string;
  /** undefined = default admin subtitle; null = hide; string = custom */
  subtitle?: string | null;
  sectionClassName?: string;
}
