'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AttendanceSummaryView, DailySchedule, ScheduleEntry, User } from '@/types/ui';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import {
  formatHoursMinutes,
  getEmploymentTypeForDate,
  isExcessEligibleRecord,
  getWorkedHoursMatchingScheduledDays,
  isDayIncludedInScheduledCalc,
} from '@/lib/attendanceSummaryMetrics';
import {
  getDesignationForDate,
  getDesignationForSummary,
  getSummaryPeriodEndDate,
  getWorkingUnderPartnerForDate,
  getWorkingUnderPartnerForSummary,
} from '@/lib/userFieldHistory';
import { SUMMARY_TABLE_CHUNK } from '../constants';
import { formatIsoKeyAsDdMmYyyy, sortRecordDetailsEntries } from '../utils/summaryDateUtils';
import {
  exportDetailedAttendance,
  exportSummaryAttendance,
  exportDaywiseAttendance,
} from '../exports';
import type { SummaryExportContext } from '../exports/exportTypes';
import type { EnrichedSummary, SummarySectionProps } from '../types';
import {
  applyExcessHourAllowance,
  lookupExcessAllowance,
  resolveDisplayExcess,
  type ExcessAllowanceLookup,
  type ExcessDayAllowanceLookup,
  type ExcessDisplayLookup,
} from '@/lib/excessHourAllowance';

