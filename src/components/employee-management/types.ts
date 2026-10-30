import type { User as UserBase } from '@/types/ui';
import type { HrAccessLevel } from '@/lib/hrConsolePermissionUtils';
import type { EmployeeTabAccess } from '@/lib/hrEmployeeSaveFilter';

// Extend User type to include articleCreditsAsOnJan26 for local use
export type User = UserBase & {
  articleCreditsAsOnJan26?: number;
};

export type ManagedFieldKey =
  | 'designation'
  | 'registeredUnderPartner'
  | 'workingUnderPartner'
  | 'basicSalary'
  | 'laptopAllowance'
  | 'totalSalaryPerMonth'
  | 'totalSalaryPerAnnum';

export type SalaryHistoryFieldKey =
  | 'basicSalary'
  | 'laptopAllowance'
  | 'totalSalaryPerMonth'
  | 'totalSalaryPerAnnum';

/** Fields that show expandable effective-dated history (salary + HR basics). */
export type FieldHistoryKey =
  | SalaryHistoryFieldKey
  | 'designation'
  | 'workingUnderPartner'
  | 'registeredUnderPartner';

export type EmployeeManagementSectionProps = {
  selectedUserId?: string | null;
  onRefreshUsers?: () => void;
  employeesSectionAccess?: HrAccessLevel;
  employeeTabAccess?: EmployeeTabAccess;
};
