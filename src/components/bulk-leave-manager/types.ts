import type { User } from '@/types/ui';

export interface BulkLeaveManagerProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  currentMonthYear: string;
  onUpdateComplete: () => void;
}

export interface AbsentRecord {
  userId: string;
  userName: string;
  odId: string;
  date: string;
  monthYear: string;
  currentStatus: string;
}