export function useSummarySectionLogic(props: SummarySectionProps) {
  const {
    summaries,
    allUsers,
    holidays = [],
    isLoading = false,
    onFilterChange,
    onEmployeeClick,
    onEmployeeDetailClick,
    onRefreshUsers,
    uploadTotal = 0,
    uploadSaved = 0,
    uploadFailed = 0,
    initialMonthYear,
    hideDetailedExport = false,
  } = props;

  const currentDate = new Date();

  // Create a persistent cache for getScheduledTimes bound to the current allUsers
  const scheduleCacheRef = useRef<Map<string, ReturnType<typeof getScheduledTimes>>>(new Map());
  useEffect(() => {
    scheduleCacheRef.current.clear();
  }, [allUsers]);

  const getCachedScheduledTimes = (user: any, dateInput: string | Date) => {
    if (!user) return getScheduledTimes(user, dateInput);
    
    let dateStr = '';
    if (typeof dateInput === 'string') {
        dateStr = dateInput.split('T')[0];
    } else {
        // Need local date string to avoid timezone issues, just use yyyy-mm-dd
        const y = dateInput.getFullYear();
        const m = String(dateInput.getMonth() + 1).padStart(2, '0');
        const d = String(dateInput.getDate()).padStart(2, '0');
        dateStr = `${y}-${m}-${d}`;
    }

    const key = `${user._id || user.odId}_${dateStr}`;
    
    if (scheduleCacheRef.current.has(key)) {
      return scheduleCacheRef.current.get(key)!;
    }
    
    const result = getScheduledTimes(user, dateInput);
    scheduleCacheRef.current.set(key, result);
    return result;
  };

  
  const getInitialYearMonth = () => {
    if (initialMonthYear) {
      const [yearStr, monthStr] = initialMonthYear.split('-');
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      if (!isNaN(y) && !isNaN(m)) {
        return { y, m };
      }
    }
    return { y: currentDate.getFullYear(), m: currentDate.getMonth() + 1 };
  };
  
  const initDate = getInitialYearMonth();
  
  const [selectedYear, setSelectedYear] = useState<number>(initDate.y);
  const [selectedMonth, setSelectedMonth] = useState<number>(initDate.m);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  
  const [filterType, setFilterType] = useState<'month' | 'range' | 'week'>('month');
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState<string>('');

  // When switching to week view, set currentWeekStart to first day of selected month
  useEffect(() => {
    if (filterType === 'week') {
      // Always start week from the 1st of the selected month
      const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
      setCurrentWeekStart(firstDay.toISOString().split('T')[0]);
    }
  }, [filterType, selectedYear, selectedMonth]);
  
  // Sync selected year/month if initialMonthYear prop changes
  useEffect(() => {
    if (initialMonthYear) {
      const [yearStr, monthStr] = initialMonthYear.split('-');
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      if (!isNaN(y) && !isNaN(m)) {
        setSelectedYear(y);
        setSelectedMonth(m);
      }
    }
  }, [initialMonthYear]);
  
  // Advanced Filtering State
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [designationFilter, setDesignationFilter] = useState<string>('all');
  const [lateFilter, setLateFilter] = useState<{operator: string, value: number}>({operator: 'all', value: 0});
  const [presentFilter, setPresentFilter] = useState<{operator: string, value: number}>({operator: 'all', value: 0});
  const [absentFilter, setAbsentFilter] = useState<{operator: string, value: number}>({operator: 'all', value: 0});
  const [leaveFilter, setLeaveFilter] = useState<{operator: string, value: number}>({operator: 'all', value: 0});
  const [halfDayFilter, setHalfDayFilter] = useState<{operator: string, value: number}>({operator: 'all', value: 0});
  const [workHoursFilter, setWorkHoursFilter] = useState<{operator: string, value: number}>({operator: 'all', value: 0});
  const [excessFilter, setExcessFilter] = useState<{operator: string, value: number}>({operator: 'all', value: 0});
  
  // Sorting State
  const [sortField, setSortField] = useState<string>('calcExcessDeficit');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Filter Modal State
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Detail Modal State
  const [detailModal, setDetailModal] = useState<{isOpen: boolean; title: string; data: {date: string; info: string; subInfo?: string}[]}>({
      isOpen: false, title: '', data: []
  });

  const [isBulkManagerOpen, setIsBulkManagerOpen] = useState(false);
  const [summaryTableFullscreen, setSummaryTableFullscreen] = useState(false);
  const [excessAllowanceMap, setExcessAllowanceMap] = useState<ExcessAllowanceLookup>({});
  const [excessDisplayMap, setExcessDisplayMap] = useState<ExcessDisplayLookup>({});
  const [excessDayAllowanceMap, setExcessDayAllowanceMap] = useState<ExcessDayAllowanceLookup>({});

  useEffect(() => {
    if (!summaries.length) {
      setExcessAllowanceMap({});
      setExcessDisplayMap({});
      setExcessDayAllowanceMap({});
      return;
    }
    const seen = new Set<string>();
    const pairs: string[] = [];
    for (const s of summaries) {
      if (!s.userId || !s.monthYear) continue;
      const key = `${s.userId}:${s.monthYear}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(key);
    }
    if (pairs.length === 0) return;

    void (async () => {
      try {
        const res = await fetch(
          `/api/excess-hour-allowance?pairs=${encodeURIComponent(pairs.join(','))}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (json.success && json.data && typeof json.data === 'object') {
          setExcessAllowanceMap(json.data as ExcessAllowanceLookup);
        } else {
          setExcessAllowanceMap({});
        }
        if (json.success && json.displayExcess && typeof json.displayExcess === 'object') {
          setExcessDisplayMap(json.displayExcess as ExcessDisplayLookup);
        } else {
          setExcessDisplayMap({});
        }
        if (json.success && json.dayAllowances && typeof json.dayAllowances === 'object') {
          setExcessDayAllowanceMap(json.dayAllowances as ExcessDayAllowanceLookup);
        } else {
          setExcessDayAllowanceMap({});
        }
      } catch {
        setExcessAllowanceMap({});
        setExcessDisplayMap({});
        setExcessDayAllowanceMap({});
      }
    })();
  }, [summaries]);

  const summaryPeriodBase = useMemo(
    () => ({
      filterType,
      selectedYear,
      selectedMonth,
      currentWeekStart,
      rangeEnd,
    }),
    [filterType, selectedYear, selectedMonth, currentWeekStart, rangeEnd]
  );

  const resolveWorkPartnerForItem = useCallback(
    (user: User | undefined, monthYear?: string) =>
      getWorkingUnderPartnerForSummary(user as Parameters<typeof getWorkingUnderPartnerForSummary>[0], {
        ...summaryPeriodBase,
        monthYear,
      }),
    [summaryPeriodBase]
  );

  const resolveDesignationForItem = useCallback(
    (user: User | undefined, monthYear?: string) =>
      getDesignationForSummary(user as Parameters<typeof getDesignationForSummary>[0], {
        ...summaryPeriodBase,
        monthYear,
      }),
    [summaryPeriodBase]
  );

  const getApplicableSchedule = (item: AttendanceSummaryView, date?: string): ScheduleEntry | undefined => {
    const targetDate = date ? new Date(date) : new Date(item.monthYear + '-01');
    const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
    if (!user) return undefined;

    // Use central resolver to find the correct schedule entry
    const schedule = getCachedScheduledTimes(user, targetDate);
    // Note: getScheduledTimes returns timings, but for UI we might still need the Entry object
    // For now, let's keep the Entry lookup logic but ensure it follows the same versioning
    if (user.schedules && Array.isArray(user.schedules)) {
      return user.schedules
        .filter((s: any) => new Date(s.effectiveFrom) <= targetDate)
        .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
    }
    return undefined;
  };

  const getLateDetails = (item: AttendanceSummaryView) => {
    if (!item) return [];
    const records = item.recordDetails || {};
    const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
    const dates: { date: string; info: string; subInfo?: string }[] = [];
    Object.entries(records).forEach(([date, rec]) => {
      const effectiveCheckin = rec.editedCheckin || rec.checkin;
      if (!effectiveCheckin) return;
      const d = new Date(date);
      // Skip Sundays
      if (d.getDay() === 0) return;
      // Skip Holidays (check typeOfPresence)
      if (rec.typeOfPresence === 'Holiday') return;
      // Skip weekoff (case-insensitive)
      if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) return;
      const empTypeLate = getEmploymentTypeForDate(user, d);
      if (empTypeLate === 'halftime') return;
      const schedule = getCachedScheduledTimes(user, d);
      const scheduledIn = schedule.inTime;
      
      if (effectiveCheckin > scheduledIn) {
        dates.push({
          date,
          info: `${effectiveCheckin}`,
          subInfo: `Sch: ${scheduledIn} (${empTypeLate || ''})`
        });
      }
    });
    return dates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getAbsentDetails = (item: AttendanceSummaryView) => {
    if (!item) return [];
    const records = item.recordDetails || {};
    const dates: { date: string; info: string; subInfo?: string }[] = [];
    const holidayDatesSet = new Set(holidays.map(h => h.date));
    
    Object.entries(records).forEach(([date, rec]) => {
        const d = new Date(date);
        const type = String(rec.typeOfPresence || '');
        const typeLower = type.toLowerCase();
        
        // Skip Sundays and holidays
        if (d.getDay() === 0) return;
        if (holidayDatesSet.has(date) || typeLower === 'holiday') return;

        if (type === 'Absent') {
          dates.push({ date, info: 'Absent', subInfo: 'Marked absent' });
          return;
        }
        if (type === 'Leave' || type === 'On leave') {
          dates.push({ date, info: 'Absent', subInfo: 'On leave' });
          return;
        }

        // Presence types that shouldn't be absent even with 0 hours
        const isPresenceType = typeLower.includes('wfh') || 
                               typeLower.includes('outstation') || 
                               typeLower.includes('clientplace') || 
                               typeLower.includes('half day') ||
                               rec.halfDay;

        if (isPresenceType) return;

        // Absent logic: 0 hours, not weekoff, both in and out invalid
        if (
          rec.totalHour === 0 &&
          !(typeLower.includes('weekoff'))
        ) {
          const effectiveCheckin = rec.editedCheckin || rec.checkin;
          const effectiveCheckout = rec.editedCheckout || rec.checkout;
          // Only mark absent if BOTH in and out are missing or '00:00'
          if ((!(effectiveCheckin && effectiveCheckin !== "00:00")) && (!(effectiveCheckout && effectiveCheckout !== "00:00"))) {
            dates.push({ date, info: 'Absent', subInfo: type === 'ThumbMachine' ? '0 Hours' : type });
          }
        }
    });
    return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getLeaveDetails = (item: AttendanceSummaryView) => {
      if (!item) return [];
      const records = item.recordDetails || {};
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      Object.entries(records).forEach(([date, rec]) => {
          if (rec.typeOfPresence === 'Leave' || rec.typeOfPresence === 'On leave') {
               dates.push({ date, info: 'On leave' });
          }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getPresentDetails = (item: AttendanceSummaryView) => {
      if (!item) return [];
      const records = item.recordDetails || {};
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      Object.entries(records).forEach(([date, rec]) => {
          // Use edited times for display if available, otherwise use original times
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const effectiveCheckout = rec.editedCheckout || rec.checkout;
        const isBothZero = !(effectiveCheckin && effectiveCheckin !== '00:00') && !(effectiveCheckout && effectiveCheckout !== '00:00');

        // Present logic: has valid checkin or halfDay (but do NOT treat as half-day when both in/out are 00:00)
        if ((effectiveCheckin && effectiveCheckin !== '00:00') || (rec.halfDay && !isBothZero)) {
           const info = rec.halfDay ? 'Half Day' : `Present (${effectiveCheckin})`;
           dates.push({ date, info, subInfo: rec.halfDay ? 'Half Day' : undefined });
        }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getHalfDayDetails = (item: AttendanceSummaryView) => {
    if (!item) return [];
    const records = item.recordDetails || {};
    const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
    const dates: { date: string; info: string; subInfo?: string }[] = [];
    Object.entries(records).forEach(([date, rec]) => {
      const effectiveCheckin = rec.editedCheckin || rec.checkin;
      const effectiveCheckout = rec.editedCheckout || rec.checkout;
      const isBothZero = !(effectiveCheckin && effectiveCheckin !== '00:00') && !(effectiveCheckout && effectiveCheckout !== '00:00');
      const d = new Date(date);
      const empTypeHalfDay = getEmploymentTypeForDate(user, d);
      // Only count as half-day if rules for this employment type say so
      if (rec.halfDay && rec.typeOfPresence !== 'Holiday' && !isBothZero) {
        dates.push({ date, info: 'Half Day', subInfo: `${empTypeHalfDay ? `Type: ${empTypeHalfDay}. ` : ''}${effectiveCheckin ? `In: ${effectiveCheckin}` : ''}` });
      }
    });
    return dates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getWorkHoursDetails = (item: AttendanceSummaryView) => {
      if (!item) return [];
      const records = item.recordDetails || {};
      const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
      const dateList = getExcessDateListForCurrentPeriod();
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      dateList.forEach((date) => {
          const rec = records[date];
          if (!user || !isDayIncludedInScheduledCalc(user, date, rec)) return;
          const effectiveCheckin = rec?.editedCheckin || rec?.checkin;
          if (rec && Number(rec.totalHour || 0) > 0) {
               dates.push({ date, info: `${formatHoursMinutes(rec.totalHour)}`, subInfo: effectiveCheckin ? `In: ${effectiveCheckin}` : undefined });
          }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getScheduledHoursDetails = (item: AttendanceSummaryView) => {
    return getScheduledResultForItem(item).breakdown;
  };

  // Helper function to get working days calculation breakdown
  const getWorkingDaysDetails = (item: AttendanceSummaryView) => {
      const details: { date: string; info: string; subInfo?: string }[] = [];
      
      // Calculate each component (excluding holidays from DB, Sundays, and weekoff types)
      const records = item.recordDetails || {};
      const holidayDates = new Set(holidays.map(h => h.date));
      let presentDays = 0;
      let absentDays = 0;
      let leaveDays = 0;
      
      Object.entries(records).forEach(([dateStr, rec]) => {
        const d = new Date(dateStr);
        if (d.getDay() === 0) return; // Exclude Sundays
        if (holidayDates.has(dateStr)) return; // Exclude holidays from DB
        if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) return;
        
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const effectiveCheckout = rec.editedCheckout || rec.checkout;
        const isBothZero = !(effectiveCheckin && effectiveCheckin !== '00:00') && !(effectiveCheckout && effectiveCheckout !== '00:00');

        const typeLower = String(rec.typeOfPresence || '').toLowerCase();
        const isPresenceType = typeLower.includes('wfh') || 
                               typeLower.includes('outstation') || 
                               typeLower.includes('clientplace') || 
                               typeLower.includes('half day') ||
                               rec.halfDay;

        if (rec.typeOfPresence === 'Leave' || rec.typeOfPresence === 'On leave') {
          absentDays++;
          if (!rec.halfDay) leaveDays++;
        } else if (
          isPresenceType ||
          ((effectiveCheckin && effectiveCheckin !== '00:00') && (effectiveCheckout && effectiveCheckout !== '00:00'))
        ) {
          presentDays++;
        } else if (
          (!(effectiveCheckin && effectiveCheckin !== '00:00')) &&
          (!(effectiveCheckout && effectiveCheckout !== '00:00'))
        ) {
          absentDays++;
        }
      });
      
      const totalWorkingDays = presentDays + absentDays;
      
      // Add summary breakdown at the top
        details.push({
          date: 'CALCULATION',
          info: `Present + Absent = Total`,
          subInfo: 'Leave is included in Absent'
        });
      
      details.push({
          date: 'Present Days',
          info: `${presentDays} days`,
          subInfo: 'Days with attendance'
      });
      
      details.push({
          date: 'Absent Days',
          info: `${absentDays} days`,
          subInfo: 'No attendance (not holiday/leave)'
      });
      
      details.push({
          date: 'Leave Days',
          info: `${leaveDays} days`,
          subInfo: 'Full leave days consumed'
      });
      
      details.push({
          date: 'TOTAL',
          info: `${totalWorkingDays} Working Days`,
          subInfo: `${presentDays} + ${absentDays}`
      });
      
      // Add individual day breakdown
      details.push({
          date: '---',
          info: 'Daily Breakdown',
          subInfo: '---'
      });
      
      Object.entries(records)
          .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
          .forEach(([date, rec]) => {
              // Skip Sundays
              const d = new Date(date);
              if (d.getDay() === 0) {
                  return;
              }
              // Skip holidays from database
              if (holidayDates.has(date)) {
                  return;
              }
              // Skip weekoff types
              if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) {
                  return;
              }
              
              let status = '';
              let category = '';
              
              if (rec.typeOfPresence === 'Leave' || rec.typeOfPresence === 'On leave') {
                  if (!rec.halfDay) {
                      status = 'Leave (Full)';
                      category = 'Leave';
                  } else {
                      status = 'Leave (Half)';
                      category = 'Leave';
                  }
                } else {
                  const effectiveCheckin = rec.editedCheckin || rec.checkin;
                  const effectiveCheckout = rec.editedCheckout || rec.checkout;
                  const isBothZero = !(effectiveCheckin && effectiveCheckin !== '00:00') && !(effectiveCheckout && effectiveCheckout !== '00:00');

                  const typeLower = String(rec.typeOfPresence || '').toLowerCase();
                  const isPresenceType = typeLower.includes('wfh') || 
                                         typeLower.includes('outstation') || 
                                         typeLower.includes('clientplace') || 
                                         typeLower.includes('half day') ||
                                         rec.halfDay;

                  if (rec.totalHour > 0 || (effectiveCheckin && effectiveCheckin !== '00:00') || isPresenceType) {
                    status = rec.halfDay ? 'Present (Half)' : 'Present';
                    category = 'Present';
                  } else {
                    status = 'Absent';
                    category = 'Absent';
                  }
                }
              
              if (status) {
                  details.push({
                      date: date,
                      info: status,
                      subInfo: category
                  });
              }
          });
      
      return details;
  };

  const getDefinedScheduleDetails = (item: AttendanceSummaryView) => {
    return getDefinedScheduleResultForItem(item).breakdown;
  };

  const openDetail = (e: React.MouseEvent, type: 'Late' | 'Absent' | 'Leave' | 'Present' | 'WorkHours' | 'ScheduledHours' | 'HalfDay' | 'DefinedSchedule' | 'WorkingDays', item: AttendanceSummaryView) => {
      e.stopPropagation();
      let data: any[] = [];
      if (type === 'Late') data = getLateDetails(item);
      if (type === 'Absent') data = getAbsentDetails(item);
      if (type === 'Leave') data = getLeaveDetails(item);
      if (type === 'Present') data = getPresentDetails(item);
      if (type === 'WorkHours') data = getWorkHoursDetails(item);
      if (type === 'ScheduledHours') data = getScheduledHoursDetails(item);
      if (type === 'HalfDay') {
        data = getHalfDayDetails(item);
        // If summary says there are halfdays but no records, show a message
        if (data.length === 0 && item.summary?.totalHalfDay > 0) {
          data = [{ date: '', info: `No detailed half-day records found, but summary shows ${item.summary.totalHalfDay} half-day(s).`, subInfo: '' }];
        }
      }
      if (type === 'DefinedSchedule') data = getDefinedScheduleDetails(item);
      if (type === 'WorkingDays') data = getWorkingDaysDetails(item);

      setDetailModal({
          isOpen: true,
          title: `${type} Details - ${item.userName}`,
          data
      });
  };

  const currentMonthYear = filterType === 'month' ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}` : 
    filterType === 'week' ? (() => {
      if (!currentWeekStart) return '';
      const end = new Date(currentWeekStart);
      if (isNaN(end.getTime())) return '';
      end.setDate(end.getDate() + 6);
      return end.toISOString().split('T')[0];
    })() : rangeEnd;

  const usersForBulk = useMemo(() => {
    if (allUsers && allUsers.length > 0) return allUsers;
    
    return summaries.map(s => ({
        _id: s.userId,
        odId: s.odId || s.userId, 
        name: s.userName,
        email: '',
        joiningDate: ''
    } as User));
  }, [summaries, allUsers]);
  
  // Trigger fetch on selection change
  useEffect(() => {
    if (filterType === 'month') {
      const monthStr = String(selectedMonth).padStart(2, '0');
      const monthYear = `${selectedYear}-${monthStr}`;
      onFilterChange(monthYear);
    } else if (filterType === 'week' && currentWeekStart) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      onFilterChange({startDate: currentWeekStart, endDate: weekEnd.toISOString().split('T')[0]});
    }
  }, [selectedYear, selectedMonth, filterType, currentWeekStart]); // Missing onFilterChange dependency is intentional to avoid loop if passed inline

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(prev => prev + 1);
    }
  };

  const handlePrevWeek = () => {
    if (!currentWeekStart) return;
    const current = new Date(currentWeekStart);
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    // If already at the first week, do nothing
    if (current.getTime() === firstDay.getTime()) return;
    current.setDate(current.getDate() - 7);
    // Clamp to first day if we go before
    if (current < firstDay) {
      setCurrentWeekStart(firstDay.toISOString().split('T')[0]);
    } else {
      setCurrentWeekStart(current.toISOString().split('T')[0]);
    }
  };

  const handleNextWeek = () => {
    if (!currentWeekStart) return;
    const current = new Date(currentWeekStart);
    current.setDate(current.getDate() + 7);
    // Prevent going past the last day of the month
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    if (current > lastDay) return;
    setCurrentWeekStart(current.toISOString().split('T')[0]);
  };

  const calculateTotalScheduledHours = (item: AttendanceSummaryView): number => {
      // 1. Get days in month
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      
      let total = 0;
      
      // Get user for scheduling
      const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
      
      // Get applicable schedule for this month
      const applicableSchedule = getApplicableSchedule(item);
      if (!applicableSchedule) return 0;

      // Helper for diff
      const timeToHours = (t?: string) => {
          if (!t) return 0;
          const [h, m] = t.split(':').map(Number);
          return h + (m / 60);
      };

      // Day names mapping
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(selectedYear, selectedMonth - 1, day);
        const schedule = getCachedScheduledTimes(user, date);

        if (schedule.isHoliday || !schedule.inTime || !schedule.outTime || schedule.inTime === '00:00' || schedule.outTime === '00:00') {
          continue;
        }

        const startH = timeToHours(schedule.inTime);
        const endH = timeToHours(schedule.outTime);
        let hours = endH > startH ? endH - startH : 0;

        if (hours === 0) {
          // Default hours if calculation fails
          hours = date.getDay() === 6 ? 4 : 9;
        }

        if (schedule.isHalfDay) {
          hours = hours / 2;
        }

        total += hours;
      }
      return total;
  };

  const calculateDefinedScheduleHours = (item: AttendanceSummaryView): number => {
    return getDefinedScheduleResultForItem(item).total;
  };

  // Calculate scheduled hours WITHOUT lunch deduction (for Scheduled column)
  // Uses the same strict day filter as the Scheduled modal.
  const calculateScheduledHoursNoLunch = (item: AttendanceSummaryView): number => {
      return getScheduledResultForItem(item).total;
  };

  // Helper function to calculate scheduled working days (expected working days)
  const calculateScheduledWorkingDays = (item: AttendanceSummaryView): number => {
    // Get applicable schedule for this month
    const applicableSchedule = getApplicableSchedule(item);
    if (!applicableSchedule) return 0;

    let workingDays = 0;

    // Calculate scheduled working days for each day that has attendance data
    const records = item.recordDetails || {};
    const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);

    for (const dateStr of Object.keys(records)) {
      const d = new Date(dateStr);
      const schedule = getCachedScheduledTimes(user, d);

      // Skip if marked as holiday
      if (schedule.isHoliday) {
        continue;
      }

      // Count this as a working day
      workingDays++;
    }

    return workingDays;
  };

  // Helper function to calculate correct leave count (only full leave days)
  const calculateLeaveConsumed = (item: AttendanceSummaryView): number => {
    let fullLeaveDays = 0;
    Object.values(item.recordDetails || {}).forEach((record: any) => {
      if ((record.typeOfPresence === 'On leave' || record.typeOfPresence === 'Leave') && record.value === 1) {
        fullLeaveDays++;
      }
    });
    return fullLeaveDays;
  };

  // Helper function to count total Sundays in the selected period
  const countTotalSundaysInPeriod = () => {
    let startDate: Date;
    let endDate: Date;

    if (filterType === 'month') {
      startDate = new Date(selectedYear, selectedMonth - 1, 1);
      endDate = new Date(selectedYear, selectedMonth, 0); // Last day of month
    } else if (filterType === 'week') {
      startDate = new Date(currentWeekStart);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // End of week
    } else {
      // Range
      startDate = new Date(rangeStart);
      endDate = new Date(rangeEnd);
    }

    let sundayCount = 0;
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      if (currentDate.getDay() === 0) { // 0 = Sunday
        sundayCount++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return sundayCount;
  };

  // Helper function to calculate detailed attendance metrics
  const calculateDetailedAttendanceMetrics = (item: AttendanceSummaryView) => {
    const records = item.recordDetails || {};
    
    // New simplified metrics
    let present = 0; // Total present days
    let absent = 0; // Total absent days
    let sunHoliday = 0; // Sundays + Holidays count
    let hdWeekday = 0; // Half Day - weekdays
    let hdWeekoff = 0; // Half Day - weekoff
    let wfhWeekday = 0; // WFH - weekdays
    let wfhWeekoff = 0; // WFH - weekoff
    let outstationWeekday = 0; // Present - Outstation (Weekdays)
    let outstationWeekoff = 0; // Present - Outstation (Weekoff)
    let clientPlaceWeekday = 0; // Present - ClientPlace (Weekdays)
    let clientPlaceWeekoff = 0; // Present - ClientPlace (Weekoff)
    let inOfficeWeekday = 0; // Present - in office - weekdays
    let inOfficeWeekoff = 0; // Present - in office - weekoff
    let weekoffSpecial = 0; // Weekoff - special allowance
    let netWeekdaysWorking = 0;

    Object.entries(records).forEach(([date, rec]: [string, any]) => {
      const recordDate = new Date(date);
      const dayOfWeek = recordDate.getDay(); // 0 = Sunday
      const isSunday = dayOfWeek === 0;

      // Get the value from the record
      const value = rec.value || 0;
      const type = rec.typeOfPresence || '';

      // Use edited times for calculations if available, otherwise use original times
      const effectiveCheckin = rec.editedCheckin || rec.checkin;
      const effectiveCheckout = rec.editedCheckout || rec.checkout;

      // Count Sundays and Holidays
      if (isSunday || type === 'Holiday' || type === 'Official Holiday Duty (OHD)') {
        sunHoliday += 1;
      }

      // Special case: ThumbMachine with 00:00 checkin/checkout should be counted as Absent
      if (type === 'ThumbMachine' && effectiveCheckin === '00:00' && effectiveCheckout === '00:00') {
        absent += 1;
        return;
      }

      // Categorize based on typeOfPresence
      if (type === 'Absent') {
        absent += 1;
      } else if (type === 'On leave' || type === 'Leave') {
        absent += 1; // Informational policy: all leave days count as absent
      } else if (type === 'Half Day - weekdays') {
        hdWeekday += value;
        present += 1; // Count as 1 day present
      } else if (type === 'Half Day - weekoff') {
        hdWeekoff += value;
        present += 1; // Count as 1 day present
      } else if (type === 'Half Day (HD)') {
        // Legacy half day - categorize based on day
        if (isSunday) {
          hdWeekoff += value;
        } else {
          hdWeekday += value;
        }
        present += 1; // Count as 1 day present
      } else if (type === 'WFH - weekdays') {
        wfhWeekday += value;
        present += 1; // Count as 1 day present
      } else if (type === 'WFH - weekoff' || type === 'Weekly Off - Work From Home (WO-WFH)') {
        wfhWeekoff += value;
        present += 1; // Count as 1 day present
      } else if (type === 'Work From Home (WFH)') {
        // Legacy WFH - categorize based on day
        if (isSunday) {
          wfhWeekoff += value;
        } else {
          wfhWeekday += value;
        }
        present += 1; // Count as 1 day present
      } else if (type === 'Present - Outstation (Weekdays)' || type === 'Onsite Presence (OS-P)') {
        outstationWeekday += value;
        present += 1; // Count as 1 day present
      } else if (type === 'Present - Outstation (Weekoff)') {
        outstationWeekoff += value;
        present += 1; // Count as 1 day present
      } else if (type === 'Present - outstation') {
        // Legacy outstation - categorize based on day
        if (isSunday) {
          outstationWeekoff += value;
        } else {
          outstationWeekday += value;
        }
        present += 1; // Count as 1 day present
      } else if (type === 'Present - ClientPlace (Weekdays)') {
        clientPlaceWeekday += value;
        present += 1; // Count as 1 day present
      } else if (type === 'Present - ClientPlace (Weekoff)') {
        clientPlaceWeekoff += value;
        present += 1; // Count as 1 day present
      } else if (type === 'Present - client place') {
        // Legacy client place - categorize based on day
        if (isSunday) {
          clientPlaceWeekoff += value;
        } else {
          clientPlaceWeekday += value;
        }
        present += 1; // Count as 1 day present
      } else if (type === 'Present - in office - weekdays') {
        inOfficeWeekday += value;
        present += 1; // Count as 1 day present
      } else if (type === 'Present - in office - weekoff') {
        inOfficeWeekoff += value;
        present += 1; // Count as 1 day present
      } else if (type === 'Present - in office' || type === 'ThumbMachine' || type === 'Thumb machine - not working') {
        // Legacy present in office - categorize based on day
        if (isSunday) {
          inOfficeWeekoff += value;
        } else {
          inOfficeWeekday += value;
        }
        present += 1; // Count as 1 day present
      } else if (type === 'Present - weekoff' || type === 'Weekly Off - Present (WO-Present)') {
        inOfficeWeekoff += value;
        present += 1; // Count as 1 day present
      } else if (type === 'Weekoff - special allowance') {
        weekoffSpecial += value;
      } else if (type === 'Holiday' || type === 'Official Holiday Duty (OHD)') {
        // Already counted in sunHoliday
      } else if (value > 0) {
        // Any other type with value > 0 counts as present
        present += 1; // Count as 1 day present
      }
    });

    // Calculate net weekdays working
    netWeekdaysWorking = present;

    return {
      present: Number(present.toFixed(2)),
      absent,
      sunHoliday,
      hdWeekday: Number(hdWeekday.toFixed(2)),
      hdWeekoff: Number(hdWeekoff.toFixed(2)),
      wfhWeekday: Number(wfhWeekday.toFixed(2)),
      wfhWeekoff: Number(wfhWeekoff.toFixed(2)),
      outstationWeekday: Number(outstationWeekday.toFixed(2)),
      outstationWeekoff: Number(outstationWeekoff.toFixed(2)),
      clientPlaceWeekday: Number(clientPlaceWeekday.toFixed(2)),
      clientPlaceWeekoff: Number(clientPlaceWeekoff.toFixed(2)),
      inOfficeWeekday: Number(inOfficeWeekday.toFixed(2)),
      inOfficeWeekoff: Number(inOfficeWeekoff.toFixed(2)),
      weekoffSpecial: Number(weekoffSpecial.toFixed(2)),
      netWeekdaysWorking: Number(netWeekdaysWorking.toFixed(2))
    };
  };

  const calculateLateArrivals = (item: AttendanceSummaryView): number => {
      const records = item.recordDetails || {};
      let count = 0;
      
      // Get applicable schedule for this month
      const applicableSchedule = getApplicableSchedule(item);
      
      // Day names mapping
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      
      Object.entries(records).forEach(([dateStr, rec]) => {
          // Use edited times for calculations if available, otherwise use original times
          const effectiveCheckin = rec.editedCheckin || rec.checkin;
          
          if (!effectiveCheckin) return;
          const d = new Date(dateStr);
          const day = d.getDay();
          const dayName = dayNames[day] as keyof DailySchedule;
          
          // Get the day's schedule, or fall back to monday's schedule if day is empty
          let daySchedule = applicableSchedule?.daily?.[dayName];
          
          // If this day's schedule is empty (no inTime) or doesn't exist, use monday as default for weekdays
          if ((!daySchedule || !daySchedule.inTime) && day >= 1 && day <= 5) { // Monday to Friday
            daySchedule = applicableSchedule?.daily?.monday;
          }
          
          let scheduledIn = '09:00';
          
          if (daySchedule && !daySchedule.isHoliday) {
            scheduledIn = daySchedule.inTime || '09:00';
          }
          
          if (effectiveCheckin > scheduledIn) count++;
      });
      return count;
  };

  const getUniqueTeams = () => {
    const teams = new Set<string>();
    summaries.forEach((item) => {
      const user = allUsers?.find((u) => u._id === item.userId || u.odId === item.userId);
      const t = user ? resolveWorkPartnerForItem(user, item.monthYear) : item.team;
      if (t) teams.add(t);
    });
    return Array.from(teams).sort();
  };

  const getUniqueDesignations = () => {
    const designations = new Set<string>();
    summaries.forEach((item) => {
      const user = allUsers?.find((u) => u._id === item.userId || u.odId === item.userId);
      const d = user ? resolveDesignationForItem(user, item.monthYear) : item.designation;
      if (d) designations.add(d);
    });
    return Array.from(designations).sort();
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const clearAllFilters = () => {
    setTeamFilter('all');
    setDesignationFilter('all');
    setLateFilter({operator: 'all', value: 0});
    setPresentFilter({operator: 'all', value: 0});
    setAbsentFilter({operator: 'all', value: 0});
    setLeaveFilter({operator: 'all', value: 0});
    setHalfDayFilter({operator: 'all', value: 0});
    setWorkHoursFilter({operator: 'all', value: 0});
    setExcessFilter({operator: 'all', value: 0});
    setSearchTerm('');
  };

  const hasActiveFilters = () => {
    return teamFilter !== 'all' ||
           designationFilter !== 'all' ||
           lateFilter.operator !== 'all' ||
           presentFilter.operator !== 'all' ||
           absentFilter.operator !== 'all' ||
           leaveFilter.operator !== 'all' ||
           halfDayFilter.operator !== 'all' ||
           workHoursFilter.operator !== 'all' ||
           excessFilter.operator !== 'all' ||
           searchTerm !== '';
  };

  const getExcessDateListForCurrentPeriod = () => {
    const dateList: string[] = [];

    if (filterType === 'week' && currentWeekStart) {
      const weekStartDate = new Date(currentWeekStart);
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStartDate);
        d.setDate(weekStartDate.getDate() + i);
        if (d.getMonth() === (selectedMonth - 1) && d.getFullYear() === selectedYear) {
          dateList.push(d.toISOString().split('T')[0]);
        }
      }
      return dateList;
    }

    if (filterType === 'range' && rangeStart && rangeEnd) {
      const start = new Date(rangeStart);
      const end = new Date(rangeEnd);
      const d = new Date(start);
      while (d <= end) {
        dateList.push(d.toISOString().split('T')[0]);
        d.setDate(d.getDate() + 1);
      }
      return dateList;
    }

    // Month view: only selected month dates.
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      dateList.push(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }

    return dateList;
  };

  const getScheduledResultForItem = (item: AttendanceSummaryView) => {
    const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
    if (!user) {
      return { total: 0, breakdown: [] as { date: string; info: string; subInfo?: string }[] };
    }

    let total = 0;
    const breakdown: { date: string; info: string; subInfo?: string }[] = [];
    const dateList = getExcessDateListForCurrentPeriod();

    dateList.forEach((dateStr) => {
      const rec = item.recordDetails?.[dateStr];
      if (!user || !isDayIncludedInScheduledCalc(user, dateStr, rec)) return;

      const dateObj = new Date(dateStr);
      const schedule = getCachedScheduledTimes(user, dateObj);

      const [inH, inM] = schedule.inTime!.split(':').map(Number);
      const [outH, outM] = schedule.outTime!.split(':').map(Number);
      let diff = (outH * 60 + outM) - (inH * 60 + inM);
      if (diff < 0) diff += 24 * 60;

      const hours = diff / 60;
      total += hours;

      breakdown.push({
        date: dateStr,
        info: formatHoursMinutes(hours),
        subInfo: `${dateObj.toLocaleDateString('en-US', { weekday: 'long' })}${schedule.isHalfDay ? ' (Half Day)' : ''}`
      });
    });

    return { total, breakdown };
  };

  const getDefinedScheduleResultForItem = (item: AttendanceSummaryView) => {
    const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
    if (!user) {
      return { total: 0, breakdown: [] as { date: string; info: string; subInfo?: string }[] };
    }

    let subtotal = 0;
    let workingDays = 0;
    const breakdown: { date: string; info: string; subInfo?: string }[] = [];
    const dateList = getExcessDateListForCurrentPeriod();

    dateList.forEach((dateStr) => {
      const rec = item.recordDetails?.[dateStr];
      if (!rec || !isExcessEligibleRecord(dateStr, rec)) return;

      const dateObj = new Date(dateStr);
      const schedule = getCachedScheduledTimes(user, dateObj);

      if (schedule.isHoliday || !schedule.inTime || !schedule.outTime || schedule.inTime === '00:00' || schedule.outTime === '00:00') return;

      const [inH, inM] = schedule.inTime.split(':').map(Number);
      const [outH, outM] = schedule.outTime.split(':').map(Number);
      let diff = (outH * 60 + outM) - (inH * 60 + inM);
      if (diff < 0) diff += 24 * 60;

      const hours = diff / 60;
      subtotal += hours;
      workingDays++;

      breakdown.push({
        date: dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
        info: formatHoursMinutes(hours),
        subInfo: `${schedule.inTime} - ${schedule.outTime}${schedule.isHalfDay ? ' (Half Day)' : ''}`
      });
    });

    if (workingDays > 0) {
      const lunchDeduction = workingDays;
      const finalTotal = Math.max(0, subtotal - lunchDeduction);
      breakdown.push({ date: 'Subtotal', info: formatHoursMinutes(subtotal), subInfo: 'Before lunch deduction' });
      breakdown.push({ date: 'Lunch Deduction', info: `-${formatHoursMinutes(lunchDeduction)}`, subInfo: `${workingDays} working days  1 hour` });
      breakdown.push({ date: 'Final Total', info: formatHoursMinutes(finalTotal), subInfo: 'Defined schedule (filtered attendance days)' });
      return { total: finalTotal, breakdown };
    }

    return { total: 0, breakdown };
  };

  const getExcessResultForItem = (item: AttendanceSummaryView) => {
    const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
    const dateList = getExcessDateListForCurrentPeriod();
    const workedHours = user
      ? getWorkedHoursMatchingScheduledDays(item, user, dateList)
      : Number(item.summary?.totalHour || 0);
    const scheduledHours = Number(calculateScheduledHoursNoLunch(item) || 0);
    const total = Number((workedHours - scheduledHours).toFixed(2));

    const breakdown: { date: string; info: string; subInfo?: string }[] = [
      { date: 'Worked Hours', info: formatHoursMinutes(workedHours) },
      { date: 'Scheduled Hours', info: formatHoursMinutes(scheduledHours) },
      { date: 'Excess (Worked - Scheduled)', info: `${total >= 0 ? '+' : '-'}${formatHoursMinutes(Math.abs(total))}` },
    ];

    return { total, breakdown };
  };

  const filteredSummaries = useMemo(() => {
    let list = summaries.filter(item => item != null); // Remove null/undefined items
    const holidayDatesSet = new Set(holidays.map(h => h.date));

    // Text search filter
    if (searchTerm) {
      list = list.filter(item => 
        item.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.employeeCode && item.employeeCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.odId && item.odId.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    // Advanced filters
    if (teamFilter !== 'all') {
      list = list.filter(item => item.team === teamFilter);
    }
    
    if (designationFilter !== 'all') {
      list = list.filter(item => item.designation === designationFilter);
    }
    
    // Numeric filters with operators
    const applyNumericFilter = (value: number, filter: {operator: string, value: number}) => {
      if (filter.operator === 'all') return true;
      switch (filter.operator) {
        case 'equals': return value === filter.value;
        case 'greater': return value > filter.value;
        case 'less': return value < filter.value;
        case 'greaterEqual': return value >= filter.value;
        case 'lessEqual': return value <= filter.value;
        default: return true;
      }
    };
    
    list = list.filter(item => {
      const lateCount = getLateDetails(item).length;
      const presentCount = item.summary.totalPresent;
      const absentCount = item.summary.totalAbsent;
      const leaveCount = item.summary.totalLeave;
      const halfDayCount = item.summary.totalHalfDay;
      const workHours = item.summary.totalHour;
      const excessHours = item.calcExcessDeficit || 0;
      
      return applyNumericFilter(lateCount, lateFilter) &&
             applyNumericFilter(presentCount, presentFilter) &&
             applyNumericFilter(absentCount, absentFilter) &&
             applyNumericFilter(leaveCount, leaveFilter) &&
             applyNumericFilter(halfDayCount, halfDayFilter) &&
             applyNumericFilter(workHours, workHoursFilter) &&
             applyNumericFilter(excessHours, excessFilter);
    });
    
    // Enrich with calculations
    const startTime = performance.now();
    const enriched = list.map(item => {
        const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
        const periodDateList = getExcessDateListForCurrentPeriod();
        const workedTotal = user
          ? getWorkedHoursMatchingScheduledDays(item, user, periodDateList)
          : item.summary.totalHour;

        // Use calculateScheduledHoursNoLunch for scheduled (no lunch deduction)
        const sched = calculateScheduledHoursNoLunch(item);
        const actual = workedTotal;
        const recordDetailsWithSchedule = { ...item.recordDetails };
        if (user && recordDetailsWithSchedule) {
          Object.entries(recordDetailsWithSchedule).forEach(([date, record]: [string, any]) => {
            let scheduledInTime = record.scheduledInTime;
            let scheduledOutTime = record.scheduledOutTime;
            if (!scheduledInTime || !scheduledOutTime) {
              const schedule = getCachedScheduledTimes(user, date);
              scheduledInTime = schedule.inTime;
              scheduledOutTime = schedule.outTime;
            }
            recordDetailsWithSchedule[date] = {
              ...record,
              scheduledInTime,
              scheduledOutTime,
            };
          });
        }
        // Excess / Sched. use same scheduled-day set for worked and sched.
        const rawExcessDeficit = Number((workedTotal - sched).toFixed(2));
        const calcExcessDeficit = resolveDisplayExcess(
          rawExcessDeficit,
          item.userId,
          item.monthYear,
          excessAllowanceMap,
          excessDisplayMap
        );
        const cap = lookupExcessAllowance(excessAllowanceMap, item.userId, item.monthYear);
        const appliedExcess = applyExcessHourAllowance(rawExcessDeficit, cap);
        // Calculate Late on frontend based on toggle
        const lateDetails = getLateDetails(item);
        const calcLate = lateDetails.length;
        // Calculate halfDay count from details for consistency
        const halfDayDetails = getHalfDayDetails(item);
        const calcHalfDay = halfDayDetails.length;
        // Pre-compute defined schedule hours (avoids expensive re-calculation during render)
        const calcDefinedSchedule = calculateDefinedScheduleHours(item);
        const workPartnerAtPeriod = user ? resolveWorkPartnerForItem(user, item.monthYear) : item.team || '';
        const designationAtPeriod = user ? resolveDesignationForItem(user, item.monthYear) : item.designation || '';

        // Calculate absent days per rule: not Sunday, not DB-holiday, not weekoff type,
        // and both in and out are missing or '00:00'. This ensures absent is counted even if
        // present values exceed expected working days.
        let calcAbsent = 0;
        Object.entries(item.recordDetails || {}).forEach(([dateStr, recAny]) => {
          const rec: any = recAny || {};
          const d = new Date(dateStr);
          // Skip Sundays
          if (d.getDay() === 0) return;
          // Skip DB holidays
          if (holidayDatesSet.has(dateStr)) return;
          // Skip weekoff types
          if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) return;
          // Explicitly marked absent is always absent
          if (rec.typeOfPresence === 'Absent') {
            calcAbsent += 1;
            return;
          }
          // Leave days are also absent (informational policy)
          if (rec.typeOfPresence === 'Leave' || rec.typeOfPresence === 'On leave') {
            calcAbsent += 1;
            return;
          }

          // Presence types that shouldn't be absent even with 0 hours
          const typeLower = String(rec.typeOfPresence || '').toLowerCase();
          const isPresenceType = typeLower.includes('wfh') || 
                                 typeLower.includes('outstation') || 
                                 typeLower.includes('clientplace') || 
                                 typeLower.includes('half day') ||
                                 rec.halfDay;

          if (isPresenceType) return;

          const effectiveCheckin = rec.editedCheckin || rec.checkin;
          const effectiveCheckout = rec.editedCheckout || rec.checkout;
          if ((!effectiveCheckin || effectiveCheckin === '00:00') && (!effectiveCheckout || effectiveCheckout === '00:00')) {
            calcAbsent += 1;
          }
        });

        // Calculate present days: valid checkin OR halfDay (with punches) OR WFH/OS/CP with value
        let calcPresent = 0;
        Object.values(item.recordDetails || {}).forEach((rec: any) => {
          const effectiveCheckin = rec.editedCheckin || rec.checkin;
          const effectiveCheckout = rec.editedCheckout || rec.checkout;
          const isBothZero = !(effectiveCheckin && effectiveCheckin !== '00:00') && !(effectiveCheckout && effectiveCheckout !== '00:00');
          const type = String(rec.typeOfPresence || '').toLowerCase();
          
          if ((effectiveCheckin && effectiveCheckin !== '00:00') || (rec.halfDay && !isBothZero) || 
              ((type.includes('wfh') || type.includes('outstation') || type.includes('clientplace')) && (rec.value > 0 || !isBothZero))) {
            calcPresent += 1;
          }
        });

        return {
          ...item,
          team: workPartnerAtPeriod || item.team || '',
          designation: designationAtPeriod || item.designation || '',
          summary: {
            ...item.summary,
            totalHour: workedTotal,
            totalHalfDay: calcHalfDay,
            totalLate: calcLate,
            totalAbsent: calcAbsent,
            totalPresent: calcPresent
          },
          calcScheduled: sched,
          calcDefinedSchedule,
          calcExcessDeficit,
          rawExcessDeficit: appliedExcess.rawExcess,
          allowedExcessCap: appliedExcess.allowedExcessCap,
          calcLate: calcLate // Override summary late
        };
      });

    // Apply sorting
    enriched.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortField) {
        case 'userName':
          aValue = a.userName.toLowerCase();
          bValue = b.userName.toLowerCase();
          break;
        case 'team':
          aValue = a.team || '';
          bValue = b.team || '';
          break;
        case 'designation':
          aValue = a.designation || '';
          bValue = b.designation || '';
          break;
        case 'employeeCode':
          aValue = a.employeeCode || a.odId || '';
          bValue = b.employeeCode || b.odId || '';
          break;
        case 'totalWorkingDays':
          aValue = a.summary.totalPresent + a.summary.totalAbsent;
          bValue = b.summary.totalPresent + b.summary.totalAbsent;
          break;
        case 'calcScheduled':
          aValue = a.calcScheduled || 0;
          bValue = b.calcScheduled || 0;
          break;
        case 'totalHour':
          aValue = a.summary.totalHour;
          bValue = b.summary.totalHour;
          break;
        case 'calcExcessDeficit':
          aValue = a.calcExcessDeficit || 0;
          bValue = b.calcExcessDeficit || 0;
          break;
        case 'calcLate':
          aValue = a.calcLate || 0;
          bValue = b.calcLate || 0;
          break;
        case 'totalHalfDay':
          aValue = a.summary.totalHalfDay;
          bValue = b.summary.totalHalfDay;
          break;
        case 'totalPresent':
          aValue = a.summary.totalPresent;
          bValue = b.summary.totalPresent;
          break;
        case 'totalAbsent':
          aValue = a.summary.totalAbsent;
          bValue = b.summary.totalAbsent;
          break;
        case 'totalLeave':
          aValue = (() => {
            let fullLeaveDays = 0;
            Object.values(a.recordDetails || {}).forEach((record: any) => {
              if ((record.typeOfPresence === 'On leave' || record.typeOfPresence === 'Leave') && record.value === 1) {
                fullLeaveDays++;
              }
            });
            return fullLeaveDays;
          })();
          bValue = (() => {
            let fullLeaveDays = 0;
            Object.values(b.recordDetails || {}).forEach((record: any) => {
              if ((record.typeOfPresence === 'On leave' || record.typeOfPresence === 'Leave') && record.value === 1) {
                fullLeaveDays++;
              }
            });
            return fullLeaveDays;
          })();
          break;
        case 'definedSchedule':
          aValue = a.calcDefinedSchedule || 0;
          bValue = b.calcDefinedSchedule || 0;
          break;
        default:
          aValue = a.calcExcessDeficit || 0;
          bValue = b.calcExcessDeficit || 0;
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      } else {
        const comparison = aValue - bValue;
        return sortDirection === 'asc' ? comparison : -comparison;
      }
    });

    // Add Rank based on sorted order
    return enriched.map((item, index) => ({
      ...item,
      rank: index + 1
    }));
  }, [summaries, searchTerm, selectedYear, selectedMonth, teamFilter, designationFilter, lateFilter, presentFilter, absentFilter, leaveFilter, halfDayFilter, workHoursFilter, excessFilter, sortField, sortDirection, holidays, allUsers, filterType, currentWeekStart, rangeStart, rangeEnd, resolveWorkPartnerForItem, resolveDesignationForItem, excessAllowanceMap, excessDisplayMap]);

  /** Render the table in chunks; stats and exports still use full `filteredSummaries`. */
  const [tableVisibleCount, setTableVisibleCount] = useState(SUMMARY_TABLE_CHUNK);
  const tableLoadMoreSentinelRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    setTableVisibleCount(SUMMARY_TABLE_CHUNK);
  }, [summaries]);

  const displayedSummaries = useMemo(
    () =>
      filteredSummaries.slice(
        0,
        Math.min(tableVisibleCount, filteredSummaries.length)
      ),
    [filteredSummaries, tableVisibleCount]
  );

  useEffect(() => {
    const el = tableLoadMoreSentinelRef.current;
    if (!el || tableVisibleCount >= filteredSummaries.length || isLoading) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setTableVisibleCount((c) =>
            Math.min(c + SUMMARY_TABLE_CHUNK, filteredSummaries.length)
          );
        }
      },
      { root: null, rootMargin: '320px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [
    filteredSummaries.length,
    tableVisibleCount,
    isLoading,
    displayedSummaries.length,
  ]);

  useEffect(() => {
    if (!summaryTableFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSummaryTableFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [summaryTableFullscreen]);

  // Calculate Aggregates for the Dashboard
  const stats = useMemo(() => {
    return filteredSummaries.reduce((acc, curr) => ({
      totalEmployees: acc.totalEmployees + 1,
      totalHours: acc.totalHours + curr.summary.totalHour,
      totalLate: acc.totalLate + curr.calcLate, // Use calcLate
      totalAbsents: acc.totalAbsents + curr.summary.totalAbsent,
      totalLeaves: acc.totalLeaves + (() => {
        let fullLeaveDays = 0;
        Object.values(curr.recordDetails || {}).forEach((record: any) => {
          if ((record.typeOfPresence === 'On leave' || record.typeOfPresence === 'Leave') && record.value === 1) {
            fullLeaveDays++;
          }
        });
        return fullLeaveDays;
      })()
    }), {
      totalEmployees: 0,
      totalHours: 0,
      totalLate: 0,
      totalAbsents: 0,
      totalLeaves: 0
    });
  }, [filteredSummaries]);
  const exportContext = useMemo(
    (): SummaryExportContext => ({
      filteredSummaries: filteredSummaries as EnrichedSummary[],
      allUsers,
      holidays,
      filterType,
      selectedYear,
      selectedMonth,
      currentWeekStart,
      rangeStart,
      rangeEnd,
      selectedEmployeeIds: selectedEmployees,
      summaryPeriodBase,
      resolveWorkPartner: resolveWorkPartnerForItem,
      resolveDesignation: resolveDesignationForItem,
      countTotalSundaysInPeriod,
      excessDayAllowanceMap,
    }),
    [
      filteredSummaries, allUsers, holidays, filterType, selectedYear, selectedMonth,
      currentWeekStart, rangeStart, rangeEnd, selectedEmployees, summaryPeriodBase,
      resolveWorkPartnerForItem, resolveDesignationForItem, countTotalSundaysInPeriod,
      excessDayAllowanceMap,
    ]
  );

  const handleDetailedExport = useCallback(() => exportDetailedAttendance(exportContext), [exportContext]);
  const handleExport = useCallback(() => exportSummaryAttendance(exportContext), [exportContext]);
  const handleDayWiseExport = useCallback(() => exportDaywiseAttendance(exportContext), [exportContext]);


  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEmployees(new Set(filteredSummaries.map(item => item.userId)));
    } else {
      setSelectedEmployees(new Set());
    }
  };

  const handleSelectEmployee = (userId: string, checked: boolean) => {
    const newSelected = new Set(selectedEmployees);
    if (checked) {
      newSelected.add(userId);
    } else {
      newSelected.delete(userId);
    }
    setSelectedEmployees(newSelected);
  };

  const applyRange = (start: string, end: string) => {
    setFilterType('range');
    setRangeStart(start);
    setRangeEnd(end);
    onFilterChange({startDate: start, endDate: end});
    setRangeModalOpen(false);
  };

  const setLast6Months = () => {
    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1;
    const startDate = new Date(endYear, endMonth - 7, 1);
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    const start = `${startYear}-${String(startMonth).padStart(2, '0')}`;
    const end = `${endYear}-${String(endMonth).padStart(2, '0')}`;
    applyRange(start, end);
  };

  const setLast3Months = () => {
    const now = new Date();
    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
    applyRange(start, end);
  };

  const setLast12Months = () => {
    const now = new Date();
    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
    const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
    applyRange(start, end);
  };

  const setCurrentMonth = () => {
    const now = new Date();
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    onFilterChange(monthYear);
    setRangeModalOpen(false);
    setFilterType('month');
  };

  const setLastMonth = () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthYear = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    onFilterChange(monthYear);
    setRangeModalOpen(false);
    setFilterType('month');
  };

  const switchToMonth = () => {
    setFilterType('month');
    onFilterChange(currentMonthYear);
  };

  const currentPeriodLabel = filterType === 'month' ? new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' }) : 
    filterType === 'week' ? (() => {
      // Clamp weekStart and weekEnd to selected month boundaries
      const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
      const lastDay = new Date(selectedYear, selectedMonth, 0);
      let weekStart = new Date(currentWeekStart);
      if (weekStart < firstDay) weekStart = new Date(firstDay);
      let weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > lastDay) weekEnd = new Date(lastDay);
      return `Week of ${weekStart.toLocaleDateString('en-GB')} - ${weekEnd.toLocaleDateString('en-GB')}`;
    })() : 
    `From ${rangeStart.length > 7 ? new Date(rangeStart).toLocaleDateString('en-GB') : new Date(rangeStart + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })} to ${rangeEnd.length > 7 ? new Date(rangeEnd).toLocaleDateString('en-GB') : new Date(rangeEnd + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}`;

  return {

    currentDate,
    filterType, setFilterType, switchToMonth, setRangeModalOpen,
    handlePrevWeek, handlePrevMonth, handleNextWeek, handleNextMonth,
    selectedYear, setSelectedYear, selectedMonth, setSelectedMonth,
    searchTerm, setSearchTerm,
    handleExport, handleDetailedExport, handleDayWiseExport, hideDetailedExport,
    selectedEmployees, setIsBulkManagerOpen, setShowAdvancedFilters, hasActiveFilters,
    stats, isLoading, filteredSummaries, displayedSummaries,
    summaryTableFullscreen, setSummaryTableFullscreen,
    uploadTotal, uploadSaved, uploadFailed,
    tableLoadMoreSentinelRef, SUMMARY_TABLE_CHUNK, setTableVisibleCount,
    handleSelectAll, handleSort, sortField, sortDirection,
    openDetail, holidays, calculateLeaveConsumed, formatHoursMinutes,
    getExcessResultForItem, detailModal, setDetailModal,
    isBulkManagerOpen, usersForBulk, currentMonthYear, onFilterChange, onRefreshUsers,
    rangeModalOpen, applyRange, setLast3Months, setLast6Months, setLast12Months,
    setLastMonth, setCurrentMonth,
    showAdvancedFilters, getUniqueTeams, getUniqueDesignations,
    teamFilter, setTeamFilter, designationFilter, setDesignationFilter,
    lateFilter, setLateFilter, presentFilter, setPresentFilter,
    absentFilter, setAbsentFilter, leaveFilter, setLeaveFilter,
    halfDayFilter, setHalfDayFilter, workHoursFilter, setWorkHoursFilter,
    excessFilter, setExcessFilter, clearAllFilters,
    currentPeriodLabel, onEmployeeClick, onEmployeeDetailClick,
    handleSelectEmployee,

  };
}
