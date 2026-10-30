import type { RequestWindowConfig } from '@/lib/attendanceRequestWindow';

export type TeamOverrideRow = {
  partnerName: string;
  previousMonthCutoffDay?: number;
  currentMonthPastDays?: number;
  futureMonthsAhead?: number;
};

export type EmployeeOverrideRow = {
  userId: string;
  userName?: string;
  previousMonthCutoffDay?: number;
  currentMonthPastDays?: number;
  futureMonthsAhead?: number;
};

export type SettingsPayload = {
  global: RequestWindowConfig;
  teamOverrides: TeamOverrideRow[];
  employeeOverrides: EmployeeOverrideRow[];
};

export type UserListItem = {
  _id: string;
  name: string;
  odId?: string;
  workingUnderPartner?: string;
};
