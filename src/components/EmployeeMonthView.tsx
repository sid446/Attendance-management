import React from 'react';
import { Clock, CheckCircle, XCircle } from 'lucide-react';
import { AttendanceSummaryView, AttendanceRecord } from '@/types/ui';

interface EmployeeMonthViewProps {
  summaries: AttendanceSummaryView[];
  selectedEmployeeId: string | null;
  setSelectedEmployeeId: (id: string | null) => void;
  selectedMonthYear: string;
  onMonthYearChange: (val: string) => void;
  employeeDays: AttendanceRecord[];
  isLoading: boolean;
  error: string | null;
  onLoadAttendance: (employeeId: string, monthYear: string) => void;
}

export const EmployeeMonthView: React.FC<EmployeeMonthViewProps> = ({
  summaries,
  selectedEmployeeId,
  setSelectedEmployeeId,
  selectedMonthYear,
  onMonthYearChange,
  employeeDays,
  isLoading,
  error,
  onLoadAttendance
}) => {
  const selectedEmployee = summaries.find((s) => s.userId === selectedEmployeeId) || null;

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

      {selectedEmployee && selectedMonthYear && (
        <div className="text-xs text-slate-400">
          Showing records for <span className="text-slate-200">{selectedEmployee.userName}</span> in
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
                const isPresent = rec?.status === 'Present';
                const isAbsent = rec?.status === 'Absent';

                return (
                  <div
                    key={day}
                    className={`h-20 rounded-md border px-2 py-1 flex flex-col gap-1 text-[11px] ${
                      isPresent
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : isAbsent
                        ? 'border-rose-500/50 bg-rose-500/5'
                        : 'border-slate-700 bg-slate-950/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="font-semibold">{day}</span>
                      {rec && (
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                            isPresent
                              ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100'
                              : 'border-rose-500/60 bg-rose-500/15 text-rose-100'
                          }`}
                        >
                          {isPresent ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {rec.status}
                        </span>
                      )}
                    </div>
                    {rec && (
                      <div className="mt-1 space-y-0.5 text-slate-300">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>In: {rec.inTime || '-'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>Out: {rec.outTime || '-'}</span>
                        </div>
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
