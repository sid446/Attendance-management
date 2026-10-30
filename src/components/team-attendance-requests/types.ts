import type { EmployeeAttendanceRequest } from '@/types/employeeAttendanceRequest';

export type TeamRequestRow = EmployeeAttendanceRequest & {
  userName?: string;
  originalCheckin?: string;
  originalCheckout?: string;
  employeeEmploymentType?: string;
  employeeCategory?: string;
  employeeDesignation?: string;
  isArticleEmployee?: boolean;
  presenceCredit?: number;
};

export interface TeamAttendanceRequestsSectionProps {
  monthYear: string;
  onActionComplete?: () => void;
}
