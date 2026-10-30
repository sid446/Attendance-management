import type { DailySchedule } from '@/types/ui';
import type { ScheduleWeekDay } from '@/lib/defaultDailySchedule';

export type DayField = 'inTime' | 'outTime' | 'isHoliday' | 'isHalfDay';

export interface ScheduleWeekGridProps {
  daily: DailySchedule;
  onDayChange: (day: ScheduleWeekDay, field: DayField, value: string | boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  accent?: 'blue' | 'emerald';
}
