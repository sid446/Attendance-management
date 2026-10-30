import type { User } from '@/types/ui';

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
}

export interface Fine {
  _id: string;
  userId: {
    _id: string;
    name: string;
    odId: string;
    employeeCode?: string;
    category?: string;
  };
  monthYear: string;
  category: 'Staff' | 'Article';
  fineRecords: FineRecord[];
  totalFine: number;
  totalWarnings: number;
}

export interface TeamFineSectionProps {
  monthYear: string;
  teamMembers: User[];
}
