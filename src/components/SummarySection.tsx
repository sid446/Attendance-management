import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AttendanceSummaryView, User, DailySchedule, ScheduleTime } from '@/types/ui';
import { Search, Calendar, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, BarChart3, Users, Clock, AlertCircle, UserX, Download, ListChecks, X, Eye, Filter, Maximize2, Minimize2 } from 'lucide-react';
import { BulkLeaveManager } from './BulkLeaveManager';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ScheduleEntry } from '@/types/ui';
import { getScheduledTimes } from '@/lib/scheduleUtils';


type EmploymentTypeHistory = { employmentType: string; effectiveFrom: string | Date };


const getEmploymentTypeForDate = (user: User | undefined, date: Date): string | undefined => {
  if (!user) return undefined;
  // @ts-ignore: employmentTypeHistory may exist from backend, not in UI type
  const history: EmploymentTypeHistory[] | undefined = (user as any).employmentTypeHistory;
  if (history && Array.isArray(history) && history.length > 0) {
    // Find the most recent employmentType effective on or before the date
    const sorted = history.slice().sort((a: EmploymentTypeHistory, b: EmploymentTypeHistory) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
    const found = sorted.find((e: EmploymentTypeHistory) => new Date(e.effectiveFrom) <= date);
    return found?.employmentType;
  }
  return user.employmentType;
};

/** Sort key for `YYYY-MM-DD` — integer compare avoids any timezone parsing. */
function isoCalendarKeyToSortNumber(iso: string): number | null {
  const t = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

/** Display-only: calendar cell as dd.mm.yyyy from DB key (never pass JS Date into Excel for this). */
function formatIsoKeyAsDdMmYyyy(isoKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoKey || '').trim());
  if (!m) return String(isoKey || '');
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Chronological sort for attendance date keys (`yyyy-mm-dd` or parseable ISO). Object key order is not reliable. */
function sortRecordDetailsEntries<T>(recordDetails: Record<string, T> | undefined | null): [string, T][] {
  return Object.entries(recordDetails || {}).sort(([a], [b]) => {
    const na = isoCalendarKeyToSortNumber(a);
    const nb = isoCalendarKeyToSortNumber(b);
    if (na != null && nb != null) return na - nb;
    const msA = Date.parse(a.trim());
    const msB = Date.parse(b.trim());
    if (!Number.isNaN(msA) && !Number.isNaN(msB)) return msA - msB;
    return a.localeCompare(b);
  });
}

const SUMMARY_WORKFLOW_STEPS = ['Pick period', 'Search or filter', 'Export or drill in'] as const;

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: { date: string; info: string; subInfo?: string }[];
}

