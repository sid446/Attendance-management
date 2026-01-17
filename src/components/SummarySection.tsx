import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AttendanceSummaryView, User } from '@/types/ui';
import { Search, Calendar, ChevronLeft, ChevronRight, BarChart3, Users, Clock, AlertCircle, TrendingUp, UserX, UserCheck, Download, ListChecks, X } from 'lucide-react';
import { BulkLeaveManager } from './BulkLeaveManager';

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
  onFilterChange: (monthYear: string) => void;
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
  const [useSpecialMonthSchedule, setUseSpecialMonthSchedule] = useState<boolean>(false);
  const [isBulkManagerOpen, setIsBulkManagerOpen] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  
  // Detail Modal State
  const [detailModal, setDetailModal] = useState<{isOpen: boolean; title: string; data: {date: string; info: string; subInfo?: string}[]}>({
      isOpen: false, title: '', data: []
  });

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
             if (useSpecialMonthSchedule) {
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
          if (rec.totalHour === 0 && rec.typeOfPresence !== 'Leave' && rec.typeOfPresence !== 'Holiday') {
               dates.push({ date, info: 'Absent', subInfo: rec.typeOfPresence === 'ThumbMachine' ? '0 Hours' : rec.typeOfPresence });
          }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getLeaveDetails = (item: AttendanceSummaryView) => {
      const records = item.recordDetails || {};
      const dates: { date: string; info: string; subInfo?: string }[] = [];
      Object.entries(records).forEach(([date, rec]) => {
          if (rec.typeOfPresence === 'Leave') {
               dates.push({ date, info: 'Leave' });
          }
      });
      return dates.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const openDetail = (e: React.MouseEvent, type: 'Late' | 'Absent' | 'Leave', item: AttendanceSummaryView) => {
      e.stopPropagation();
      let data: any[] = [];
      if (type === 'Late') data = getLateDetails(item);
      if (type === 'Absent') data = getAbsentDetails(item);
      if (type === 'Leave') data = getLeaveDetails(item);

      setDetailModal({
          isOpen: true,
          title: `${type} Details - ${item.userName}`,
          data
      });
  };

  const currentMonthYear = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

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
    const monthStr = String(selectedMonth).padStart(2, '0');
    const monthYear = `${selectedYear}-${monthStr}`;
    onFilterChange(monthYear);
  }, [selectedYear, selectedMonth]); // Missing onFilterChange dependency is intentional to avoid loop if passed inline

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
        if (useSpecialMonthSchedule) {
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
             if (useSpecialMonthSchedule) {
                scheduledIn = item.schedules?.monthly?.inTime || '09:00'; 
             } else {
                scheduledIn = item.schedules?.regular?.inTime || '09:00';
             }
          }
          
          if (rec.checkin > scheduledIn) count++;
      });
      return count;
  };

  const filteredSummaries = useMemo(() => {
    let list = summaries;
    if (searchTerm) {
      list = summaries.filter(item => 
        item.userName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    // Enrich with calculations
    const enriched = list.map(item => {
        const sched = calculateTotalScheduledHours(item);
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

    // Sort by Excess/Deficit Descending
    enriched.sort((a, b) => b.calcExcessDeficit - a.calcExcessDeficit);

    // Add Rank
    return enriched.map((item, index) => ({
      ...item,
      rank: index + 1
    }));
  }, [summaries, searchTerm, selectedYear, selectedMonth, useSpecialMonthSchedule]);

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
  }, [filteredSummaries]); // filteredSummaries depends on useSpecialMonthSchedule

 const handleExport = () => {
    if (filteredSummaries.length === 0) return;

    // Create workbook and worksheet manually for better control
    const wb = XLSX.utils.book_new();
    
    // Create header row with styling markers
    const headers = [
      "Sr. No.", "Employee Name", "Team", "Designation", "Scheduled Hours", "Actual Hours", 
      "Excess/Deficit", "Rank", "Late Arrivals", "Half Days", "Present Days", 
      "Absent Days", "Leaves Taken"
    ];
    
    // Create data rows
    const rows = filteredSummaries.map((item, index) => [
      index + 1,
      item.userName,
      item.team || 'N/A',
      item.designation || 'N/A',
      item.calcScheduled?.toFixed(1) || '0.0',
      item.summary.totalHour.toFixed(1),
      item.calcExcessDeficit !== undefined ? item.calcExcessDeficit.toFixed(1) : '0.0',
      item.rank,
      item.calcLate || 0,
      item.summary.totalHalfDay || 0,
      item.summary.totalPresent || 0,
      item.summary.totalAbsent || 0,
      item.summary.totalLeave || 0
    ]);
    
    // Combine headers and data
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 8 },  { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, 
      { wch: 13 }, { wch: 15 }, { wch: 8 },  { wch: 14 }, { wch: 11 }, 
      { wch: 14 }, { wch: 13 }, { wch: 14 }
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
    
    const fileName = `Attendance_Summary_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx`;
    XLSX.writeFile(wb, fileName, { cellStyles: true });
  };

  const handleDayWiseExport = async () => {
    if (selectedEmployees.size === 0) {
      alert('Please select at least one employee to export.');
      return;
    }

    try {
      const monthYear = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      const userIds = Array.from(selectedEmployees);

      const response = await fetch('/api/attendance/range-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userIds,
          monthYear,
        }),
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

      const fileName = `Daywise_Attendance_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx`;
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
  const currentPeriodLabel = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* 1. Control Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
           {/* Date Navigation */}
           <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-1">
              <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <div className="px-4 flex items-center gap-2 font-medium text-slate-200 min-w-[140px] justify-center">
                <Calendar className="w-4 h-4 text-emerald-500" />
                <span>{currentPeriodLabel}</span>
              </div>

              <button onClick={handleNextMonth} className="p-2 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
           </div>
           
           {/* Year/Month Manual Selectors (Hidden on small screens if space limited, or visible) */}
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

            {/* Special Month/Seasonal Schedule Toggle */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-2 rounded-md">
                <label className="text-xs text-slate-400 font-medium whitespace-nowrap cursor-pointer select-none" htmlFor="specialMonthToggle">
                    Seasonal Schedule
                </label>
                <div 
                    className={`relative w-9 h-5 rounded-full cursor-pointer transition-colors ${useSpecialMonthSchedule ? 'bg-emerald-600' : 'bg-slate-700'}`}
                    onClick={() => setUseSpecialMonthSchedule(!useSpecialMonthSchedule)}
                >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${useSpecialMonthSchedule ? 'translate-x-4' : ''}`}></div>
                </div>
            </div>
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
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-full md:rounded-md transition-colors shadow-sm"
            title="Export Summary to Excel"
          >
             <Download className="w-4 h-4" />
             <span className="hidden md:inline">Summary Export</span>
          </button>

          <button 
            onClick={handleDayWiseExport}
            disabled={selectedEmployees.size === 0}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-xs font-medium rounded-full md:rounded-md transition-colors shadow-sm"
            title="Export Day-wise Attendance for Selected Employees"
          >
             <Download className="w-4 h-4" />
             <span className="hidden md:inline">Day-wise Export ({selectedEmployees.size})</span>
          </button>
          
          <button 
            onClick={() => setIsBulkManagerOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-full md:rounded-md transition-colors border border-slate-700"
            title="Bulk Manage Absent/Leave"
          >
             <ListChecks className="w-4 h-4" />
             <span className="hidden md:inline">Status Manager</span>
          </button>
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
                  <th className="px-4 py-3 text-left font-semibold text-slate-400">Rank</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-300">Employee</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-400">Team</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-400">Designation</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-400">Scheduled</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-300">Work Hours</th>
                  <th className="px-4 py-3 text-right font-semibold text-emerald-300/90">Excess</th>
                  <th className="px-4 py-3 text-right font-semibold text-amber-300/90">Late</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-300">Half Days</th>
                  <th className="px-4 py-3 text-right font-semibold text-emerald-300">Present</th>
                  <th className="px-4 py-3 text-right font-semibold text-rose-300">Absent</th>
                  <th className="px-4 py-3 text-right font-semibold text-sky-300">Leave</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(filteredSummaries as any[]).map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                    onClick={() => onEmployeeClick(item.userId, item.monthYear)}
                  >
                    <td className="px-4 py-3 text-left" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedEmployees.has(item.userId)}
                        onChange={(e) => handleSelectEmployee(item.userId, e.target.checked)}
                        className="rounded border-slate-600 text-emerald-600 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-left font-mono text-slate-500 font-bold">{item.rank}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200 group-hover:text-white">{item.userName}</div>
                      <div className="text-[10px] text-slate-500 font-mono hidden md:block">{item.employeeCode || item.odId || item.userId}</div>
                    </td>
                    <td className="px-4 py-3 text-left text-slate-400">{item.team || '-'}</td>
                    <td className="px-4 py-3 text-left text-slate-400">{item.designation || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">{item.calcScheduled?.toFixed(1) ?? '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{item.summary.totalHour?.toFixed(1)}</td>
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
                    <td className="px-4 py-3 text-right font-mono text-slate-400">{item.summary.totalHalfDay > 0 ? item.summary.totalHalfDay : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-400">{item.summary.totalPresent}</td>
                    <td className="px-4 py-3 text-right font-mono text-rose-400 cursor-pointer hover:bg-slate-800/60" onClick={(e) => item.summary.totalAbsent > 0 && openDetail(e, 'Absent', item)}>
                        {item.summary.totalAbsent > 0 ? (
                           <span className="hover:underline" title="Click to view details">{item.summary.totalAbsent}</span>
                        ) : '-'}
                    </td>
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
    </div>
  );
};
