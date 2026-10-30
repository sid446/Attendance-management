import { type EmployeeManagementTabId, type HrAccessLevel, type HrConsoleSectionId } from '@/lib/hrConsolePermissionUtils';

export const SECTION_LABELS: Record<HrConsoleSectionId, string> = {
  upload: 'Attendance Upload',
  summary: 'Attendance Summary',
  employee: 'Employee Month View',
  employees: 'Employees',
  employeeMasterUpload: 'Employee Master Upload',
  teamAccess: 'Team Access',
  requests: 'Requests',
  holidays: 'Holiday Management',
  backup: 'Database Backup',
  leave: 'Leave Management',
  salaryPayroll: 'Salary',
  fines: 'Fine Management',
  articleCredits: 'Article Credits',
  invalid: 'Invalid Attendance',
  misExceptions: 'MIS Exceptions',
  daywiseCompare: 'Daywise Compare',
  clientPlaces: 'Client Places',
  accessControl: 'Access control (this page)',
  settings: 'Settings',
};

export const TAB_LABELS: Record<EmployeeManagementTabId, string> = {
  basic: 'Basic Info',
  schedule: 'Schedule',
  extended: 'Extended',
  bank: 'Bank Details',
  salary: 'Salary & Leave',
  history: 'History',
};

export const LEVEL_OPTIONS: { value: HrAccessLevel; label: string }[] = [
  { value: 'none', label: 'Hidden' },
  { value: 'view', label: 'View only' },
  { value: 'edit', label: 'View & edit' },
];
