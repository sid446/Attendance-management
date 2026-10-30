export type UploadRow = { name: string; balance?: number; leaveAdjLwp?: number };

export type ReconcileUser = {
  userId: string;
  userName: string;
  isArticle: boolean;
  monthsWithAttendance: number;
  balanceAsOfJan26: number;
  leaveAdjLwp?: number;
  earned: number;
  usedAfterJan26: number;
  remaining: number;
  paidDays: number;
  unpaidDays: number;
  lockedDays: number;
  attendanceDayChanges: number;
};

export type ReconcileChange = {
  userName: string;
  date: string;
  fromType: string;
  toType: string;
};

export type ReconcileResult = {
  dryRun: boolean;
  fromMonth: string;
  toMonth: string;
  usersProcessed: number;
  usersSkippedNoAttendance: number;
  attendanceDocsUpdated: number;
  recordsUpdated: number;
  monthsRebuilt: string[];
  users: ReconcileUser[];
  sampleChanges: ReconcileChange[];
};

export type UploadPreview = {
  kind: 'bf' | 'adj';
  mode: 'preview' | 'apply';
  monthYear?: string;
  matched: Array<{
    excelName: string;
    userId: string;
    userName: string;
    currentBalanceAsOfJan26?: number;
    newBalanceAsOfJan26?: number;
    currentLeaveAdjLwp?: number;
    newLeaveAdjLwp?: number;
  }>;
  notFound: string[];
  ambiguous: Array<{ excelName: string; candidates: string[] }>;
  invalid: Array<{ excelName: string; reason: string }>;
  duplicateNames: string[];
  reconcile: ReconcileResult;
};

export interface LeaveBalance {
  userId: string;
  userName: string;
  employeeCode?: string;
  team?: string;
  employmentType?: string;
  balanceAsOfJan26: number;
  earned: number;
  leaveAdjLwp: number; // Adj/LWP as of the selected month (sum Jan..month)
  leaveAdjLwpThisMonth?: number; // That month's change
  usedAfterJan26: number; // Leaves taken on or after 1st Jan 2026
  remaining: number;
  lastUpdated: Date;
  monthlyEarned: number;
}

export interface LeaveManagementSectionProps {
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}
