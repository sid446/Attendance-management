import React, { useState, useMemo, useEffect } from 'react';
import { AttendanceSummaryView, User, DailySchedule, ScheduleTime } from '@/types/ui';
import { Search, Calendar, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, BarChart3, Users, Clock, AlertCircle, TrendingUp, UserX, UserCheck, Download, ListChecks, X } from 'lucide-react';
import { BulkLeaveManager } from './BulkLeaveManager';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ScheduleEntry } from '@/types/ui';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: { date: string; info: string; subInfo?: string }[];
}

const DetailModal: React.FC<DetailModalProps> = ({ isOpen, onClose, title, data }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
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
                             <div className="flex items-center gap-3 flex-shrink-0">
                                <div className="font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-xs whitespace-nowrap">{d.date}</div>
                                {d.subInfo && (
                                  <span className="text-amber-400/70 text-[10px] bg-amber-400/5 px-1.5 py-0.5 rounded border border-amber-400/10 whitespace-nowrap">
                                    {d.subInfo}
                                  </span>
                                )}
                             </div>
                             <div className="font-mono font-medium text-slate-300 flex-1 text-left break-words leading-relaxed">
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
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      
      Object.entries(records).forEach(([date, rec]) => {
          if (!rec.checkin) return;
          
          const d = new Date(date);
          const day = d.getDay();
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayName = dayNames[day] as keyof DailySchedule;
          
          // Get applicable schedule for this specific date
          const applicableSchedule = getApplicableSchedule(item, date);
          
          // Get the day's schedule, or fall back to monday's schedule if day is empty
          let daySchedule: ScheduleTime | undefined = applicableSchedule?.daily?.[dayName];
          
          // If this day's schedule is empty (no inTime) or doesn't exist, use monday as default for weekdays
          if ((!daySchedule || !daySchedule.inTime) && day >= 1 && day <= 5) { // Monday to Friday
            daySchedule = applicableSchedule?.daily?.monday;
          }
          
          // If still no schedule, use default
          const scheduledIn = daySchedule?.inTime || '09:00';
          
          // Debug logging
          console.log(`Date: ${date}, Day: ${dayName}, Applicable Schedule:`, applicableSchedule, `Scheduled In: ${scheduledIn}, Checkin: ${rec.checkin}`);

          if (rec.checkin > scheduledIn) {
              dates.push({ 
                  date, 
                  info: `${rec.checkin}`,
                  subInfo: `Sch: ${scheduledIn}`
              });
          }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
          // Present logic: has valid checkin or halfDay
          if ((rec.checkin && rec.checkin !== "00:00") || rec.halfDay) {
               const info = rec.halfDay ? 'Half Day' : `Present (${rec.checkin})`;
               dates.push({ date, info, subInfo: rec.halfDay ? 'Half Day' : undefined });
          }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getHalfDayDetails = (item: AttendanceSummaryView) => {
      if (!item) return [];
      const records = item.recordDetails || {};
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      Object.entries(records).forEach(([date, rec]) => {
          if (rec.halfDay && rec.typeOfPresence !== 'Holiday') {
               dates.push({ date, info: 'Half Day', subInfo: rec.checkin ? `In: ${rec.checkin}` : undefined });
          }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getWorkHoursDetails = (item: AttendanceSummaryView) => {
      if (!item) return [];
      const records = item.recordDetails || {};
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      Object.entries(records).forEach(([date, rec]) => {
          if (rec.totalHour > 0 && rec.typeOfPresence !== 'Holiday') {
               dates.push({ date, info: `${formatHoursMinutes(rec.totalHour)}`, subInfo: rec.checkin ? `In: ${rec.checkin}` : undefined });
          }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getScheduledHoursDetails = (item: AttendanceSummaryView) => {
      if (!item) return [];
      const records = item.recordDetails || {};
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      
      // Helper for diff
      const timeToHours = (t?: string) => {
          if (!t) return 0;
          const [h, m] = t.split(':').map(Number);
          return h + (m / 60);
      };
      
      // Calculate daily hours for each day that has attendance data
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      Object.entries(records).forEach(([date, rec]) => {
          if (rec.typeOfPresence === 'Holiday') return;

          const d = new Date(date);
          const dow = d.getDay();
          const dayName = dayNames[dow] as keyof DailySchedule;
          
          // Get applicable schedule for this specific date
          const applicableSchedule = getApplicableSchedule(item, date);
          if (!applicableSchedule) return;
          
          // Get the day's schedule, or fall back to monday's schedule if day is empty
          let daySchedule = applicableSchedule?.daily?.[dayName];
          
          // If this day's schedule is empty (no inTime) or doesn't exist, use monday as default for weekdays
          if ((!daySchedule || !daySchedule.inTime) && dow >= 1 && dow <= 5) { // Monday to Friday
            daySchedule = applicableSchedule?.daily?.monday;
          }
          
          if (!daySchedule || daySchedule.isHoliday) return;

          const start = timeToHours(daySchedule.inTime);
          const end = timeToHours(daySchedule.outTime);
          let hours = (start && end && end > start) ? (end - start) : 9;

          // Apply half-day if marked
          if (daySchedule.isHalfDay) {
              hours = hours / 2;
          }

          if (hours > 0) {
              dates.push({
                  date,
                  info: formatHoursMinutes(hours),
                  subInfo: daySchedule.isHalfDay ? 'Half Day' : dayName.charAt(0).toUpperCase() + dayName.slice(1)
              });
          }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getDefinedScheduleDetails = (item: AttendanceSummaryView) => {
      const details: { date: string; info: string; subInfo?: string }[] = [];

      let totalHours = 0;
      let workingDays = 0;

      // Get applicable schedule for this month
      const applicableSchedule = getApplicableSchedule(item);
      if (!applicableSchedule) {
          details.push({
              date: 'No Schedule',
              info: 'No schedule defined for this employee',
              subInfo: ''
          });
          return details;
      }

      // Helper for diff
      const timeToHours = (t?: string) => {
          if (!t) return 0;
          const [h, m] = t.split(':').map(Number);
          return h + (m / 60);
      };

      // Calculate for each day that has attendance data
      const records = item.recordDetails || {};
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

        const dow = d.getDay();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dow] as keyof DailySchedule;

        // Get the day's schedule, or fall back to monday's schedule if day is empty
        let daySchedule: ScheduleTime | undefined = applicableSchedule?.daily?.[dayName];

        // If this day's schedule is empty (no inTime) or doesn't exist, use monday as default for weekdays
        if ((!daySchedule || !daySchedule.inTime) && dow >= 1 && dow <= 5) { // Monday to Friday
          daySchedule = applicableSchedule?.daily?.monday;
        }

        if (!daySchedule || daySchedule.isHoliday) {
          details.push({
              date: d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
              info: 'Holiday/Off',
              subInfo: ''
          });
          continue;
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

        totalHours += hours;
        workingDays++;

        const scheduleText = `${daySchedule.inTime || '09:00'} - ${daySchedule.outTime || '18:00'}`;
        const hoursText = formatHoursMinutes(hours);
        const note = daySchedule.isHalfDay ? ' (Half Day)' : '';

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

  const openDetail = (e: React.MouseEvent, type: 'Late' | 'Absent' | 'Leave' | 'Present' | 'WorkHours' | 'ScheduledHours' | 'HalfDay' | 'DefinedSchedule', item: AttendanceSummaryView) => {
      e.stopPropagation();
      let data: any[] = [];
      if (type === 'Late') data = getLateDetails(item);
      if (type === 'Absent') data = getAbsentDetails(item);
      if (type === 'Leave') data = getLeaveDetails(item);
      if (type === 'Present') data = getPresentDetails(item);
      if (type === 'WorkHours') data = getWorkHoursDetails(item);
      if (type === 'ScheduledHours') data = getScheduledHoursDetails(item);
      if (type === 'HalfDay') data = getHalfDayDetails(item);
      if (type === 'DefinedSchedule') data = getDefinedScheduleDetails(item);

      setDetailModal({
          isOpen: true,
          title: `${type} Details - ${item.userName}`,
          data
      });
  };

  const currentMonthYear = filterType === 'month' ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}` : 
    filterType === 'week' ? (() => {
      const end = new Date(currentWeekStart);
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
    const current = new Date(currentWeekStart);
    current.setDate(current.getDate() - 7);
    setCurrentWeekStart(current.toISOString().split('T')[0]);
  };

  const handleNextWeek = () => {
    const current = new Date(currentWeekStart);
    current.setDate(current.getDate() + 7);
    setCurrentWeekStart(current.toISOString().split('T')[0]);
  };

  // --- Calculation Helper ---
  const formatHoursMinutes = (hours: number): string => {
    const absHours = Math.abs(hours);
    if (absHours === 0) return '0';
    const totalMinutes = Math.round(absHours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const sign = hours < 0 ? '-' : '';
    if (h === 0) {
      return `${sign}${m}m`;
    }
    return `${sign}${h}h ${m}m`;
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
      // This matches the logic used for calcScheduled

      let total = 0;
      let workingDays = 0;

      // Get applicable schedule for this month
      const applicableSchedule = getApplicableSchedule(item);
      if (!applicableSchedule) return 0;

      // Helper for diff
      const timeToHours = (t?: string) => {
          if (!t) return 0;
          const [h, m] = t.split(':').map(Number);
          return h + (m / 60);
      };

      // Calculate scheduled hours for each day that has attendance data
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
        workingDays++;
      }

      // Subtract 1 hour lunch deduction for each working day
      const lunchDeduction = workingDays; // 1 hour per working day
      total = Math.max(0, total - lunchDeduction);

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

      // Special case: ThumbMachine with 00:00 checkin/checkout should be counted as Absent but not added to totals
      if (type === 'ThumbMachine' && rec.checkin === '00:00' && rec.checkout === '00:00') {
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
          if (!rec.checkin) return;
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
          
          if (rec.checkin > scheduledIn) count++;
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
        const sched = item.calcScheduled !== undefined ? item.calcScheduled : calculateTotalScheduledHours(item);
        const actual = item.summary.totalHour;
        const diff = actual === 0 ? 0 : actual - sched;
        // Calculate Late on frontend based on toggle
        const calcLate = calculateLateArrivals(item);

        return {
            ...item,
            calcScheduled: sched,
            calcExcessDeficit: diff,
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
        sun: metrics.sun,
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

      // Special highlighting for "Net Weekdays Working" column (column 25)
      if (colNumber === 25) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF6B35' } // Orange highlight
        };
      } else {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2C5F2D' } // Dark green
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
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEvenRow ? 'FFF8F9FA' : 'FFFFFFFF' }
        };

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

    // Define columns with widths - matching summary page display exactly
    worksheet.columns = [
      { key: 'paidFrom', header: 'Paid From', width: 12 },
      { key: 'employeeName', header: 'Employee Name', width: 25 },
      { key: 'category', header: 'Category', width: 12 },
      { key: 'verticalHead', header: 'Authorised Vertical Head', width: 25 },
      { key: 'employeeCode', header: 'Employee Code', width: 15 },
      { key: 'team', header: 'Team', width: 12 },
      { key: 'designation', header: 'Designation', width: 15 },
      { key: 'scheduled', header: 'Scheduled', width: 12 },
      { key: 'definedSchedule', header: 'Defined Schedule', width: 15 },
      { key: 'workHours', header: 'Work Hours', width: 12 },
      { key: 'excess', header: 'Excess', width: 10 },
      { key: 'late', header: 'Late', width: 8 },
      { key: 'halfDays', header: 'Half Days', width: 10 },
      { key: 'present', header: 'Present', width: 8 },
      { key: 'absent', header: 'Absent', width: 8 },
      { key: 'workingDays', header: 'Working Days', width: 12 }
    ];

    // Add data rows - using summary data from the database
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
        scheduled: item.calcScheduled || 0,
        definedSchedule: calculateDefinedScheduleHours(item),
        workHours: item.summary.totalHour,
        excess: item.calcExcessDeficit || 0,
        late: item.calcLate || 0,
        halfDays: item.summary.totalHalfDay,
        present: item.summary.totalPresent,
        absent: item.summary.totalAbsent,
        workingDays: item.summary.totalPresent + item.summary.totalAbsent + calculateLeaveConsumed(item)
      });
    });

    // Style the header row
    const headerRow = worksheet.getRow(1);
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

    // Style data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

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
    if (selectedEmployees.size === 0) {
      alert('Please select at least one employee to export.');
      return;
    }

    try {
      const userIds = Array.from(selectedEmployees);
      const requestBody = filterType === 'month'
        ? { userIds, monthYear: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}` }
        : filterType === 'week'
        ? (() => {
            const end = new Date(currentWeekStart);
            end.setDate(end.getDate() + 6);
            return { userIds, startDate: currentWeekStart, endDate: end.toISOString().split('T')[0] };
          })()
        : { userIds, startDate: rangeStart, endDate: rangeEnd };

      const response = await fetch('/api/attendance/range-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch attendance data');
      }

      // Import ExcelJS dynamically
      const ExcelJS = (await import('exceljs')).default;

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Day-wise Attendance');

      // Define columns with widths
      worksheet.columns = [
        { key: 'employeeName', header: 'Employee Name', width: 20 },
        { key: 'employeeId', header: 'Employee ID', width: 15 },
        { key: 'team', header: 'Team', width: 15 },
        { key: 'department', header: 'Department', width: 15 },
        { key: 'date', header: 'Date', width: 12 },
        { key: 'day', header: 'Day', width: 12 },
        { key: 'status', header: 'Status', width: 12 },
        { key: 'inTime', header: 'In Time', width: 10 },
        { key: 'outTime', header: 'Out Time', width: 10 },
        { key: 'totalHours', header: 'Total Hours', width: 12 },
        { key: 'typeOfPresence', header: 'Type of Presence', width: 20 },
        { key: 'lateArrival', header: 'Late Arrival', width: 12 },
        { key: 'halfDay', header: 'Half Day', width: 10 },
        { key: 'remarks', header: 'Remarks', width: 20 },
        { key: 'scheduledHours', header: 'Scheduled Hours', width: 15 },
        { key: 'excessDeficitHours', header: 'Excess/Deficit Hours', width: 18 }
      ];

      // Add data rows
      result.data.forEach((row: any) => {
        worksheet.addRow(row);
      });

      // Style the header row
      const headerRow = worksheet.getRow(1);
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

      // Style data rows
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header row

        const isEvenRow = rowNumber % 2 === 0;
        row.eachCell((cell) => {
          cell.font = { size: 10 };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isEvenRow ? 'FFF8F9FA' : 'FFFFFFFF' }
          };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
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
        ? `Daywise_Attendance_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx`
        : filterType === 'week'
        ? `Daywise_Attendance_Week_${currentWeekStart}.xlsx`
        : `Daywise_Attendance_${rangeStart}_to_${rangeEnd}.xlsx`;

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

    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export attendance data. Please try again.');
    }
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
    onFilterChange({start, end});
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
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
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
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
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
              
              <div className="px-4 flex items-center gap-2 font-medium text-slate-200 min-w-[140px] justify-center">
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
                  <th 
                    className="px-4 py-3 text-left font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('userName')}
                  >
                    <div className="flex items-center gap-1">
                      Employee
                      {sortField === 'userName' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-slate-400 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('employeeCode')}
                  >
                    <div className="flex items-center gap-1">
                      Emp Code
                      {sortField === 'employeeCode' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-slate-400 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('team')}
                  >
                    <div className="flex items-center gap-1">
                      Team
                      {sortField === 'team' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-slate-400 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('designation')}
                  >
                    <div className="flex items-center gap-1">
                      Designation
                      {sortField === 'designation' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-right font-semibold text-slate-400 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('calcScheduled')}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Scheduled
                      {sortField === 'calcScheduled' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-right font-semibold text-blue-300/90 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('definedSchedule')}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Defined Schedule
                      {sortField === 'definedSchedule' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-right font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('totalHour')}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Work Hours
                      {sortField === 'totalHour' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-right font-semibold text-emerald-300/90 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('calcExcessDeficit')}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Excess
                      {sortField === 'calcExcessDeficit' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-right font-semibold text-amber-300/90 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('calcLate')}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Late
                      {sortField === 'calcLate' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-right font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('totalHalfDay')}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Half Days
                      {sortField === 'totalHalfDay' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-right font-semibold text-emerald-300 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('totalPresent')}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Present
                      {sortField === 'totalPresent' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-right font-semibold text-rose-300 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('totalAbsent')}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Absent
                      {sortField === 'totalAbsent' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-right font-semibold text-slate-400 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('totalWorkingDays')}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Working Days
                      {sortField === 'totalWorkingDays' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-right font-semibold text-slate-400 cursor-pointer hover:bg-slate-800/60 select-none"
                    onClick={() => handleSort('totalLeave')}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Leave
                      {sortField === 'totalLeave' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
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
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200 group-hover:text-white cursor-pointer" onClick={() => onEmployeeClick(item.userId, item.monthYear)}>{item.userName}</div>
                      <div className="text-[10px] text-slate-500 font-mono hidden md:block">{item.employeeCode || item.odId || item.userId}</div>
                    </td>
                    <td className="px-4 py-3 text-left font-mono text-slate-400">{item.employeeCode || item.odId || '-'}</td>
                    <td className="px-4 py-3 text-left text-slate-400">{item.team || '-'}</td>
                    <td className="px-4 py-3 text-left text-slate-400">{item.designation || '-'}</td>
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
                    <td className="px-4 py-3 text-right font-mono">
                         {item.calcExcessDeficit !== undefined ? (
                             <span className={item.calcExcessDeficit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                 {item.calcExcessDeficit > 0 ? "+" : ""}{formatHoursMinutes(Math.abs(item.calcExcessDeficit))}
                             </span>
                         ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono" onClick={(e) => item.calcLate > 0 && openDetail(e, 'Late', item)}>
                      {item.calcLate > 0 ? (
                        <span className="text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-amber-400/20" title="Click to view details">{item.calcLate}</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => item.summary.totalHalfDay > 0 && openDetail(e, 'HalfDay', item)}>
                        {item.summary.totalHalfDay > 0 ? (
                           <span className="hover:underline" title="Click to view details">{item.summary.totalHalfDay}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => item.summary.totalPresent > 0 && openDetail(e, 'Present', item)}>
                        {item.summary.totalPresent > 0 ? (
                           <span className="hover:underline" title="Click to view details">{item.summary.totalPresent}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-rose-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => item.summary.totalAbsent > 0 && openDetail(e, 'Absent', item)}>
                        {item.summary.totalAbsent > 0 ? (
                           <span className="hover:underline" title="Click to view details">{item.summary.totalAbsent}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">{item.summary.totalPresent + item.summary.totalAbsent + calculateLeaveConsumed(item)}</td>
                    <td className="px-4 py-3 text-right font-mono text-sky-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => calculateLeaveConsumed(item) > 0 && openDetail(e, 'Leave', item)}>
                        {calculateLeaveConsumed(item) > 0 ? (
                           <span className="hover:underline" title="Click to view details">{calculateLeaveConsumed(item)}</span>
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
