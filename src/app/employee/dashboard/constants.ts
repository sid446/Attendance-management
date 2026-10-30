import type { EmployeeDashboardTab } from './types';

export const PARTNER_PENDING_COUNT_TTL_MS = 60_000;

export const TIMED_CATEGORIES = [
  'Present - in office',
  'Half Day',
  'WFH',
  'Present - outstation',
  'Present - client place'
];

export const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const EMPLOYEE_DASHBOARD_TABS = new Set<EmployeeDashboardTab>([
  'dashboard',
  'attendance',
  'clientPunch',
  'fines',
  'employees',
  'manageApprovers',
  'manageExcessHours',
]);
