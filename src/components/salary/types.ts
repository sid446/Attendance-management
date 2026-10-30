import type { PayrollExtraField, PayrollGroup, PayrollOverrides } from '@/lib/salaryCalculation';

export type PayrollLine = {
  userId: string;
  name: string;
  email: string;
  attendanceEmail?: string;
  category: string;
  designation: string;
  team: string;
  verticalHead: string;
  paidFrom: string;
  group: PayrollGroup;
  isNewJoin: boolean;
  isArticle: boolean;
  articleshipYear?: string;
  pio: number;
  woPio: number;
  osP: number;
  absent: number;
  hd: number;
  wfhWeekday: number;
  weekdaysWorking: number;
  leavesTaken: number;
  leavesBf: number;
  leavesEarned: number;
  leavesConsumed: number;
  leavesCf: number;
  weekoffWorking: number;
  overtimeDays: number;
  overtimeSuggested: number;
  excessHours?: number;
  weekdayHours?: number;
  netWorkingDays: number;
  officeWorkingDays: number;
  checking: number;
  basic: number;
  laptop: number;
  payableBasic: number;
  payableLaptop: number;
  payableMonth: number;
  dueInTally: number;
  additionInOffDue: number;
  cashOffDue: number;
  otherExtra: number;
  esiEmployer: number;
  esiEmployee: number;
  tds: number;
  advances: number;
  off: number;
  taReimbursement?: number;
  lcReimbursement?: number;
  laptopAdjustment?: number;
  customEarnings?: number;
  customDeductions?: number;
  bankPayment: number;
  cashOff: number;
  diff: number;
  netSalary: number;
  overrides?: PayrollOverrides;
  payslipSentAt?: string | null;
  frozen?: boolean;
  frozenAt?: string | null;
  frozenBy?: string;
};

export type PayrollDoc = {
  monthYear: string;
  status: 'draft' | 'finalized';
  calendar: { totalDays: number; sundays: number; ohd: number };
  lines: PayrollLine[];
  extraFields?: PayrollExtraField[];
  generatedAt?: string;
  finalizedAt?: string | null;
};

export type InvalidDayIssue = {
  date: string;
  checkin: string;
  checkout: string;
  issue: 'missing-checkin' | 'missing-checkout';
};

export type EmptyDayIssue = {
  dates: string[];
  wholeMonthMissing: boolean;
};

export type IssuePanelKind = 'invalid' | 'empty';
