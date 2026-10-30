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
  paymentMode?: 'cash' | 'upi' | 'bank_transfer' | 'salary_deduction' | '';
  vertical?: string;
}

export interface Fine {
  _id: string;
  userId: {
    _id: string;
    name: string;
    odId: string;
    category?: string;
    team?: string;
    workingUnderPartner?: string;
    designation?: string;
  };
  monthYear: string;
  category: 'Staff' | 'Article';
  fineRecords: FineRecord[];
  totalFine: number;
  totalWarnings: number;
}

export interface FineManagementProps {
  selectedMonth?: number;
  selectedYear?: number;
}
