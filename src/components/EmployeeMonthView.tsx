import React from 'react';
import { Clock, CheckCircle, XCircle, AlertTriangle, CalendarOff, Briefcase } from 'lucide-react';
import { AttendanceSummaryView, AttendanceRecord, User } from '@/types/ui';

interface EmployeeMonthViewProps {
  summaries: AttendanceSummaryView[];
  users: User[]; // All available users for dropdown
  selectedEmployeeId: string | null;
  setSelectedEmployeeId: (id: string | null) => void;
  selectedMonthYear: string;
  onMonthYearChange: (val: string) => void;
  employeeDays: AttendanceRecord[];
  isLoading: boolean;
  error: string | null;
  onLoadAttendance: (employeeId: string, monthYear: string) => void;
  onDayClick?: (date: string, currentStatus: string) => void; // Added for interactivity
}

export const EmployeeMonthView: React.FC<EmployeeMonthViewProps> = ({
  summaries,
  users,
  selectedEmployeeId,
  setSelectedEmployeeId,
  selectedMonthYear,
  onMonthYearChange,
  employeeDays,
  isLoading,
  error,
  onLoadAttendance,
  onDayClick
}) => {
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

  const calendarData = (() => {
    if (!selectedMonthYear || employeeDays.length === 0) return null;

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

    return { daysInMonth, startWeekday, dayRecordMap };
  })();

  // Determine lateness helper
  const isLateArrival = (date: Date, inTimeStr?: string) => {
      if (!inTimeStr || !summaryFromList?.schedules) return false;
      
      const parseMinutes = (t: string) => {
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m;
      };

      const actualMins = parseMinutes(inTimeStr);
      const dow = date.getDay();
      
      let scheduledStr = summaryFromList.schedules.regular?.inTime; // Default regular
      
      if (dow === 6 && summaryFromList.schedules.saturday?.inTime) {
          scheduledStr = summaryFromList.schedules.saturday.inTime;
      }
      
      if (dow === 0) return false; // Sunday or holiday logic handled separately

      if (!scheduledStr) return false;
      const scheduledMins = parseMinutes(scheduledStr);

      // 15 mins grace period? Or strict? Let's Assume strict > scheduled
      return actualMins > scheduledMins; 
  };

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Employee month-wise attendance</h2>
          <p className="text-xs text-slate-400 mt-1">
            Select an employee and month to inspect their daily check-in/out.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 text-xs">
        <div className="flex flex-col gap-1">
          <label className="text-slate-300">Employee</label>
          <select
            className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-100 min-w-[220px]"
            value={selectedEmployeeId ?? ''}
            onChange={(e) => setSelectedEmployeeId(e.target.value || null)}
          >
            <option value="">Select employee</option>
            {summaries
                  .reduce<{ id: string; name: string }[]>((acc, s) => {
                    if (!acc.find((x) => x.id === s.userId)) {
                      acc.push({ id: s.userId, name: s.userName });
                    }
                    return acc;
                  }, [])
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-slate-300">Year</label>
          <select
            value={selectedYear}
            onChange={handleYearChange}
            className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-100 w-24"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-slate-300">Month</label>
          <select
            value={selectedMonth}
            onChange={handleMonthChange}
            className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-100 w-32"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            if (selectedEmployeeId && selectedMonthYear) {
              onLoadAttendance(selectedEmployeeId, selectedMonthYear);
            }
          }}
          disabled={!selectedEmployeeId || !selectedMonthYear || isLoading}
          className="px-4 py-2 bg-emerald-500 text-slate-950 font-medium rounded-md hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Loading…' : 'Load attendance'}
        </button>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      {selectedEmployeeId && selectedMonthYear && (
        <div className="text-xs text-slate-400">
          Showing records for <span className="text-slate-200">{displayUserName}</span> in
          month <span className="text-slate-200">{selectedMonthYear}</span>.
        </div>
      )}

      <div className="border border-slate-800 rounded-lg p-4">
        {!calendarData ? (
          <div className="text-xs text-slate-500">
            No records loaded. Select employee and month, then click "Load attendance".
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-2 mb-2 text-[11px] text-slate-400">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-center font-medium">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2 text-xs">
              {Array.from({ length: calendarData.startWeekday }).map((_, idx) => (
                <div key={`blank-${idx}`} />
              ))}
              {Array.from({ length: calendarData.daysInMonth }).map((_, idx) => {
                const day = idx + 1;
                const rec = calendarData.dayRecordMap.get(day) || null;
                let status: any = rec?.status;
                const type = rec?.typeOfPresence;
                
                // Override status if 00:00 - 00:00 (Absent)
                if (rec && rec.inTime === '00:00' && rec.outTime === '00:00') {
                    // Check if there is a specific type like Leave, Holiday, etc.
                    if (type && type !== 'ThumbMachine' && type !== 'Manual' && type !== 'Remote') {
                        status = type; // Use the specific type (e.g. Leave, OHD, WFH)
                    } else {
                        status = 'Absent';
                    }
                }
                
                // Check lateness
                const dateObj = new Date(selectedYear, selectedMonth - 1, day);
                const isLate = rec ? isLateArrival(dateObj, rec.inTime) : false;

                let borderClass = 'border-slate-700';
                let bgClass = 'bg-slate-950/40';
                let badgeClass = 'border-slate-700 bg-slate-800 text-slate-400';
                let Icon = XCircle;

                if (status === 'Present') {
                    borderClass = isLate ? 'border-amber-500/50' : 'border-emerald-500/50'; // Amber border if late
                    bgClass = isLate ? 'bg-amber-500/5' : 'bg-emerald-500/5';
                    badgeClass = 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100';
                    Icon = CheckCircle;
                } else if (status === 'Absent') {
                    borderClass = 'border-rose-500/50';
                    bgClass = 'bg-rose-500/5';
                    badgeClass = 'border-rose-500/60 bg-rose-500/15 text-rose-100';
                    Icon = XCircle;
                } else if (status === 'Leave' || status === 'On leave') {
                    borderClass = 'border-sky-500/50';
                    bgClass = 'bg-sky-500/5';
                    badgeClass = 'border-sky-500/60 bg-sky-500/15 text-sky-100';
                    Icon = CalendarOff;
                } else if (status === 'Holiday' || status === 'Week Off') {
                    borderClass = 'border-amber-500/50';
                    bgClass = 'bg-amber-500/5';
                    badgeClass = 'border-amber-500/60 bg-amber-500/15 text-amber-100';
                    Icon = Briefcase;
                } else if (status === 'HalfDay' || status === 'Half Day (HD)') {
                    borderClass = 'border-orange-500/50';
                    bgClass = 'bg-orange-500/5';
                    badgeClass = 'border-orange-500/60 bg-orange-500/15 text-orange-100';
                    Icon = AlertTriangle;
                } else if (typeof status === 'string') {
                    // Fallback for new types (OHD, WFH, OS-P, etc.)
                    // Treat them generally as "Provisional/Special" - Blue/Purple?
                    // Let's use a Generic Present-like style but maybe different color
                    borderClass = 'border-indigo-500/50';
                    bgClass = 'bg-indigo-500/5';
                    badgeClass = 'border-indigo-500/60 bg-indigo-500/15 text-indigo-100';
                    Icon = Briefcase;
                }

                return (
                  <div
                    key={day}
                    onClick={() => {
                        if (onDayClick && status === 'Absent') {
                            const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                            onDayClick(dateStr, status);
                        }
                    }}
                    className={`h-24 rounded-md border px-2 py-1 flex flex-col gap-1 text-[11px] ${borderClass} ${bgClass} ${onDayClick && status === 'Absent' ? 'cursor-pointer hover:ring-2 hover:ring-emerald-500/50 transition-shadow' : ''}`}
                  >
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="font-semibold">{day}</span>
                      {rec && (
                        <div className="flex gap-1">
                            {isLate && (
                                <span className="inline-flex items-center px-1 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold border border-amber-500/30">
                                    LATE
                                </span>
                            )}
                            <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${badgeClass}`}
                            >
                            <Icon className="w-3 h-3" />
                            {status}
                            </span>
                        </div>
                      )}
                    </div>
                    {rec && (
                      <div className="mt-1 space-y-0.5 text-slate-300">
                        {status !== 'Leave' && status !== 'Holiday' && (
                          <>
                            <div className="flex items-center gap-1">
                              <Clock className={`w-3 h-3 ${isLate ? 'text-amber-500' : 'text-slate-500'}`} />
                              <span className={isLate ? 'text-amber-200' : ''}>In: {rec.inTime || '-'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>Out: {rec.outTime || '-'}</span>
                            </div>
                          </>
                        )}
                        {/* Show type or simplified status if special */}
                        {(status === 'Leave' || status === 'On leave' || status === 'Holiday' || status !== rec.typeOfPresence) && (
                            <div className="text-[10px] italic text-slate-400 mt-1 truncate" title={type}>{type || status}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
};
