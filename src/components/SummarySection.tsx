import React, { useState, useMemo, useEffect } from 'react';
import { AttendanceSummaryView, User, DailySchedule, ScheduleTime } from '@/types/ui';
import { Search, Calendar, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, BarChart3, Users, Clock, AlertCircle, TrendingUp, UserX, UserCheck, Download, ListChecks, X, Eye } from 'lucide-react';
import { BulkLeaveManager } from './BulkLeaveManager';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ScheduleEntry } from '@/types/ui';

// Patch: Add missing type for employmentTypeHistory
type EmploymentTypeHistory = { employmentType: string; effectiveFrom: string | Date };

// Helper: Get employment type for a given date from employmentTypeHistory
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

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: { date: string; info: string; subInfo?: string }[];
}

const DetailModal: React.FC<DetailModalProps> = ({ isOpen, onClose, title, data }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex justify-between items-center shrink-0">
            <h3 className="font-semibold text-slate-100">{title}</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        <div className="overflow-y-auto p-2 flex-1">
            {data.length === 0 ? (
                <div className="text-center py-6 text-slate-500">No records found</div>
            ) : (
                <div className="flex flex-col gap-1">
                    {data.map((d, i) => (
                        <div
                          key={i}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 hover:bg-slate-800/50 rounded-lg text-sm transition-colors border border-transparent hover:border-slate-800"
                        >
                             <div className="flex items-center gap-3 shrink-0">
                                <div className="font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-xs whitespace-nowrap">{d.date}</div>
                                {d.subInfo && (
                                  <span className="text-amber-400/70 text-[10px] bg-amber-400/5 px-1.5 py-0.5 rounded border border-amber-400/10 whitespace-nowrap">
                                    {d.subInfo}
                                  </span>
                                )}
                             </div>
                             <div className="font-mono font-medium text-slate-300 flex-1 text-left wrap-break-word leading-relaxed">
                               {d.info}
                             </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
        <div className="bg-slate-950 px-4 py-2 border-t border-slate-800 text-right shrink-0">
            <button onClick={onClose} className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
};

interface SummarySectionProps {
  summaries: AttendanceSummaryView[];
  allUsers?: User[]; // Optional prop for fuller search context
  isLoading?: boolean;
  onFilterChange: (filter: string | {start: string, end: string} | {startDate: string, endDate: string}) => void;
  onEmployeeClick: (userId: string, monthYear: string) => void;
  onEmployeeDetailClick?: (userId: string) => void; // Opens employee management detail
  onRefreshUsers?: () => void; // Optional function to refresh user data
  // Upload stats kept for context if needed, but made optional/less prominent
  uploadTotal?: number;
  uploadSaved?: number;
  uploadFailed?: number;
}

export const SummarySection: React.FC<SummarySectionProps> = ({
  summaries,
  allUsers,
  isLoading = false,
  onFilterChange,
  onEmployeeClick,
  onEmployeeDetailClick,
  onRefreshUsers,
  uploadTotal = 0,
  uploadSaved = 0,
  uploadFailed = 0
}) => {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);
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

  // Schedule Helper Function
  const getApplicableSchedule = (item: AttendanceSummaryView, date?: string): ScheduleEntry | undefined => {
    // If date is provided, use it to find the applicable schedule for that specific date
    // If not, use the monthYear for general month-level schedule
    const targetDate = date ? new Date(date) : new Date(item.monthYear + '-01');
    
    // First try the schedule from the summary item (already resolved in page.tsx for the month)
    if (item.schedules && !date) {
      // If no specific date, use the pre-resolved schedule
      return item.schedules;
    }
    
    // For specific dates or if item.schedules is not available, find from allUsers
    if (allUsers && item.userId) {
      const user = allUsers.find(u => u._id === item.userId);
      if (user?.schedules && Array.isArray(user.schedules)) {
        // Find the applicable schedule for the target date
        const applicable = user.schedules
          .filter((s: any) => new Date(s.effectiveFrom) <= targetDate)
          .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
        
        return applicable || undefined;
      }
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
      const empTypeLate = getEmploymentTypeForDate(user, d);
      if (empTypeLate === 'halftime') {
        // For halftime, do not mark late if checkin is after 1:30 PM
        const [h, m] = effectiveCheckin.split(':').map(Number);
        if (h > 13 || (h === 13 && m > 30)) return; // after 13:30
        // For halftime, do not mark late at all
        return;
      }
      const day = d.getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[day] as keyof DailySchedule;
      const applicableSchedule = getApplicableSchedule(item, date);
      let daySchedule: ScheduleTime | undefined = applicableSchedule?.daily?.[dayName];
      if ((!daySchedule || !daySchedule.inTime) && day >= 1 && day <= 5) {
        daySchedule = applicableSchedule?.daily?.monday;
      }
      const scheduledIn = daySchedule?.inTime || '09:00';
      // Only count as late if rules for this employment type say so
      // Example: for 'article', late is only if checkin > scheduledIn (same as before)
      // You can add more rules here if needed for other types
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
      Object.entries(records).forEach(([date, rec]) => {
          // Absent logic: 0 hours, not Leave/Holiday
          if (rec.totalHour === 0 && (rec.typeOfPresence !== 'Leave' && rec.typeOfPresence !== 'On leave') && rec.typeOfPresence !== 'Holiday') {
               dates.push({ date, info: 'Absent', subInfo: rec.typeOfPresence === 'ThumbMachine' ? '0 Hours' : rec.typeOfPresence });
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
          
          // Present logic: has valid checkin or halfDay
          if ((effectiveCheckin && effectiveCheckin !== "00:00") || rec.halfDay) {
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
      const d = new Date(date);
      const empTypeHalfDay = getEmploymentTypeForDate(user, d);
      // For halftime, do not mark half-day if absent (totalHour === 0)
      if (empTypeHalfDay === 'halftime') {
        if (rec.totalHour === 0) {
          return;
        }
        // Do not mark half-day for halftime if checkin is after 13:30
        if (effectiveCheckin) {
          const [h, m] = effectiveCheckin.split(':').map(Number);
          if (h > 13 || (h === 13 && m > 30)) {
            // After 13:30, do not mark half-day
            return;
          }
        }
      }
      // Only count as half-day if rules for this employment type say so
      if (rec.halfDay && rec.typeOfPresence !== 'Holiday') {
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
    if (!item) return [];
    const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
    if (!user) return [];
    const monthYear = item.monthYear || '';
    const [year, month] = monthYear.split('-').map(Number);
    if (!year || !month) return [];
    const records = item.recordDetails || {};
    const details: { date: string; info: string; subInfo?: string }[] = [];
    for (const dateStr of Object.keys(records)) {
      const rec = records[dateStr];
      // Exclude if typeOfPresence is Holiday (as in working day column)
      if (rec.typeOfPresence === 'Holiday') continue;
      const dateObj = new Date(dateStr);
      const dayName = dateObj.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
      // Find applicable schedule entry for this date
      let scheduleEntry;
      if (user && user.schedules && Array.isArray(user.schedules)) {
        scheduleEntry = user.schedules.slice().reverse().find(entry => {
          const eff = new Date(entry.effectiveFrom);
          return eff <= dateObj;
        });
      }
      let daySchedule;
      if (scheduleEntry && scheduleEntry.daily && scheduleEntry.daily[dayName]) {
        daySchedule = scheduleEntry.daily[dayName];
      } else if (user.scheduleInOutTime && ['monday','tuesday','wednesday','thursday','friday'].includes(dayName)) {
        daySchedule = user.scheduleInOutTime;
      } else if (user.scheduleInOutTimeSat && dayName === 'saturday') {
        daySchedule = user.scheduleInOutTimeSat;
      } else if (user.scheduleInOutTimeMonth && dayName === 'monthly') {
        daySchedule = user.scheduleInOutTimeMonth;
      }
      if (!daySchedule || daySchedule.isHoliday) continue;
      const inTime = daySchedule.inTime;
      const outTime = daySchedule.outTime;
      let info = '0:00';
      if (inTime && outTime && inTime !== '00:00' && outTime !== '00:00') {
        const [inH, inM] = inTime.split(':').map(Number);
        const [outH, outM] = outTime.split(':').map(Number);
        let diff = (outH * 60 + outM) - (inH * 60 + inM);
        if (diff < 0) diff += 24 * 60;
        let hours = diff / 60;
        info = `${Math.floor(hours)}:${(Math.round((hours % 1) * 60)).toString().padStart(2, '0')}`;
      }
      details.push({ date: dateStr, info, subInfo: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}${daySchedule.isHalfDay ? ' (Half Day)' : ''}` });
    }
    return details;
  };

  // Helper function to get working days calculation breakdown
  const getWorkingDaysDetails = (item: AttendanceSummaryView) => {
      const details: { date: string; info: string; subInfo?: string }[] = [];
      
      // Calculate each component
      const presentDays = item.summary.totalPresent || 0;
      const absentDays = item.summary.totalAbsent || 0;
      const leaveDays = calculateLeaveConsumed(item);
      const totalWorkingDays = presentDays + absentDays + leaveDays;
      
      // Add summary breakdown at the top
      details.push({
          date: 'CALCULATION',
          info: `Present + Absent + Leave = Total`,
          subInfo: 'Formula'
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
          subInfo: `${presentDays} + ${absentDays} + ${leaveDays}`
      });
      
      // Add individual day breakdown
      details.push({
          date: '---',
          info: 'Daily Breakdown',
          subInfo: '---'
      });
      
      const records = item.recordDetails || {};
      Object.entries(records)
          .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
          .forEach(([date, rec]) => {
              // Skip holidays - they don't count as working days
              if (rec.typeOfPresence === 'Holiday') {
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
              } else if (rec.totalHour > 0 || (rec.checkin && rec.checkin !== '00:00') || rec.halfDay) {
                  status = rec.halfDay ? 'Present (Half)' : 'Present';
                  category = 'Present';
              } else {
                  status = 'Absent';
                  category = 'Absent';
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
    const details: { date: string; info: string; subInfo?: string }[] = [];

    let totalHours = 0;
    let workingDays = 0;

    // Calculate for each day that has attendance data
    const records = item.recordDetails || {};
    const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
    for (const dateStr of Object.keys(records)) {
      const d = new Date(dateStr);
      const rec = records[dateStr];

      // Skip holidays
      if (rec.typeOfPresence === 'Holiday') {
        details.push({
            date: d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
            info: 'Holiday',
            subInfo: ''
        });
        continue;
      }

      const dayName = d.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
      // Find applicable schedule entry for this date
      let scheduleEntry;
      if (user && user.schedules && Array.isArray(user.schedules)) {
        scheduleEntry = user.schedules.slice().reverse().find(entry => {
          const eff = new Date(entry.effectiveFrom);
          return eff <= d;
        });
      }
      let scheduledIn = '';
      let scheduledOut = '';
      let isHoliday = false;
      let isHalfDay = false;
      if (scheduleEntry && scheduleEntry.daily && scheduleEntry.daily[dayName]) {
        const sch = scheduleEntry.daily[dayName] as { inTime?: string; outTime?: string; isHoliday?: boolean; isHalfDay?: boolean } | undefined;
        scheduledIn = sch?.inTime ?? '';
        scheduledOut = sch?.outTime ?? '';
        isHoliday = !!sch?.isHoliday;
        isHalfDay = !!sch?.isHalfDay;
      } else if (user && user.scheduleInOutTime && ['monday','tuesday','wednesday','thursday','friday'].includes(dayName)) {
        scheduledIn = user.scheduleInOutTime.inTime ?? '';
        scheduledOut = user.scheduleInOutTime.outTime ?? '';
        isHoliday = !!user.scheduleInOutTime.isHoliday;
        isHalfDay = !!user.scheduleInOutTime.isHalfDay;
      } else if (user && user.scheduleInOutTimeSat && dayName === 'saturday') {
        scheduledIn = user.scheduleInOutTimeSat.inTime ?? '';
        scheduledOut = user.scheduleInOutTimeSat.outTime ?? '';
        isHoliday = !!user.scheduleInOutTimeSat.isHoliday;
        isHalfDay = !!user.scheduleInOutTimeSat.isHalfDay;
      } else if (user && user.scheduleInOutTimeMonth && dayName === 'monthly') {
        scheduledIn = user.scheduleInOutTimeMonth.inTime ?? '';
        scheduledOut = user.scheduleInOutTimeMonth.outTime ?? '';
        isHoliday = !!user.scheduleInOutTimeMonth.isHoliday;
        isHalfDay = !!user.scheduleInOutTimeMonth.isHalfDay;
      }
      if (isHoliday) {
        details.push({
            date: d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
            info: 'Holiday/Off',
            subInfo: ''
        });
        continue;
      }
      // Calculate scheduled hours for the day
      const timeToHours = (t?: string) => {
        if (!t) return 0;
        const [h, m] = t.split(":").map(Number);
        return h + m / 60;
      };
      const startTime = timeToHours(scheduledIn);
      const endTime = timeToHours(scheduledOut);
      let hours = 0;
      if (startTime && endTime && endTime > startTime) {
        hours = endTime - startTime;
      }
      // Use actual scheduled hours for half-day (from schedule, not divided by 2)
      // If isHalfDay, just label it, but do not divide hours
      totalHours += hours;
      workingDays++;
      const scheduleText = `${scheduledIn || '09:00'} - ${scheduledOut || '18:00'}`;
      const hoursText = formatHoursMinutes(hours);
      const note = isHalfDay ? ' (Half Day)' : '';
      details.push({
          date: d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
          info: `${hoursText}${note}`,
          subInfo: scheduleText
      });
    }

    // Add lunch deduction info
    if (workingDays > 0) {
      const lunchDeduction = workingDays; // 1 hour per working day
      const finalTotal = Math.max(0, totalHours - lunchDeduction);
      details.push({
          date: 'Subtotal',
          info: formatHoursMinutes(totalHours),
          subInfo: 'Before lunch deduction'
      });
      details.push({
          date: 'Lunch Deduction',
          info: `-${formatHoursMinutes(lunchDeduction)}`,
          subInfo: `${workingDays} working days × 1 hour`
      });
      details.push({
          date: 'Final Total',
          info: formatHoursMinutes(finalTotal),
          subInfo: 'Defined schedule (attendance days only)'
      });
    }

    return details;
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
        const dow = date.getDay(); // 0=Sun, 6=Sat
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dow] as keyof DailySchedule;
        
        // Get the day's schedule, or fall back to monday's schedule if day is empty
        let daySchedule: ScheduleTime | undefined = applicableSchedule?.daily?.[dayName];
        
        // If this day's schedule is empty (no inTime) or doesn't exist, use monday as default for weekdays
        if ((!daySchedule || !daySchedule.inTime) && dow >= 1 && dow <= 5) { // Monday to Friday
          daySchedule = applicableSchedule?.daily?.monday;
        }

        if (!daySchedule || daySchedule.isHoliday) {
          continue; // Skip holidays
        }

        const startTime = timeToHours(daySchedule.inTime);
        const endTime = timeToHours(daySchedule.outTime);
        let hours = 0;

        if (startTime && endTime && endTime > startTime) {
          hours = endTime - startTime;
        } else {
          // Default hours if no schedule defined
          hours = dow === 6 ? 4 : 9; // Saturday: 4 hours, weekdays: 9 hours
        }

        if (daySchedule.isHalfDay) {
          hours = hours / 2;
        }

        total += hours;
      }
      return total;
  };

  const calculateDefinedScheduleHours = (item: AttendanceSummaryView): number => {
    // Calculate defined schedule hours only for days with attendance records, with 1-hour lunch deduction per working day
    let total = 0;
    let workingDays = 0;
    const records = item.recordDetails || {};
    const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
    for (const dateStr of Object.keys(records)) {
      const d = new Date(dateStr);
      const rec = records[dateStr];
      // Skip holidays
      if (rec.typeOfPresence === 'Holiday') continue;
      const dayName = d.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
      // Find applicable schedule entry for this date
      let scheduleEntry;
      if (user && user.schedules && Array.isArray(user.schedules)) {
        scheduleEntry = user.schedules.slice().reverse().find(entry => {
          const eff = new Date(entry.effectiveFrom);
          return eff <= d;
        });
      }
      let scheduledIn = '';
      let scheduledOut = '';
      let isHoliday = false;
      let isHalfDay = false;
      if (scheduleEntry && scheduleEntry.daily && scheduleEntry.daily[dayName]) {
        const sch = scheduleEntry.daily[dayName] as { inTime?: string; outTime?: string; isHoliday?: boolean; isHalfDay?: boolean } | undefined;
        scheduledIn = sch?.inTime ?? '';
        scheduledOut = sch?.outTime ?? '';
        isHoliday = !!sch?.isHoliday;
        isHalfDay = !!sch?.isHalfDay;
      } else if (user && user.scheduleInOutTime && ['monday','tuesday','wednesday','thursday','friday'].includes(dayName)) {
        scheduledIn = user.scheduleInOutTime.inTime ?? '';
        scheduledOut = user.scheduleInOutTime.outTime ?? '';
        isHoliday = !!user.scheduleInOutTime.isHoliday;
        isHalfDay = !!user.scheduleInOutTime.isHalfDay;
      } else if (user && user.scheduleInOutTimeSat && dayName === 'saturday') {
        scheduledIn = user.scheduleInOutTimeSat.inTime ?? '';
        scheduledOut = user.scheduleInOutTimeSat.outTime ?? '';
        isHoliday = !!user.scheduleInOutTimeSat.isHoliday;
        isHalfDay = !!user.scheduleInOutTimeSat.isHalfDay;
      } else if (user && user.scheduleInOutTimeMonth && dayName === 'monthly') {
        scheduledIn = user.scheduleInOutTimeMonth.inTime ?? '';
        scheduledOut = user.scheduleInOutTimeMonth.outTime ?? '';
        isHoliday = !!user.scheduleInOutTimeMonth.isHoliday;
        isHalfDay = !!user.scheduleInOutTimeMonth.isHalfDay;
      }
      if (isHoliday) continue;
      // Calculate scheduled hours for the day
      const timeToHours = (t?: string) => {
        if (!t) return 0;
        const [h, m] = t.split(":").map(Number);
        return h + m / 60;
      };
      const startTime = timeToHours(scheduledIn);
      const endTime = timeToHours(scheduledOut);
      let hours = 0;
      if (startTime && endTime && endTime > startTime) {
        hours = endTime - startTime;
      }
      total += hours;
      workingDays++;
    }
    // Subtract 1 hour lunch deduction for each working day
    const lunchDeduction = workingDays; // 1 hour per working day
    total = Math.max(0, total - lunchDeduction);
    return total;
  };

  // Calculate scheduled hours WITHOUT lunch deduction (for Scheduled column)
  const calculateScheduledHoursNoLunch = (item: AttendanceSummaryView): number => {
      let total = 0;
      // Get user
      const user = allUsers?.find(u => u._id === item.userId || u.odId === item.userId);
      if (!user) return 0;
      // Only include days with uploaded attendance records that are not holidays (as in working day column)
      const records = item.recordDetails || {};
      for (const dateStr of Object.keys(records)) {
        const rec = records[dateStr];
        // Exclude if typeOfPresence is Holiday (as in working day column)
        if (rec.typeOfPresence === 'Holiday') continue;
        const dateObj = new Date(dateStr);
        const dayKey = dateObj.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
        // Find applicable schedule entry for this date
        let scheduleEntry;
        if (user.schedules && Array.isArray(user.schedules)) {
          scheduleEntry = user.schedules.slice().reverse().find(entry => {
            const eff = new Date(entry.effectiveFrom);
            return eff <= dateObj;
          });
        }
        let daySchedule;
        if (scheduleEntry && scheduleEntry.daily && scheduleEntry.daily[dayKey]) {
          daySchedule = scheduleEntry.daily[dayKey];
        } else if (user.scheduleInOutTime && ['monday','tuesday','wednesday','thursday','friday'].includes(dayKey)) {
          daySchedule = user.scheduleInOutTime;
        } else if (user.scheduleInOutTimeSat && dayKey === 'saturday') {
          daySchedule = user.scheduleInOutTimeSat;
        } else if (user.scheduleInOutTimeMonth && dayKey === 'monthly') {
          daySchedule = user.scheduleInOutTimeMonth;
        }
        // Skip if holiday
        if (!daySchedule || daySchedule.isHoliday) continue;
        const inTime = daySchedule.inTime;
        const outTime = daySchedule.outTime;
        if (inTime && outTime && inTime !== '00:00' && outTime !== '00:00') {
          const [inH, inM] = inTime.split(':').map(Number);
          const [outH, outM] = outTime.split(':').map(Number);
          let diff = (outH * 60 + outM) - (inH * 60 + inM);
          if (diff < 0) diff += 24 * 60; // overnight
          let hours = diff / 60;
          total += hours;
        }
      }
      return total;
  };

  // Helper function to calculate scheduled working days (expected working days)
  const calculateScheduledWorkingDays = (item: AttendanceSummaryView): number => {
    // Get applicable schedule for this month
    const applicableSchedule = getApplicableSchedule(item);
    if (!applicableSchedule) return 0;

    let workingDays = 0;

    // Calculate scheduled working days for each day that has attendance data
    const records = item.recordDetails || {};
    for (const dateStr of Object.keys(records)) {
      const d = new Date(dateStr);
      const rec = records[dateStr];

      // Skip holidays
      if (rec.typeOfPresence === 'Holiday') continue;

      const dow = d.getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[dow] as keyof DailySchedule;

      // Get the day's schedule, or fall back to monday's schedule if day is empty
      let daySchedule: ScheduleTime | undefined = applicableSchedule?.daily?.[dayName];

      // If this day's schedule is empty (no inTime) or doesn't exist, use monday as default for weekdays
      if ((!daySchedule || !daySchedule.inTime) && dow >= 1 && dow <= 5) { // Monday to Friday
        daySchedule = applicableSchedule?.daily?.monday;
      }

      // Skip if no schedule or marked as holiday
      if (!daySchedule || daySchedule.isHoliday) {
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
    let pio = 0; // Present in office (ThumbMachine, Present - in office, Thumb machine - not working)
    let woPio = 0; // Week off present in office (Present - weekoff)
    let osP = 0; // Outstation present
    let pcp = 0; // Present - client place
    let absent = 0; // Absent
    let hd = 0; // Half day (Half Day - weekdays or if value is 0.5)
    let sun = 0; // Sundays
    let weekoffHd = 0; // Week off half days (Half Day - weekoff)
    let ohd = 0; // Official holiday
    let wfhWeekoff = 0; // WFH in weekoff (WFH - weekoff)
    let wfhWeekdays = 0; // WFH weekdays (WFH - weekdays)
    let weekoffSpecial = 0; // Weekoff - special allowance
    let netWeekdaysWorking = 0; // Sum of PIO, WO-PIO, OS-P, HD, WEEKOFF HD, WFH

    Object.entries(records).forEach(([date, rec]: [string, any]) => {
      const recordDate = new Date(date);
      const dayOfWeek = recordDate.getDay(); // 0 = Sunday
      const isSunday = dayOfWeek === 0;

      // Count Sundays
      if (isSunday) {
        sun += 1;
      }

      // Get the value from the record
      const value = rec.value || 0;
      const type = rec.typeOfPresence || '';

      // Use edited times for calculations if available, otherwise use original times
      const effectiveCheckin = rec.editedCheckin || rec.checkin;
      const effectiveCheckout = rec.editedCheckout || rec.checkout;

      // Special case: ThumbMachine with 00:00 checkin/checkout should be counted as Absent but not added to totals
      if (type === 'ThumbMachine' && effectiveCheckin === '00:00' && effectiveCheckout === '00:00') {
        absent += 1; // Count as absent for informational purposes
        return; // Don't add to any other totals since value is zero
      }

      // Categorize based on typeOfPresence
      if (type === 'ThumbMachine' || type === 'Present - in office' || type === 'Thumb machine - not working') {
        // Check if this is a half day (either from record or schedule)
        if (rec.halfDay && value < 1) {
          // If halfDay flag is set AND value is less than 1, categorize under HD or Weekoff HD (exclude Saturday)
          if (isSunday) {
            weekoffHd += value;
          } else if (recordDate.getDay() >= 1 && recordDate.getDay() <= 5) {
            // Only weekdays (Mon-Fri) are considered half days
            hd += value;
          } else {
            // Saturday should not be treated as half day, so categorize as PIO
            pio += value;
          }
        } else {
          // Check if this day was scheduled as a half day
          const applicableSchedule = getApplicableSchedule(item, date);
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayName = dayNames[recordDate.getDay()] as keyof DailySchedule;
          let daySchedule = applicableSchedule?.daily?.[dayName];

          // If this day's schedule is empty (no inTime) or doesn't exist, use monday as default for weekdays
          if ((!daySchedule || !daySchedule.inTime) && recordDate.getDay() >= 1 && recordDate.getDay() <= 5) {
            daySchedule = applicableSchedule?.daily?.monday;
          }

          // If the day was scheduled as half day, categorize under HD or Weekoff HD (exclude Saturday)
          if (daySchedule?.isHalfDay && value < 1) {
            if (daySchedule.isHoliday || isSunday) {
              weekoffHd += value;
            } else if (recordDate.getDay() >= 1 && recordDate.getDay() <= 5) {
              // Only weekdays (Mon-Fri) are considered half days
              hd += value;
            } else {
              // Saturday should not be treated as half day, so categorize as PIO
              pio += value;
            }
          } else {
            pio += value;
          }
        }
      } else if (type === 'Present - weekoff') {
        woPio += value;
      } else if (type === 'Present - outstation' || type === 'Onsite Presence (OS-P)') {
        osP += value;
      } else if (type === 'Present - client place') {
        pcp += value;
      } else if (type === 'Half Day - weekdays') {
        hd += value;
      } else if (type === 'Half Day - weekoff') {
        weekoffHd += value;
      } else if (rec.halfDay && value < 1 && type !== 'Half Day - weekdays' && type !== 'Half Day - weekoff' && type !== 'ThumbMachine' && type !== 'Present - in office' && type !== 'Thumb machine - not working') {
        // Additional check: If halfDay is true AND value < 1 for any other attendance type, categorize under HD or Weekoff HD (exclude Saturday)
        if (isSunday) {
          weekoffHd += value;
        } else if (recordDate.getDay() >= 1 && recordDate.getDay() <= 5) {
          // Only weekdays (Mon-Fri) are considered half days
          hd += value;
        } else {
          // Saturday should not be treated as half day, so categorize normally
          // This will fall through to the normal categorization logic below
        }
      } else if (type === 'Absent') {
        absent += value;
      } else if (type === 'Holiday' || type === 'Official Holiday Duty (OHD)') {
        ohd += value;
      } else if (type === 'WFH - weekdays') {
        wfhWeekdays += value;
      } else if (type === 'WFH - weekoff' || type === 'Weekly Off - Work From Home (WO-WFH)') {
        wfhWeekoff += value;
      } else if (type === 'Weekoff - special allowance') {
        weekoffSpecial += value;
      } else if (type === 'Weekly Off - Present (WO-Present)') {
        woPio += value;
      } else if (type === 'Half Day (HD)') {
        // Check if it's weekoff based on day or type
        if (type.includes('weekoff') || isSunday) {
          weekoffHd += value;
        } else {
          hd += value;
        }
      } else if (type === 'Work From Home (WFH)') {
        // Check if it's weekoff based on day
        if (isSunday) {
          wfhWeekoff += value;
        } else {
          wfhWeekdays += value;
        }
      }
    });

    // Calculate net weekdays working
    netWeekdaysWorking = pio + woPio + osP + hd + weekoffHd + wfhWeekdays;

    return {
      pio,
      woPio,
      osP,
      pcp,
      absent,
      hd,
      sun,
      weekoffHd,
      ohd,
      wfhWeekoff,
      wfhWeekdays,
      weekoffSpecial,
      netWeekdaysWorking
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

  const filteredSummaries = useMemo(() => {
    let list = summaries.filter(item => item != null); // Remove null/undefined items
    
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
      const lateCount = calculateLateArrivals(item);
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
              const d = new Date(date);
              let applicableSchedule = undefined;
              if (user.schedules && Array.isArray(user.schedules)) {
                applicableSchedule = user.schedules.slice().reverse().find(entry => new Date(entry.effectiveFrom) <= d);
              }
              const dayName = d.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
              let sch = undefined;
              if (applicableSchedule && applicableSchedule.daily && applicableSchedule.daily[dayName]) {
                sch = applicableSchedule.daily[dayName];
              } else if (user.scheduleInOutTime && ['monday','tuesday','wednesday','thursday','friday'].includes(dayName)) {
                sch = user.scheduleInOutTime;
              } else if (user.scheduleInOutTimeSat && dayName === 'saturday') {
                sch = user.scheduleInOutTimeSat;
              } else if (user.scheduleInOutTimeMonth && dayName === 'monthly') {
                sch = user.scheduleInOutTimeMonth;
              }
              scheduledInTime = sch?.inTime ?? '';
              scheduledOutTime = sch?.outTime ?? '';
            }
            recordDetailsWithSchedule[date] = {
              ...record,
              scheduledInTime,
              scheduledOutTime,
            };
          });
        }
        // Calculate excess for week/range by summing daily excessHour for selected days
        let calcExcessDeficit = 0;
        if (filterType === 'week' && currentWeekStart) {
          // Calculate week range, but do not include days before the 1st of the selected month
          const weekStartDate = new Date(currentWeekStart);
          const selectedMonth = weekStartDate.getMonth();
          const selectedYear = weekStartDate.getFullYear();
          const weekDates = [];
          for (let i = 0; i < 7; i++) {
            const d = new Date(weekStartDate);
            d.setDate(weekStartDate.getDate() + i);
            // Only include if in the selected month
            if (d.getMonth() === selectedMonth && d.getFullYear() === selectedYear) {
              weekDates.push(d.toISOString().split('T')[0]);
            }
          }
          calcExcessDeficit = weekDates.reduce((sum, date) => {
            const rec = item.recordDetails?.[date];
            return sum + (rec?.excessHour || 0);
          }, 0);
        } else if (filterType === 'range' && rangeStart && rangeEnd) {
          // Calculate range
          const start = new Date(rangeStart);
          const end = new Date(rangeEnd);
          let d = new Date(start);
          while (d <= end) {
            const dateStr = d.toISOString().split('T')[0];
            calcExcessDeficit += item.recordDetails?.[dateStr]?.excessHour || 0;
            d.setDate(d.getDate() + 1);
          }
        } else {
          // Default to monthly summary
          calcExcessDeficit = item.summary.excessHour || 0;
        }
        // Calculate Late on frontend based on toggle
        const lateDetails = getLateDetails(item);
        const calcLate = lateDetails.length;
        // Calculate halfDay count from details for consistency
        const halfDayDetails = getHalfDayDetails(item);
        const calcHalfDay = halfDayDetails.length;

        return {
          ...item,
          summary: {
            ...item.summary,
            totalHalfDay: calcHalfDay,
            totalLate: calcLate,
          },
          calcScheduled: sched,
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
          aValue = a.summary.totalPresent + a.summary.totalAbsent + a.summary.totalLeave;
          bValue = b.summary.totalPresent + b.summary.totalAbsent + b.summary.totalLeave;
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
          aValue = calculateDefinedScheduleHours(a);
          bValue = calculateDefinedScheduleHours(b);
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
  }, [summaries, searchTerm, selectedYear, selectedMonth, teamFilter, designationFilter, lateFilter, presentFilter, absentFilter, leaveFilter, halfDayFilter, workHoursFilter, excessFilter, sortField, sortDirection]);

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

  const handleDetailedExport = async () => {
    if (filteredSummaries.length === 0) return;

    // Import ExcelJS dynamically
    const ExcelJS = (await import('exceljs')).default;

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Detailed Attendance Summary');

    // Define columns with widths
    worksheet.columns = [
      { key: 'paidFrom', header: 'Paid From', width: 10 },
      { key: 'employeeName', header: 'Employee Name', width: 18 },
      { key: 'category', header: 'Category', width: 10 },
      { key: 'verticalHead', header: 'Authorised Vertical Head', width: 18 },
      { key: 'pio', header: 'PIO', width: 4 },
      { key: 'woPio', header: 'WO-PIO', width: 4 },
      { key: 'osP', header: 'OS-P', width: 4 },
      { key: 'maxOsP', header: 'Max OS-P allowed', width: 8 },
      { key: 'pcp', header: 'PCP', width: 4 },
      { key: 'absent', header: 'A', width: 4 },
      { key: 'hd', header: 'HD', width: 4 },
      { key: 'maxHd', header: 'Max HD allowed', width: 8 },
      { key: 'sun', header: 'Sun (Days)', width: 6 },
      { key: 'weekoffHd', header: 'Weekoff HD (Days)', width: 8 },
      { key: 'ohd', header: 'OHD', width: 4 },
      { key: 'wfhWeekoff', header: 'WFH (In Weekoff)', width: 8 },
      { key: 'wfhWeekdays', header: 'WFH Weekdays', width: 8 },
      { key: 'maxWfh', header: 'Max WFH allowed', width: 8 },
      { key: 'woSa', header: 'WO-SA', width: 4 },
      { key: 'leavesTaken', header: 'Leaves Taken By Staff', width: 12 },
      { key: 'leavesBF', header: 'Leaves B/F', width: 10 },
      { key: 'leavesEarned', header: 'Leaves Earned This Month', width: 15 },
      { key: 'leavesConsumed', header: 'Leaves Consumed This Month', width: 15 },
      { key: 'leavesCF', header: 'C/F Leaves', width: 10 },
      { key: 'paidLeave', header: 'Paid Leave', width: 10 },
      { key: 'netWorking', header: 'Net Weekdays Working', width: 12 },
      { key: 'officeWorkingDays', header: 'Office Working Days', width: 12 }
    ];

    // Add data rows
    filteredSummaries.forEach((item) => {
      const user = allUsers?.find(u => u._id === item.userId);
      const metrics = calculateDetailedAttendanceMetrics(item);

      worksheet.addRow({
        paidFrom: user?.paidFrom || 'N/A',
        employeeName: user?.name || item.userName,
        category: user?.category || 'N/A',
        verticalHead: user?.workingUnderPartner || 'N/A',
        pio: metrics.pio,
        woPio: metrics.woPio,
        osP: metrics.osP,
        maxOsP: 1.2,
        pcp: metrics.pcp,
        absent: metrics.absent,
        hd: metrics.hd,
        maxHd: 0.5,
        sun: countTotalSundaysInPeriod(),
        weekoffHd: metrics.weekoffHd,
        ohd: metrics.ohd,
        wfhWeekoff: metrics.wfhWeekoff,
        wfhWeekdays: metrics.wfhWeekdays,
        maxWfh: 0.75,
        woSa: metrics.weekoffSpecial,
        leavesTaken: user?.leaveBalance?.used || 0, // Total leaves taken till date
        leavesBF: (user?.leaveBalance?.remaining || 0) - (user?.leaveBalance?.monthlyEarned || 0), // Balance brought forward (remaining - earned_this_month)
        leavesEarned: user?.leaveBalance?.monthlyEarned || 0,
        leavesConsumed: calculateLeaveConsumed(item),
        leavesCF: (() => {
          const bf = (user?.leaveBalance?.remaining || 0) - (user?.leaveBalance?.monthlyEarned || 0);
          const earned = user?.leaveBalance?.monthlyEarned || 0;
          const consumed = calculateLeaveConsumed(item);
          return bf + earned - consumed;
        })(), // Carried forward: B/F + Earned - Consumed
        paidLeave: calculateLeaveConsumed(item), // Paid leave days
        netWorking: metrics.netWeekdaysWorking + calculateLeaveConsumed(item), // Net includes paid leave
        officeWorkingDays: calculateScheduledWorkingDays(item) // Expected working days
      });
    });

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 45; // 3x the default height

    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

      // Special highlighting for calculated columns
      if (colNumber === 24) {
        // Paid Leave - Yellow
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFD700' } // Yellow highlight
        };
      } else if (colNumber === 25) {
        // Net Weekdays Working - Blue
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E90FF' } // Blue highlight
        };
      } else if (colNumber === 26) {
        // Office Working Days - Orange
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF6B35' } // Orange highlight
        };
      } else {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2C5F2D' } // Dark green for other headers
        };
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // Style data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const isEvenRow = rowNumber % 2 === 0;
      row.eachCell((cell, colNumber) => {
        cell.font = { size: 10 };

        // Special highlighting for calculated columns
        if (colNumber === 24) {
          // Paid Leave - Light Yellow background
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF8DC' } // Light yellow
          };
          cell.font = { size: 10, color: { argb: 'FF8B4513' } }; // Dark brown text
        } else if (colNumber === 25) {
          // Net Weekdays Working - Light Blue background
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' } // Light blue
          };
          cell.font = { size: 10, color: { argb: 'FF000080' } }; // Dark blue text
        } else if (colNumber === 26) {
          // Office Working Days - Light Orange background
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF0E6' } // Light orange
          };
          cell.font = { size: 10, color: { argb: 'FF8B4513' } }; // Dark brown text
        } else {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isEvenRow ? 'FFF8F9FA' : 'FFFFFFFF' }
          };
        }

        // Left align employee names, center align everything else
        cell.alignment = {
          vertical: 'top',
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
      ? `Detailed_Attendance_Summary_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx`
      : filterType === 'week'
      ? `Detailed_Attendance_Summary_Week_${currentWeekStart}.xlsx`
      : `Detailed_Attendance_Summary_${rangeStart}_to_${rangeEnd}.xlsx`;

    // Save file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Create download link
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
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      dateRangeText = `Date Range: ${currentWeekStart} to ${weekEnd.toISOString().split('T')[0]}`;
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
      { key: 'excess', header: 'Excess', width: 10 }

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
        holidays: Object.values(item.recordDetails || {}).filter((r: any) => r.typeOfPresence === 'Holiday').length,
        workingDays: item.summary.totalPresent + item.summary.totalAbsent + calculateLeaveConsumed(item),
        present: item.summary.totalPresent,
        halfDays: item.summary.totalHalfDay,
        absent: item.summary.totalAbsent,
        late: item.calcLate || 0,
        scheduled: formatHoursMinutes(item.calcScheduled || 0),
        definedSchedule: formatHoursMinutes(calculateDefinedScheduleHours(item)),
        workHours: formatHoursMinutes(item.summary.totalHour),
        excess: (item.calcExcessDeficit !== undefined && item.calcExcessDeficit !== 0)
          ? `${item.calcExcessDeficit > 0 ? '+' : item.calcExcessDeficit < 0 ? '-' : ''}${formatHoursMinutes(Math.abs(item.calcExcessDeficit))}`
          : formatHoursMinutes(0)
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
    const worksheet = workbook.addWorksheet('Daywise Attendance');

    // Define columns in requested order
    worksheet.columns = [
      { header: 'Weekdays/Weekoffs', key: 'weekType', width: 14 },
      { header: 'Source', key: 'source', width: 18 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Day', key: 'day', width: 10 },
      { header: 'Employee Name', key: 'employeeName', width: 18 },
      { header: 'Designation', key: 'designation', width: 14 },
      { header: 'Present / Absent', key: 'presentAbsent', width: 14 },
      { header: 'Actual InTime Orignal Data', key: 'actualInTimeOriginal', width: 18 },
      { header: 'Actual OutTime Orignal Data', key: 'actualOutTimeOriginal', width: 18 },
      { header: 'Actual InTime Editable Data', key: 'actualInTimeEditable', width: 18 },
      { header: 'Actual OutTime Editable Data', key: 'actualOutTimeEditable', width: 18 },
      { header: 'True/False In Time', key: 'trueFalseInTime', width: 14 },
      { header: 'True/False Out Time', key: 'trueFalseOutTime', width: 14 },
      { header: 'Scheduled In Time', key: 'scheduledInTime', width: 12 },
      { header: 'Scheduled Out Time', key: 'scheduledOutTime', width: 12 },
      { header: 'MAX - WFH', key: 'maxWFH', width: 10 },
      { header: 'ACTUAL - WFH', key: 'actualWFH', width: 10 },
      { header: 'MAX - Outstation (1.2 Days)', key: 'maxOutstation', width: 12 },
      { header: 'ACTUAL - Out Station', key: 'actualOutstation', width: 10 },
      { header: 'Working Hrs', key: 'workingHrs', width: 8 },
      { header: 'Scheduled Time', key: 'scheduledTime', width: 8 },
      { header: 'Scheduled Hrs (In Month)', key: 'scheduledHrsMonth', width: 10 },
      { header: 'Working Hrs (In Month)', key: 'workingHrsMonth', width: 10 },
      { header: 'Excess/Short (In Month)', key: 'excessShortHrsMonth', width: 10 },
      { header: 'Excess/Short (In a Day)', key: 'excessShortHrsDay', width: 10 },
      { header: 'Halfdays', key: 'halfDays', width: 8 },
      // Add extra fields at the end if needed
    ];

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
      const d = new Date(date);
      const day = d.getDay();
      if (record && typeof record.status === 'string' && record.status.toLowerCase().includes('weekoff')) return 'Weekoff';
      return day === 0 ? 'Weekoff' : 'Weekdays';
    };

    // Loop through each summary and each day
    filteredSummaries.forEach((item: any) => {
    // Helper to format seconds to ±HH:MM:SS
    const formatSecondsToHMS = (seconds: number): string => {
      const sign = seconds < 0 ? '-' : '';
      const abs = Math.abs(seconds);
      const h = Math.floor(abs / 3600);
      const m = Math.floor((abs % 3600) / 60);
      const s = abs % 60;
      return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // These must be declared inside the forEach to be scoped per summary
    const dailyExcessShortSeconds: number[] = [];
    const rowIndexes: number[] = [];
    // Calculate actual working hours for the month for this user
    let workingHrsMonth = 0;
    const monthYear = item.monthYear || '';
    const [year, month] = monthYear.split('-').map(Number);
    const recordsMonth = item.recordDetails || {};
    Object.entries(recordsMonth).forEach(([date, record]: [string, any]) => {
      const d = new Date(date);
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
          for (const dateStr of Object.keys(item.recordDetails)) {
            if (holidayDates.has(dateStr)) continue; // skip API holidays
            const rec = item.recordDetails[dateStr];
            if (rec.typeOfPresence === 'Holiday') continue;
            const dateObj = new Date(dateStr);
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
      Object.entries(records).forEach(([date, record]: [string, any]) => {
        const d = new Date(date);
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
        // Custom present logic for WFH and Outstation
        const typeOfPresence = record.typeOfPresence || record.status || '';
        if (isHoliday || isSunday) {
          presentAbsent = 'Holiday';
        } else if (
          typeOfPresence === 'Present - outstation'
        ) {
          maxOutstation = '1.2';
          actualOutstation = typeof record.value === 'number' ? String(record.value) : String(record.value ?? workingHrs);
          presentAbsent = 'Present';
        } else if (
          typeOfPresence === 'WFH - weekdays' || typeOfPresence === 'WFH - weekoff'
        ) {
          maxWFH = '0.75';
          actualWFH = typeof record.value === 'number' ? String(record.value) : String(record.value ?? workingHrs);
          presentAbsent = 'Present';
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
        worksheet.addRow({
          weekType,
          source: getSource(record),
          date,
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
          maxWFH: String(maxWFH),
          actualWFH: String(actualWFH),
          maxOutstation: String(maxOutstation),
          actualOutstation: String(actualOutstation),
          workingHrs: typeof workingHrs === 'number' && !isNaN(workingHrs)
            ? `${Math.floor(workingHrs)}:${Math.round((workingHrs % 1) * 60).toString().padStart(2, '0')}`
            : formatTime(workingHrs),
          scheduledTime: scheduledTime,
          scheduledHrsMonth: scheduledHrsMonth ? formatHoursMinutes(scheduledHrsMonth) : '',
          workingHrsMonth: workingHrsMonth ? formatHoursMinutes(workingHrsMonth) : '',
          excessShortHrsMonth: '',
          excessShortHrsDay: formatSecondsToHMS(daySeconds),
          halfDays,
          // Add extra fields at the end if needed
        });
        rowIndexes.push(worksheet.rowCount);
      });
      // After all rows for this user/month, sum daily seconds and update monthly column
      if (dailyExcessShortSeconds.length > 0) {
        const totalMonthSeconds = dailyExcessShortSeconds.reduce((a: number, b: number) => a + b, 0);
        const excessShortHrsMonth = formatSecondsToHMS(totalMonthSeconds);
        for (const rowIdx of rowIndexes) {
          worksheet.getRow(rowIdx).getCell('excessShortHrsMonth').value = excessShortHrsMonth;
        }
      }
    });

    // Save file
    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 45;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size:12, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2C5F2D' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // Style data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      const isEvenRow = rowNumber % 2 === 0;
      row.eachCell((cell, colNumber) => {
        cell.font = { size: 11 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEvenRow ? 'FFF8F9FA' : 'FFFFFFFF' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
      });
      // Highlight 'Absent' in Present / Absent column
      const presentAbsentCell = row.getCell('presentAbsent');
      if (presentAbsentCell.value === 'Absent') {
        presentAbsentCell.font = {
          size: 11,
          color: { argb: 'FFFF0000' },
          bold: true
        };
      } else if (presentAbsentCell.value === 'Holiday') {
        presentAbsentCell.font = {
          size: 11,
          color: { argb: 'FFFFD700' }, // Yellow
          bold: true
        };
      }
    });

    // Auto-fit columns
    worksheet.columns.forEach((col) => {
      const headerStr = typeof col.header === 'string' ? col.header : Array.isArray(col.header) ? col.header.join(' ') : '';
      let maxLength = headerStr.length;
      col.eachCell?.((cell) => {
        const cellValue = cell.value ? cell.value.toString() : '';
        maxLength = Math.max(maxLength, cellValue.length);
      });
      col.width = Math.max(col.width || 10, Math.min(maxLength + 2, 40));
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
      const start = new Date(currentWeekStart);
      const end = new Date(currentWeekStart);
      end.setDate(end.getDate() + 6);
      return `Week of ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    })() : 
    `From ${rangeStart.length > 7 ? new Date(rangeStart).toLocaleDateString() : new Date(rangeStart + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })} to ${rangeEnd.length > 7 ? new Date(rangeEnd).toLocaleDateString() : new Date(rangeEnd + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}`;

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
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
          <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-slate-100">Select Date Range</h3>
              <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-5 h-5"/></button>
          </div>
          <div className="p-4 flex-1">
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={setLast3Months} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md">Last 3 Months</button>
              <button onClick={setLast6Months} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-md">Last 6 Months</button>
              <button onClick={setLast12Months} className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-md">Last 12 Months</button>
              <button onClick={setLastMonth} className="px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm rounded-md">Last Month</button>
              <button onClick={setCurrentMonth} className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-md col-span-2">Current Month</button>
            </div>
            <div className="mb-4">
              <h4 className="text-slate-300 mb-2">Custom Range</h4>
              <div className="flex gap-2 mb-2">
                <DatePicker
                  selected={new Date(customStartDate)}
                  onChange={(date: Date | null) => date && setCustomStartDate(date.toISOString().split('T')[0])}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-md px-3 py-2 w-full"
                  dateFormat="yyyy-MM-dd"
                />
              </div>
              <div className="text-center text-slate-500 mb-2">to</div>
              <div className="flex gap-2">
                <DatePicker
                  selected={new Date(customEndDate)}
                  onChange={(date: Date | null) => date && setCustomEndDate(date.toISOString().split('T')[0])}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-md px-3 py-2 w-full"
                  dateFormat="yyyy-MM-dd"
                />
              </div>
              <button onClick={applyCustom} className="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md">Apply Custom Range</button>
            </div>
          </div>
          <div className="bg-slate-950 px-4 py-2 border-t border-slate-800 text-right shrink-0">
              <button onClick={onClose} className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors">Close</button>
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
        <label className="block text-sm font-medium text-slate-300">{label}</label>
        <div className="flex gap-2">
          <select
            value={filter.operator}
            onChange={(e) => onChange({...filter, operator: e.target.value})}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-md px-2 py-1 flex-1"
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
              className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-md px-2 py-1 w-20"
              placeholder="0"
            />
          )}
        </div>
      </div>
    );

    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
          <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-slate-100">Advanced Filters</h3>
              <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-5 h-5"/></button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Filters */}
              <div className="space-y-4">
                <h4 className="text-slate-200 font-medium border-b border-slate-700 pb-2">Basic Filters</h4>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">Team</label>
                  <select
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-md px-3 py-2"
                  >
                    <option value="all">All Teams</option>
                    {getUniqueTeams().map(team => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">Designation</label>
                  <select
                    value={designationFilter}
                    onChange={(e) => setDesignationFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-md px-3 py-2"
                  >
                    <option value="all">All Designations</option>
                    {getUniqueDesignations().map(designation => (
                      <option key={designation} value={designation}>{designation}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Numeric Filters */}
              <div className="space-y-4">
                <h4 className="text-slate-200 font-medium border-b border-slate-700 pb-2">Numeric Filters</h4>
                
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
          <div className="bg-slate-950 px-4 py-3 border-t border-slate-800 flex justify-between items-center shrink-0">
            <button
              onClick={clearAllFilters}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm rounded-md hover:bg-slate-800 transition-colors"
            >
              Clear All
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm rounded-md hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Control Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
           {/* Date Navigation */}
           <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-1">
              <button onClick={filterType === 'week' ? handlePrevWeek : handlePrevMonth} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <div className="px-4 flex items-center gap-2 font-medium text-slate-200 min-w-35 justify-center">
                <Calendar className="w-4 h-4 text-emerald-500" />
                <span>{currentPeriodLabel}</span>
              </div>

              <button onClick={filterType === 'week' ? handleNextWeek : handleNextMonth} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
           </div>
           
           {/* Year/Month Manual Selectors (Hidden in week mode) */}
           {filterType !== 'week' && (
             <div className="flex gap-2">
               <select 
                 value={selectedYear} 
                 onChange={(e) => setSelectedYear(Number(e.target.value))}
                 className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-md px-3 py-2 outline-none focus:border-emerald-500"
               >
                 {Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i).map(y => (
                   <option key={y} value={y}>{y}</option>
                 ))}
               </select>
               <select 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-md px-3 py-2 outline-none focus:border-emerald-500"
               >
                 {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                   <option key={m} value={m}>{new Date(2000, m-1, 1).toLocaleString('default', { month: 'short' })}</option>
                 ))}
               </select>
             </div>
           )}

            {filterType === 'month' ? (
              <div className="flex gap-2">
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => setFilterType('week')} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors" title="Switch to Week View">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-400">Week</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => setRangeModalOpen(true)} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors" title="Switch to Range View">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-400">Range</span>
                </div>
              </div>
            ) : filterType === 'week' ? (
              <div className="flex gap-2">
                <div className="flex flex-col items-center gap-1">
                  <button onClick={switchToMonth} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors" title="Switch to Month View">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-400">Month</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => setRangeModalOpen(true)} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors" title="Switch to Range View">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-400">Range</span>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex flex-col items-center gap-1">
                  <button onClick={switchToMonth} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors" title="Switch to Month View">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-400">Month</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => setFilterType('week')} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors" title="Switch to Week View">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-400">Week</span>
                </div>
              </div>
            )}
        </div>

        {/* Search & Export */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-full pl-10 pr-4 py-2 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 placeholder:text-slate-600"
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <button 
              onClick={handleExport}
              className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full transition-colors shadow-sm"
              title="Export Summary to Excel"
            >
              <Download className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-400">Summary</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <button 
              onClick={handleDetailedExport}
              className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-full transition-colors shadow-sm"
              title="Export Detailed Attendance Summary to Excel"
            >
              <Download className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-400">Detailed</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <button 
              onClick={handleDayWiseExport}
              disabled={selectedEmployees.size === 0}
              className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-full transition-colors shadow-sm"
              title="Export Day-wise Attendance for Selected Employees"
            >
              <Download className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-400">Day-wise</span>
          </div>
          
          <div className="flex flex-col items-center gap-1">
            <button 
              onClick={() => setIsBulkManagerOpen(true)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-full transition-colors border border-slate-700"
              title="Bulk Manage Absent/Leave"
            >
              <ListChecks className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-400">Status</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <button 
              onClick={() => setShowAdvancedFilters(true)}
              className={`p-2 rounded-full transition-colors border shadow-sm ${
                hasActiveFilters() 
                  ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-600' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
              }`}
              title="Advanced Filters"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
            <span className="text-xs text-slate-400">Filters</span>
          </div>
        </div>
      </div>

      {/* 2. Dashboard Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex items-center gap-4">
           <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-400">
             <Users className="w-6 h-6" />
           </div>
           <div>
             <div className="text-2xl font-bold text-slate-100">{stats.totalEmployees}</div>
             <div className="text-xs text-slate-400 uppercase tracking-wider font-medium">Active Employees</div>
           </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex items-center gap-4">
           <div className="p-3 bg-amber-500/10 rounded-full text-amber-400">
             <AlertCircle className="w-6 h-6" />
           </div>
           <div>
             <div className="text-2xl font-bold text-slate-100">{stats.totalLate}</div>
             <div className="text-xs text-slate-400 uppercase tracking-wider font-medium">Late Arrivals</div>
           </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex items-center gap-4">
           <div className="p-3 bg-rose-500/10 rounded-full text-rose-400">
             <UserX className="w-6 h-6" />
           </div>
           <div>
             <div className="text-2xl font-bold text-slate-100">{stats.totalAbsents}</div>
             <div className="text-xs text-slate-400 uppercase tracking-wider font-medium">Absences</div>
           </div>
        </div>

         <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex items-center gap-4">
           <div className="p-3 bg-indigo-500/10 rounded-full text-indigo-400">
             <Clock className="w-6 h-6" />
           </div>
           <div>
             <div className="text-2xl font-bold text-slate-100">{formatHoursMinutes(stats.totalHours)}</div>
             <div className="text-xs text-slate-400 uppercase tracking-wider font-medium">Total Man-Hours</div>
           </div>
        </div>
      </div>

      {/* 3. Detailed Data Table */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
             <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
             <p>Loading summary data...</p>
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
            <BarChart3 className="w-10 h-10 opacity-20" />
            <p>No attendance records found for {currentPeriodLabel}.</p>
            {uploadTotal > 0 && <p className="text-xs opacity-60">Last upload: {uploadSaved} saved, {uploadFailed} failed.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-400">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.size === filteredSummaries.length && filteredSummaries.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-600 text-emerald-600 focus:ring-emerald-500"
                    />
                  </th>
                  <th className="px-2 py-3 text-center font-semibold text-slate-400">View</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-400 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('employeeCode')}>
                    <div className="flex items-center gap-1">Emp Code{sortField === 'employeeCode' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('userName')}>
                    <div className="flex items-center gap-1">Employee{sortField === 'userName' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-400 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('team')}>
                    <div className="flex items-center gap-1">Team{sortField === 'team' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-400 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('designation')}>
                    <div className="flex items-center gap-1">Designation{sortField === 'designation' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-400">Total Days</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-400">Holidays</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-400">Working Days</th>
                  <th className="px-4 py-3 text-right font-semibold text-emerald-300 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('totalPresent')}>
                    <div className="flex items-center gap-1 justify-end">Present{sortField === 'totalPresent' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('totalHalfDay')}>
                    <div className="flex items-center gap-1 justify-end">Half Days{sortField === 'totalHalfDay' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-rose-300 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('totalAbsent')}>
                    <div className="flex items-center gap-1 justify-end">Absent{sortField === 'totalAbsent' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-amber-300/90 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('calcLate')}>
                    <div className="flex items-center gap-1 justify-end">Late{sortField === 'calcLate' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-sky-400 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('totalLeave')}>
                    <div className="flex items-center gap-1 justify-end">Leave{sortField === 'totalLeave' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-400 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('calcScheduled')}>
                    <div className="flex items-center gap-1 justify-end">Scheduled{sortField === 'calcScheduled' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-blue-300/90 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('definedSchedule')}>
                    <div className="flex items-center gap-1 justify-end">Defined Work Hour{sortField === 'definedSchedule' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('totalHour')}>
                    <div className="flex items-center gap-1 justify-end">Work Hours{sortField === 'totalHour' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-emerald-300/90 cursor-pointer hover:bg-slate-800/60 select-none" onClick={() => handleSort('calcExcessDeficit')}>
                    <div className="flex items-center gap-1 justify-end">Excess{sortField === 'calcExcessDeficit' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(filteredSummaries as any[]).map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="px-4 py-3 text-left" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedEmployees.has(item.userId)}
                        onChange={(e) => handleSelectEmployee(item.userId, e.target.checked)}
                        className="rounded border-slate-600 text-emerald-600 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => onEmployeeClick(item.userId, item.monthYear)}
                        className="p-1.5 rounded-md bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 hover:text-emerald-300 transition-colors"
                        title={`View ${item.userName}'s month details`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-left font-mono text-slate-400">{item.employeeCode || item.odId || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200 group-hover:text-white cursor-pointer" onClick={() => onEmployeeDetailClick?.(item.userId)}>{item.userName}</div>
                      <div className="text-[10px] text-slate-500 font-mono hidden md:block">{item.employeeCode || item.odId || item.userId}</div>
                    </td>
                    <td className="px-4 py-3 text-left text-slate-400">{item.team || '-'}</td>
                    <td className="px-4 py-3 text-left text-slate-400">{item.designation || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">{Object.keys(item.recordDetails || {}).length}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">{Object.values(item.recordDetails || {}).filter((r: any) => r.typeOfPresence === 'Holiday').length}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => openDetail(e, 'WorkingDays', item)}>
                        {(() => {
                          // Count all days in recordDetails that are not holidays
                          const records = item.recordDetails || {};
                          const workingDays = Object.values(records).filter((rec: any) => rec.typeOfPresence !== 'Holiday').length;
                          return workingDays > 0 ? (
                            <span className="hover:underline" title="Click to view calculation breakdown">{workingDays}</span>
                          ) : '-';
                        })()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => item.summary.totalPresent > 0 && openDetail(e, 'Present', item)}>
                        {item.summary.totalPresent > 0 ? (
                           <span className="hover:underline" title="Click to view details">{item.summary.totalPresent}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => item.summary.totalHalfDay > 0 && openDetail(e, 'HalfDay', item)}>
                        {item.summary.totalHalfDay > 0 ? (
                           <span className="hover:underline" title="Click to view details">{item.summary.totalHalfDay}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-rose-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => item.summary.totalAbsent > 0 && openDetail(e, 'Absent', item)}>
                        {item.summary.totalAbsent > 0 ? (
                           <span className="hover:underline" title="Click to view details">{item.summary.totalAbsent}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono" onClick={(e) => item.calcLate > 0 && openDetail(e, 'Late', item)}>
                      {item.calcLate > 0 ? (
                        <span className="text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-amber-400/20" title="Click to view details">{item.calcLate}</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sky-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => calculateLeaveConsumed(item) > 0 && openDetail(e, 'Leave', item)}>
                        {calculateLeaveConsumed(item) > 0 ? (
                           <span className="hover:underline" title="Click to view details">{calculateLeaveConsumed(item)}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => item.calcScheduled > 0 && openDetail(e, 'ScheduledHours', item)}>
                        {item.calcScheduled > 0 ? (
                           <span className="hover:underline" title="Click to view daily breakdown">{formatHoursMinutes(item.calcScheduled)}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-blue-400">
                        {(() => {
                          const definedHours = calculateDefinedScheduleHours(item);
                          return definedHours > 0 ? (
                            <span 
                              className="cursor-pointer hover:underline" 
                              title="Click to view calculation breakdown"
                              onClick={(e) => openDetail(e, 'DefinedSchedule', item)}
                            >
                              {formatHoursMinutes(definedHours)}
                            </span>
                          ) : '-';
                        })()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300 cursor-pointer hover:bg-slate-800/60" onClick={(e) => item.summary.totalHour > 0 && openDetail(e, 'WorkHours', item)}>
                        {item.summary.totalHour > 0 ? (
                           <span className="hover:underline" title="Click to view daily breakdown">{formatHoursMinutes(item.summary.totalHour)}</span>
                        ) : '0h 0m'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono cursor-pointer hover:bg-slate-800/60"
                        onClick={() => {
                          // Prepare breakdown for modal
                          let breakdown = [];
                          if (filterType === 'week' && currentWeekStart) {
                            const weekStartDate = new Date(currentWeekStart);
                            for (let i = 0; i < 7; i++) {
                              const d = new Date(weekStartDate);
                              d.setDate(weekStartDate.getDate() + i);
                              const dateStr = d.toISOString().split('T')[0];
                              const rec = item.recordDetails?.[dateStr];
                              if (rec) {
                                breakdown.push({ date: dateStr, info: `Excess: ${rec.excessHour ?? 0} hr`, subInfo: rec.remarks || '' });
                              }
                            }
                          } else if (filterType === 'range' && rangeStart && rangeEnd) {
                            const start = new Date(rangeStart);
                            const end = new Date(rangeEnd);
                            let d = new Date(start);
                            while (d <= end) {
                              const dateStr = d.toISOString().split('T')[0];
                              const rec = item.recordDetails?.[dateStr];
                              if (rec) {
                                breakdown.push({ date: dateStr, info: `Excess: ${rec.excessHour ?? 0} hr`, subInfo: rec.remarks || '' });
                              }
                              d.setDate(d.getDate() + 1);
                            }
                          } else {
                            // Month view: show all days in month
                            const month = selectedMonth;
                            const year = selectedYear;
                            const daysInMonth = new Date(year, month, 0).getDate();
                            for (let day = 1; day <= daysInMonth; day++) {
                              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                              const rec = item.recordDetails?.[dateStr];
                              if (rec) {
                                breakdown.push({ date: dateStr, info: `Excess: ${rec.excessHour ?? 0} hr`, subInfo: rec.remarks || '' });
                              }
                            }
                          }
                          setDetailModal({
                            isOpen: true,
                            title: `Excess Calculation Details for ${item.userName}`,
                            data: breakdown
                          });
                        }}
                    >
                       {item.calcExcessDeficit !== undefined ? (
                         <span className={item.calcExcessDeficit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                           {/* Always use backend decimal value, format as H:MM */}
                           {item.calcExcessDeficit > 0 ? "+" : item.calcExcessDeficit < 0 ? "-" : ""}
                           {formatHoursMinutes(Math.abs(item.calcExcessDeficit))}
                         </span>
                       ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </div>
  );
};


