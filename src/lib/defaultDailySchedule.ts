import type { DailySchedule } from '@/types/ui';

/** Default Mon–Fri full day, Sat half day, Sun holiday — matches new schedule entry defaults. */
export function createDefaultDailySchedule(): DailySchedule {
  return {
    monday: { inTime: '10:45', outTime: '19:45' },
    tuesday: { inTime: '10:45', outTime: '19:45' },
    wednesday: { inTime: '10:45', outTime: '19:45' },
    thursday: { inTime: '10:45', outTime: '19:45' },
    friday: { inTime: '10:45', outTime: '19:45' },
    saturday: { inTime: '10:45', outTime: '13:45', isHalfDay: true },
    sunday: { inTime: '', outTime: '', isHoliday: true },
  };
}

export const SCHEDULE_WEEK_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type ScheduleWeekDay = (typeof SCHEDULE_WEEK_DAYS)[number];

export function cloneDailySchedule(daily: DailySchedule): DailySchedule {
  const out: DailySchedule = {};
  for (const day of SCHEDULE_WEEK_DAYS) {
    const slot = daily[day];
    if (slot) out[day] = { ...slot };
  }
  return out;
}
