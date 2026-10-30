import type { DailyExcessApprovalRow } from "@/lib/excessHourAllowance";

export interface ExcessDayChangeLogEntry {
  date: string;
  oldAllowedExcessHours: number | null;
  newAllowedExcessHours: number | null;
  changedByEmail: string;
  changedAt: string;
  typeOfPresence: string;
  missedEntry: boolean;
}

export interface TeamMemberRow {
  _id: string;
  name: string;
  odId: string;
  employeeCode: string;
  rawExcessHour: number;
  displayExcessHour: number;
  adjustedPositiveDays: number;
  partnerAdjusted: boolean;
  days: DailyExcessApprovalRow[];
  changeLogs: ExcessDayChangeLogEntry[];
}

export interface ManageExcessHourAllowanceSectionProps {
  viewerUserId: string;
}
