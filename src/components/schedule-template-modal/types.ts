import type { DailySchedule } from '@/types/ui';

export interface ScheduleTemplateRecord {
  _id: string;
  name: string;
  daily: DailySchedule;
}

export interface ScheduleTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: ScheduleTemplateRecord | null;
  onSave: (payload: { _id?: string; name: string; daily: DailySchedule }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  saving?: boolean;
}
