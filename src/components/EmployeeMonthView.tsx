import React from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  CalendarOff,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  Calendar,
  Search,
  Edit3,
  FileCheck,
  Loader2,
  Home,
  Building2,
  Plane,
  Sun,
} from 'lucide-react';
import { AttendanceSummaryView, AttendanceRecord, User, DailySchedule } from '@/types/ui';
import { ScheduleEntry } from '@/types/ui';
import { getScheduledTimes } from '@/lib/scheduleUtils';
interface ApprovedRequest {
  _id: string;
  date: string;
  requestedStatus: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: string;
  updatedAt?: string;
}

type CellStyleResult = {
  borderClass: string;
  bgClass: string;
  badgeClass: string;
  Icon: React.ElementType;
  /** When set, replaces `status` for display (e.g. paid vs unpaid leave). */
  statusLabel?: string;
};

/** Distinct calendar cell colours by `status`, `typeOfPresence`, and `halfDay`. */
function resolveAttendanceCellStyle(input: {
  status: any;
  type?: string;
  rec: AttendanceRecord;
  isLate: boolean;
}): CellStyleResult {
  const { status, type = '', rec, isLate } = input;
  const t = type.toLowerCase();
  const s = String(status ?? '').toLowerCase();
  const hay = `${s} ${t}`;

  if (status === 'Leave' || status === 'On leave') {
    let borderClass = 'border-sky-200';
    let bgClass = 'bg-sky-50';
    let badgeClass = 'border-sky-300 bg-sky-100 text-sky-900';
    let statusLabel: string;
    if (rec.value !== undefined && rec.value > 0) {
      statusLabel = 'Paid Leave';
    } else {
      statusLabel = 'Unpaid Leave';
      borderClass = 'border-rose-200';
      bgClass = 'bg-rose-50';
      badgeClass = 'border-rose-300 bg-rose-100 text-rose-900';
    }
    return { borderClass, bgClass, badgeClass, Icon: CalendarOff, statusLabel };
  }

  if (status === 'Holiday' || status === 'Week Off') {
    return {
      borderClass: 'border-cyan-200',
      bgClass: 'bg-cyan-50',
      badgeClass: 'border-cyan-300 bg-cyan-100 text-cyan-900',
      Icon: Briefcase,
    };
  }

  if (status === 'Absent') {
    return {
      borderClass: 'border-rose-200',
      bgClass: 'bg-rose-50',
      badgeClass: 'border-rose-300 bg-rose-100 text-rose-900',
      Icon: XCircle,
    };
  }

  if (status === 'Missed Entry') {
    return {
      borderClass: 'border-red-400',
      bgClass: 'bg-red-200',
      badgeClass: 'border-red-500 bg-red-300 text-red-950',
      Icon: XCircle,
    };
  }

  const isHalfDay =
    status === 'HalfDay' ||
    status === 'Half Day (HD)' ||
    t.includes('half day') ||
    (rec.halfDay &&
      status !== 'Leave' &&
      status !== 'On leave' &&
      status !== 'Holiday' &&
      status !== 'Week Off' &&
      status !== 'Absent' &&
      !t.includes('holiday'));

  if (isHalfDay) {
    return {
      borderClass: 'border-orange-200',
      bgClass: 'bg-orange-50',
      badgeClass: 'border-orange-300 bg-orange-100 text-orange-900',
      Icon: AlertTriangle,
    };
  }

  const isPresentLike =
    status === 'Present' ||
    hay.includes('present -') ||
    hay.includes('present-') ||
    t === 'thumbmachine' ||
    t === 'manual' ||
    t === 'remote' ||
    hay.includes('thumb machine');

  if (isPresentLike) {
    if (t === 'thumbmachine' || t === 'manual' || t === 'remote' || hay.includes('thumb machine')) {
      return {
        borderClass: 'border-border',
        bgClass: 'bg-background',
        badgeClass: 'border-border bg-surface text-foreground',
        Icon: Clock,
      };
    }
    if (t.includes('client') || hay.includes('clientplace')) {
      return {
        borderClass: 'border-teal-200',
        bgClass: 'bg-teal-50',
        badgeClass: 'border-teal-300 bg-teal-100 text-teal-900',
        Icon: Building2,
      };
    }
    if (t.includes('outstation') || hay.includes('out station')) {
      return {
        borderClass: 'border-sky-200',
        bgClass: 'bg-sky-50',
        badgeClass: 'border-sky-300 bg-sky-100 text-sky-900',
        Icon: Plane,
      };
    }
    if (t.includes('wfh') || hay.includes('work from home') || (hay.includes('weekly off') && hay.includes('wfh')) || hay.includes('wo-wfh')) {
      return {
        borderClass: 'border-violet-200',
        bgClass: 'bg-violet-50',
        badgeClass: 'border-violet-300 bg-violet-100 text-violet-900',
        Icon: Home,
      };
    }
    if (t.includes('ohd') || hay.includes('official holiday duty')) {
      return {
        borderClass: 'border-yellow-200',
        bgClass: 'bg-yellow-50',
        badgeClass: 'border-yellow-300 bg-yellow-100 text-yellow-900',
        Icon: Sun,
      };
    }
    if ((t.includes('weekoff') || t.includes('week off')) && (t.includes('present') || status === 'Present')) {
      return {
        borderClass: 'border-lime-200',
        bgClass: 'bg-lime-50',
        badgeClass: 'border-lime-300 bg-lime-100 text-lime-900',
        Icon: Calendar,
      };
    }

    return {
      borderClass: isLate ? 'border-amber-200' : 'border-emerald-200',
      bgClass: isLate ? 'bg-amber-50' : 'bg-emerald-50',
      badgeClass: isLate
        ? 'border-amber-300 bg-amber-100 text-amber-900'
        : 'border-emerald-300 bg-emerald-100 text-emerald-900',
      Icon: CheckCircle,
    };
  }

  if (typeof status === 'string') {
    if (hay.includes('wfh') || hay.includes('work from home') || hay.includes('wo-wfh')) {
      return {
        borderClass: 'border-violet-200',
        bgClass: 'bg-violet-50',
        badgeClass: 'border-violet-300 bg-violet-100 text-violet-900',
        Icon: Home,
      };
    }
    if (hay.includes('ohd') || hay.includes('official holiday duty')) {
      return {
        borderClass: 'border-yellow-200',
        bgClass: 'bg-yellow-50',
        badgeClass: 'border-yellow-300 bg-yellow-100 text-yellow-900',
        Icon: Sun,
      };
    }
    if (hay.includes('client') || hay.includes('clientplace')) {
      return {
        borderClass: 'border-teal-200',
        bgClass: 'bg-teal-50',
        badgeClass: 'border-teal-300 bg-teal-100 text-teal-900',
        Icon: Building2,
      };
    }
    if (hay.includes('outstation')) {
      return {
        borderClass: 'border-sky-200',
        bgClass: 'bg-sky-50',
        badgeClass: 'border-sky-300 bg-sky-100 text-sky-900',
        Icon: Plane,
      };
    }
    if (hay.includes('half day')) {
      return {
        borderClass: 'border-orange-200',
        bgClass: 'bg-orange-50',
        badgeClass: 'border-orange-300 bg-orange-100 text-orange-900',
        Icon: AlertTriangle,
      };
    }
  }

  return {
    borderClass: 'border-indigo-200',
    bgClass: 'bg-indigo-50',
    badgeClass: 'border-indigo-300 bg-indigo-100 text-indigo-900',
    Icon: Briefcase,
  };
}

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
  selectionStart?: string | null;
  onSelectionStartChange?: (date: string | null) => void;
  onApplyFutureRequest?: () => void; // Callback to open future request modal
  showEmployeeSelector?: boolean; // When true, always show employee dropdown using users list (for admin views)
  approvedRequests?: ApprovedRequest[]; // For admin view: show indicators for approved/edited days
  /** When false, hides the top summary strip (e.g. when shown in a dashboard overview). Default true. */
  showSummaryStrip?: boolean;
  sectionTitle?: string;
  /** undefined = default admin subtitle; null = hide; string = custom */
  subtitle?: string | null;
  sectionClassName?: string;
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
  onDayClick,
  selectionStart: externalSelectionStart,
  onSelectionStartChange,
  onApplyFutureRequest,
  showEmployeeSelector = false,
  approvedRequests = [],
  showSummaryStrip = true,
  sectionTitle = 'Employee Month View',
  subtitle: subtitleProp,
  sectionClassName = ''
}) => {
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
  const [requestDetailModal, setRequestDetailModal] = React.useState<ApprovedRequest | null>(null);

  React.useEffect(() => {
    if (!requestDetailModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRequestDetailModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestDetailModal]);

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

  // Helper: get scheduled times (inTime/outTime) for a specific date string YYYY-MM-DD
  const getScheduledTimesForDate = (dateStr: string) => {
    const user = userFromList || (summaryFromList ? { ...summaryFromList, _id: summaryFromList.userId } : null);
    if (!user) return { inTime: '', outTime: '' };
    
    const schedule = getScheduledTimes(user, dateStr);
    return { inTime: schedule.inTime, outTime: schedule.outTime };
  };

  // Statuses that should NOT ask for manual in/out times and instead use schedule
  const STATUS_USE_SCHEDULE = new Set<string>([
    'WFH - weekdays', 'WFH - weekoff', 'Half Day - weekdays', 'Half Day - weekoff',
    'Present - outstation', 'Present - client place'
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

    // Use schedule for defined statuses
    if (STATUS_USE_SCHEDULE.has(status)) {
      setFormValue(1);
      if (dateStr) {
        const sch = getScheduledTimesForDate(dateStr);
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

    // Map approved requests to days
    const approvedRequestMap = new Map<number, ApprovedRequest>();
    for (const req of approvedRequests) {
      // Handle both YYYY-MM-DD format and ISO date strings
      const dateStr = req.date.split('T')[0]; // Get just YYYY-MM-DD part
      const d = new Date(dateStr + 'T00:00:00'); // Create date at midnight to avoid timezone issues
      if (!Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() + 1 === month) {
        approvedRequestMap.set(d.getDate(), req);
      }
    }

    return { daysInMonth, startWeekday, dayRecordMap, approvedRequestMap };
  })();

  // Determine lateness helper (use central utility)
  const isLateArrival = (date: Date, inTimeStr?: string) => {
    if (!inTimeStr || inTimeStr === '00:00') return false;

    const user = userFromList || (summaryFromList ? { ...summaryFromList, _id: summaryFromList.userId } : null);
    if (!user) return false;

    const schedule = getScheduledTimes(user, date);
    if (!schedule.inTime || schedule.inTime === '00:00') return false;

    return inTimeStr > schedule.inTime;
  };

  const defaultSubtitle = 'View detailed daily attendance for any employee and month.';
  const resolvedSubtitle =
    subtitleProp === undefined ? defaultSubtitle : subtitleProp;

  const fieldCls =
    'w-full rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const navBtnCls =
    'rounded-lg border border-blue-200/65 bg-panel p-1.5 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:p-2';

  return (
    <section
      className={`space-y-4 rounded-xl border border-blue-200/65 bg-panel p-4 text-slate-900 shadow-sm sm:space-y-5 sm:p-6 ${sectionClassName}`.trim()}
    >
      {/* Monthly summary row */}
      {showSummaryStrip && summaryFromList && summaryFromList.summary && (
        (() => {
          // Compute absent days locally: not Sunday, not DB-holiday, not weekoff, not leave,
          // and both in and out are missing or '00:00'
          let calcAbsentLocal = 0;
          for (const rec of employeeDays) {
            if (!rec || !rec.date) continue;
            const d = new Date(rec.date);
            if (d.getFullYear() !== selectedYear || d.getMonth() + 1 !== selectedMonth) continue;
            // Skip Sundays
            if (d.getDay() === 0) continue;
            const t = rec.typeOfPresence || '';
            // Skip DB-holiday
            if (t === 'Holiday') continue;
            // Skip weekoff types
            if (typeof t === 'string' && t.toLowerCase().includes('weekoff')) continue;
            // Skip leaves
            if (t === 'Leave' || t === 'On leave') continue;
            const effectiveCheckin = rec.editedCheckin || rec.checkin;
            const effectiveCheckout = rec.editedCheckout || rec.checkout;
            if ((!effectiveCheckin || effectiveCheckin === '00:00') && (!effectiveCheckout || effectiveCheckout === '00:00')) {
              calcAbsentLocal += 1;
            }
          }
          return (
            <div className="mb-2 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">
              <div>
                <span className="font-semibold text-slate-900">Total Hours:</span>{' '}
                {summaryFromList.summary.totalHour?.toFixed(2)}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Late Arrivals:</span>{' '}
                {summaryFromList.summary.totalLateArrival}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Half Days:</span> {summaryFromList.summary.totalHalfDay}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Presents:</span> {summaryFromList.summary.totalPresent}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Absents:</span> {calcAbsentLocal}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Leaves:</span> {summaryFromList.summary.totalLeave}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Excess/Short Hours:</span>{' '}
                {(() => {
                  const val = summaryFromList.summary.excessHour;
                  const sign = val < 0 ? '-' : '';
                  const abs = Math.abs(val);
                  const h = Math.floor(abs);
                  const m = Math.round((abs % 1) * 60);
                  return `${sign}${h}:${m.toString().padStart(2, '0')}`;
                })()}
              </div>
            </div>
          );
        })()
      )}
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-slate-900 sm:text-lg">
            <Calendar className="h-4 w-4 shrink-0 text-blue-600 sm:h-5 sm:w-5" aria-hidden />
            {sectionTitle}
          </h2>
          {resolvedSubtitle !== null && resolvedSubtitle !== '' && (
            <p className="mt-1 max-w-xl text-xs text-slate-600 sm:text-sm">{resolvedSubtitle}</p>
          )}
        </div>
      </div>

                  {/* Admin Edit Modal (portal-like inline) */}
                  {editModalOpen && editDate && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
                      <div className="relative w-[min(620px,95%)] rounded-xl border border-blue-200/65 bg-panel p-4 text-sm text-slate-900 shadow-xl">
                        <h3 className="mb-2 font-semibold text-slate-900">Edit attendance — {editDate}</h3>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <label className="text-xs font-medium text-slate-700">Status</label>
                            <select
                              value={formStatus}
                              onChange={(e) => {
                                const v = e.target.value;
                                setFormStatus(v);
                                // Determine editDate when in modal
                                if (editDate) applyStatusAutoFill(v, editDate);
                              }}
                              className={`${fieldCls} mt-1`}
                            >
                              <option>Present</option>
                              <option>Absent</option>
                              <option>On leave</option>
                              <option>Leave</option>
                              <option>Holiday</option>
                              <option>WFH - weekdays</option>
                              <option>WFH - weekoff</option>
                              <option>Half Day - weekdays</option>
                              <option>Half Day - weekoff</option>
                              <option>Present - in office</option>
                              <option>Present - client place</option>
                              <option>Present - outstation</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-700">Value (e.g. 1 or 0.5)</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={formValue ?? ''}
                              onChange={(e) => setFormValue(e.target.value === '' ? undefined : Number(e.target.value))}
                              className={`${fieldCls} mt-1`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-700">Start time (HH:MM)</label>
                            <input
                              value={formStartTime}
                              onChange={(e) => setFormStartTime(e.target.value)}
                              placeholder="09:00"
                              disabled={formStatus === 'Absent' || STATUS_USE_SCHEDULE.has(formStatus) || formStatus.startsWith('Half Day')}
                              className={`${fieldCls} mt-1 ${formStatus === 'Absent' || STATUS_USE_SCHEDULE.has(formStatus) || formStatus.startsWith('Half Day') ? 'cursor-not-allowed opacity-60' : ''}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-700">End time (HH:MM)</label>
                            <input
                              value={formEndTime}
                              onChange={(e) => setFormEndTime(e.target.value)}
                              placeholder="18:00"
                              disabled={formStatus === 'Absent' || STATUS_USE_SCHEDULE.has(formStatus) || formStatus.startsWith('Half Day')}
                              className={`${fieldCls} mt-1 ${formStatus === 'Absent' || STATUS_USE_SCHEDULE.has(formStatus) || formStatus.startsWith('Half Day') ? 'cursor-not-allowed opacity-60' : ''}`}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs font-medium text-slate-700">Remarks</label>
                            <input
                              value={formRemarks}
                              onChange={(e) => setFormRemarks(e.target.value)}
                              className={`${fieldCls} mt-1`}
                            />
                          </div>
                        </div>

                        {editError && (
                          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                            {editError}
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditModalOpen(false)}
                            className="rounded-lg border border-blue-200/65 bg-panel px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!selectedEmployeeId || !selectedMonthYear || !editDate) return setEditError('Missing employee or month');
                              setSavingEdit(true);
                              setEditError(null);
                              try {
                                const body = {
                                  userId: selectedEmployeeId,
                                  date: editDate,
                                  monthYear: selectedMonthYear,
                                  requestedStatus: formStatus,
                                  startTime: formStartTime || undefined,
                                  endTime: formEndTime || undefined,
                                  attendanceValue: formValue,
                                  remarks: formRemarks,
                                  updatedBy: 'HR'
                                };

                                const res = await fetch('/api/attendance/admin-update', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(body),
                                });
                                const result = await res.json();
                                if (!res.ok || !result.success) {
                                  setEditError(result.error || 'Failed to save');
                                  setSavingEdit(false);
                                  return;
                                }
                                // Refresh parent data
                                if (selectedEmployeeId && selectedMonthYear && onLoadAttendance) {
                                  onLoadAttendance(selectedEmployeeId, selectedMonthYear);
                                }
                                setEditModalOpen(false);
                              } catch (e) {
                                setEditError(e instanceof Error ? e.message : 'Save failed');
                              } finally {
                                setSavingEdit(false);
                              }
                            }}
                            disabled={savingEdit}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                          >
                            {savingEdit ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {requestDetailModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                      <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setRequestDetailModal(null)}
                        aria-hidden
                      />
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="request-detail-title"
                        className="relative w-[min(420px,95%)] rounded-xl border border-blue-200/65 bg-panel p-4 text-sm text-slate-900 shadow-xl"
                      >
                        <h3 id="request-detail-title" className="mb-3 font-semibold text-slate-900">
                          Request details
                        </h3>
                        <dl className="space-y-2 text-xs">
                          <div className="flex justify-between gap-4">
                            <dt className="shrink-0 text-slate-600">Status</dt>
                            <dd className="text-right text-slate-900">{requestDetailModal.status || 'Unknown'}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="shrink-0 text-slate-600">Requested</dt>
                            <dd className="break-words text-right text-slate-900">
                              {requestDetailModal.requestedStatus || 'Unknown'}
                            </dd>
                          </div>
                          {requestDetailModal.status === 'Approved' && (
                            <>
                              <div className="flex justify-between gap-4">
                                <dt className="shrink-0 text-slate-600">Approved by</dt>
                                <dd className="text-right text-slate-900">{requestDetailModal.approvedBy || 'Unknown'}</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt className="shrink-0 text-slate-600">Email</dt>
                                <dd className="break-all text-right text-slate-900">{requestDetailModal.approvedByEmail || '—'}</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt className="shrink-0 text-slate-600">Date</dt>
                                <dd className="text-right text-slate-900">
                                  {requestDetailModal.approvedAt
                                    ? new Date(requestDetailModal.approvedAt).toLocaleDateString('en-GB', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                      }) + ' ' + new Date(requestDetailModal.approvedAt).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : 'N/A'}
                                </dd>
                              </div>
                            </>
                          )}
                          {requestDetailModal.status === 'Pending' && (
                            <p className="pt-1 text-slate-600">Awaiting approval from partner/HR.</p>
                          )}
                          {requestDetailModal.status === 'Rejected' && (
                            <p className="pt-1 text-slate-600">This request was rejected.</p>
                          )}
                        </dl>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setRequestDetailModal(null)}
                            className="rounded-lg border border-blue-200/65 bg-panel px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
      {/* Navigation Controls */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm sm:p-4">
        {/* Employee Selection - Show if showEmployeeSelector is true OR if multiple employees in summaries */}
        {(showEmployeeSelector || summaries.length > 1) && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1 text-xs font-medium text-slate-700">
              <UserIcon className="h-3 w-3 text-slate-500" aria-hidden />
              Employee
            </label>

            {/* Search bar for admin view */}
            {showEmployeeSelector && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  type="text"
                  placeholder="Search employees…"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className={`${fieldCls} pl-9`}
                />
              </div>
            )}

            <select
              className={`${fieldCls} touch-manipulation py-2.5 disabled:cursor-not-allowed disabled:opacity-60`}
              value={selectedEmployeeId ?? ''}
              onChange={(e) => setSelectedEmployeeId(e.target.value || null)}
              disabled={isLoading}
            >
              <option value="">Select employee ({showEmployeeSelector 
                ? users.filter(u => 
                    !employeeSearch || 
                    u.name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
                    u.odId?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
                    u.employeeCode?.toLowerCase().includes(employeeSearch.toLowerCase())
                  ).length 
                : summaries.length} available)</option>
              {showEmployeeSelector 
                ? users
                    .filter(u => 
                      !employeeSearch || 
                      u.name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
                      u.odId?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
                      u.employeeCode?.toLowerCase().includes(employeeSearch.toLowerCase())
                    )
                    .slice()
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.name} {u.odId ? `(${u.odId})` : ''}
                      </option>
                    ))
                : summaries
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
                    ))
              }
            </select>
          </div>
        )}

        {/* Year and Month Navigation - Compact Row for Mobile */}
        <div className="flex flex-row items-center justify-between gap-1 sm:gap-2">
          {/* Year Navigation */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button
              type="button"
              onClick={handlePrevYear}
              disabled={isLoading}
              className={`${navBtnCls} touch-manipulation active:scale-95`}
              title="Previous Year"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="min-w-[50px] rounded-lg border border-blue-200/65 bg-panel px-1.5 py-1.5 text-center text-xs font-semibold text-slate-900 shadow-sm sm:min-w-[80px] sm:px-3 sm:py-2 sm:text-sm">
              {selectedYear}
            </span>
            <button
              type="button"
              onClick={handleNextYear}
              disabled={isLoading}
              className={`${navBtnCls} touch-manipulation active:scale-95`}
              title="Next Year"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={isLoading}
              className={`${navBtnCls} touch-manipulation active:scale-95`}
              title="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <select
              value={selectedMonth}
              onChange={handleMonthChange}
              disabled={isLoading}
              className={`${fieldCls} w-[70px] touch-manipulation px-1 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60 sm:w-[120px] sm:px-3 sm:py-2 sm:text-sm`}
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleNextMonth}
              disabled={isLoading}
              className={`${navBtnCls} touch-manipulation active:scale-95`}
              title="Next Month"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* Load Button - Full width on mobile */}
        <button
          type="button"
          onClick={() => {
            if (selectedEmployeeId && selectedMonthYear) {
              onLoadAttendance(selectedEmployeeId, selectedMonthYear);
            }
          }}
          disabled={!selectedEmployeeId || !selectedMonthYear || isLoading}
          className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Clock className="h-4 w-4" aria-hidden />
          {isLoading ? 'Loading…' : 'Load attendance'}
        </button>

        {/* Apply Future Request Button */}
        {onApplyFutureRequest && (
          <button
            type="button"
            onClick={onApplyFutureRequest}
            className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 font-medium text-violet-900 shadow-sm transition-colors hover:bg-violet-100 active:scale-[0.98]"
          >
            <Calendar className="h-4 w-4" aria-hidden />
            Apply future request
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mx-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-900 shadow-sm sm:mx-0 sm:px-4"
        >
          {error}
        </div>
      )}

      {selectedEmployeeId && selectedMonthYear && (
        <div className="mb-2 px-2 text-xs text-slate-600 sm:mb-4 sm:px-0">
          Showing records for <span className="font-medium text-slate-900">{displayUserName}</span> in
          <span className="ml-1 font-medium text-slate-900">
            {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
          </span>
          {!employeeDays.length && !isLoading && (
            <span className="ml-2 block text-amber-800 sm:inline">(No attendance records found for this month)</span>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2 shadow-inner sm:p-4">
        {!calendarData ? (
          <div className="py-6 text-center sm:py-8">
            <Calendar className="mx-auto mb-3 h-8 w-8 text-slate-300 sm:h-12 sm:w-12" aria-hidden />
            <div className="px-4 text-sm text-slate-600">
              {selectedEmployeeId && selectedMonthYear 
                ? 'Select an employee and click "Load Attendance" to view their monthly calendar.'
                : 'Select an employee and month to view their attendance calendar.'
              }
            </div>
          </div>
        ) : (
          <div className="relative">
            {isLoading && selectedEmployeeId && selectedMonthYear && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-panel/80 backdrop-blur-sm"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="flex items-center gap-2 rounded-xl border border-blue-200/65 bg-panel px-4 py-3 text-sm text-slate-800 shadow-lg">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden />
                  <span>Loading attendance…</span>
                </div>
              </div>
            )}

            <div className="mb-3 px-1 text-center sm:mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
              </h3>
              <p className="mt-1 text-[11px] text-slate-500 sm:hidden">Use the controls above to change month</p>
            </div>

            {/* Day name headers - hidden on mobile since 2-col layout */}
            <div className="mb-2 hidden grid-cols-7 gap-2 text-[11px] font-medium text-slate-600 sm:grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-center font-medium py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-7 gap-1.5 sm:gap-2 text-xs">
              {Array.from({ length: calendarData.startWeekday }).map((_, idx) => (
                <div key={`blank-${idx}`} />
              ))}
              {Array.from({ length: calendarData.daysInMonth }).map((_, idx) => {
                const day = idx + 1;
                const rec = calendarData.dayRecordMap.get(day) || null;
                            // {debugScheduledIn && (
                            //   <div className="text-[10px] text-amber-400 mt-0.5">Sch: {debugScheduledIn} | In: {debugActualIn}</div>
                            // )}
                const approvedReq = approvedRequests.length > 0 ? calendarData.approvedRequestMap.get(day) : null;
                let status: any = rec?.status;
                const type = rec?.typeOfPresence;

                // Treat partial punch records (only one side marked) as Absent for red highlight.
                const normalizedType = String(type || '').toLowerCase();
                const isNonWorkingType =
                  normalizedType.includes('leave') ||
                  normalizedType.includes('holiday') ||
                  normalizedType.includes('week off') ||
                  normalizedType.includes('weekoff');
                const inMarked = !!rec?.inTime && rec.inTime !== '00:00';
                const outMarked = !!rec?.outTime && rec.outTime !== '00:00';
                const isPartialPunch = rec ? inMarked !== outMarked : false;
                if (isPartialPunch && !isNonWorkingType) {
                  status = 'Missed Entry';
                }
                
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
                let isLate = false;
                if (rec) {
                  isLate = isLateArrival(dateObj, rec.inTime);
                }

                // Check if request is a custom/other type (not standard)
                const STANDARD_REQUEST_TYPES = [
                  'On leave', 'Present - in office', 'Present - client place', 'Present - outstation',
                  'Present - weekoff', 'Half Day - weekdays', 'Half Day - weekoff', 'WFH - weekdays',
                  'WFH - weekoff', 'Weekoff - special allowance', 'Thumb machine - not working',
                  'Leave', 'Holiday', 'Absent', 'Present','Present- Outstation (Weekoff)', 'Present - ClientPlace (Weekoff)', 'Present - Outstation (Weekdays)', 'Present - ClientPlace (Weekdays)', 'Present - in office - weekdays', 'Present - in office - weekoff','Manual'
                ];
                const isCustomRequestType = approvedReq && approvedReq.requestedStatus && 
                  !STANDARD_REQUEST_TYPES.includes(approvedReq.requestedStatus);

                // Selection highlighting logic
                const currentDateStr = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const isFutureDate = dateObj >= new Date();
                const isSelectionStart = selectionStart === currentDateStr;
                const isInRange = selectionStart && hoveredDate && (() => {
                  const start = new Date(Math.min(new Date(selectionStart).getTime(), new Date(hoveredDate).getTime()));
                  const end = new Date(Math.max(new Date(selectionStart).getTime(), new Date(hoveredDate).getTime()));
                  return dateObj >= start && dateObj <= end;
                })();

                let borderClass = 'border-slate-200';
                let bgClass = 'bg-sky-50/90';
                let badgeClass = 'border-slate-200 bg-slate-100 text-slate-600';
                let Icon: React.ElementType = XCircle;

                // Apply selection highlighting
                if (isSelectionStart) {
                  borderClass = 'border-dashed border-2 border-blue-500';
                  bgClass = 'bg-blue-50';
                } else if (isInRange && isFutureDate) {
                  borderClass = 'border-blue-200';
                  bgClass = 'bg-blue-50/80';
                } else if (isCustomRequestType) {
                  if (approvedReq.status === 'Approved') {
                    borderClass = 'border-teal-200';
                    bgClass = 'bg-teal-50';
                  } else if (approvedReq.status === 'Pending') {
                    borderClass = 'border-teal-200';
                    bgClass = 'bg-teal-50/70';
                  } else {
                    borderClass = 'border-teal-200';
                    bgClass = 'bg-teal-50/40';
                  }
                } else if (rec) {
                  const cell = resolveAttendanceCellStyle({ status, type, rec, isLate });
                  borderClass = cell.borderClass;
                  bgClass = cell.bgClass;
                  badgeClass = cell.badgeClass;
                  Icon = cell.Icon;
                  if (cell.statusLabel !== undefined) {
                    status = cell.statusLabel;
                  }
                }

                return (
                  <div
                    key={day}
                    onClick={() => {
                        if (onDayClick) {
                            const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                            onDayClick(dateStr, status || 'No Record');
                        }
                    }}
                    onMouseEnter={() => {
                      if (selectionStart && isFutureDate) {
                        setHoveredDate(currentDateStr);
                      }
                    }}
                    onMouseLeave={() => {
                      setHoveredDate(null);
                    }}
                    className={`flex min-h-[90px] flex-col gap-0.5 rounded-lg border px-2.5 py-2 shadow-sm ${borderClass} ${bgClass} ${onDayClick ? 'cursor-pointer transition-all hover:ring-2 hover:ring-blue-500/25 active:scale-[0.97]' : ''} touch-manipulation`}
                  >
                    {/* Day number and day name on mobile */}
                    <div className="mb-0.5 flex items-center justify-between text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-bold sm:text-lg">{day}</span>
                        <span className="text-[10px] text-slate-500 sm:hidden">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getDay()]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Request status indicator - shows Pending, Approved, or Rejected */}
                        {approvedReq && (
                          <span 
                            className={`inline-flex cursor-pointer items-center rounded px-1 py-0.5 text-[9px] font-bold ${
                              isCustomRequestType
                                ? approvedReq.status === 'Pending'
                                  ? 'border border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100'
                                  : approvedReq.status === 'Rejected'
                                    ? 'border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100'
                                    : 'border border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100'
                                : approvedReq.status === 'Pending'
                                  ? 'border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                  : approvedReq.status === 'Rejected'
                                    ? 'border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100'
                                    : 'border border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100'
                            }`}
                            title={`Request: ${approvedReq.status}${isCustomRequestType ? ` (${approvedReq.requestedStatus})` : ''}${approvedReq.status === 'Approved' ? ` by ${approvedReq.approvedBy || 'Unknown'}` : ''}${approvedReq.approvedByEmail ? ` (${approvedReq.approvedByEmail})` : ''}${approvedReq.approvedAt ? ` on ${new Date(approvedReq.approvedAt).toLocaleDateString('en-GB')}` : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRequestDetailModal(approvedReq);
                            }}
                          >
                            <FileCheck className="w-2.5 h-2.5 sm:mr-0.5" />
                            <span className="hidden sm:inline">
                              {isCustomRequestType 
                                ? approvedReq.requestedStatus.toUpperCase().slice(0, 8)
                                : approvedReq.status === 'Pending' ? 'PENDING' : approvedReq.status === 'Rejected' ? 'REJECTED' : 'APPROVED'
                              }
                            </span>
                          </span>
                        )}
                        {/* Admin Edit Button */}
                        {showEmployeeSelector && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // populate form with existing values
                              const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                              setEditDate(dateStr);
                              // prefer edited values if present
                              const existingStart = rec?.editedCheckin || rec?.checkin || rec?.inTime || '';
                              const existingEnd = rec?.editedCheckout || rec?.checkout || rec?.outTime || '';
                              setFormStartTime(existingStart || '');
                              setFormEndTime(existingEnd || '');
                              const chosenStatus = (rec && (rec.typeOfPresence || rec.status)) || 'Present';
                              setFormStatus(chosenStatus);
                              // Autofill times/value depending on status (this will override only for statuses that require it)
                              applyStatusAutoFill(chosenStatus, dateStr);
                              setFormValue(typeof rec?.value === 'number' ? rec.value : undefined);
                              setFormRemarks(rec?.remarks || '');
                              setEditError(null);
                              setEditModalOpen(true);
                            }}
                            title="Edit day"
                            type="button"
                            className="rounded p-1 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Edit3 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                        {isLate && (
                          <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">
                            LATE
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Status badge */}
                    {rec && (
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${badgeClass} w-fit`}
                      >
                        <Icon className="w-3 h-3" />
                        <span className="hidden sm:inline">{status}</span>
                        <span className="sm:hidden">
                          {(() => {
                            const tl = (type || '').toLowerCase();
                            if (status === 'Present') {
                              if (tl.includes('client') || tl.includes('clientplace')) return 'Client';
                              if (tl.includes('outstation')) return 'OS';
                              if (tl.includes('wfh') || tl.includes('work from home') || tl.includes('wo-wfh'))
                                return 'WFH';
                              if (tl.includes('ohd') || tl.includes('official holiday duty')) return 'OHD';
                              if (tl.includes('half day') || rec?.halfDay) return '½ day';
                              if ((tl.includes('weekoff') || tl.includes('week off')) && tl.includes('present'))
                                return 'WO+';
                              if (tl === 'thumbmachine' || tl === 'manual' || tl === 'remote') return 'Punch';
                              return isLate ? 'Late' : 'In';
                            }
                            if (status === 'Absent') return 'Absent';
                            if (status === 'Missed Entry') return 'Missed';
                            if (status === 'Leave' || status === 'On leave') return 'Leave';
                            if (status === 'Paid Leave') return 'Paid Lv';
                            if (status === 'Unpaid Leave') return 'Unpaid';
                            if (status === 'Holiday' || status === 'Week Off') return 'Hol';
                            if (status === 'HalfDay' || status === 'Half Day (HD)' || tl.includes('half day'))
                              return '½ day';
                            return typeof status === 'string' && status.length > 10
                              ? `${status.slice(0, 9)}…`
                              : status || '?';
                          })()}
                        </span>
                      </span>
                    )}
                    
                    {/* Time info */}
                    {rec && (
                      <div className="mt-auto space-y-0 text-[11px] text-slate-600">
                        {status !== 'Leave' &&
                          status !== 'Paid Leave' &&
                          status !== 'Unpaid Leave' &&
                          status !== 'Holiday' &&
                          status !== 'Week Off' && (
                          <div className="flex items-center gap-2">
                            <span className={isLate ? 'font-medium text-amber-800' : 'text-slate-600'}>
                              {rec.inTime || '--:--'} → {rec.outTime || '--:--'}
                            </span>
                          </div>
                        )}
                        {/* Show type if different from status */}
                        {type && type !== status && status !== 'Leave' && status !== 'Holiday' && (
                          <div className="truncate text-[10px] text-slate-500" title={type}>
                            {type}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Legend</h3>
        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-3 lg:grid-cols-4">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-emerald-300 bg-emerald-100" />
            <span className="text-slate-700">Present (in office)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-amber-300 bg-amber-100" />
            <span className="text-slate-700">Late (in office)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-orange-300 bg-orange-100" />
            <span className="text-slate-700">Half day</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-teal-300 bg-teal-100" />
            <span className="text-slate-700">Client place</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-sky-300 bg-sky-100" />
            <span className="text-slate-700">Outstation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-violet-300 bg-violet-100" />
            <span className="text-slate-700">WFH</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-yellow-300 bg-yellow-100" />
            <span className="text-slate-700">OHD</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-lime-300 bg-lime-100" />
            <span className="text-slate-700">Present (week off)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-zinc-300 bg-zinc-100" />
            <span className="text-slate-700">Manual / remote / machine</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-rose-300 bg-rose-100" />
            <span className="text-slate-700">Absent</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-red-500 bg-red-300" />
            <span className="text-slate-700">Missed entry (single punch)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-sky-300 bg-sky-100" />
            <span className="text-slate-700">Paid leave</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-rose-300 bg-rose-100" />
            <span className="text-slate-700">Unpaid leave</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-cyan-300 bg-cyan-100" />
            <span className="text-slate-700">Holiday / week off</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-slate-300 bg-panel" />
            <span className="text-slate-700">No record</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-indigo-300 bg-indigo-100" />
            <span className="text-slate-700">Other / unmapped type</span>
          </div>
          {approvedRequests.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <div className="flex h-4 w-4 items-center justify-center rounded border border-amber-300 bg-amber-100">
                  <FileCheck className="h-2.5 w-2.5 text-amber-800" aria-hidden />
                </div>
                <span className="text-slate-700">Pending request</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-4 w-4 items-center justify-center rounded border border-violet-300 bg-violet-100">
                  <FileCheck className="h-2.5 w-2.5 text-violet-800" aria-hidden />
                </div>
                <span className="text-slate-700">Approved</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-4 w-4 items-center justify-center rounded border border-rose-300 bg-rose-100">
                  <FileCheck className="h-2.5 w-2.5 text-rose-800" aria-hidden />
                </div>
                <span className="text-slate-700">Rejected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-4 w-4 items-center justify-center rounded border border-teal-300 bg-teal-100">
                  <FileCheck className="h-2.5 w-2.5 text-teal-800" aria-hidden />
                </div>
                <span className="text-slate-700">Custom / other</span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
