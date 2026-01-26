import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AttendanceSummaryView, User } from '@/types/ui';
import { Search, Calendar, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, BarChart3, Users, Clock, AlertCircle, TrendingUp, UserX, UserCheck, Download, ListChecks, X } from 'lucide-react';
import { BulkLeaveManager } from './BulkLeaveManager';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

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

  const getLateDetails = (item: AttendanceSummaryView) => {
      const records = item.recordDetails || {};
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      
      Object.entries(records).forEach(([date, rec]) => {
          if (!rec.checkin) return;
          
          let scheduledIn = '10:00'; 
          const d = new Date(date);
          const day = d.getDay(); 
          const month = d.getMonth() + 1;

          // Replicate backend logic but respect toggle
          if (day === 0) {
             scheduledIn = item.schedules?.regular?.inTime || '09:00';
          } else if (day === 6) {
             scheduledIn = item.schedules?.saturday?.inTime || '09:00';
          } else {
             // Weekdays
             if (selectedMonth === 1 || selectedMonth === 12) {
                scheduledIn = item.schedules?.monthly?.inTime || '09:00'; 
             } else {
                scheduledIn = item.schedules?.regular?.inTime || '09:00';
             }
          }
          
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
      const records = item.recordDetails || {};
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      Object.entries(records).forEach(([date, rec]) => {
          if (rec.totalHour > 0 && rec.typeOfPresence !== 'Holiday') {
               dates.push({ date, info: `${rec.totalHour.toFixed(1)} hours`, subInfo: rec.checkin ? `In: ${rec.checkin}` : undefined });
          }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getScheduledHoursDetails = (item: AttendanceSummaryView) => {
      const records = item.recordDetails || {};
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      
      const { schedules } = item;
      if (!schedules) return dates;

      // Helper for diff
      const timeToHours = (t?: string) => {
          if (!t) return 0;
          const [h, m] = t.split(':').map(Number);
          return h + (m / 60);
      };
      
      // Calculate daily hours for each schedule type
      const startReg = timeToHours(schedules.regular?.inTime);
      const endReg = timeToHours(schedules.regular?.outTime);
      const hoursReg = (startReg && endReg && endReg > startReg) ? (endReg - startReg) : 9;

      const startSat = timeToHours(schedules.saturday?.inTime) || startReg;
      const endSat = timeToHours(schedules.saturday?.outTime);
      const hoursSat = (startSat && endSat && endSat > startSat) ? (endSat - startSat) : 4;

      const startMonth = timeToHours(schedules.monthly?.inTime) || startReg;
      const endMonth = timeToHours(schedules.monthly?.outTime);
      const hoursMonth = (startMonth && endMonth && endMonth > startMonth) ? (endMonth - startMonth) : hoursReg;

      // Get the period
      let start: Date, end: Date;
      if (filterType === 'month') {
          start = new Date(selectedYear, selectedMonth - 1, 1);
          end = new Date(selectedYear, selectedMonth, 0);
      } else if (filterType === 'week') {
          start = new Date(currentWeekStart);
          end = new Date(currentWeekStart);
          end.setDate(end.getDate() + 6);
      } else {
          start = new Date(rangeStart);
          end = new Date(rangeEnd);
      }

      Object.entries(records).forEach(([date, rec]) => {
          if (rec.typeOfPresence === 'Holiday') return;
          
          const d = new Date(date);
          const dow = d.getDay();
          if (dow === 0) return; // Sunday off

          let hours = 0;
          if (dow === 6) {
              hours = hoursSat;
          } else {
              const month = d.getMonth() + 1;
              hours = (month === 1 || month === 12) ? hoursMonth : hoursReg;
          }

          if (hours > 0) {
              dates.push({ 
                  date, 
                  info: `${hours.toFixed(2)} hours`,
                  subInfo: dow === 6 ? 'Saturday' : ((d.getMonth() + 1 === 1 || d.getMonth() + 1 === 12) ? 'Seasonal' : 'Regular')
              });
          }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const openDetail = (e: React.MouseEvent, type: 'Late' | 'Absent' | 'Leave' | 'Present' | 'WorkHours' | 'ScheduledHours' | 'HalfDay', item: AttendanceSummaryView) => {
      e.stopPropagation();
      let data: any[] = [];
      if (type === 'Late') data = getLateDetails(item);
      if (type === 'Absent') data = getAbsentDetails(item);
      if (type === 'Leave') data = getLeaveDetails(item);
      if (type === 'Present') data = getPresentDetails(item);
      if (type === 'WorkHours') data = getWorkHoursDetails(item);
      if (type === 'ScheduledHours') data = getScheduledHoursDetails(item);
      if (type === 'HalfDay') data = getHalfDayDetails(item);

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
  
  // Initialize current week start
  useEffect(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(now.setDate(diff));
    setCurrentWeekStart(monday.toISOString().split('T')[0]);
  }, []);

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
  const calculateTotalScheduledHours = (item: AttendanceSummaryView): number => {
      // 1. Get days in month
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      
      let total = 0;
      
      const { schedules } = item;
      if (!schedules) return 0; // Or standard default 9?

      // Helper for diff
      const timeToHours = (t?: string) => {
          if (!t) return 0;
          const [h, m] = t.split(':').map(Number);
          return h + (m / 60);
      };
      
      // Calculate daily hours for each schedule type
      // Regular
      const startReg = timeToHours(schedules.regular?.inTime);
      const endReg = timeToHours(schedules.regular?.outTime);
      const hoursReg = (startReg && endReg && endReg > startReg) ? (endReg - startReg) : 9; // Default 9?

      // Saturday
      const startSat = timeToHours(schedules.saturday?.inTime) || startReg;
      const endSat = timeToHours(schedules.saturday?.outTime);
      const hoursSat = (startSat && endSat && endSat > startSat) ? (endSat - startSat) : 4; // Default 4?

      // Monthly Special
      const startMonth = timeToHours(schedules.monthly?.inTime) || startReg;
      const endMonth = timeToHours(schedules.monthly?.outTime);
      const hoursMonth = (startMonth && endMonth && endMonth > startMonth) ? (endMonth - startMonth) : hoursReg;

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(selectedYear, selectedMonth - 1, day);
        const dow = date.getDay(); // 0=Sun, 6=Sat

        if (dow === 0) {
            // Sunday = 0
            continue;
        } 
        
        if (dow === 6) {
           // Saturday
           total += hoursSat;
           continue;
        }

        // Weekday
        if (selectedMonth === 1 || selectedMonth === 12) {
            total += hoursMonth;
        } else {
            total += hoursReg;
        }
      }
      return total;
  };

  const calculateLateArrivals = (item: AttendanceSummaryView): number => {
      const records = item.recordDetails || {};
      let count = 0;
      Object.entries(records).forEach(([dateStr, rec]) => {
          if (!rec.checkin) return;
          const d = new Date(dateStr);
          const day = d.getDay();
          
          let scheduledIn = '09:00';
          
          if (day === 0) {
             scheduledIn = item.schedules?.regular?.inTime || '09:00';
          } else if (day === 6) {
             scheduledIn = item.schedules?.saturday?.inTime || '09:00';
          } else {
             // Weekdays
             if (selectedMonth === 1 || selectedMonth === 12) {
                scheduledIn = item.schedules?.monthly?.inTime || '09:00'; 
             } else {
                scheduledIn = item.schedules?.regular?.inTime || '09:00';
             }
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
    let list = summaries;
    
    // Text search filter
    if (searchTerm) {
      list = summaries.filter(item => 
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
        const diff = actual - sched;
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
          aValue = a.summary.totalLeave;
          bValue = b.summary.totalLeave;
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
      totalLeaves: acc.totalLeaves + curr.summary.totalLeave
    }), {
      totalEmployees: 0,
      totalHours: 0,
      totalLate: 0,
      totalAbsents: 0,
      totalLeaves: 0
    });
  }, [filteredSummaries]);

 const handleExport = () => {
    if (filteredSummaries.length === 0) return;

    // Create workbook and worksheet manually for better control
    const wb = XLSX.utils.book_new();
    
    // Create header row with styling markers
    const headers = [
      "Sr. No.", "Employee Name", "Emp Code", "Team", "Designation", "Scheduled Hours", "Actual Hours", 
      "Excess/Deficit", "Late Arrivals", "Half Days", "Present Days", 
      "Absent Days", "Working Days", "Leaves Taken"
    ];
    
    // Create data rows
    const rows = filteredSummaries.map((item, index) => [
      index + 1,
      item.userName,
      item.employeeCode || item.odId || 'N/A',
      item.team || 'N/A',
      item.designation || 'N/A',
      item.calcScheduled?.toFixed(1) || '0.0',
      item.summary.totalHour.toFixed(1),
      item.calcExcessDeficit !== undefined ? item.calcExcessDeficit.toFixed(1) : '0.0',
      item.calcLate || 0,
      item.summary.totalHalfDay || 0,
      item.summary.totalPresent || 0,
      item.summary.totalAbsent || 0,
      item.summary.totalPresent + item.summary.totalAbsent + item.summary.totalLeave,
      item.summary.totalLeave || 0
    ]);
    
    // Combine headers and data
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 8 },  { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, 
      { wch: 13 }, { wch: 15 }, { wch: 8 },  { wch: 14 }, { wch: 11 }, 
      { wch: 12 }, { wch: 14 }
    ];
    
    // Apply cell styles using the `s` property
    const range = XLSX.utils.decode_range(ws['!ref'] || "A1");
    
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) continue;
        
        // Initialize cell style
        ws[cellAddress].s = {};
        
        // Header row (R === 0)
        if (R === 0) {
          ws[cellAddress].s = {
            font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "2C5F2D" } },
            alignment: { vertical: "center", horizontal: "center" },
            border: {
              top: { style: "thin", color: { rgb: "000000" } },
              bottom: { style: "thin", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "000000" } },
              right: { style: "thin", color: { rgb: "000000" } }
            }
          };
        } else {
          // Data rows
          const isEvenRow = R % 2 === 0;
          ws[cellAddress].s = {
            font: { sz: 10 },
            fill: { fgColor: { rgb: isEvenRow ? "F8F9FA" : "FFFFFF" } },
            alignment: { 
              vertical: "center", 
              horizontal: C === 1 ? "left" : "center" 
            },
            border: {
              top: { style: "thin", color: { rgb: "E0E0E0" } },
              bottom: { style: "thin", color: { rgb: "E0E0E0" } },
              left: { style: "thin", color: { rgb: "E0E0E0" } },
              right: { style: "thin", color: { rgb: "E0E0E0" } }
            }
          };
          
          // Conditional formatting for Excess/Deficit column (C === 5)
          if (C === 5) {
            const value = parseFloat(ws[cellAddress].v);
            if (!isNaN(value)) {
              if (value > 0) {
                ws[cellAddress].s.font = { sz: 10, color: { rgb: "097969" }, bold: true };
              } else if (value < 0) {
                ws[cellAddress].s.font = { sz: 10, color: { rgb: "DC2626" }, bold: true };
              }
            }
          }
          
          // Bold rank column (C === 6)
          if (C === 6) {
            ws[cellAddress].s.font = { sz: 10, bold: true };
          }
        }
      }
    }
    
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Summary");
    
    const fileName = filterType === 'month' ? `Attendance_Summary_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx` : 
      filterType === 'week' ? `Attendance_Summary_Week_${currentWeekStart}.xlsx` : 
      `Attendance_Summary_${rangeStart}_to_${rangeEnd}.xlsx`;
    XLSX.writeFile(wb, fileName, { cellStyles: true });
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

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result.data);

      // Set column widths
      ws['!cols'] = [
        { wch: 20 }, // Employee Name
        { wch: 15 }, // Employee ID
        { wch: 15 }, // Team
        { wch: 15 }, // Department
        { wch: 12 }, // Date
        { wch: 12 }, // Day
        { wch: 12 }, // Status
        { wch: 10 }, // In Time
        { wch: 10 }, // Out Time
        { wch: 12 }, // Total Hours
        { wch: 20 }, // Type of Presence
        { wch: 12 }, // Late Arrival
        { wch: 10 }, // Half Day
        { wch: 20 }, // Remarks
        { wch: 15 }, // Scheduled Hours
        { wch: 18 }, // Excess/Deficit Hours
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Day-wise Attendance");

      const fileName = filterType === 'month' ? `Daywise_Attendance_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx` : 
        filterType === 'week' ? `Daywise_Attendance_Week_${currentWeekStart}.xlsx` : 
        `Daywise_Attendance_${rangeStart}_to_${rangeEnd}.xlsx`;
      XLSX.writeFile(wb, fileName, { cellStyles: true });

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
             <div className="text-2xl font-bold text-slate-100">{stats.totalHours.toFixed(1)}</div>
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
                    className="px-4 py-3 text-right font-semibold text-sky-300 cursor-pointer hover:bg-slate-800/60 select-none"
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
                           <span className="hover:underline" title="Click to view daily breakdown">{item.calcScheduled?.toFixed(1) ?? '-'}</span>
                        ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300 cursor-pointer hover:bg-slate-800/60" onClick={(e) => item.summary.totalHour > 0 && openDetail(e, 'WorkHours', item)}>
                        {item.summary.totalHour > 0 ? (
                           <span className="hover:underline" title="Click to view daily breakdown">{item.summary.totalHour.toFixed(1)}</span>
                        ) : '0.0'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                         {item.calcExcessDeficit !== undefined ? (
                             <span className={item.calcExcessDeficit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                 {item.calcExcessDeficit > 0 ? "+" : ""}{item.calcExcessDeficit.toFixed(1)}
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
                    <td className="px-4 py-3 text-right font-mono text-slate-400">{item.summary.totalPresent + item.summary.totalAbsent + item.summary.totalLeave}</td>
                    <td className="px-4 py-3 text-right font-mono text-sky-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => item.summary.totalLeave > 0 && openDetail(e, 'Leave', item)}>
                        {item.summary.totalLeave > 0 ? (
                           <span className="hover:underline" title="Click to view details">{item.summary.totalLeave}</span>
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
