import type { AttendanceSummaryView, User } from "@/types/ui";
import type { SummaryAlignedMetrics } from "@/lib/attendanceSummaryMetrics";
import type { EmployeeAttendanceRequest } from "@/types/employeeAttendanceRequest";

export interface EmployeeDashboardOverviewProps {
  user: User;
  monthYear: string;
  onMonthYearChange: (monthYear: string) => void;
  alignedMetrics: SummaryAlignedMetrics | null;
  summary: AttendanceSummaryView | null;
  holidays?: { date: string }[];
  chartDailySeries?: { date: string; hours: number }[];
  requestsPending: number;
  pendingRequests?: EmployeeAttendanceRequest[];
  /** Direct reports (partners only); shown below profile. */
  teamMembers?: User[];
  teamMembersLoading?: boolean;
  isLoadingMetrics: boolean;
  /** Open team member profile + month calendar (Team attendance tab). */
  onSelectTeamMember?: (userId: string) => void;
  /** Open the employee My fines tab. */
  onOpenFines?: () => void;
}
