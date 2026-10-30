import React from 'react';
import { AttendanceRecord, User } from '@/types/ui';
import { computeSummaryAlignedMetrics, type SummaryMetricsOptions } from '@/lib/attendanceSummaryMetrics';
import { isValidPunchTime } from '@/lib/attendanceHours';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { getWorkHoursReferenceSchedule, resolveWfhOspSpentSchedule } from '@/lib/deriveRequestInOutFromWorkHours';
import { useExcessAllowanceMaps } from '@/hooks/useExcessAllowanceMaps';
import { buildAttendanceRequestDayMap } from '@/lib/attendanceRequestDayDisplay';
import { getDefaultNumericValueForType } from '@/lib/attendanceRequestValues';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { type PresenceCreditRuleLike } from '@/lib/presenceCredit';
import type { DayActivityModalData, EmployeeMonthViewProps } from '../types';

export function useEmployeeMonthViewLogic({
  summaries,
  users,
  selectedEmployeeId,
  selectedMonthYear,
  onMonthYearChange,
  employeeDays,
  selectionStart: externalSelectionStart,
  onSelectionStartChange,
  approvedRequests = [],
  holidays = [],
  summaryMetricsOptions,
  alignedMetrics: alignedMetricsProp,
  subtitle: subtitleProp,
}: Pick<EmployeeMonthViewProps, 'summaries' | 'users' | 'selectedEmployeeId' | 'selectedMonthYear' | 'onMonthYearChange' | 'employeeDays' | 'selectionStart' | 'onSelectionStartChange' | 'approvedRequests' | 'holidays' | 'summaryMetricsOptions' | 'alignedMetrics' | 'subtitle'>) {
  // Selection state for range picking - use external state if provided
  const [internalSelectionStart, setInternalSelectionStart] = React.useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = React.useState<string | null>(null);
  const [employeeSearch, setEmployeeSearch] = React.useState<string>('');
  
  const selectionStart = externalSelectionStart !== undefined ? externalSelectionStart : internalSelectionStart;
  const setSelectionStart = onSelectionStartChange || setInternalSelectionStart;
  // Admin edit modal state
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [editDate, setEditDate] = React.useState<string | null>(null);
  const [formStatus, setFormStatus] = React.useState<string>('Present');
  const [formStartTime, setFormStartTime] = React.useState<string>('');
  const [formEndTime, setFormEndTime] = React.useState<string>('');
  const [formValue, setFormValue] = React.useState<number | undefined>(undefined);
  const [formRemarks, setFormRemarks] = React.useState<string>('');
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [dayActivityModal, setDayActivityModal] = React.useState<DayActivityModalData | null>(null);
  const [presenceRules, setPresenceRules] = React.useState<PresenceCreditRuleLike[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/hr-console-settings/presence-credit', hrCredentialsInit())
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json?.success && Array.isArray(json.data?.rules)) {
          setPresenceRules(json.data.rules);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!dayActivityModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDayActivityModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dayActivityModal]);

  // Try to find user details from the 'users' list first, otherwise fallback to summaries
  const userFromList = users.find(u => u._id === selectedEmployeeId);
  const summaryFromList = summaries.find((s) => s.userId === selectedEmployeeId);
  
  const displayUserName = userFromList?.name || summaryFromList?.userName || 'Unknown Employee';

  // Derive year and month from selectedMonthYear string
  // Default to current date if empty
  const [selectedYear, selectedMonth] = React.useMemo(() => {
    if (selectedMonthYear) {
      const [y, m] = selectedMonthYear.split('-');
      return [parseInt(y), parseInt(m)];
    }
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1];
  }, [selectedMonthYear]);

  // Generate Year Options (current year - 2 to current year + 2)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Month Options
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = parseInt(e.target.value);
    onMonthYearChange(`${newYear}-${String(selectedMonth).padStart(2, '0')}`);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = parseInt(e.target.value);
    onMonthYearChange(`${selectedYear}-${String(newMonth).padStart(2, '0')}`);
  };

  const handlePrevMonth = () => {
    let newYear = selectedYear;
    let newMonth = selectedMonth - 1;
    
    if (newMonth < 1) {
      newMonth = 12;
      newYear = selectedYear - 1;
    }
    
    onMonthYearChange(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    let newYear = selectedYear;
    let newMonth = selectedMonth + 1;
    
    if (newMonth > 12) {
      newMonth = 1;
      newYear = selectedYear + 1;
    }
    
    onMonthYearChange(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  const handlePrevYear = () => {
    onMonthYearChange(`${selectedYear - 1}-${String(selectedMonth).padStart(2, '0')}`);
  };

  /** User with schedules/employment history — required for correct late vs summary. */
  const scheduleUser: User | null = userFromList ?? null;

  const fetchedExcessMaps = useExcessAllowanceMaps({
    userIds: selectedEmployeeId ? [selectedEmployeeId] : [],
    monthYear: selectedMonthYear,
    enabled: Boolean(selectedEmployeeId && selectedMonthYear),
  });

  const mergedSummaryMetricsOptions = React.useMemo((): SummaryMetricsOptions | undefined => {
    const hasFetched =
      Object.keys(fetchedExcessMaps.excessAllowanceMap).length > 0 ||
      Object.keys(fetchedExcessMaps.excessDisplayMap).length > 0 ||
      Object.keys(fetchedExcessMaps.excessDayAllowanceMap).length > 0;
    const hasPassed =
      summaryMetricsOptions &&
      (summaryMetricsOptions.excessAllowanceMap ||
        summaryMetricsOptions.excessDisplayMap ||
        summaryMetricsOptions.excessDayAllowanceMap ||
        summaryMetricsOptions.treatSinglePunchAsAbsent != null ||
        summaryMetricsOptions.allowedExcessCap != null);

    if (!hasFetched && !hasPassed) return summaryMetricsOptions;

    return {
      ...summaryMetricsOptions,
      excessAllowanceMap: {
        ...fetchedExcessMaps.excessAllowanceMap,
        ...summaryMetricsOptions?.excessAllowanceMap,
      },
      excessDisplayMap: {
        ...fetchedExcessMaps.excessDisplayMap,
        ...summaryMetricsOptions?.excessDisplayMap,
      },
      excessDayAllowanceMap: {
        ...fetchedExcessMaps.excessDayAllowanceMap,
        ...summaryMetricsOptions?.excessDayAllowanceMap,
      },
    };
  }, [fetchedExcessMaps, summaryMetricsOptions]);

  const alignedMetrics = React.useMemo(() => {
    if (alignedMetricsProp !== undefined) return alignedMetricsProp;
    if (!summaryFromList || !scheduleUser || !selectedMonthYear) return null;
    return computeSummaryAlignedMetrics(
      summaryFromList,
      scheduleUser,
      holidays,
      selectedMonthYear,
      mergedSummaryMetricsOptions
    );
  }, [
    alignedMetricsProp,
    summaryFromList,
    scheduleUser,
    holidays,
    selectedMonthYear,
    mergedSummaryMetricsOptions,
  ]);

  // Helper: get scheduled times (inTime/outTime) for a specific date string YYYY-MM-DD
  const getScheduledTimesForDate = (dateStr: string) => {
    if (!scheduleUser) return { inTime: '', outTime: '' };
    
    const schedule = getScheduledTimes(scheduleUser, dateStr);
    return { inTime: schedule.inTime, outTime: schedule.outTime };
  };

  // Statuses that auto-fill in/out from schedule; HR can still edit the times.
  const STATUS_USE_SCHEDULE = new Set<string>([
    'WFH - weekdays', 'WFH - weekoff', 'Half Day - weekdays', 'Half Day - weekoff',
    'Present - client place',
  ]);

  const applyStatusAutoFill = (status: string, dateStr?: string) => {
    // Absent: set times to 00:00 and value 0
    if (status === 'Absent') {
      setFormStartTime('00:00');
      setFormEndTime('00:00');
      setFormValue(0);
      return;
    }

    // Half day statuses -> value 0.5 and use schedule if available
    if (status.startsWith('Half Day')) {
      setFormValue(0.5);
      if (dateStr) {
        const sch = getScheduledTimesForDate(dateStr);
        if (sch.inTime) setFormStartTime(sch.inTime);
        if (sch.outTime) setFormEndTime(sch.outTime);
      }
      return;
    }

    // WFH and OSP: in-time stays the usual start; out-time is that start plus the credited hours.
    if (
      status.toLowerCase().includes('wfh') ||
      status.toLowerCase().includes('outstation') ||
      status.toLowerCase().includes('onsite') ||
      status.toLowerCase().includes('os-p')
    ) {
      const credit =
        getDefaultNumericValueForType(status, {
          employee: scheduleUser ?? undefined,
          date: dateStr,
          rules: presenceRules,
        }) ?? (status.toLowerCase().includes('wfh') ? 0.75 : 1);
      setFormValue(credit);
      if (dateStr) {
        const spent = resolveWfhOspSpentSchedule({
          user: scheduleUser,
          dateStr,
          typeOfPresence: status,
          value: credit,
        });
        if (spent) {
          setFormStartTime(spent.scheduledIn);
          setFormEndTime(spent.scheduledOut);
        }
      }
      return;
    }

    // Use schedule for defined statuses (locked fields)
    if (STATUS_USE_SCHEDULE.has(status)) {
      setFormValue(1);
      if (dateStr) {
        // Keep GPS punch times for location-verified days — do not snap to schedule
        const stored = employeeDays.find((r) => String(r.date || '').slice(0, 10) === dateStr);
        const gpsIn = String(stored?.checkin || '').trim();
        const gpsOut = String(stored?.checkout || '').trim();
        const isGpsLocationDay =
          status === 'Present - client place' &&
          !!stored &&
          /location verified/i.test(String(stored.remarks || '')) &&
          isValidPunchTime(gpsIn) &&
          isValidPunchTime(gpsOut);
        if (isGpsLocationDay) {
          setFormStartTime(gpsIn);
          setFormEndTime(gpsOut);
          return;
        }
        const sch =
          /weekoff|wfh/i.test(status)
            ? getWorkHoursReferenceSchedule(scheduleUser, dateStr)
            : getScheduledTimesForDate(dateStr);
        if (sch.inTime) setFormStartTime(sch.inTime);
        if (sch.outTime) setFormEndTime(sch.outTime);
      }
      return;
    }

    // Default: do not override times/value
  };

  const handleNextYear = () => {
    onMonthYearChange(`${selectedYear + 1}-${String(selectedMonth).padStart(2, '0')}`);
  };

  const calendarData = (() => {
    if (!selectedMonthYear) return null;

    const [yearStr, monthStr] = selectedMonthYear.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);

    if (!year || !month) return null;

    const firstDay = new Date(year, month - 1, 1);
    const startWeekday = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
    const daysInMonth = new Date(year, month, 0).getDate();

    const dayRecordMap = new Map<number, AttendanceRecord>();
    for (const rec of employeeDays) {
      const d = new Date(rec.date);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() + 1 === month) {
        dayRecordMap.set(d.getDate(), rec);
      }
    }

    // One request per day — prefer Approved/Pending over superseded Rejected entries
    const approvedRequestMap = buildAttendanceRequestDayMap(approvedRequests, year, month);

    return { daysInMonth, startWeekday, dayRecordMap, approvedRequestMap };
  })();

  const defaultSubtitle = 'View detailed daily attendance for any employee and month.';
  const resolvedSubtitle =
    subtitleProp === undefined ? defaultSubtitle : subtitleProp;

  const fieldCls =
    'w-full rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const navBtnCls =
    'rounded-lg border border-blue-200/65 bg-panel p-1.5 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:p-2';

  return {
    hoveredDate,
    setHoveredDate,
    employeeSearch,
    setEmployeeSearch,
    selectionStart,
    editModalOpen,
    setEditModalOpen,
    editDate,
    setEditDate,
    formStatus,
    setFormStatus,
    formStartTime,
    setFormStartTime,
    formEndTime,
    setFormEndTime,
    formValue,
    setFormValue,
    formRemarks,
    setFormRemarks,
    savingEdit,
    setSavingEdit,
    editError,
    setEditError,
    dayActivityModal,
    setDayActivityModal,
    presenceRules,
    displayUserName,
    selectedYear,
    selectedMonth,
    months,
    handleMonthChange,
    handlePrevMonth,
    handleNextMonth,
    handlePrevYear,
    scheduleUser,
    alignedMetrics,
    applyStatusAutoFill,
    handleNextYear,
    calendarData,
    resolvedSubtitle,
    fieldCls,
    navBtnCls,
  } as const;
}