const DetailModal: React.FC<DetailModalProps> = ({ isOpen, onClose, title, data }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-blue-200/65 bg-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-detail-modal-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-blue-200/50 bg-sky-100/50 px-4 py-3">
          <h3 id="summary-detail-modal-title" className="text-sm font-semibold text-slate-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[min(60vh,480px)] flex-1 overflow-y-auto p-3">
          {data.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No records found</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {data.map((d, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-md border border-transparent px-3 py-2.5 text-sm transition-colors hover:border-blue-200/60 hover:bg-sky-100/55 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="whitespace-nowrap rounded border border-blue-200/65 bg-panel px-2 py-0.5 font-mono text-xs text-slate-800">
                      {/^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date.split('-').reverse().join('/') : new Date(d.date).toLocaleDateString('en-GB')}
                    </div>
                    {d.subInfo && (
                      <span className="whitespace-nowrap rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">
                        {d.subInfo}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 text-left font-mono text-xs leading-relaxed text-slate-600 wrap-break-word">
                    {d.info}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-end border-t border-blue-200/50 bg-sky-100/50 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

interface SummarySectionProps {
  summaries: AttendanceSummaryView[];
  allUsers?: User[]; // Optional prop for fuller search context
  holidays?: {date: string; name: string}[]; // Holiday dates from database
  isLoading?: boolean;
  onFilterChange: (filter: string | {start: string, end: string} | {startDate: string, endDate: string}) => void;
  // onEmployeeClick now opens EmployeeMonthView as modal, not via sidebar section
  onEmployeeClick: (userId: string, monthYear: string) => void;
  onEmployeeDetailClick?: (userId: string) => void; // Opens employee management detail
  onRefreshUsers?: () => void; // Optional function to refresh user data
  // Upload stats kept for context if needed, but made optional/less prominent
  uploadTotal?: number;
  uploadSaved?: number;
  uploadFailed?: number;
  initialMonthYear?: string;
  hideDetailedExport?: boolean;
}

export const SummarySection: React.FC<SummarySectionProps> = ({
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
  hideDetailedExport = false
}) => {
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
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      Object.entries(records).forEach(([date, rec]) => {
          // Use edited times for display if available, otherwise use original times
          const effectiveCheckin = rec.editedCheckin || rec.checkin;
          
          if (rec.totalHour > 0 && rec.typeOfPresence !== 'Holiday') {
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

  // --- Calculation Helper ---
  const formatHoursMinutes = (hours: number): string => {
    const absHours = Math.abs(hours);
    if (absHours === 0) return '0:00';
    const totalMinutes = Math.round(absHours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const sign = hours < 0 ? '-' : '';
    // Always show as H:MM (e.g., 0:00, 1:05)
    return `${sign}${h}:${m.toString().padStart(2, '0')}`;
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
    const teams = new Set(summaries.map(item => item.team).filter(Boolean));
    return Array.from(teams).sort();
  };

  const getUniqueDesignations = () => {
    const designations = new Set(summaries.map(item => item.designation).filter(Boolean));
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

  const hasValidInOutForExcess = (rec: any) => {
    const inTime = rec?.editedCheckin || rec?.checkin;
    const outTime = rec?.editedCheckout || rec?.checkout;
    return !!(inTime && inTime !== '00:00' && outTime && outTime !== '00:00');
  };

  const isExcessEligibleRecord = (dateStr: string, recAny: any) => {
    const rec: any = recAny || {};
    const type = String(rec.typeOfPresence || '');
    const d = new Date(dateStr);

    if (Number.isNaN(d.getTime())) return false;
    if (d.getDay() === 0) return false; // Sunday

    // Only and only these presence types are eligible
    if (type === 'ThumbMachine') {
      return hasValidInOutForExcess(rec) || Number(rec.totalHour || 0) > 0;
    }

    if (type === 'Present - in office - weekdays') {
      return true;
    }

    if (type === 'Half Day - weekdays' || type === 'Half Day (HD)') {
      return true;
    }

    return false;
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
      if (!rec || !isExcessEligibleRecord(dateStr, rec)) return;

      const dateObj = new Date(dateStr);
      const schedule = getCachedScheduledTimes(user, dateObj);

      if (schedule.isHoliday || !schedule.inTime || !schedule.outTime || schedule.inTime === '00:00' || schedule.outTime === '00:00') return;

      const [inH, inM] = schedule.inTime.split(':').map(Number);
      const [outH, outM] = schedule.outTime.split(':').map(Number);
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
      breakdown.push({ date: 'Lunch Deduction', info: `-${formatHoursMinutes(lunchDeduction)}`, subInfo: `${workingDays} working days × 1 hour` });
      breakdown.push({ date: 'Final Total', info: formatHoursMinutes(finalTotal), subInfo: 'Defined schedule (filtered attendance days)' });
      return { total: finalTotal, breakdown };
    }

    return { total: 0, breakdown };
  };

  const getExcessResultForItem = (item: AttendanceSummaryView) => {
    const workedHours = Number(item.summary?.totalHour || 0);
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
        // Use calculateScheduledHoursNoLunch for scheduled (no lunch deduction)
        const sched = calculateScheduledHoursNoLunch(item);
        const actual = item.summary.totalHour;
        // Attach scheduledInTime and scheduledOutTime to each record for correct excess/short calculation
        const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
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
        // Calculate excess using only eligible records:
        // ThumbMachine, Present - in office - weekdays, Half Day (weekday).
        const calcExcessDeficit = getExcessResultForItem(item).total;
        // Calculate Late on frontend based on toggle
        const lateDetails = getLateDetails(item);
        const calcLate = lateDetails.length;
        // Calculate halfDay count from details for consistency
        const halfDayDetails = getHalfDayDetails(item);
        const calcHalfDay = halfDayDetails.length;
        // Pre-compute defined schedule hours (avoids expensive re-calculation during render)
        const calcDefinedSchedule = calculateDefinedScheduleHours(item);

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
          summary: {
            ...item.summary,
            totalHalfDay: calcHalfDay,
            totalLate: calcLate,
            totalAbsent: calcAbsent,
            totalPresent: calcPresent
          },
          calcScheduled: sched,
          calcDefinedSchedule,
          calcExcessDeficit,
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
  }, [summaries, searchTerm, selectedYear, selectedMonth, teamFilter, designationFilter, lateFilter, presentFilter, absentFilter, leaveFilter, halfDayFilter, workHoursFilter, excessFilter, sortField, sortDirection, holidays, allUsers, filterType, currentWeekStart, rangeStart, rangeEnd]);

  /** Render the table in chunks; stats and exports still use full `filteredSummaries`. */
  const SUMMARY_TABLE_CHUNK = 50;
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

  /**
   * Detailed Export
   * Columns (keeps existing columns up to `paidFrom`, then):
   * - PIO: ThumbMachine | Present - in office | Present - in office - weekdays (halfDay=false), exclude holidays
   * - WO-PIO: Present - in office - weekoff / Present - weekoff / WO-Present (halfDay=false), plus PIO-eligible presence on Sunday or on a date in `holidays`
   * - OS-P: Outstation/ClientPlace present types (weekdays/weekoff). halfDay counts as 0.5
   * - A: Absent (existing logic: 0 hours, not leave/holiday/weekoff and no checkin/out)
   * - HD: Half-day weekdays (halfDay=true, exclude outstation/clientplace, exclude weekoff)
   * - Weekoff HD (Days): halfDay=true && typeOfPresence === 'Half Day - weekoff' (two half-days = 1 day)
   * - Weekoffs (Inc. Sun+OHD): present on weekoff/Sunday/DB-holiday (sum values)
   * - Sun (Days): present on Sundays
   * - OHD (Days): official holidays from `holidays` prop where user has attendance
   * - WFH (In Weekoff): WFH - weekoff (sum, half=0.5)
   * - WFH (Days): WFH - weekdays (sum)
   * - WFH (Max Day Allowed): per-user allowed (default 2) × 0.75
   * - Absent WFH: maxAllowed - presentActual (floor at 0)
   * - Present WFH (Actual): sum of WFH - weekdays values
   * - Absent WFH (Max-Actual): same as Absent WFH
   * - Staff Weekdays-Working: PIO + OS-P + (HD/2) + Present WFH (Actual)
   * - Leaves Taken By Staff: count of On leave/Leave days (full days)
   * - Leaves B/F: `user.leaveBalance.remaining`
   * - Leaves Earned This Month: `user.leaveBalance.monthlyEarned` (default 2)
   * - Leaves Consumed This Month: IF(StaffWeekdaysWorking < 10, 0, min( LeavesTaken, LeavesB/F + LeavesEarned))
   * - C/F Leaves: Leaves B/F + Earned - Consumed
   * - Staff Weekoff Working Days: WO-PIO + Weekoff HD (converted) + WFH weekoff × 0.75
   * - Staff Overtime (non-articles): ThumbMachine excess hours ÷ weekday hours, plus floor(max(0, period excess hours) / 6) — each full 6h of net excess adds 1 overtime day (e.g. 24h → +4, 22h → +3)
   * - Net Staff Working Days: if employmentType==='article' => Staff Weekdays-Working else Staff Weekdays-Working + Leaves Consumed + Staff Weekoff Working + Staff Overtime
   *
   * Notes:
   * - Holidays are authoritative from `holidays` prop.
   * - Half-day values use `rec.halfDay` and `rec.value` when available.
   * - WFH allowed default is 2 days (configurable later).
   */
  const handleDetailedExport = async () => {
    if (filteredSummaries.length === 0) return;

    // Build holiday date set for quick checks
    const holidayDates = new Set(holidays.map(h => h.date));

    // Helper predicates per spec
    const isPIO = (rec: any) => {
      const t = rec.typeOfPresence;
      if (!t) return false;
      if (rec.halfDay) return false;

      // Exclude ThumbMachine records with no real checkin/out (00:00 or missing)
      if (t === 'ThumbMachine') {
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const effectiveCheckout = rec.editedCheckout || rec.checkout;
        const hasValidCheckin = !!(effectiveCheckin && effectiveCheckin !== '00:00');
        const hasValidCheckout = !!(effectiveCheckout && effectiveCheckout !== '00:00');
        if (!hasValidCheckin && !hasValidCheckout) return false;
      }

      return t === 'ThumbMachine' || t === 'Present - in office' || t === 'Present - in office - weekdays' || t === 'Present';
    };

    const isWOPIO = (rec: any) => {
      const t = rec.typeOfPresence || '';
      if (!t) return false;
      if (rec.halfDay) return false;
      return t === 'Present - in office - weekoff' || t === 'Present - weekoff' || t === 'Weekly Off - Present (WO-Present)';
    };

    const isOSP = (rec: any) => {
      const t = rec.typeOfPresence || '';
      const set = new Set([
        'Present - Outstation (Weekdays)',
        'Present - Outstation (Weekoff)',
        'Present - ClientPlace (Weekoff)',
        'Present - ClientPlace (Weekdays)',
        'Present - outstation',
        'Present - client place',
        'Present - Outstation (Weekdays)'
      ]);
      return set.has(t);
    };

    const isWFHWeekoff = (rec: any) => {
      const t = rec.typeOfPresence || '';
      return t === 'WFH - weekoff' || t === 'Weekly Off - Work From Home (WO-WFH)';
    };

    const isWFHWeekday = (rec: any) => {
      const t = rec.typeOfPresence || '';
      return t === 'WFH - weekdays' || t === 'Work From Home (WFH)';
    };

    const isHalfDayWeekoff = (rec: any) => rec.halfDay && (rec.typeOfPresence === 'Half Day - weekoff' || rec.typeOfPresence === 'Half Day (HD)');

    const isHalfDayWeekday = (rec: any) => rec.halfDay && (rec.typeOfPresence === 'Half Day - weekdays' || rec.typeOfPresence === 'Half Day (HD)');

    // WFH allowed default per user (days) - default 2
    const getWfhAllowed = (user: User | undefined) => {
      return 2;
    };

    const toDateOnly = (v: string) => new Date(`${v}T00:00:00`);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

    const getExportRange = () => {
      if (filterType === 'month') {
        const start = new Date(selectedYear, selectedMonth - 1, 1);
        const end = new Date(selectedYear, selectedMonth, 0);
        return { start, end };
      }

      if (filterType === 'week') {
        const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
        const lastDay = new Date(selectedYear, selectedMonth, 0);
        let weekStart = new Date(currentWeekStart);
        if (weekStart < firstDay) weekStart = new Date(firstDay);
        let weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd > lastDay) weekEnd = new Date(lastDay);
        return { start: weekStart, end: weekEnd };
      }

      return { start: new Date(rangeStart), end: new Date(rangeEnd) };
    };

    const isHolidayLikeType = (typeOfPresence: string) => {
      const t = String(typeOfPresence || '').toLowerCase();
      return (
        t === 'holiday' ||
        t === 'sun' ||
        t === 'sunday' ||
        t === 'official holiday duty (ohd)' ||
        t.includes('weekoff')
      );
    };

    // Leave contribution rules for detailed export adjustments:
    // Absent => 1, Half Day => 0.5, WFH => 1 - value, Leave => value/full-day.
    const getLeaveContribution = (dateStr: string, rec: any): number => {
      if (!rec) return 0;

      const dateObj = toDateOnly(dateStr);
      if (dateObj.getDay() === 0) return 0;
      if (holidayDates.has(dateStr)) return 0;

      const type = String(rec.typeOfPresence || '');
      if (isHolidayLikeType(type)) return 0;

      const inTime = String(rec.editedCheckin || rec.checkin || '').trim();
      const outTime = String(rec.editedCheckout || rec.checkout || '').trim();
      const hasIn = inTime !== '' && inTime !== '00:00';
      const hasOut = outTime !== '' && outTime !== '00:00';
      const totalHour = Number(rec.totalHour || 0);

      // Paid leave / on leave entries
      if (type === 'Leave' || type === 'On leave') {
        const raw = Number(rec.value);
        if (Number.isFinite(raw) && raw > 0) return round2(clamp01(raw));
        return rec.halfDay ? 0.5 : 1;
      }

      // Absent entries
      const isAbsentByType = type === 'Absent';
      const isAbsentByTime = totalHour === 0 && !hasIn && !hasOut;
      if (isAbsentByType || isAbsentByTime) {
        return 1;
      }

      // Half day entries
      if (rec.halfDay || type === 'Half Day - weekdays' || type === 'Half Day - weekoff' || type === 'Half Day (HD)') {
        return 0.5;
      }

      // WFH entries consume the shortfall from 1 day
      const isWFH =
        type === 'WFH - weekdays' ||
        type === 'WFH - weekoff' ||
        type === 'Work From Home (WFH)' ||
        type === 'Weekly Off - Work From Home (WO-WFH)';

      if (isWFH) {
        const raw = Number(rec.value);
        const normalized = Number.isFinite(raw) ? clamp01(raw) : 0;
        return round2(Math.max(0, 1 - normalized));
      }

      return 0;
    };

    // Import ExcelJS dynamically
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Detailed Attendance');

    // Define columns exactly in required order
    worksheet.columns = [
      { key: 'employeeCode', width: 14 },
      { key: 'employeeName', width: 22 },
      { key: 'category', width: 12 },
      { key: 'verticalHead', width: 18 },
      { key: 'paidFrom', width: 12 },

      // New columns after paidFrom
      { key: 'PIO', width: 8 },
      { key: 'WO_PIO', width: 8 },
      { key: 'OS_P', width: 8 },
      { key: 'A', width: 6 },
      { key: 'HD', width: 8 },
      { key: 'Weekoff_HD', width: 12 },
      { key: 'Weekoffs', width: 14 },
      { key: 'Sun', width: 10 },
      { key: 'OHD', width: 10 },
      { key: 'WFH_Weekoff', width: 12 },
      { key: 'WFH_Weekday', width: 12 },
      { key: 'WFH_MaxAllowed', width: 14 },
      { key: 'Absent_WFH', width: 12 },
      { key: 'Present_WFH', width: 16 },
      { key: 'Absent_WFH_MaxActual', width: 16 },
      { key: 'Staff_Weekdays_Working', width: 18 },
      { key: 'Leaves_Taken', width: 14 },
      { key: 'Leaves_BF', width: 10 },
      { key: 'Leaves_Earned', width: 12 },
      { key: 'Leaves_Earned_Extra', width: 12 },
      { key: 'Leaves_Consumed', width: 18 },
      { key: 'Leaves_CF', width: 10 },
      { key: 'Staff_Weekoff_Working', width: 20 },
      { key: 'Staff_Overtime', width: 12 },
      { key: 'Net_Staff_Working', width: 18 },
      { key: 'Loss_Due_Invalid', width: 18 }
    ];

    // Insert numbering row above header (1..N) and header row at row 2
    const colCount = worksheet.columns.length;
    const numberingRow = Array.from({ length: colCount }, (_, i) => i + 1);
    worksheet.insertRow(1, numberingRow);
    const headerLabels = [
      'Employee Code',
      'Employee Name',
      'Category',
      'Authorised Vertical Head',
      'Paid From',

      'PIO',
      'WO-PIO',
      'OS-P',
      'A',
      'HD',
      'Weekoff HD (Days)',
      'Weekoffs (Inc. Sun+OHD)',
      'Sun (Days)',
      'OHD (Days)',
      'WFH (In Weekoff)',
      'WFH (Days)',
      'WFH (Max Day Allowed)',
      'Absent WFH',
      'Present WFH (Actual)',
      'Absent WFH (Max-Actual)',
      'Staff Weekdays-Working',
      'Leaves Taken By Staff',
      'Leaves B/F',
      'Leaves Earned This Month',
      'Leaves Earned - Extra',
      'Leaves Consumed This Month',
      'C/F Leaves',
      'Staff Weekoff Working Days',
      'Staff Overtime',
      'Net Staff Working Days',
      'Loss due to invalid'
    ];
    worksheet.insertRow(2, headerLabels);

    // Pre-calc period range
    let startDate: Date;
    let endDate: Date;

    if (filterType === 'month') {
      startDate = new Date(selectedYear, selectedMonth - 1, 1);
      endDate = new Date(selectedYear, selectedMonth, 0);
    } else if (filterType === 'week') {
      startDate = new Date(currentWeekStart);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
    } else {
      startDate = new Date(rangeStart);
      endDate = new Date(rangeEnd);
    }

    // Pre-calc total Sundays and total DB-holidays in selected period (same for all users)
    const totalSundaysInPeriod = countTotalSundaysInPeriod();
    const countHolidaysInPeriod = () => {
      let cnt = 0;
      for (const h of holidays) {
        const [y, m, d] = h.date.split('-').map(Number);
        const localHolidayDate = new Date(y, m - 1, d);
        if (localHolidayDate >= startDate && localHolidayDate <= endDate) cnt++;
      }
      return cnt;
    };
    const totalHolidaysInPeriod = countHolidaysInPeriod();

    const exportRange = getExportRange();

    // Current month context for snapshot-driven leave adjustment
    const targetMonth = filterType === 'range'
      ? `${exportRange.end.getFullYear()}-${String(exportRange.end.getMonth() + 1).padStart(2, '0')}`
      : `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

    // Fetch snapshots for the target month so Leaves_B/F and leave taken adjustment are accurate
    let snapshotMap: Record<string, any> = {};
    try {
      const snapRes = await fetch(`/api/leave/snapshots?monthYear=${targetMonth}`);
      if (snapRes.ok) {
        const json = await snapRes.json();
        if (json && Array.isArray(json.data)) {
          snapshotMap = Object.fromEntries(json.data.map((s: any) => [String(s.userId), s]));
        }
      }
    } catch (e) {
      // ignore snapshot fetch errors and fallback to user.leaveBalance
    }

    // For week/range exports, fetch full current-month attendance so we can
    // adjust snapshot leave values for included/excluded dates precisely.
    let currentMonthRecordsByUser: Record<string, Record<string, any>> = {};
    if (filterType !== 'month') {
      try {
        const monthRes = await fetch(`/api/attendance?monthYear=${encodeURIComponent(targetMonth)}`);
        if (monthRes.ok) {
          const json = await monthRes.json();
          if (json?.success && Array.isArray(json.data)) {
            for (const row of json.data) {
              const uid = String(row?.userId?._id || row?.userId || '');
              if (!uid) continue;
              currentMonthRecordsByUser[uid] = (row?.records || {}) as Record<string, any>;
            }
          }
        }
      } catch (e) {
        // If month fetch fails, detailed export falls back to in-range records only.
      }
    }

    // Partition summaries into employees and articles so export has two sections
    const employeeSummaries: AttendanceSummaryView[] = [];
    const articleSummaries: AttendanceSummaryView[] = [];
    filteredSummaries.forEach(item => {
      const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
      const employmentType = user?.employmentType || getEmploymentTypeForDate(user as any, new Date());
      const designation = (user?.designation || item.designation || '').toString().toLowerCase();
      // Treat as article if employmentType==='article' OR designation mentions 'article'
      if (employmentType === 'article' || designation.includes('article')) articleSummaries.push(item);
      else employeeSummaries.push(item);
    });

    // Process a single summary and add a row; if `isArticle` blanks certain columns
    const processItem = (item: AttendanceSummaryView, isArticle = false) => {
      const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
      const records = item.recordDetails || {};

      let weekdayHours = 8;
      try {
        const schedules = (user as any)?.schedules;
        if (schedules && Array.isArray(schedules) && schedules.length > 0) {
          const sortedSchedules = schedules.slice().sort((a: any, b: any) =>
            new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
          );
          const mondaySchedule = sortedSchedules[0]?.daily?.monday;
          if (mondaySchedule?.inTime && mondaySchedule?.outTime) {
            const [inH, inM] = mondaySchedule.inTime.split(':').map(Number);
            const [outH, outM] = mondaySchedule.outTime.split(':').map(Number);
            const calc = (outH + outM / 60) - (inH + inM / 60);
            if (calc > 0) weekdayHours = calc;
          }
        }
      } catch (e) {
        weekdayHours = 8;
      }

      // Calculate loss due to invalid attendance (deficient due to missing in/out)
      let lossDueToInvalidHour = 0;
      sortRecordDetailsEntries(records).forEach(([dateStr, recAny]) => {
        const rec: any = recAny || {};
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const effectiveCheckout = rec.editedCheckout || rec.checkout;
        // If both inTime and outTime are '00:00' or missing, treat as absent, not invalid
        const isBothZero = !(effectiveCheckin && effectiveCheckin !== '00:00') && !(effectiveCheckout && effectiveCheckout !== '00:00');
        if (isBothZero) return; // skip, this is absent
        // If either inTime or outTime is missing (invalid attendance)
        const missingIn = !(effectiveCheckin && effectiveCheckin !== '00:00');
        const missingOut = !(effectiveCheckout && effectiveCheckout !== '00:00');
        if (missingIn || missingOut) {
          // If excessHour is negative (deficit), sum it
          const ex = typeof rec.excessHour === 'number' ? rec.excessHour : (rec.excessHour ? Number(rec.excessHour) : 0);
          if (ex < 0) lossDueToInvalidHour += Math.abs(ex);
        }
      });
      // Convert total deficient hours to days (divide by weekdayHours)
      const lossDueToInvalid = weekdayHours > 0 ? Number((lossDueToInvalidHour / weekdayHours).toFixed(2)) : 0;

      // Counters
      let pio = 0;
      let wo_pio = 0;
      let os_p = 0; // can be fractional
      let absent = 0;
      let hd_count = 0; // number of half-day weekday records
      let weekoff_hd_days = 0; // half-day weekoff count -> will convert to days later
      let weekoffs_sum = 0; // sum of values for weekoff present records
      let sun_days = 0;
      let ohd_days = 0;
      let wfh_weekoff = 0; // sum of values
      let wfh_weekday = 0; // sum of values
      let present_wfh_actual = 0; // same as wfh_weekday
      let leaves_taken = 0;
      let extraEarnedFromOutclient = 0; // additional leave earned from outstation/clientplace attendances
      let staffOvertime = 0; // sum of excessHour for ThumbMachine records

      sortRecordDetailsEntries(records).forEach(([dateStr, recAny]) => {
        const rec: any = recAny || {};
        const d = new Date(dateStr);
        const isSunday = d.getDay() === 0;
        const isHoliday = holidayDates.has(dateStr) || rec.typeOfPresence === 'Holiday';
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const effectiveCheckout = rec.editedCheckout || rec.checkout;
        const isBothZero = !(effectiveCheckin && effectiveCheckin !== '00:00') && !(effectiveCheckout && effectiveCheckout !== '00:00');
        // If both checkin/checkout are 00:00 (or missing) treat record as no-value (0)
        const value = typeof rec.value === 'number'
          ? rec.value
          : (isBothZero ? 0 : (rec.halfDay ? 0.5 : (rec.totalHour > 0 ? 1 : 0)));

        const t = rec.typeOfPresence || '';
        const outclientSet = new Set(['Present - Outstation (Weekdays)', 'Present - Outstation (Weekoff)', 'Present - ClientPlace (Weekoff)', 'Present - ClientPlace (Weekdays)', 'Present - outstation', 'Present - client place']);

        // Resolve employment type for this record's date (respect history)
        const empType = getEmploymentTypeForDate(user, d) || user?.employmentType;

        // PIO
        if (isPIO(rec) && !isHoliday && !isSunday) {
          pio += 1;
        } else if (empType === 'halftime' && rec.halfDay && !isHoliday && !isSunday && !isBothZero) {
          // For halftime employees, count half-days as PIO (use rec.value if present)
          if (!outclientSet.has(t)) {
            const inc = typeof rec.value === 'number' ? rec.value : 0.5;
            pio += inc;
          }
        }

        // WO-PIO: explicit weekoff present types, or in-office present (PIO rules) on Sunday / holiday
        if (isWOPIO(rec)) {
          wo_pio += 1;
        } else if (isPIO(rec) && (isSunday || isHoliday)) {
          wo_pio += 1;
        }

        // OS-P (allow half days)
        if (isOSP(rec)) {
          os_p += (rec.halfDay ? 0.5 : 1);
        }

        // Absent (A): exclude Sundays and holidays from absent counting.
        let isAbsentRecord = false;
        const isExplicitAbsent = rec.typeOfPresence === 'Absent';
        const isLeaveMarked = rec.typeOfPresence === 'Leave' || rec.typeOfPresence === 'On leave';

        if (!isSunday && !isHoliday && (isExplicitAbsent || isLeaveMarked)) {
          absent += 1;
          isAbsentRecord = true;
        } else if (
          !isSunday &&
          !isHoliday &&
          rec.totalHour === 0 &&
          rec.typeOfPresence !== 'Holiday' &&
          !(typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff'))
        ) {
          const effectiveCheckin = rec.editedCheckin || rec.checkin;
          const effectiveCheckout = rec.editedCheckout || rec.checkout;
          if ((!(effectiveCheckin && effectiveCheckin !== '00:00')) && (!(effectiveCheckout && effectiveCheckout !== '00:00'))) {
            absent += 1;
            isAbsentRecord = true;
          }
        }

        // HD handling:
        // Count explicit 'Half Day - weekoff' regardless of rec.halfDay, but skip if record is absent
        if (t === 'Half Day - weekoff') {
          if (!isAbsentRecord) weekoff_hd_days += 1;
        } else if (rec.halfDay) {
          // If record is actually absent (no valid checkin/checkout) do not count as half-day
          if (isAbsentRecord) {
            // skip
          } else if (isSunday || isHoliday) {
            weekoff_hd_days += 1;
          } else {
            if (!outclientSet.has(t)) {
              // For halftime employees, half-days are counted into PIO above, so skip hd_count to avoid double-counting
              if (empType !== 'halftime') {
                hd_count += 1;
              }
            }
          }
        }

        // Weekoffs (Inc. Sun+OHD)
        const isWeekoffType = typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff');
        if ((isSunday || isHoliday || isWeekoffType) && value > 0) {
          weekoffs_sum += value;
        }

        if (outclientSet.has(t)) {
          const explicitExtra = typeof rec.extraEarned === 'number' ? rec.extraEarned : (rec.extraEarned ? Number(rec.extraEarned) : 0);
          const impliedExtra = value > 1 ? (value - 1) : 0;
          extraEarnedFromOutclient += explicitExtra + impliedExtra;
        }

        // Sun (Days)
        if (isSunday && value > 0) sun_days += value;

        // OHD (Days)
        if (holidayDates.has(dateStr) && value > 0) ohd_days += value;

        // WFH handling
        if (isWFHWeekoff(rec)) {
          wfh_weekoff += value;
        }
        if (isWFHWeekday(rec)) {
          wfh_weekday += 1;
          present_wfh_actual += value;
        }

        leaves_taken += getLeaveContribution(dateStr, rec);

        // Staff Overtime
        const excessHourVal = typeof rec.excessHour === 'number' ? rec.excessHour : (rec.excessHour ? Number(rec.excessHour) : 0);
        if (!isAbsentRecord && rec.typeOfPresence && typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('thumbmachine')) {
          staffOvertime += excessHourVal;
        }
      });

      // Post-process conversions (same as before)
      const weekoff_hd_days_converted = Number(weekoff_hd_days.toFixed(3));
      const wfhMaxAllowed = Number((wfh_weekday * 0.75).toFixed(3));
      const presentWFHActual = Number(present_wfh_actual.toFixed(2));
      const absentWFH = Number((wfh_weekday * 0.25).toFixed(3));
      const absentWFH_MaxActual = Number(Math.max(0, wfhMaxAllowed - presentWFHActual).toFixed(3));
      const staffWeekdaysWorking = Number((pio + os_p + (hd_count / 2) + presentWFHActual).toFixed(3));

      // Snapshot-driven leave taken adjustment for week/range exports.
      // Baseline from current-month snapshot, then:
      // 1) subtract excluded current-month dates,
      // 2) add included non-current-month dates (e.g., last day of previous month).
      if (filterType !== 'month') {
        const uid = String(user?._id || item.userId);
        const fullCurrentMonthRecords = currentMonthRecordsByUser[uid] || {};
        const snapshotUsedRaw = Number(snapshotMap[uid]?.usedThisMonth);
        const hasSnapshotUsed = Number.isFinite(snapshotUsedRaw);

        let excludedCurrentMonthContribution = 0;
        if (hasSnapshotUsed) {
          for (const [dateStr, rec] of sortRecordDetailsEntries(fullCurrentMonthRecords)) {
            if (!dateStr.startsWith(`${targetMonth}-`)) continue;
            const d = toDateOnly(dateStr);
            const isIncluded = d >= exportRange.start && d <= exportRange.end;
            if (!isIncluded) {
              excludedCurrentMonthContribution += getLeaveContribution(dateStr, rec);
            }
          }
        }

        let includedOtherMonthContribution = 0;
        for (const [dateStr, rec] of sortRecordDetailsEntries(records)) {
          if (dateStr.startsWith(`${targetMonth}-`)) continue;
          const d = toDateOnly(dateStr);
          if (d >= exportRange.start && d <= exportRange.end) {
            includedOtherMonthContribution += getLeaveContribution(dateStr, rec);
          }
        }

        if (hasSnapshotUsed) {
          const adjustedCurrentMonth = Math.max(0, snapshotUsedRaw - excludedCurrentMonthContribution);
          leaves_taken = round2(adjustedCurrentMonth + includedOtherMonthContribution);
        } else {
          leaves_taken = round2(leaves_taken);
        }
      } else {
        const uid = String(user?._id || item.userId);
        const snapshotUsedRaw = Number(snapshotMap[uid]?.usedThisMonth);
        if (Number.isFinite(snapshotUsedRaw)) {
          leaves_taken = round2(snapshotUsedRaw);
        } else {
          leaves_taken = round2(leaves_taken);
        }
      }

      // Prefer snapshot balanceAsOfMonth for Leaves B/F, fallback to user.leaveBalance
      const snap = snapshotMap[String(user?._id || item.userId)];
      const leavesBF = snap && typeof snap.balanceAsOfMonth === 'number'
        ? Number(snap.balanceAsOfMonth)
        : Math.max(0, (user?.leaveBalance?.remaining ?? 0) - (user?.leaveBalance?.monthlyEarned ?? 0));
      const leavesEarned = (user?.leaveBalance?.monthlyEarned ?? 2);
      const totalLeavesEarned = Number((leavesEarned + (extraEarnedFromOutclient || 0)).toFixed(3));
      let leavesConsumed = 0;
      if (staffWeekdaysWorking < 10) {
        leavesConsumed = 0;
      } else {
        const available = leavesBF + totalLeavesEarned;
        leavesConsumed = Math.min(leaves_taken, available);
      }
      const leavesCF = Number((leavesBF + totalLeavesEarned - leavesConsumed).toFixed(3));
      // Calculate unique weekoffs (Sundays + non-Sunday Holidays)
      let uniqueWeekoffs = totalSundaysInPeriod;
      for (const h of holidays) {
        const [y, m, day] = h.date.split('-').map(Number);
        const d = new Date(y, m - 1, day);
        if (d >= startDate && d <= endDate && d.getDay() !== 0) {
          uniqueWeekoffs++;
        }
      }
      const weekoffs_total = Number(uniqueWeekoffs.toFixed(3));
      const staffWeekoffWorking = Number((wo_pio + (weekoff_hd_days_converted / 2) + wfh_weekoff).toFixed(3));

      // Staff Overtime (non-articles): hours from ThumbMachine excess → days, plus 1 day per each full 6h of net period excess (worked − scheduled)
      const thumbOvertimeDays = Number(((staffOvertime || 0) / (weekdayHours || 8)).toFixed(2));
      const periodExcessHours = Math.max(0, Number(item.calcExcessDeficit) || 0);
      const overtimeDaysFromExcessBlocks =
        !isArticle && periodExcessHours >= 6 ? Math.floor(periodExcessHours / 6) : 0;
      const staffOvertimeDays = Number((thumbOvertimeDays + overtimeDaysFromExcessBlocks).toFixed(2));
      const employmentType = user?.employmentType || getEmploymentTypeForDate(user as any, new Date());

      // Net Staff Working Days formula:
      // If employmentType is 'article', use staffWeekdaysWorking only.
      // Else, sum staffWeekdaysWorking + leavesConsumed + staffWeekoffWorking + staffOvertimeDays
      let netStaffWorking = 0;
      if (employmentType === 'article') {
        netStaffWorking = staffWeekdaysWorking;
      } else {
        netStaffWorking = Number((staffWeekdaysWorking + leavesConsumed + staffWeekoffWorking + staffOvertimeDays).toFixed(3));
      }

      const rowData: any = {
        employeeCode: user?.employeeCode || user?.odId || item.userId,
        employeeName: user?.name || item.userName,
        category: user?.category || '',
        verticalHead: user?.workingUnderPartner || '',
        paidFrom: user?.paidFrom || '',

        PIO: Number(pio.toFixed(2)),
        WO_PIO: Number(wo_pio.toFixed(2)),
        OS_P: Number(os_p.toFixed(2)),
        A: Number(absent.toFixed(2)),
        HD: Number(hd_count.toFixed(2)),
        Weekoff_HD: Number(weekoff_hd_days_converted.toFixed(2)),
        Weekoffs: Number(weekoffs_total.toFixed(2)),
        Sun: Number(totalSundaysInPeriod),
        OHD: Number(totalHolidaysInPeriod),
        WFH_Weekoff: Number(wfh_weekoff.toFixed(2)),
        WFH_Weekday: Number(wfh_weekday.toFixed(2)),
        WFH_MaxAllowed: wfhMaxAllowed,
        Absent_WFH: absentWFH,
        Present_WFH: presentWFHActual,
        Absent_WFH_MaxActual: absentWFH_MaxActual,
        Staff_Weekdays_Working: staffWeekdaysWorking,
        Leaves_Taken: Number(leaves_taken.toFixed(2)),
        Leaves_BF: Number(leavesBF.toFixed(2)),
        Leaves_Earned: Number(totalLeavesEarned.toFixed(2)),
        Leaves_Earned_Extra: Number((extraEarnedFromOutclient || 0).toFixed(2)),
        Leaves_Consumed: Number(leavesConsumed.toFixed(2)),
        Leaves_CF: leavesCF,
        Staff_Weekoff_Working: staffWeekoffWorking,
        Staff_Overtime: staffOvertimeDays,
        Net_Staff_Working: Number(netStaffWorking.toFixed(3)),
        Loss_Due_Invalid: lossDueToInvalid
      };

      if (isArticle) {
        rowData.Leaves_Taken = '';
        rowData.Leaves_BF = '';
        rowData.Leaves_Earned = '';
        rowData.Leaves_Earned_Extra = '';
        rowData.Leaves_Consumed = '';
        rowData.Leaves_CF = '';
        rowData.Staff_Weekoff_Working = '';
        rowData.Staff_Overtime = '';
      }

      worksheet.addRow(rowData);
    };

    // Write employee summaries first
    employeeSummaries.forEach(i => processItem(i, false));

    // If any articles exist, insert a few blank rows as separator then write article rows
    if (articleSummaries.length > 0) {
      worksheet.addRow([]);
      worksheet.addRow([]);
      worksheet.addRow([]);
      // leave a small visual gap; no explicit 'Articles' header required per request
      articleSummaries.forEach(i => processItem(i, true));
    }

    // Style numbering row and header row (numbering = row 1, header = row 2)
    const numbering = worksheet.getRow(1);
    numbering.height = 18;
    numbering.eachCell((cell) => {
      cell.font = { bold: true, size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const headerRow = worksheet.getRow(2);
    headerRow.height = 36; // increased height for better readability

    // Role-based header and data styling
    const identityKeys = new Set(['employeeCode','employeeName','category','verticalHead','paidFrom','team','designation']);
    const presenceKeys = new Set(['PIO','WO_PIO','OS_P','A','HD','Weekoff_HD','Weekoffs','Sun','OHD','WFH_Weekoff','WFH_Weekday','WFH_MaxAllowed','Absent_WFH','Present_WFH','Absent_WFH_MaxActual']);
    const leaveKeys = new Set(['Leaves_Taken','Leaves_BF','Leaves_Earned','Leaves_Earned_Extra','Leaves_Consumed','Leaves_CF']);
    const workKeys = new Set(['Staff_Weekdays_Working','Staff_Weekoff_Working','Staff_Overtime','Net_Staff_Working']);

    const headerFillMap: Record<string,string> = {
      identity: 'FF0F172A', // dark slate
      presence: 'FF1E3A8A', // indigo
      leave: 'FF1F2937', // gray-800
      work: 'FF065F46' // teal/green
    };

    const dataFillMap: Record<string,string> = {
      identity: 'FFFFFFFF',
      presence: 'FFEEF2FF',
      leave: 'FFF1F5F9',
      work: 'FFE6F6EF'
    };

    // Highlight specific columns in orange (header + subtle data tint)
    const highlightKeys = new Set(['Leaves_Earned_Extra', 'Loss_Due_Invalid']);
    const highlightHeaderColor = 'FFFB923C'; // orange
    const highlightDataColor = 'FFFEEBD4';

    headerRow.eachCell((cell, colNumber) => {
      const colKey = worksheet.columns[colNumber - 1]?.key as string | undefined;
      // Highlighted header columns use orange
      if (colKey && highlightKeys.has(colKey)) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: highlightHeaderColor } };
        return;
      }

      let role = 'identity';
      if (colKey && presenceKeys.has(colKey)) role = 'presence';
      else if (colKey && leaveKeys.has(colKey)) role = 'leave';
      else if (colKey && workKeys.has(colKey)) role = 'work';

      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFillMap[role] } };
    });

    // Style data rows and apply role-based fills
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // skip numbering + header
      const isEvenRow = rowNumber % 2 === 0;
      row.eachCell((cell, colNumber) => {
        const colKey = worksheet.columns[colNumber - 1]?.key as string | undefined;
        let role = 'identity';
        if (colKey && presenceKeys.has(colKey)) role = 'presence';
        else if (colKey && leaveKeys.has(colKey)) role = 'leave';
        else if (colKey && workKeys.has(colKey)) role = 'work';

        // Base font/alignment
        cell.font = { size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'left' : 'center' };

        // If highlighted column, apply special data fill
        if (colKey && highlightKeys.has(colKey)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: (isEvenRow ? highlightDataColor : 'FFFFFFFF') } };
        } else {
          // Apply role-based data fill with subtle alternation
          const baseFill = dataFillMap[role] || 'FFFFFFFF';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseFill } };
          if (isEvenRow) {
            // slightly tint even rows darker for readability
            if (role !== 'identity') {
              const darkVariant = role === 'presence' ? 'FFE6EEFF' : role === 'leave' ? 'FFF8FAFC' : role === 'work' ? 'FFF1FAF6' : baseFill;
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: darkVariant } };
            }
          }
        }
      });
    });

    const fileName = filterType === 'month'
      ? `Detailed_Attendance_Summary_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx`
      : filterType === 'week'
      ? `Detailed_Attendance_Summary_Week_${currentWeekStart}.xlsx`
      : `Detailed_Attendance_Summary_${rangeStart}_to_${rangeEnd}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

 const handleExport = async () => {
    if (filteredSummaries.length === 0) return;

    // Import ExcelJS dynamically
    const ExcelJS = (await import('exceljs')).default;

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Summary');


    // Add date range at the top (row 1)
    let dateRangeText = '';
    if (filterType === 'month') {
      dateRangeText = `Date Range: ${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    } else if (filterType === 'week') {
      // Clamp weekStart and weekEnd to selected month boundaries
      const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
      const lastDay = new Date(selectedYear, selectedMonth, 0);
      let weekStart = new Date(currentWeekStart);
      if (weekStart < firstDay) weekStart = new Date(firstDay);
      let weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > lastDay) weekEnd = new Date(lastDay);
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = weekEnd.toISOString().split('T')[0];
      dateRangeText = `Date Range: ${weekStartStr} to ${weekEndStr}`;
    } else if (filterType === 'range') {
      dateRangeText = `Date Range: ${rangeStart} to ${rangeEnd}`;
    }
    // Now add the header row (row 1)
    worksheet.columns = [
      { key: 'paidFrom', header: 'Paid From', width: 12 },
      { key: 'employeeName', header: 'Employee Name', width: 25 },
      { key: 'category', header: 'Category', width: 12 },
      { key: 'verticalHead', header: 'Authorised Vertical Head', width: 25 },
      { key: 'employeeCode', header: 'Employee Code', width: 15 },
      { key: 'team', header: 'Team', width: 12 },
      { key: 'designation', header: 'Designation', width: 15 },
      { key: 'totalDays', header: 'Total Days', width: 10 },
      { key: 'holidays', header: 'Holidays', width: 10 },
      { key: 'workingDays', header: 'Working Days', width: 12 },
      { key: 'present', header: 'Present', width: 8 },
      { key: 'halfDays', header: 'Half Days', width: 10 },
      { key: 'absent', header: 'Absent', width: 8 },
      { key: 'late', header: 'Late', width: 8 },
      { key: 'scheduled', header: 'Scheduled', width: 12 },
      { key: 'definedSchedule', header: 'Defined Work Hour', width: 15 },
      { key: 'workHours', header: 'Work Hours', width: 12 },
      { key: 'excess', header: 'Excess', width: 10 },

    ];

    // Insert date range row above the header (row 1)
    worksheet.spliceRows(1, 0, [dateRangeText]);
    worksheet.mergeCells(1, 1, 1, worksheet.columns.length);
    worksheet.getRow(1).font = { bold: true, size: 13 };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data rows - using summary data from the database, start from row 3
    filteredSummaries.forEach((item) => {
      const user = allUsers?.find(u => u._id === item.userId);
      worksheet.addRow({
        paidFrom: user?.paidFrom || 'N/A',
        employeeName: user?.name || item.userName,
        category: user?.category || 'N/A',
        verticalHead: user?.workingUnderPartner || 'N/A',
        employeeCode: item.employeeCode || item.odId || item.userId || '-',
        team: item.team || '-',
        designation: item.designation || '-',
        totalDays: Object.keys(item.recordDetails || {}).length,
        holidays: (() => {
          const records = item.recordDetails || {};
          const holidayDatesSet = new Set(holidays.map(h => h.date));
          let holidayCount = 0;
          Object.keys(records).forEach((dateStr) => {
            const d = new Date(dateStr);
            if (d.getDay() === 0) holidayCount++;
            else if (holidayDatesSet.has(dateStr)) holidayCount++;
          });
          return holidayCount;
        })(),
        workingDays: (() => {
          const records = item.recordDetails || {};
          const holidayDatesSet = new Set(holidays.map(h => h.date));
          return Object.entries(records).filter(([dateStr, rec]: [string, any]) => {
            const d = new Date(dateStr);
            if (d.getDay() === 0) return false;
            if (holidayDatesSet.has(dateStr)) return false;
            if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) return false;
            return true;
          }).length;
        })(),
        present: item.summary.totalPresent,
        halfDays: item.summary.totalHalfDay,
        absent: item.summary.totalAbsent,
        late: item.calcLate || 0,
        scheduled: formatHoursMinutes(item.calcScheduled || 0),
        definedSchedule: formatHoursMinutes(item.calcDefinedSchedule || 0),
        workHours: formatHoursMinutes(item.summary.totalHour),
        excess: (item.calcExcessDeficit !== undefined && item.calcExcessDeficit !== 0)
          ? `${item.calcExcessDeficit > 0 ? '+' : item.calcExcessDeficit < 0 ? '-' : ''}${formatHoursMinutes(Math.abs(item.calcExcessDeficit))}`
          : formatHoursMinutes(0),
      });
    });

    // Style the header row (now row 2)
    const headerRow = worksheet.getRow(2);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2C5F2D' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // Style data rows (start from row 3)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip date range row
      if (rowNumber === 2) return; // Skip header row

      const isEvenRow = rowNumber % 2 === 0;
      row.eachCell((cell, colNumber) => {
        cell.font = { size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEvenRow ? 'FFF8F9FA' : 'FFFFFFFF' }
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: colNumber === 2 ? 'left' : 'center'
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
      });
    });

    // Generate filename
    const fileName = filterType === 'month'
      ? `Attendance_Summary_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx`
      : filterType === 'week'
      ? `Attendance_Summary_Week_${currentWeekStart}.xlsx`
      : `Attendance_Summary_${rangeStart}_to_${rangeEnd}.xlsx`;

    // Save file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleDayWiseExport = async () => {
    if (filteredSummaries.length === 0) return;

    // 1. Fetch holidays for the relevant year(s)
    let years = new Set<number>();
    filteredSummaries.forEach((summary) => {
      if (summary && summary.recordDetails) {
        Object.keys(summary.recordDetails).forEach(dateStr => {
          years.add(Number(dateStr.substring(0, 4)));
        });
      }
    });
    let holidays: { date: string; name: string }[] = [];
    for (const year of years) {
      try {
        const res = await fetch(`/api/holidays?year=${year}&activeOnly=true`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.data) {
            holidays = holidays.concat(data.data.map((h: any) => ({ date: h.date, name: h.name })));
          }
        }
      } catch (e) {
        // Ignore fetch errors, continue
      }
    }
    const holidayDates = new Set(holidays.map(h => h.date));

    // Import ExcelJS dynamically
    const ExcelJS = (await import('exceljs')).default;

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Daywise Attendance', {
      views: [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' }],
    });

    // Column keys + widths (no `header` here — we insert a real header row so row 1 is not overwritten by data)
    worksheet.columns = [
      { key: 'weekType', width: 12 },
      { key: 'source', width: 22 },
      { key: 'date', width: 12 },
      { key: 'day', width: 11 },
      { key: 'employeeName', width: 22 },
      { key: 'designation', width: 16 },
      { key: 'presentAbsent', width: 14 },
      { key: 'actualInTimeOriginal', width: 14 },
      { key: 'actualOutTimeOriginal', width: 14 },
      { key: 'actualInTimeEditable', width: 14 },
      { key: 'actualOutTimeEditable', width: 14 },
      { key: 'trueFalseInTime', width: 12 },
      { key: 'trueFalseOutTime', width: 12 },
      { key: 'scheduledInTime', width: 12 },
      { key: 'scheduledOutTime', width: 12 },
      { key: 'maxWFH', width: 10 },
      { key: 'actualWFH', width: 11 },
      { key: 'maxOutstation', width: 14 },
      { key: 'actualOutstation', width: 12 },
      { key: 'workingHrs', width: 11 },
      { key: 'scheduledTime', width: 12 },
      { key: 'scheduledHrsMonth', width: 16 },
      { key: 'workingHrsMonth', width: 16 },
      { key: 'excessShortHrsMonth', width: 16 },
      { key: 'excessShortHrsDay', width: 16 },
      { key: 'halfDays', width: 9 },
    ];

    const daywiseHeaderLabels = [
      'Weekday / weekoff',
      'Source',
      'Date',
      'Day',
      'Employee name',
      'Designation',
      'Present / absent',
      'Actual in (original)',
      'Actual out (original)',
      'Actual in (edited)',
      'Actual out (edited)',
      'In time unchanged',
      'Out time unchanged',
      'Scheduled in',
      'Scheduled out',
      'Max WFH',
      'Actual WFH',
      'Max outstation (1.2 d)',
      'Actual outstation',
      'Working hrs (day)',
      'Scheduled (day)',
      'Scheduled hrs (month)',
      'Working hrs (month)',
      'Excess/short (month)',
      'Excess/short (day)',
      'Half day',
    ];
    worksheet.insertRow(1, daywiseHeaderLabels);

    /** Calendar day from attendance key `YYYY-MM-DD` without UTC drift (never `new Date('YYYY-MM-DD')`). */
    const calendarDateFromIsoKey = (iso: string): Date => {
      const parts = String(iso || '')
        .trim()
        .split('-');
      if (parts.length !== 3) return new Date(iso);
      const y = Number(parts[0]);
      const mo = Number(parts[1]);
      const d = Number(parts[2]);
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return new Date(iso);
      return new Date(y, mo - 1, d);
    };

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const toIsoFromLocalDate = (dt: Date) =>
      `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

    /** Selected summary period as inclusive ISO date bounds (string compare safe for YYYY-MM-DD). */
    const getDaywiseExportIsoInclusiveRange = (): { min: string; max: string } | null => {
      if (filterType === 'month') {
        const y = selectedYear;
        const m = selectedMonth;
        const lastD = new Date(y, m, 0).getDate();
        return { min: `${y}-${pad2(m)}-01`, max: `${y}-${pad2(m)}-${pad2(lastD)}` };
      }
      if (filterType === 'week' && currentWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(currentWeekStart.trim())) {
        const [wy, wm, wd] = currentWeekStart.trim().split('-').map(Number);
        let ws = new Date(wy, wm - 1, wd);
        const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
        const lastDayMonth = new Date(selectedYear, selectedMonth, 0);
        if (ws < firstDay) ws = new Date(firstDay);
        let we = new Date(ws);
        we.setDate(we.getDate() + 6);
        if (we > lastDayMonth) we = new Date(lastDayMonth);
        return { min: toIsoFromLocalDate(ws), max: toIsoFromLocalDate(we) };
      }
      if (filterType === 'range' && rangeStart && rangeEnd) {
        const min = rangeStart.trim().substring(0, 10);
        const max = rangeEnd.trim().substring(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(min) && /^\d{4}-\d{2}-\d{2}$/.test(max)) {
          return min <= max ? { min, max } : { min: max, max: min };
        }
      }
      return null;
    };

    const daywiseIsoRange = getDaywiseExportIsoInclusiveRange();
    const includeDaywiseIsoDate = (isoKey: string) => {
      if (!daywiseIsoRange) return true;
      const k = String(isoKey || '').trim().substring(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return true;
      return k >= daywiseIsoRange.min && k <= daywiseIsoRange.max;
    };

    const round2 = (n: number): number => {
      if (!Number.isFinite(n)) return n;
      return Math.round(n * 100) / 100;
    };

    /** Parse H:MM / HH:MM to decimal hours for numeric cells (same string pattern as formatHoursMinutes output). */
    const hmStringToDecimalHours = (s: string): number | '' => {
      if (!s || typeof s !== 'string') return '';
      const t = s.trim();
      if (t === '' || /^0h\s*0m$/i.test(t)) return 0;
      const match = t.match(/^(\d+):(\d{2})$/);
      if (!match) return '';
      const h = Number(match[1]);
      const min = Number(match[2]);
      if (!Number.isFinite(h) || !Number.isFinite(min)) return '';
      return round2(h + min / 60);
    };

    const daywiseNumericOrString = (s: string): number | string => {
      if (!s || String(s).trim() === '') return '';
      const n = Number(s);
      return Number.isFinite(n) ? round2(n) : s;
    };

    const formatSecondsToHMS = (seconds: number): string => {
      const sign = seconds < 0 ? '-' : '';
      const abs = Math.abs(seconds);
      const h = Math.floor(abs / 3600);
      const m = Math.floor((abs % 3600) / 60);
      const s = abs % 60;
      return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const daywiseBorderThin = {
      top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    };

    /** Presence types that use max outstation 1.2 d and per-day actual from `record.value` (same as legacy Present - outstation). */
    const daywiseOutstationPresenceExact = new Set([
      'Present - outstation',
      'Present - Outstation (Weekdays)',
      'Present - Outstation (Weekoff)',
      'Present - ClientPlace (Weekdays)',
      'Present - ClientPlace (Weekoff)',
      'Present - client place',
      'Onsite Presence (OS-P)',
    ]);
    const isDaywiseOutstationPresence = (raw: string) => {
      const s = String(raw || '').trim();
      if (daywiseOutstationPresenceExact.has(s)) return true;
      const low = s.toLowerCase().replace(/\s+/g, ' ');
      return (
        low === 'present - outstation (weekdays)' ||
        low === 'present - outstation (weekoff)' ||
        low === 'present - clientplace (weekdays)' ||
        low === 'present - clientplace (weekoff)' ||
        low === 'present - client place' ||
        low === 'present- outstation (weekoff)' ||
        low === 'present- outstation (weekdays)' ||
        low === 'present- clientplace (weekoff)' ||
        low === 'present- clientplace (weekdays)' ||
        low === 'onsite presence (os-p)' ||
        low === 'os-p'
      );
    };

    /** Loose match when type/status strings vary but still mean client place / outstation (in/out may be 00:00). */
    const isDaywiseOutstationByPhrase = (raw: string) => {
      const low = String(raw || '').toLowerCase().replace(/\s+/g, ' ');
      if (low === 'os-p' || low.includes('(os-p)') || low.includes('onsite presence')) return true;
      if (!low.includes('present')) return false;
      if (low.includes('outstation')) return true;
      if (low.includes('clientplace') || low.includes('client place')) return true;
      return false;
    };

    const recordIsDaywiseOutstationRow = (rec: any) => {
      for (const k of ['typeOfPresence', 'status'] as const) {
        const v = rec?.[k];
        if (typeof v !== 'string' || !v.trim()) continue;
        const t = v.trim();
        if (isDaywiseOutstationPresence(t) || isDaywiseOutstationByPhrase(t)) return true;
      }
      return false;
    };

    /** Per-day actual outstation days: prefer numeric `value` (including 0), then fallbacks. */
    const formatDaywiseActualOutstation = (rec: any, workingHrsFallback: unknown): string => {
      const v = rec?.value;
      if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
      if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        if (!Number.isNaN(n)) return String(n);
        return v.trim();
      }
      if (v != null && v !== '') {
        const n = Number(v);
        if (!Number.isNaN(n)) return String(n);
      }
      if (typeof workingHrsFallback === 'number' && !Number.isNaN(workingHrsFallback)) {
        return String(workingHrsFallback);
      }
      if (workingHrsFallback != null && String(workingHrsFallback).trim() !== '') {
        const n = Number(workingHrsFallback);
        if (!Number.isNaN(n)) return String(n);
        return String(workingHrsFallback);
      }
      return '';
    };

    /** `typeOfPresence` values for WFH on daily records (see `Attendance.ts` / summary aggregates). */
    const daywiseWFHTypeExact = new Set([
      'WFH - weekdays',
      'WFH - weekoff',
      'Work From Home (WFH)',
      'Weekly Off - Work From Home (WO-WFH)',
    ]);

    const recordIsDaywiseWFHRow = (rec: any) => {
      const t = String(rec?.typeOfPresence || rec?.status || '').trim();
      return daywiseWFHTypeExact.has(t);
    };

    /**
     * Weekday WFH → "WFH". DB week-off WFH types, or weekday/legacy WFH on API holiday or Sunday → "WO-WFH".
     */
    const daywiseWFHStatusLabel = (rec: any, isHolidayDate: boolean, isSundayDate: boolean): 'WFH' | 'WO-WFH' => {
      const t = String(rec?.typeOfPresence || rec?.status || '').trim();
      if (t === 'WFH - weekoff' || t === 'Weekly Off - Work From Home (WO-WFH)') {
        return 'WO-WFH';
      }
      if (t === 'WFH - weekdays' || t === 'Work From Home (WFH)') {
        if (isHolidayDate || isSundayDate) return 'WO-WFH';
        return 'WFH';
      }
      return 'WFH';
    };

    /** Same rules as `handleDetailedExport` / monthly WO-PIO column (PIO on Sun/API holiday, or explicit weekoff present). */
    const daywiseIsPIO = (rec: any) => {
      const t = String(rec?.typeOfPresence || rec?.status || '');
      if (!t) return false;
      if (rec.halfDay) return false;
      if (t === 'ThumbMachine') {
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const effectiveCheckout = rec.editedCheckout || rec.checkout;
        const hasValidCheckin = !!(effectiveCheckin && effectiveCheckin !== '00:00');
        const hasValidCheckout = !!(effectiveCheckout && effectiveCheckout !== '00:00');
        if (!hasValidCheckin && !hasValidCheckout) return false;
      }
      return t === 'ThumbMachine' || t === 'Present - in office' || t === 'Present - in office - weekdays' || t === 'Present or NA';
    };

    const daywiseIsWOPIOExplicit = (rec: any) => {
      const t = String(rec?.typeOfPresence || rec?.status || '');
      if (!t || rec.halfDay) return false;
      return (
        t === 'Present - in office - weekoff' ||
        t === 'Present - weekoff' ||
        t === 'Weekly Off - Present (WO-Present)'
      );
    };

    // Helper to get updater email from attendance request (if edited)
    const getUpdaterEmail = (record: any) => {
      if (record && typeof record.updatedByEmail === 'string') return record.updatedByEmail;
      if (record && typeof record.updatedBy === 'string') return record.updatedBy;
      return null;
    };

    // Helper to get Source
    const getSource = (record: any) => {
      const updater = getUpdaterEmail(record);
      if (updater) return updater;
      return 'ThumbMachine';
    };

    // Helper to get Weekdays/Weekoffs
    const getWeekType = (date: string, record: any) => {
      const d = calendarDateFromIsoKey(date);
      const day = d.getDay();
      if (record && typeof record.status === 'string' && record.status.toLowerCase().includes('weekoff')) return 'Weekoff';
      return day === 0 ? 'Weekoff' : 'Weekdays';
    };

    // Loop through each summary and each day
    for (const item of filteredSummaries) {
    // These must be declared inside the forEach to be scoped per summary
    const dailyExcessShortSeconds: number[] = [];
    const rowIndexes: number[] = [];
    // Calculate actual working hours for the month for this user
    let workingHrsMonth = 0;
    const monthYear = item.monthYear || '';
    const [year, month] = monthYear.split('-').map(Number);
    const recordsMonth = item.recordDetails || {};
    sortRecordDetailsEntries(recordsMonth).forEach(([date, record]: [string, any]) => {
      if (!includeDaywiseIsoDate(date)) return;
      const d = calendarDateFromIsoKey(date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        // Use edited in/out times for calculation
        const actualIn = (record.editedCheckin ?? record.inTime ?? '').trim();
        const actualOut = (record.editedCheckout ?? record.outTime ?? '').trim();
        if (actualIn && actualOut && actualIn !== '00:00' && actualOut !== '00:00') {
          const [inH, inM] = actualIn.split(':').map(Number);
          const [outH, outM] = actualOut.split(':').map(Number);
          let diff = (outH * 60 + outM) - (inH * 60 + inM);
          if (diff < 0) diff += 24 * 60;
          workingHrsMonth += diff / 60;
        }
      }
    });
      // Calculate scheduled hours for the month for this user, EXCLUDING holidays from API
      let scheduledHrsMonth = 0;
      if (allUsers && item.userId) {
        const user = allUsers.find(u => u._id === item.userId);
        if (user && item.recordDetails) {
          for (const [dateStr, rec] of sortRecordDetailsEntries(item.recordDetails)) {
            if (!includeDaywiseIsoDate(dateStr)) continue;
            if (holidayDates.has(dateStr)) continue; // skip API holidays
            if (rec.typeOfPresence === 'Holiday') continue;
            const dateObj = calendarDateFromIsoKey(dateStr);
            const dayName = dateObj.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
            // Find applicable schedule entry for this date
            let scheduleEntry;
            if (user.schedules && Array.isArray(user.schedules)) {
              scheduleEntry = user.schedules.slice().reverse().find(entry => {
                const eff = new Date(entry.effectiveFrom);
                return eff <= dateObj;
              });
            }
            let scheduledIn = '';
            let scheduledOut = '';
            let isHoliday = false;
            if (scheduleEntry && scheduleEntry.daily && scheduleEntry.daily[dayName]) {
              const sch = scheduleEntry.daily[dayName] as { inTime?: string; outTime?: string; isHoliday?: boolean; isHalfDay?: boolean } | undefined;
              scheduledIn = sch?.inTime ?? '';
              scheduledOut = sch?.outTime ?? '';
              isHoliday = !!sch?.isHoliday;
            } else if (user.scheduleInOutTime && ['monday','tuesday','wednesday','thursday','friday'].includes(dayName)) {
              scheduledIn = user.scheduleInOutTime.inTime ?? '';
              scheduledOut = user.scheduleInOutTime.outTime ?? '';
              isHoliday = !!user.scheduleInOutTime.isHoliday;
            } else if (user.scheduleInOutTimeSat && dayName === 'saturday') {
              scheduledIn = user.scheduleInOutTimeSat.inTime ?? '';
              scheduledOut = user.scheduleInOutTimeSat.outTime ?? '';
              isHoliday = !!user.scheduleInOutTimeSat.isHoliday;
            } else if (user.scheduleInOutTimeMonth && dayName === 'monthly') {
              scheduledIn = user.scheduleInOutTimeMonth.inTime ?? '';
              scheduledOut = user.scheduleInOutTimeMonth.outTime ?? '';
              isHoliday = !!user.scheduleInOutTimeMonth.isHoliday;
            }
            // Skip holidays from schedule
            if (isHoliday) continue;
            if (scheduledIn && scheduledOut && scheduledIn !== '00:00' && scheduledOut !== '00:00') {
              const [inH, inM] = scheduledIn.split(':').map(Number);
              const [outH, outM] = scheduledOut.split(':').map(Number);
              let diff = (outH * 60 + outM) - (inH * 60 + inM);
              if (diff < 0) diff += 24 * 60;
              scheduledHrsMonth += diff / 60;
            }
          }
        }
      }

      // Only one of excess or short for the month should be nonzero
      // Fetch monthly excess directly from attendance summary
      let excessShortHrsMonth = '';
      if (item.summary && typeof item.summary.excessHour === 'number') {
        const val = item.summary.excessHour;
        const sign = val < 0 ? '-' : '';
        const abs = Math.abs(val);
        const h = Math.floor(abs);
        const m = Math.round((abs % 1) * 60);
        excessShortHrsMonth = `${sign}${h}:${m.toString().padStart(2, '0')}`;
      }
      const records = item.recordDetails || {};
      sortRecordDetailsEntries(records).forEach(([date, record]: [string, any]) => {
        if (!includeDaywiseIsoDate(date)) return;
        const d = calendarDateFromIsoKey(date);
        const dayName = d.toLocaleString('en-US', { weekday: 'long' });
        // Robust extraction for each column
        // Helper to format time as H:M
        const formatTime = (val: any) => {
          if (!val || typeof val !== 'string') return '';
          const [h, m] = val.split(':');
          if (h === undefined || m === undefined) return val;
          // Always pad to two digits
          return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
        };
        // Always use edited times for calculations and display
        const actualInTimeEditable = formatTime(record.editedCheckin ?? record.inTime ?? '');
        const actualOutTimeEditable = formatTime(record.editedCheckout ?? record.outTime ?? '');
        // For display, keep original for reference
        const actualInTimeOriginal = formatTime(record.originalInTime ?? record.checkin ?? '');
        const actualOutTimeOriginal = formatTime(record.originalOutTime ?? record.checkout ?? '');
        // Get scheduled in/out from user schedule for this day
        let scheduledInTime = '';
        let scheduledOutTime = '';
        let scheduledTime = '';
        // Set scheduled time to zero for holidays and weekoffs
        const isHoliday = holidayDates.has(date);
        const isSunday = d.getDay() === 0;
        const isWeekoff = isSunday || (record && typeof record.status === 'string' && record.status.toLowerCase().includes('weekoff'));
        let weekType = getWeekType(date, record);
        if (isHoliday) {
          weekType = 'Weekoff';
        }
        if (isHoliday || isWeekoff) {
          scheduledTime = '0h 0m';
          scheduledInTime = '';
          scheduledOutTime = '';
        } else if (allUsers && item.userId) {
          const user = allUsers.find(u => u._id === item.userId);
          if (user) {
            // Find applicable schedule entry for this date
            let scheduleEntry;
            if (user.schedules && Array.isArray(user.schedules)) {
              scheduleEntry = user.schedules.slice().reverse().find(entry => {
                const eff = new Date(entry.effectiveFrom);
                return eff <= d;
              });
            }
            // Fallback to legacy
            let dayKey = dayName.toLowerCase();
            if (scheduleEntry && scheduleEntry.daily && scheduleEntry.daily[dayKey]) {
              const sch = scheduleEntry.daily[dayKey] as { inTime?: string; outTime?: string } | undefined;
              scheduledInTime = sch?.inTime ?? '';
              scheduledOutTime = sch?.outTime ?? '';
            } else if (user.scheduleInOutTime && ['monday','tuesday','wednesday','thursday','friday'].includes(dayKey)) {
              scheduledInTime = user.scheduleInOutTime.inTime ?? '';
              scheduledOutTime = user.scheduleInOutTime.outTime ?? '';
            } else if (user.scheduleInOutTimeSat && dayKey === 'saturday') {
              scheduledInTime = user.scheduleInOutTimeSat.inTime ?? '';
              scheduledOutTime = user.scheduleInOutTimeSat.outTime ?? '';
            } else if (user.scheduleInOutTimeMonth && dayKey === 'monthly') {
              scheduledInTime = user.scheduleInOutTimeMonth.inTime ?? '';
              scheduledOutTime = user.scheduleInOutTimeMonth.outTime ?? '';
            }
            // Calculate scheduled time (hours) for this day
            if (scheduledInTime && scheduledOutTime && scheduledInTime !== '00:00' && scheduledOutTime !== '00:00') {
              const [inH, inM] = scheduledInTime.split(':').map(Number);
              const [outH, outM] = scheduledOutTime.split(':').map(Number);
              let diff = (outH * 60 + outM) - (inH * 60 + inM);
              if (diff < 0) diff += 24 * 60; // handle overnight
              const hours = Math.floor(diff / 60);
              const mins = diff % 60;
              scheduledTime = `${hours}:${mins.toString().padStart(2, '0')}`;
            } else {
              scheduledTime = '';
            }
          }
        }
        // --- Custom logic for WFH and Outstation ---
        let maxWFH = '';
        let actualWFH = '';
        let maxOutstation = '';
        let actualOutstation = '';
        // Default working hours
        const workingHrs = record.workingHours ?? record.workingHour ?? record.totalHour ?? '';
        // Mark halfday as true for Saturday
        let isHalfDay = false;
        if (typeof record.halfDay === 'boolean') {
          isHalfDay = record.halfDay;
        } else if (record.halfDay !== undefined) {
          isHalfDay = Boolean(record.halfDay);
        }
        if (dayName.toLowerCase() === 'saturday') {
          isHalfDay = true;
        }
        const halfDays = isHalfDay ? 'True' : 'False';

        // Present/Absent/Holiday logic
        let presentAbsent = 'Absent';
        const inTime = String(actualInTimeEditable).trim();
        const outTime = String(actualOutTimeEditable).trim();
        // Custom present logic for WFH and Outstation (client place / outstation: 00:00 in-out is OK; still fill max/actual outstation)
        const typeOfPresence = record.typeOfPresence || record.status || '';
        // Outstation / client place / OS-P must win over calendar Sunday or API holidays (e.g. work at client on a Sunday).
        if (recordIsDaywiseOutstationRow(record)) {
          maxOutstation = '1.2';
          actualOutstation = formatDaywiseActualOutstation(record, workingHrs);
          presentAbsent = 'OS-P';
        } else if (recordIsDaywiseWFHRow(record)) {
          maxWFH = '0.75';
          actualWFH = formatDaywiseActualOutstation(record, workingHrs);
          presentAbsent = daywiseWFHStatusLabel(record, isHoliday, isSunday);
        } else if (
          daywiseIsWOPIOExplicit(record) ||
          (daywiseIsPIO(record) && (isHoliday || isSunday))
        ) {
          presentAbsent = 'WO-PIO';
        } else if (isHoliday || isSunday) {
          presentAbsent = 'Holiday';
        } else if (
          (record.status && record.status.toLowerCase().includes('present')) ||
          (inTime !== '00:00' && outTime !== '00:00')
        ) {
          presentAbsent = 'Present';
        } else if (inTime === '00:00' && outTime === '00:00') {
          presentAbsent = 'Absent';
        }

        // --- Excess/Short calculation for the day ---
        // Always output ±HH:MM:SS
        let daySeconds = 0;
        const isAbsent = presentAbsent === 'Absent';
        if (isAbsent && scheduledInTime && scheduledOutTime && scheduledInTime !== '00:00' && scheduledOutTime !== '00:00') {
          const [schInH, schInM] = scheduledInTime.split(':').map(Number);
          const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
          let scheduledMinutes = schOutH * 60 + schOutM - (schInH * 60 + schInM);
          if (scheduledMinutes < 0) scheduledMinutes += 24 * 60;
          daySeconds = -scheduledMinutes * 60;
        } else if (scheduledInTime && scheduledOutTime && scheduledInTime !== '00:00' && scheduledOutTime !== '00:00' && inTime && outTime && inTime !== '00:00' && outTime !== '00:00') {
          const [schInH, schInM] = scheduledInTime.split(':').map(Number);
          const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
          const [actInH, actInM] = inTime.split(':').map(Number);
          const [actOutH, actOutM] = outTime.split(':').map(Number);
          let scheduledMinutes = schOutH * 60 + schOutM - (schInH * 60 + schInM);
          if (scheduledMinutes < 0) scheduledMinutes += 24 * 60;
          let actualMinutes = actOutH * 60 + actOutM - (actInH * 60 + actInM);
          if (actualMinutes < 0) actualMinutes += 24 * 60;
          let isArticle = false;
          if (allUsers && item.userId) {
            const user = allUsers.find(u => u._id === item.userId);
            const empType = getEmploymentTypeForDate(user, d);
            if (user && (user.designation?.toLowerCase() === 'article' || empType === 'article')) {
              isArticle = true;
            }
          }
          if (actualMinutes < scheduledMinutes) {
            daySeconds = -(scheduledMinutes - actualMinutes) * 60;
          } else if (actualMinutes > scheduledMinutes) {
            if (isArticle) {
              let excess = 0;
              if (actInH * 60 + actInM < schInH * 60 + schInM) {
                excess += (schInH * 60 + schInM) - (actInH * 60 + actInM);
              }
              if (actOutH * 60 + actOutM > schOutH * 60 + schOutM) {
                const late = (actOutH * 60 + actOutM) - (schOutH * 60 + schOutM);
                if (late > 30) excess += late;
              }
              daySeconds = excess * 60;
            } else {
              daySeconds = (actualMinutes - scheduledMinutes) * 60;
            }
          } else {
            daySeconds = 0;
          }
        } else {
          daySeconds = 0;
        }
        dailyExcessShortSeconds.push(daySeconds);

        let workingHrsExport: number | string = '';
        if (typeof workingHrs === 'number' && !Number.isNaN(workingHrs)) {
          workingHrsExport = round2(workingHrs);
        } else {
          const hm = formatTime(workingHrs);
          const dec = hmStringToDecimalHours(hm);
          workingHrsExport = dec === '' ? hm : dec;
        }

        let scheduledTimeExport: number | string = '';
        if (scheduledTime === '') {
          scheduledTimeExport = '';
        } else if (/^0h\s*0m$/i.test(String(scheduledTime).trim())) {
          scheduledTimeExport = 0;
        } else {
          const dec = hmStringToDecimalHours(String(scheduledTime));
          scheduledTimeExport = dec === '' ? scheduledTime : dec;
        }

        worksheet.addRow({
          weekType,
          source: getSource(record),
          date: formatIsoKeyAsDdMmYyyy(date),
          day: dayName,
          employeeName: item.userName,
          designation: item.designation || '',
          presentAbsent,
          actualInTimeOriginal: String(actualInTimeOriginal),
          actualOutTimeOriginal: String(actualOutTimeOriginal),
          actualInTimeEditable: String(actualInTimeEditable),
          actualOutTimeEditable: String(actualOutTimeEditable),
          trueFalseInTime: String(actualInTimeOriginal) === String(actualInTimeEditable) ? 'True' : 'False',
          trueFalseOutTime: String(actualOutTimeOriginal) === String(actualOutTimeEditable) ? 'True' : 'False',
          scheduledInTime: formatTime(scheduledInTime),
          scheduledOutTime: formatTime(scheduledOutTime),
          maxWFH: maxWFH === '' ? '' : round2(Number(maxWFH)),
          actualWFH: actualWFH === '' ? '' : daywiseNumericOrString(String(actualWFH)),
          maxOutstation: maxOutstation === '' ? '' : round2(Number(maxOutstation)),
          actualOutstation: actualOutstation === '' ? '' : daywiseNumericOrString(String(actualOutstation)),
          workingHrs: workingHrsExport,
          scheduledTime: scheduledTimeExport,
          scheduledHrsMonth: scheduledHrsMonth ? round2(scheduledHrsMonth) : '',
          workingHrsMonth: workingHrsMonth ? round2(workingHrsMonth) : '',
          excessShortHrsMonth: '',
          excessShortHrsDay: round2(daySeconds / 3600),
          halfDays,
        });
        rowIndexes.push(worksheet.rowCount);
      });
      // After all rows for this user/month, sum daily seconds and update monthly column
      if (dailyExcessShortSeconds.length > 0) {
        const totalMonthSeconds = dailyExcessShortSeconds.reduce((a: number, b: number) => a + b, 0);
        const excessShortHrsMonthHours = round2(totalMonthSeconds / 3600);
        for (const rowIdx of rowIndexes) {
          worksheet.getRow(rowIdx).getCell('excessShortHrsMonth').value = excessShortHrsMonthHours;
        }
      }
    };

    // Header row (row 1) — data starts row 2 (keep header compact; no wrap avoids tall rows)
    const headerRow = worksheet.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false, shrinkToFit: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF1E40AF' } },
        bottom: { style: 'medium', color: { argb: 'FF1E40AF' } },
        left: { style: 'thin', color: { argb: 'FF1E40AF' } },
        right: { style: 'thin', color: { argb: 'FF1E40AF' } },
      };
    });

    const daywiseLeftAlignKeys = new Set(['source', 'employeeName', 'designation']);

    const daywiseNumericColumnFmt: Record<string, string> = {
      date: '@',
      maxWFH: '0.00',
      maxOutstation: '0.00',
      actualWFH: '0.00',
      actualOutstation: '0.00',
      workingHrs: '0.00',
      scheduledTime: '0.00',
      scheduledHrsMonth: '0.00',
      workingHrsMonth: '0.00',
      excessShortHrsMonth: '0.00',
      excessShortHrsDay: '0.00',
    };

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.height = 15;
      const isEvenRow = rowNumber % 2 === 0;
      row.eachCell((cell, colNumber) => {
        const colKey = worksheet.columns[colNumber - 1]?.key as string | undefined;
        const alignLeft = colKey && daywiseLeftAlignKeys.has(colKey);
        cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF0F172A' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEvenRow ? 'FFF8FAFC' : 'FFFFFFFF' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: alignLeft ? 'left' : 'center',
          wrapText: false,
          shrinkToFit: true,
          indent: alignLeft ? 1 : 0,
        };
        cell.border = daywiseBorderThin;
        if (colKey && daywiseNumericColumnFmt[colKey]) {
          cell.numFmt = daywiseNumericColumnFmt[colKey];
        }
      });

      const presentAbsentCell = row.getCell('presentAbsent');
      const pa = presentAbsentCell.value;
      if (pa === 'Absent') {
        presentAbsentCell.font = { size: 10, name: 'Calibri', color: { argb: 'FFBE123C' }, bold: true };
        presentAbsentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF1F2' },
        };
      } else if (pa === 'Holiday') {
        presentAbsentCell.font = { size: 10, name: 'Calibri', color: { argb: 'FFB45309' }, bold: true };
        presentAbsentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF3C7' },
        };
      } else if (pa === 'Present' || pa === 'OS-P' || pa === 'WFH' || pa === 'WO-WFH' || pa === 'WO-PIO') {
        presentAbsentCell.font = { size: 10, name: 'Calibri', color: { argb: 'FF047857' }, bold: true };
        presentAbsentCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFECFDF5' },
        };
      }
    });

    // Widen columns slightly if content is longer than default (cap so layout stays usable)
    worksheet.columns.forEach((col, idx) => {
      const headerLen = (daywiseHeaderLabels[idx] || '').length;
      let maxLen = headerLen;
      if (col.eachCell) {
        col.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
          if (rowNumber === 1) return;
          const v = cell.value != null ? String(cell.value) : '';
          maxLen = Math.max(maxLen, Math.min(v.length, 55));
        });
      }
      const base = col.width || 10;
      col.width = Math.min(42, Math.max(base, maxLen * 0.9 + 1.5));
    });

    const fileName = `daywise_attendance_${new Date().toISOString().split('T')[0]}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

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

  const RangeModal: React.FC<{isOpen: boolean; onClose: () => void}> = ({isOpen, onClose}) => {
    const [customStartDate, setCustomStartDate] = useState(currentDate.toISOString().split('T')[0]);
    const [customEndDate, setCustomEndDate] = useState(currentDate.toISOString().split('T')[0]);

    const applyCustom = () => {
      setRangeStart(customStartDate);
      setRangeEnd(customEndDate);
      onFilterChange({startDate: customStartDate, endDate: customEndDate});
      setRangeModalOpen(false);
      setFilterType('range');
    };

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose} role="presentation">
        <div
          className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-blue-200/65 bg-panel shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="summary-range-modal-title"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-blue-200/50 bg-sky-100/50 px-4 py-3">
              <h3 id="summary-range-modal-title" className="text-sm font-semibold text-slate-900">
                Custom date range
              </h3>
              <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Close"><X className="w-4 h-4"/></button>
          </div>
          <div className="p-4 flex-1">
            <p className="text-xs text-slate-500 mb-3">Pick a preset or choose start and end dates.</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button type="button" onClick={setLast3Months} className="px-3 py-2 text-sm rounded-md border border-blue-200/65 bg-panel text-slate-800 hover:bg-slate-100 transition-colors">Last 3 months</button>
              <button type="button" onClick={setLast6Months} className="px-3 py-2 text-sm rounded-md border border-blue-200/65 bg-panel text-slate-800 hover:bg-slate-100 transition-colors">Last 6 months</button>
              <button type="button" onClick={setLast12Months} className="px-3 py-2 text-sm rounded-md border border-blue-200/65 bg-panel text-slate-800 hover:bg-slate-100 transition-colors">Last 12 months</button>
              <button type="button" onClick={setLastMonth} className="px-3 py-2 text-sm rounded-md border border-blue-200/65 bg-panel text-slate-800 hover:bg-slate-100 transition-colors">Last month</button>
              <button type="button" onClick={setCurrentMonth} className="px-3 py-2 text-sm rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100/80 transition-colors col-span-2">This month</button>
            </div>
            <div className="space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">Start and end</h4>
              <div>
                <DatePicker
                  selected={new Date(customStartDate)}
                  onChange={(date: Date | null) => date && setCustomStartDate(date.toISOString().split('T')[0])}
                  className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  dateFormat="yyyy-MM-dd"
                />
              </div>
              <div className="text-center text-xs text-slate-500">to</div>
              <div>
                <DatePicker
                  selected={new Date(customEndDate)}
                  onChange={(date: Date | null) => date && setCustomEndDate(date.toISOString().split('T')[0])}
                  className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  dateFormat="yyyy-MM-dd"
                />
              </div>
              <button type="button" onClick={applyCustom} className="w-full mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">Apply range</button>
            </div>
          </div>
          <div className="flex shrink-0 justify-end border-t border-blue-200/50 bg-sky-100/50 px-4 py-2.5">
              <button type="button" onClick={onClose} className="text-sm text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  const AdvancedFiltersModal: React.FC<{isOpen: boolean; onClose: () => void}> = ({isOpen, onClose}) => {
    if (!isOpen) return null;

    const NumericFilterInput: React.FC<{
      label: string;
      filter: {operator: string, value: number};
      onChange: (filter: {operator: string, value: number}) => void;
    }> = ({label, filter, onChange}) => (
      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</label>
        <div className="flex gap-2">
          <select
            value={filter.operator}
            onChange={(e) => onChange({...filter, operator: e.target.value})}
            className="flex-1 rounded-md border border-blue-200/65 bg-panel px-2 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">All</option>
            <option value="equals">=</option>
            <option value="greater">&gt;</option>
            <option value="less">&lt;</option>
            <option value="greaterEqual">≥</option>
            <option value="lessEqual">≤</option>
          </select>
          {filter.operator !== 'all' && (
            <input
              type="number"
              min="0"
              step="0.5"
              value={filter.value}
              onChange={(e) => onChange({...filter, value: parseFloat(e.target.value) || 0})}
              className="w-24 rounded-md border border-blue-200/65 bg-panel px-2 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="0"
            />
          )}
        </div>
      </div>
    );

    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose} role="presentation">
        <div
          className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-blue-200/65 bg-panel shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="summary-advanced-filters-title"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-blue-200/50 bg-sky-100/50 px-4 py-3">
              <h3 id="summary-advanced-filters-title" className="text-sm font-semibold text-slate-900">
                Refine results
              </h3>
              <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Close"><X className="w-4 h-4"/></button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Filters */}
              <div className="space-y-4">
                <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-2">Organization</h4>
                
                <div className="space-y-2">
                  <label htmlFor="summary-filter-team" className="block text-xs font-medium text-slate-600">
                    Team
                  </label>
                  <select
                    id="summary-filter-team"
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="all">All teams</option>
                    {getUniqueTeams().map(team => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="summary-filter-designation" className="block text-xs font-medium text-slate-600">
                    Designation
                  </label>
                  <select
                    id="summary-filter-designation"
                    value={designationFilter}
                    onChange={(e) => setDesignationFilter(e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="all">All designations</option>
                    {getUniqueDesignations().map(designation => (
                      <option key={designation} value={designation}>{designation}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Numeric Filters */}
              <div className="space-y-4">
                <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-2">Metrics</h4>
                
                <NumericFilterInput
                  label="Late Arrivals"
                  filter={lateFilter}
                  onChange={setLateFilter}
                />
                
                <NumericFilterInput
                  label="Present Days"
                  filter={presentFilter}
                  onChange={setPresentFilter}
                />
                
                <NumericFilterInput
                  label="Absent Days"
                  filter={absentFilter}
                  onChange={setAbsentFilter}
                />
                
                <NumericFilterInput
                  label="Leave Days"
                  filter={leaveFilter}
                  onChange={setLeaveFilter}
                />
                
                <NumericFilterInput
                  label="Half Days"
                  filter={halfDayFilter}
                  onChange={setHalfDayFilter}
                />
                
                <NumericFilterInput
                  label="Work Hours"
                  filter={workHoursFilter}
                  onChange={setWorkHoursFilter}
                />
                
                <NumericFilterInput
                  label="Excess/Deficit Hours"
                  filter={excessFilter}
                  onChange={setExcessFilter}
                />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between border-t border-blue-200/50 bg-sky-100/50 px-4 py-3">
            <button
              type="button"
              onClick={clearAllFilters}
              className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-md hover:bg-slate-100 transition-colors"
            >
              Clear all
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-md hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-5 text-slate-900" aria-labelledby="attendance-summary-heading">
      {/* Page header — title, hint, workflow */}
      <header className="space-y-2">
        <h1 id="attendance-summary-heading" className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
          Attendance summary
        </h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Review team totals for the selected period. Search by name, open a row for the monthly calendar, or export for reporting.
          <span className="text-slate-400"> · </span>
          <span className="font-medium text-slate-800">{currentPeriodLabel}</span>
        </p>
        <ol className="flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Summary workflow">
          {SUMMARY_WORKFLOW_STEPS.map((t, i) => (
            <li
              key={t}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200/50 bg-sky-100/50 px-2 py-1"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>
      </header>

      {/* Period + scope */}
      <div className="rounded-md border border-blue-200/65 bg-panel p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="inline-flex rounded-md border border-blue-200/65 bg-panel p-0.5" role="group" aria-label="Period type">
              <button
                type="button"
                onClick={switchToMonth}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  filterType === 'month' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setFilterType('week')}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  filterType === 'week' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setRangeModalOpen(true)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  filterType === 'range' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Custom range
              </button>
            </div>

            <div className="flex items-center rounded-md border border-blue-200/65 bg-panel">
              <button
                type="button"
                onClick={filterType === 'week' ? handlePrevWeek : handlePrevMonth}
                className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-l-md transition-colors"
                aria-label="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm text-slate-800">
                <Calendar className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <span className="truncate font-medium">{currentPeriodLabel}</span>
              </div>
              <button
                type="button"
                onClick={filterType === 'week' ? handleNextWeek : handleNextMonth}
                className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-r-md transition-colors"
                aria-label="Next period"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {filterType !== 'week' && (
              <div className="flex gap-2">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  aria-label="Year"
                >
                  {Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  aria-label="Month"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="relative w-full lg:max-w-xs">
            <label htmlFor="summary-employee-search" className="sr-only">
              Search by employee name or code
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              id="summary-employee-search"
              type="search"
              placeholder="Search by employee name or code"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-blue-200/65 bg-panel py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <Download className="h-4 w-4 text-slate-500" />
            Export summary
          </button>
          {!hideDetailedExport && (
            <button
              type="button"
              onClick={handleDetailedExport}
              className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 transition-colors"
            >
              <Download className="h-4 w-4 text-slate-500" />
              Export detailed
            </button>
          )}
          <button
            type="button"
            onClick={handleDayWiseExport}
            disabled={selectedEmployees.size === 0}
            className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            title={selectedEmployees.size === 0 ? 'Select one or more rows first' : undefined}
          >
            <Download className="h-4 w-4 text-slate-500" />
            Day-wise (selected)
          </button>
          <button
            type="button"
            onClick={() => setIsBulkManagerOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <ListChecks className="h-4 w-4 text-slate-500" />
            Bulk status
          </button>
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(true)}
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              hasActiveFilters()
                ? 'border-blue-500/50 bg-blue-50 text-blue-700 hover:bg-blue-100/80'
                : 'border-blue-200/65 bg-panel text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Filter className="h-4 w-4 text-slate-500" />
            Filters
          </button>
        </div>
      </div>

      {/* KPI strip — calm metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-md border border-blue-200/50 bg-sky-100/50 px-4 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">People in view</p>
            <Users className="h-4 w-4 text-slate-500" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{stats.totalEmployees}</p>
        </div>
        <div className="rounded-md border border-blue-200/50 bg-sky-100/50 px-4 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Late arrivals</p>
            <AlertCircle className="h-4 w-4 text-slate-500" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{stats.totalLate}</p>
        </div>
        <div className="rounded-md border border-blue-200/50 bg-sky-100/50 px-4 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Absence days</p>
            <UserX className="h-4 w-4 text-slate-500" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{stats.totalAbsents}</p>
        </div>
        <div className="col-span-2 rounded-md border border-blue-200/50 bg-sky-100/50 px-4 py-3 shadow-sm lg:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total hours logged</p>
            <Clock className="h-4 w-4 text-slate-500" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{formatHoursMinutes(stats.totalHours)}</p>
        </div>
      </div>

      {/* Employee table */}
      <section className="overflow-hidden rounded-md border border-blue-200/65 bg-panel shadow-sm" aria-labelledby="summary-employees-heading">
        <div className="flex flex-col gap-2 border-b border-blue-200/50 bg-sky-100/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="summary-employees-heading" className="text-sm font-semibold text-slate-900">
              Employees
            </h2>
            <p className="text-xs text-slate-500">
              {isLoading ? 'Loading…' : `${filteredSummaries.length} in this period`}
              {!isLoading && filteredSummaries.length > 0 && displayedSummaries.length < filteredSummaries.length && (
                <span className="text-slate-500"> · Showing {displayedSummaries.length}</span>
              )}
            </p>
          </div>
          {!isLoading && filteredSummaries.length > 0 && (
            <button
              type="button"
              onClick={() => setSummaryTableFullscreen(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:border-slate-300 hover:bg-slate-100"
              title="Open table full screen to scroll all columns"
            >
              <Maximize2 className="h-4 w-4 text-slate-500" aria-hidden />
              Full screen
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center text-sm text-slate-500">
             <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" aria-hidden />
             <p>Loading summary…</p>
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center text-sm text-slate-500">
            <BarChart3 className="h-10 w-10 text-slate-400" aria-hidden />
            <p>No rows for <span className="text-slate-600">{currentPeriodLabel}</span>.</p>
            {uploadTotal > 0 && (
              <p className="text-xs text-slate-500">Last upload: {uploadSaved} saved, {uploadFailed} failed.</p>
            )}
          </div>
        ) : (
          <>
            {summaryTableFullscreen && (
              <div className="min-h-[min(70dvh,520px)] rounded-md border border-dashed border-blue-200/50 bg-sky-100/50/70 px-4 py-8 text-center">
                <p className="text-sm text-slate-500">Table is open in full screen.</p>
                <button
                  type="button"
                  onClick={() => setSummaryTableFullscreen(false)}
                  className="mt-2 text-sm font-medium text-blue-700 hover:underline"
                >
                  Return here
                </button>
              </div>
            )}
            <div
              className={
                summaryTableFullscreen
                  ? 'fixed inset-0 z-50 flex flex-col bg-slate-100'
                  : 'overflow-x-auto'
              }
            >
              {summaryTableFullscreen && (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-blue-200/65 bg-panel px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">Employees — full screen</p>
                    <p className="truncate text-xs text-slate-500">
                      Scroll horizontally for all columns · {currentPeriodLabel} · Esc to close
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSummaryTableFullscreen(false)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                  >
                    <Minimize2 className="h-4 w-4 text-slate-500" aria-hidden />
                    Exit
                  </button>
                </div>
              )}
              <div className={summaryTableFullscreen ? 'min-h-0 flex-1 overflow-auto' : undefined}>
            <table className={`w-full text-left text-sm ${summaryTableFullscreen ? 'min-w-[1280px]' : 'min-w-[1100px]'}`}>
              <thead className="border-b border-blue-200/50 bg-sky-100/50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.size === filteredSummaries.length && filteredSummaries.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                      aria-label="Select all rows"
                    />
                  </th>
                  <th className="px-2 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-slate-500">Open</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('employeeCode')}>
                    <div className="flex items-center gap-1">Code{sortField === 'employeeCode' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-600 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('userName')}>
                    <div className="flex items-center gap-1">Employee{sortField === 'userName' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('team')}>
                    <div className="flex items-center gap-1">Team{sortField === 'team' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('designation')}>
                    <div className="flex items-center gap-1">Designation{sortField === 'designation' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Days</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Holidays</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Working</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-600 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('totalPresent')}>
                    <div className="flex items-center gap-1 justify-end">Present{sortField === 'totalPresent' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('totalHalfDay')}>
                    <div className="flex items-center gap-1 justify-end">Half{sortField === 'totalHalfDay' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('totalAbsent')}>
                    <div className="flex items-center gap-1 justify-end">Absent{sortField === 'totalAbsent' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('calcLate')}>
                    <div className="flex items-center gap-1 justify-end">Late{sortField === 'calcLate' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('totalLeave')}>
                    <div className="flex items-center gap-1 justify-end">Leave{sortField === 'totalLeave' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('calcScheduled')}>
                    <div className="flex items-center gap-1 justify-end">Sched.{sortField === 'calcScheduled' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('definedSchedule')}>
                    <div className="flex items-center gap-1 justify-end">Defined{sortField === 'definedSchedule' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('totalHour')}>
                    <div className="flex items-center gap-1 justify-end">Worked{sortField === 'totalHour' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-slate-600 cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('calcExcessDeficit')}>
                    <div className="flex items-center gap-1 justify-end">+/− hrs{sortField === 'calcExcessDeficit' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(displayedSummaries as any[]).map((item) => (
                  <tr
                    key={item.id}
                    className="group transition-colors hover:bg-sky-100/55"
                  >
                    <td className="px-4 py-2.5 text-left" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedEmployees.has(item.userId)}
                        onChange={(e) => handleSelectEmployee(item.userId, e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                        aria-label={`Select ${item.userName}`}
                      />
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => onEmployeeClick(item.userId, item.monthYear)}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        title={`Monthly calendar for ${item.userName}`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-left font-mono text-xs text-slate-500">{item.employeeCode || item.odId || '-'}</td>
                    <td className="px-4 py-2.5">
                      <button type="button" className="text-left font-medium text-slate-800 hover:text-blue-700 cursor-pointer" onClick={() => onEmployeeDetailClick?.(item.userId)}>{item.userName}</button>
                      <div className="font-mono text-[10px] text-slate-500 hidden md:block">{item.employeeCode || item.odId || item.userId}</div>
                    </td>
                    <td className="px-4 py-2.5 text-left text-sm text-slate-500">{item.team || '—'}</td>
                    <td className="px-4 py-2.5 text-left text-sm text-slate-500">{item.designation || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500">{Object.keys(item.recordDetails || {}).length}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500">
                        {(() => {
                          // Count holidays: Sundays + dates in holiday database
                          const records = item.recordDetails || {};
                          const holidayDates = new Set(holidays.map(h => h.date));
                          let holidayCount = 0;
                          Object.keys(records).forEach((dateStr) => {
                            const d = new Date(dateStr);
                            if (d.getDay() === 0) {
                              // Sunday
                              holidayCount++;
                            } else if (holidayDates.has(dateStr)) {
                              // Holiday from database
                              holidayCount++;
                            }
                          });
                          return holidayCount;
                        })()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500 cursor-pointer hover:bg-sky-100/55" onClick={(e) => openDetail(e, 'WorkingDays', item)}>
                        {(() => {
                          // Count working days: exclude holidays (from DB), Sundays, and weekoff types
                          const records = item.recordDetails || {};
                          const holidayDates = new Set(holidays.map(h => h.date));
                          const workingDays = Object.entries(records).filter(([dateStr, rec]: [string, any]) => {
                            const d = new Date(dateStr);
                            if (d.getDay() === 0) return false; // Exclude Sundays
                            if (holidayDates.has(dateStr)) return false; // Exclude holidays from DB
                            if (typeof rec.typeOfPresence === 'string' && rec.typeOfPresence.toLowerCase().includes('weekoff')) return false;
                            return true;
                          }).length;
                          return workingDays > 0 ? (
                            <span className="underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-slate-700" title="How working days were counted">{workingDays}</span>
                          ) : '-';
                        })()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-800 cursor-pointer hover:bg-sky-100/55" onClick={(e) => item.summary.totalPresent > 0 && openDetail(e, 'Present', item)}>
                        {item.summary.totalPresent > 0 ? (
                           <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Day-by-day present">{item.summary.totalPresent}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500 cursor-pointer hover:bg-sky-100/55" onClick={(e) => item.summary.totalHalfDay > 0 && openDetail(e, 'HalfDay', item)}>
                        {item.summary.totalHalfDay > 0 ? (
                          <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Half-day breakdown">
                            {item.summary.totalHalfDay}
                            {(() => {
                              // Count 'Half Day - weekdays' in recordDetails
                              const halfDayWeekdays = Object.values(item.recordDetails || {}).filter((r: any) => r.typeOfPresence === 'Half Day - weekdays').length;
                              return halfDayWeekdays > 0 ? (
                                <span className="block text-xs font-normal text-slate-500">Weekdays: {halfDayWeekdays}</span>
                              ) : null;
                            })()}
                          </span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-600 cursor-pointer hover:bg-sky-100/55" onClick={(e) => item.summary.totalAbsent > 0 && openDetail(e, 'Absent', item)}>
                        {item.summary.totalAbsent > 0 ? (
                           <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Absent days">{item.summary.totalAbsent}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums" onClick={(e) => item.calcLate > 0 && openDetail(e, 'Late', item)}>
                      {item.calcLate > 0 ? (
                        <span className="cursor-pointer rounded border border-blue-200/65 bg-panel px-1.5 py-0.5 text-slate-800 hover:border-slate-300" title="Late arrival dates">{item.calcLate}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500 cursor-pointer hover:bg-sky-100/55" onClick={(e) => calculateLeaveConsumed(item) > 0 && openDetail(e, 'Leave', item)}>
                        {calculateLeaveConsumed(item) > 0 ? (
                           <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Leave days">{calculateLeaveConsumed(item)}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500 cursor-pointer hover:bg-sky-100/55" onClick={(e) => item.calcScheduled > 0 && openDetail(e, 'ScheduledHours', item)}>
                        {item.calcScheduled > 0 ? (
                           <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Scheduled hours breakdown">{formatHoursMinutes(item.calcScheduled)}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-500">
                        {(item.calcDefinedSchedule || 0) > 0 ? (
                            <span 
                              className="cursor-pointer underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-slate-700" 
                              title="Defined schedule hours"
                              onClick={(e) => openDetail(e, 'DefinedSchedule', item)}
                            >
                              {formatHoursMinutes(item.calcDefinedSchedule)}
                            </span>
                          ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-700 cursor-pointer hover:bg-sky-100/55" onClick={(e) => item.summary.totalHour > 0 && openDetail(e, 'WorkHours', item)}>
                        {item.summary.totalHour > 0 ? (
                           <span className="underline decoration-slate-300 decoration-dotted underline-offset-2" title="Worked hours by day">{formatHoursMinutes(item.summary.totalHour)}</span>
                        ) : '0h 0m'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums cursor-pointer hover:bg-sky-100/55"
                        onClick={() => {
                          const breakdown = getExcessResultForItem(item).breakdown;
                          setDetailModal({
                            isOpen: true,
                            title: `Excess / deficit — ${item.userName}`,
                            data: breakdown
                          });
                        }}
                    >
                       {item.calcExcessDeficit !== undefined ? (
                         <span className={item.calcExcessDeficit >= 0 ? "text-emerald-700" : "text-slate-500"}>
                           {/* Always use backend decimal value, format as H:MM */}
                           {item.calcExcessDeficit > 0 ? "+" : item.calcExcessDeficit < 0 ? "-" : ""}
                           {formatHoursMinutes(Math.abs(item.calcExcessDeficit))}
                         </span>
                       ) : '-'}
                    </td>
                  </tr>
                ))}
                {filteredSummaries.length > displayedSummaries.length && (
                  <tr ref={tableLoadMoreSentinelRef}>
                    <td colSpan={18} className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"
                            aria-hidden
                          />
                          Showing {displayedSummaries.length} of {filteredSummaries.length} — scroll for more
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setTableVisibleCount((c) =>
                              Math.min(
                                c + SUMMARY_TABLE_CHUNK,
                                filteredSummaries.length
                              )
                            )
                          }
                          className="rounded-md border border-blue-200/65 bg-panel px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100"
                        >
                          Load {SUMMARY_TABLE_CHUNK} more
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setTableVisibleCount(filteredSummaries.length)
                          }
                          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100/80"
                        >
                          Show all
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
              </div>
            </div>
          </>
        )}
      </section>

      <BulkLeaveManager 
        isOpen={isBulkManagerOpen}
        onClose={() => setIsBulkManagerOpen(false)}
        users={usersForBulk}
        currentMonthYear={currentMonthYear}
        onUpdateComplete={() => onFilterChange(currentMonthYear)}
      />

      <DetailModal 
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal(prev => ({ ...prev, isOpen: false }))}
        title={detailModal.title}
        data={detailModal.data}
      />

      <RangeModal isOpen={rangeModalOpen} onClose={() => setRangeModalOpen(false)} />

      <AdvancedFiltersModal isOpen={showAdvancedFilters} onClose={() => setShowAdvancedFilters(false)} />
    </section>
  );
};


