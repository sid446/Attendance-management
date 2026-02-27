// src/lib/scheduleUtils.ts
import { IUser } from '@/models/User';

/**
 * Get scheduled in/out times, holiday, and half-day status for a user on a specific date.
 */
export function getScheduledTimes(user: IUser | null | undefined, dateStr: string): { inTime: string; outTime: string; isHoliday: boolean; isHalfDay: boolean } {
  if (!user) {
    return { inTime: '09:00', outTime: '18:00', isHoliday: false, isHalfDay: false };
  }
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Try to use the user's schedules array (new structure)
  if (user.schedules && Array.isArray(user.schedules)) {
    const normalizeDate = (d: any) => {
      if (!d) return 0;
      if (typeof d === 'string') return new Date(d).getTime();
      if (d instanceof Date) return d.getTime();
      return 0;
    };
    const applicableEntry = user.schedules
      .filter(entry => normalizeDate(entry.effectiveFrom) <= date.getTime())
      .sort((a, b) => normalizeDate(b.effectiveFrom) - normalizeDate(a.effectiveFrom))[0];
    if (applicableEntry && applicableEntry.daily) {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[dayOfWeek];
      const sch = applicableEntry.daily[dayName];
      if (sch) {
        return {
          inTime: sch.inTime || '09:00',
          outTime: sch.outTime || '18:00',
          isHoliday: sch.isHoliday || false,
          isHalfDay: sch.isHalfDay || false,
        };
      }
    }
  }
  // Fallback to legacy schedule fields
  const month = date.getMonth() + 1; // 1-12
  let inTime = '09:00';
  let outTime = '18:00';
  let isHoliday = false;
  let isHalfDay = false;
  if (month === 12 || month === 1) {
    inTime = user.scheduleInOutTimeMonth?.inTime || '09:00';
    outTime = user.scheduleInOutTimeMonth?.outTime || '18:00';
    isHoliday = user.scheduleInOutTimeMonth?.isHoliday || false;
    isHalfDay = user.scheduleInOutTimeMonth?.isHalfDay || false;
  } else if (dayOfWeek === 6) { // Saturday
    inTime = user.scheduleInOutTimeSat?.inTime || '09:00';
    outTime = user.scheduleInOutTimeSat?.outTime || '18:00';
    isHoliday = user.scheduleInOutTimeSat?.isHoliday || false;
    isHalfDay = user.scheduleInOutTimeSat?.isHalfDay || false;
  } else if (dayOfWeek !== 0) { // Regular (Mon-Fri)
    inTime = user.scheduleInOutTime?.inTime || '09:00';
    outTime = user.scheduleInOutTime?.outTime || '18:00';
    isHoliday = user.scheduleInOutTime?.isHoliday || false;
    isHalfDay = user.scheduleInOutTime?.isHalfDay || false;
  }
  return { inTime, outTime, isHoliday, isHalfDay };
}
