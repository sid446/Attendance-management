/**
 * Get scheduled in/out times, holiday, and half-day status for a user on a specific date.
 * This is the central source of truth for all schedule calculations.
 */
export function getScheduledTimes(user: any, dateInput: string | Date): { 
  inTime: string; 
  outTime: string; 
  isHoliday: boolean; 
  isHalfDay: boolean;
  source: 'seasonal' | 'regular' | 'legacy' | 'default';
} {
  if (!user) {
    return { inTime: '09:00', outTime: '18:00', isHoliday: false, isHalfDay: false, source: 'default' };
  }

  // YYYY-MM-DD must be local noon — bare `new Date('YYYY-MM-DD')` is UTC midnight and
  // can shift the weekday in timezones west of UTC (and break schedule day lookup).
  let date: Date;
  if (typeof dateInput === 'string') {
    const isoDay = dateInput.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) {
      date = new Date(`${isoDay}T12:00:00`);
    } else {
      date = new Date(dateInput);
    }
  } else {
    date = dateInput;
  }
  if (isNaN(date.getTime())) {
    return { inTime: '09:00', outTime: '18:00', isHoliday: false, isHalfDay: false, source: 'default' };
  }

  const dateTime = date.getTime();
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const month = date.getMonth(); // 0-11
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dayOfWeek];

  const normalizeDate = (d: any) => {
    if (!d) return 0;
    if (typeof d === 'string') return new Date(d).getTime();
    if (d instanceof Date) return d.getTime();
    if (typeof d === 'object' && d.$date) return new Date(d.$date).getTime();
    return 0;
  };

  // 1. Try to use seasonal schedules first (Recurring & Versioned)
  if (user.seasonalSchedules && Array.isArray(user.seasonalSchedules)) {
    const applicableSeasonal = user.seasonalSchedules
      .filter((s: any) => {
        // Month range check with wrap-around support
        const isMonthMatch = s.startMonth <= s.endMonth
          ? (month >= s.startMonth && month <= s.endMonth)
          : (month >= s.startMonth || month <= s.endMonth);
        
        // Versioning check
        const isEffective = normalizeDate(s.effectiveFrom) <= dateTime;
        return isMonthMatch && isEffective;
      })
      .slice()
      .sort((a: any, b: any) => normalizeDate(b.effectiveFrom) - normalizeDate(a.effectiveFrom))[0];

    if (applicableSeasonal && applicableSeasonal.daily) {
      const sch = applicableSeasonal.daily[dayName];
      if (sch && sch.inTime) {
        return {
          inTime: sch.inTime,
          outTime: sch.outTime || '18:00',
          isHoliday: sch.isHoliday || false,
          isHalfDay: sch.isHalfDay || false,
          source: 'seasonal'
        };
      }
    }
  }

  // 2. Fallback to the user's regular schedules array (Effective Date based)
  if (user.schedules && Array.isArray(user.schedules)) {
    const applicableEntry = user.schedules
      .filter((entry: any) => normalizeDate(entry.effectiveFrom) <= dateTime)
      .slice()
      .sort((a: any, b: any) => normalizeDate(b.effectiveFrom) - normalizeDate(a.effectiveFrom))[0];

    if (applicableEntry && applicableEntry.daily) {
      const sch = applicableEntry.daily[dayName];
      if (sch && sch.inTime) {
        return {
          inTime: sch.inTime,
          outTime: sch.outTime || '18:00',
          isHoliday: sch.isHoliday || false,
          isHalfDay: sch.isHalfDay || false,
          source: 'regular'
        };
      }
    }
  }

  // 3. Fallback to legacy schedule fields
  const month1Based = month + 1; // 1-12
  let inTime = '09:00';
  let outTime = '18:00';
  let isHoliday = false;
  let isHalfDay = false;
  let source: 'legacy' | 'default' = 'default';

  if (month1Based === 12 || month1Based === 1) {
    if (user.scheduleInOutTimeMonth) {
      inTime = user.scheduleInOutTimeMonth.inTime || '09:00';
      outTime = user.scheduleInOutTimeMonth.outTime || '18:00';
      isHoliday = user.scheduleInOutTimeMonth.isHoliday || false;
      isHalfDay = user.scheduleInOutTimeMonth.isHalfDay || false;
      source = 'legacy';
    }
  } else if (dayOfWeek === 6) { // Saturday
    if (user.scheduleInOutTimeSat) {
      inTime = user.scheduleInOutTimeSat.inTime || '09:00';
      outTime = user.scheduleInOutTimeSat.outTime || '18:00';
      isHoliday = user.scheduleInOutTimeSat.isHoliday || false;
      isHalfDay = user.scheduleInOutTimeSat.isHalfDay || false;
      source = 'legacy';
    }
  } else if (dayOfWeek !== 0) { // Regular (Mon-Fri)
    if (user.scheduleInOutTime) {
      inTime = user.scheduleInOutTime.inTime || '09:00';
      outTime = user.scheduleInOutTime.outTime || '18:00';
      isHoliday = user.scheduleInOutTime.isHoliday || false;
      isHalfDay = user.scheduleInOutTime.isHalfDay || false;
      source = 'legacy';
    }
  } else {
    // Sunday default
    isHoliday = true;
  }

  return { inTime, outTime, isHoliday, isHalfDay, source };
}
