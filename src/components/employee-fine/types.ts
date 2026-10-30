export interface FineRecord {
  serialNo: string;
  date: string;
  consecutiveDay: number;
  fineAmount: number;
  isWarning: boolean;
  status: 'pending' | 'paid' | 'waived';
  penaltyImposedBy?: string;
  reason?: string;
  remark?: string;
  paymentDate?: string;
  paymentMode?: string;
  vertical?: string;
}

export interface EmployeeFineDoc {
  _id: string;
  monthYear: string;
  category: 'Staff' | 'Article';
  fineRecords: FineRecord[];
  totalFine: number;
  totalWarnings: number;
}

export interface EmployeeFineSummaryCardProps {
  monthYear: string;
  onViewDetails: () => void;
}

export interface EmployeeFineSectionProps {
  monthYear: string;
  onMonthYearChange: (monthYear: string) => void;
  userCategory?: string;
}
