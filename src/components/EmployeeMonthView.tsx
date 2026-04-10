import React from 'react';
import { Clock, CheckCircle, XCircle, AlertTriangle, CalendarOff, Briefcase, ChevronLeft, ChevronRight, User as UserIcon, Calendar, Search, Edit3, FileCheck, Loader2 } from 'lucide-react';
import { AttendanceSummaryView, AttendanceRecord, User, DailySchedule } from '@/types/ui';
import { ScheduleEntry } from '@/types/ui';
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
    // Try to find a specific attendance record for that date
    const rec = employeeDays.find((r) => (r.date || '').split('T')[0] === dateStr);
    if (rec && rec.schedule && (rec.schedule.inTime || rec.schedule.outTime)) {
      return { inTime: rec.schedule.inTime || '', outTime: rec.schedule.outTime || '' };
    }
    // Fallback to summary daily schedules
    if (summaryFromList && summaryFromList.schedules) {
      const d = new Date(dateStr + 'T00:00:00');
      if (!Number.isNaN(d.getTime())) {
        // If the date is Sunday, use Monday's schedule
        const dow = d.getDay();
        const lookupDow = dow === 0 ? 1 : dow;
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[lookupDow] as keyof typeof summaryFromList.schedules.daily;
        const daySchedule = summaryFromList.schedules.daily?.[dayName];
        return { inTime: daySchedule?.inTime || '', outTime: daySchedule?.outTime || '' };
      }
    }
    // Try to use user's schedule entries (fallback)
    if (userFromList && userFromList.schedules && userFromList.schedules.length > 0) {
      const d = new Date(dateStr + 'T00:00:00');
      if (!Number.isNaN(d.getTime())) {
        // find latest schedule effective on or before date
        const applicable = [...userFromList.schedules].reverse().find((s) => {
          try {
            return new Date(s.effectiveFrom) <= d;
          } catch (e) {
            return false;
          }
        }) || userFromList.schedules[0];
        if (applicable && applicable.daily) {
          const dow = d.getDay();
          const lookupDow = dow === 0 ? 1 : dow;
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayName = dayNames[lookupDow];
          const daySchedule = (applicable.daily as any)?.[dayName];
          if (daySchedule) return { inTime: daySchedule.inTime || '', outTime: daySchedule.outTime || '' };
        }
      }
    }

    // Legacy single-schedule fields on user
    if (userFromList) {
      const d = new Date(dateStr + 'T00:00:00');
      if (!Number.isNaN(d.getTime())) {
        const dow = d.getDay();
        const lookupDow = dow === 0 ? 1 : dow;
        // Saturday-specific legacy schedule
        if (lookupDow === 6 && userFromList.scheduleInOutTimeSat) {
          return { inTime: userFromList.scheduleInOutTimeSat.inTime || '', outTime: userFromList.scheduleInOutTimeSat.outTime || '' };
        }
        if (userFromList.scheduleInOutTime) {
          return { inTime: userFromList.scheduleInOutTime.inTime || '', outTime: userFromList.scheduleInOutTime.outTime || '' };
        }
      }
    }

    return { inTime: '', outTime: '' };
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

  // Determine lateness helper (use per-day schedule if available)
  const isLateArrival = (date: Date, inTimeStr?: string, dayRecord?: AttendanceRecord) => {
    if (!inTimeStr) return false;

    const parseMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const actualMins = parseMinutes(inTimeStr);
    let scheduledStr: string | undefined = undefined;

    // Prefer per-day schedule from AttendanceRecord
    if (dayRecord && dayRecord.schedule && dayRecord.schedule.inTime) {
      scheduledStr = dayRecord.schedule.inTime;
    } else if (summaryFromList?.schedules) {
      // If the date is Sunday, use Monday's schedule per requirement
      const dow = date.getDay();
      const lookupDow = dow === 0 ? 1 : dow;
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[lookupDow] as keyof typeof summaryFromList.schedules.daily;
      const daySchedule = summaryFromList.schedules.daily?.[dayName];
      scheduledStr = daySchedule?.inTime;
      if (!scheduledStr) return false; // no schedule available
    } else {
      return false;
    }

    const scheduledMins = parseMinutes(scheduledStr ?? "");
    return actualMins > scheduledMins;
  };

  const defaultSubtitle = 'View detailed daily attendance for any employee and month.';
  const resolvedSubtitle =
    subtitleProp === undefined ? defaultSubtitle : subtitleProp;

  return (
    <section className={`bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-4 sm:p-6 space-y-3 sm:space-y-4 ${sectionClassName}`.trim()}>
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
            <div className="mb-2 flex flex-wrap gap-4 items-center text-sm text-slate-200">
              <div>
                <span className="font-semibold">Total Hours:</span> {summaryFromList.summary.totalHour?.toFixed(2)}
              </div>
              <div>
                <span className="font-semibold">Late Arrivals:</span> {summaryFromList.summary.totalLateArrival}
              </div>
              <div>
                <span className="font-semibold">Half Days:</span> {summaryFromList.summary.totalHalfDay}
              </div>
              <div>
                <span className="font-semibold">Presents:</span> {summaryFromList.summary.totalPresent}
              </div>
              <div>
                <span className="font-semibold">Absents:</span> {calcAbsentLocal}
              </div>
              <div>
                <span className="font-semibold">Leaves:</span> {summaryFromList.summary.totalLeave}
              </div>
              <div>
                <span className="font-semibold">Excess/Short Hours:</span> {(() => {
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-50 flex items-center gap-2">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            {sectionTitle}
          </h2>
          {resolvedSubtitle !== null && resolvedSubtitle !== '' && (
            <p className="text-xs text-slate-400 mt-1 sm:max-w-xl">
              {resolvedSubtitle}
            </p>
          )}
        </div>
      </div>

                  {/* Admin Edit Modal (portal-like inline) */}
                  {editModalOpen && editDate && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                      <div className="absolute inset-0 bg-black/50" onClick={() => setEditModalOpen(false)} />
                      <div className="relative w-[min(620px,95%)] bg-slate-900 border border-slate-700 rounded-lg p-4 text-sm text-slate-200">
                        <h3 className="font-semibold mb-2">Edit Attendance — {editDate}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-slate-400">Status</label>
                            <select
                              value={formStatus}
                              onChange={(e) => {
                                const v = e.target.value;
                                setFormStatus(v);
                                // Determine editDate when in modal
                                if (editDate) applyStatusAutoFill(v, editDate);
                              }}
                              className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
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
                            <label className="text-xs text-slate-400">Value (e.g. 1 or 0.5)</label>
                            <input type="number" step="0.1" min="0" value={formValue ?? ''} onChange={(e) => setFormValue(e.target.value === '' ? undefined : Number(e.target.value))} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-400">Start Time (HH:MM)</label>
                            <input
                              value={formStartTime}
                              onChange={(e) => setFormStartTime(e.target.value)}
                              placeholder="09:00"
                              disabled={formStatus === 'Absent' || STATUS_USE_SCHEDULE.has(formStatus) || formStatus.startsWith('Half Day')}
                              className={`w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm ${formStatus === 'Absent' || STATUS_USE_SCHEDULE.has(formStatus) || formStatus.startsWith('Half Day') ? 'opacity-60 cursor-not-allowed' : ''}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-400">End Time (HH:MM)</label>
                            <input
                              value={formEndTime}
                              onChange={(e) => setFormEndTime(e.target.value)}
                              placeholder="18:00"
                              disabled={formStatus === 'Absent' || STATUS_USE_SCHEDULE.has(formStatus) || formStatus.startsWith('Half Day')}
                              className={`w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm ${formStatus === 'Absent' || STATUS_USE_SCHEDULE.has(formStatus) || formStatus.startsWith('Half Day') ? 'opacity-60 cursor-not-allowed' : ''}`}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs text-slate-400">Remarks</label>
                            <input value={formRemarks} onChange={(e) => setFormRemarks(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" />
                          </div>
                        </div>

                        {editError && <div className="text-rose-400 text-xs mt-2">{editError}</div>}

                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button onClick={() => setEditModalOpen(false)} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm">Cancel</button>
                          <button
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
                            className="px-3 py-1.5 bg-emerald-500 text-slate-900 rounded text-sm disabled:opacity-60"
                          >
                            {savingEdit ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {requestDetailModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                      <div className="absolute inset-0 bg-black/50" onClick={() => setRequestDetailModal(null)} aria-hidden />
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="request-detail-title"
                        className="relative w-[min(420px,95%)] bg-slate-900 border border-slate-700 rounded-lg p-4 text-sm text-slate-200 shadow-xl"
                      >
                        <h3 id="request-detail-title" className="font-semibold text-slate-50 mb-3">
                          Request details
                        </h3>
                        <dl className="space-y-2 text-xs">
                          <div className="flex justify-between gap-4">
                            <dt className="text-slate-500 shrink-0">Status</dt>
                            <dd className="text-slate-200 text-right">{requestDetailModal.status || 'Unknown'}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-slate-500 shrink-0">Requested</dt>
                            <dd className="text-slate-200 text-right break-words">{requestDetailModal.requestedStatus || 'Unknown'}</dd>
                          </div>
                          {requestDetailModal.status === 'Approved' && (
                            <>
                              <div className="flex justify-between gap-4">
                                <dt className="text-slate-500 shrink-0">Approved by</dt>
                                <dd className="text-slate-200 text-right">{requestDetailModal.approvedBy || 'Unknown'}</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt className="text-slate-500 shrink-0">Email</dt>
                                <dd className="text-slate-200 text-right break-all">{requestDetailModal.approvedByEmail || '—'}</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt className="text-slate-500 shrink-0">Date</dt>
                                <dd className="text-slate-200 text-right">
                                  {requestDetailModal.approvedAt
                                    ? new Date(requestDetailModal.approvedAt).toLocaleString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : 'N/A'}
                                </dd>
                              </div>
                            </>
                          )}
                          {requestDetailModal.status === 'Pending' && (
                            <p className="text-slate-400 pt-1">Awaiting approval from partner/HR.</p>
                          )}
                          {requestDetailModal.status === 'Rejected' && (
                            <p className="text-slate-400 pt-1">This request was rejected.</p>
                          )}
                        </dl>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setRequestDetailModal(null)}
                            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm hover:bg-slate-700"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
      {/* Navigation Controls */}
      <div className="flex flex-col gap-3 p-3 sm:p-4 bg-slate-800/50 rounded-lg border border-slate-700">
        {/* Employee Selection - Show if showEmployeeSelector is true OR if multiple employees in summaries */}
        {(showEmployeeSelector || summaries.length > 1) && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
              <UserIcon className="w-3 h-3" />
              Employee
            </label>
            
            {/* Search bar for admin view */}
            {showEmployeeSelector && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md pl-9 pr-3 py-2 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50"
                />
              </div>
            )}
            
            <select
              className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2.5 text-slate-100 text-sm disabled:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-500 touch-manipulation"
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
              onClick={handlePrevYear}
              disabled={isLoading}
              className="p-1.5 sm:p-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed rounded text-slate-300 hover:text-white disabled:text-slate-500 transition-colors touch-manipulation active:scale-95"
              title="Previous Year"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-1.5 sm:px-3 py-1.5 sm:py-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-xs sm:text-sm min-w-[50px] sm:min-w-[80px] text-center font-medium">
              {selectedYear}
            </span>
            <button
              onClick={handleNextYear}
              disabled={isLoading}
              className="p-1.5 sm:p-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed rounded text-slate-300 hover:text-white disabled:text-slate-500 transition-colors touch-manipulation active:scale-95"
              title="Next Year"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button
              onClick={handlePrevMonth}
              disabled={isLoading}
              className="p-1.5 sm:p-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed rounded text-slate-300 hover:text-white disabled:text-slate-500 transition-colors touch-manipulation active:scale-95"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <select
              value={selectedMonth}
              onChange={handleMonthChange}
              disabled={isLoading}
              className="px-1 sm:px-3 py-1.5 sm:py-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-xs sm:text-sm w-[70px] sm:w-[120px] disabled:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-500 touch-manipulation"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleNextMonth}
              disabled={isLoading}
              className="p-1.5 sm:p-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed rounded text-slate-300 hover:text-white disabled:text-slate-500 transition-colors touch-manipulation active:scale-95"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
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
          className="w-full px-4 py-2.5 bg-emerald-500 text-slate-950 font-medium rounded-md hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 touch-manipulation active:scale-[0.98]"
        >
          <Clock className="w-4 h-4" />
          {isLoading ? 'Loading…' : 'Load Attendance'}
        </button>

        {/* Apply Future Request Button */}
        {onApplyFutureRequest && (
          <button
            type="button"
            onClick={onApplyFutureRequest}
            className="w-full px-4 py-2.5 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2 touch-manipulation active:scale-[0.98]"
          >
            <Calendar className="w-4 h-4" />
            Apply Future Request
          </button>
        )}
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-700/60 text-rose-100 px-3 sm:px-4 py-3 rounded-md text-xs mx-2 sm:mx-0">
          {error}
        </div>
      )}

      {selectedEmployeeId && selectedMonthYear && (
        <div className="text-xs text-slate-400 mb-2 sm:mb-4 px-2 sm:px-0">
          Showing records for <span className="text-slate-200 font-medium">{displayUserName}</span> in
          <span className="text-slate-200 font-medium ml-1">
            {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
          </span>
          {!employeeDays.length && !isLoading && (
            <span className="text-amber-400 ml-2 block sm:inline">(No attendance records found for this month)</span>
          )}
        </div>
      )}

      <div className="border border-slate-800 rounded-lg p-2 sm:p-4">
        {!calendarData ? (
          <div className="text-center py-6 sm:py-8">
            <Calendar className="w-8 h-8 sm:w-12 sm:h-12 text-slate-600 mx-auto mb-3" />
            <div className="text-sm text-slate-500 px-4">
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
                className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-slate-950/60 backdrop-blur-[1px]"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/90 px-4 py-3 text-sm text-slate-200 shadow-lg">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-400" aria-hidden />
                  <span>Loading attendance…</span>
                </div>
              </div>
            )}

            <div className="mb-3 sm:mb-4 px-1 text-center">
              <h3 className="text-lg font-semibold text-slate-200">
                {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
              </h3>
              <p className="mt-1 text-[11px] text-slate-500 sm:hidden">Use the controls above to change month</p>
            </div>

            {/* Day name headers - hidden on mobile since 2-col layout */}
            <div className="hidden sm:grid grid-cols-7 gap-2 mb-2 text-[11px] text-slate-400">
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
                  isLate = isLateArrival(dateObj, rec.inTime, rec);
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

                let borderClass = 'border-slate-700';
                let bgClass = 'bg-slate-950/40';
                let badgeClass = 'border-slate-700 bg-slate-800 text-slate-400';
                let Icon = XCircle;

                // Apply selection highlighting
                if (isSelectionStart) {
                  borderClass = 'border-dashed border-2 border-blue-400';
                  bgClass = 'bg-blue-500/10';
                } else if (isInRange && isFutureDate) {
                  borderClass = 'border-blue-300/50';
                  bgClass = 'bg-blue-500/5';
                } else if (isCustomRequestType) {
                  // Custom/Other request type - use teal color for the whole cell
                  if (approvedReq.status === 'Approved') {
                    borderClass = 'border-teal-500/50';
                    bgClass = 'bg-teal-500/15';
                  } else if (approvedReq.status === 'Pending') {
                    borderClass = 'border-teal-400/40';
                    bgClass = 'bg-teal-500/10';
                  } else {
                    borderClass = 'border-teal-500/30';
                    bgClass = 'bg-teal-500/5';
                  }
                } else {
                  // Original status-based styling
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
                      // Determine if paid or unpaid leave
                      if (rec && rec.value !== undefined && rec.value > 0) {
                        status = 'Paid Leave';
                      } else {
                        // If value is 0 or undefined, treat as unpaid leave
                        status = 'Unpaid Leave';
                        borderClass = 'border-rose-500/50';
                        bgClass = 'bg-rose-500/5';
                        badgeClass = 'border-rose-500/60 bg-rose-500/15 text-rose-100';
                      }
                  } else if (status === 'Holiday' || status === 'Week Off') {
                      borderClass = 'border-cyan-500/50';
                      bgClass = 'bg-cyan-500/5';
                      badgeClass = 'border-cyan-500/60 bg-cyan-500/15 text-cyan-100';
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
                    className={`min-h-[90px] sm:h-24 rounded-lg border px-2.5 py-2 flex flex-col gap-0.5 ${borderClass} ${bgClass} ${onDayClick ? 'cursor-pointer hover:ring-2 hover:ring-emerald-500/50 transition-all active:scale-[0.97]' : ''} touch-manipulation`}
                  >
                    {/* Day number and day name on mobile */}
                    <div className="flex items-center justify-between text-slate-300 mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-base sm:text-lg">{day}</span>
                        <span className="text-[10px] text-slate-500 sm:hidden">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getDay()]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Request status indicator - shows Pending, Approved, or Rejected */}
                        {approvedReq && (
                          <span 
                            className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold cursor-pointer ${
                              isCustomRequestType
                                ? approvedReq.status === 'Pending' 
                                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30 hover:bg-teal-500/30 active:bg-teal-500/40'
                                  : approvedReq.status === 'Rejected'
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 active:bg-rose-500/40'
                                    : 'bg-teal-500/20 text-teal-400 border border-teal-500/30 hover:bg-teal-500/30 active:bg-teal-500/40'
                                : approvedReq.status === 'Pending' 
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 active:bg-amber-500/40'
                                  : approvedReq.status === 'Rejected'
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 active:bg-rose-500/40'
                                    : 'bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 active:bg-purple-500/40'
                            }`}
                            title={`Request: ${approvedReq.status}${isCustomRequestType ? ` (${approvedReq.requestedStatus})` : ''}${approvedReq.status === 'Approved' ? ` by ${approvedReq.approvedBy || 'Unknown'}` : ''}${approvedReq.approvedByEmail ? ` (${approvedReq.approvedByEmail})` : ''}${approvedReq.approvedAt ? ` on ${new Date(approvedReq.approvedAt).toLocaleDateString()}` : ''}`}
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
                            className="p-1 rounded hover:bg-slate-700 text-slate-300"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isLate && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold border border-amber-500/30">
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
                          {status === 'Present' ? 'Present' : 
                           status === 'Absent' ? 'Absent' : 
                           status === 'Leave' || status === 'On leave' ? 'Leave' :
                           status === 'Paid Leave' ? 'Paid Leave' :
                           status === 'Unpaid Leave' ? 'Unpaid Leave' :
                           status === 'Holiday' || status === 'Week Off' ? 'Holiday' :
                           status === 'HalfDay' || status === 'Half Day (HD)' ? 'Half Day' :
                           status || '?'}
                        </span>
                      </span>
                    )}
                    
                    {/* Time info */}
                    {rec && (
                      <div className="mt-auto space-y-0 text-slate-300 text-[11px]">
                        {status !== 'Leave' && status !== 'Paid Leave' && status !== 'Unpaid Leave' && status !== 'Holiday' && (
                          <div className="flex items-center gap-2">
                            <span className={`${isLate ? 'text-amber-200' : 'text-slate-400'}`}>
                              {rec.inTime || '--:--'} → {rec.outTime || '--:--'}
                            </span>
                          </div>
                        )}
                        {/* Show type if different from status */}
                        {type && type !== status && status !== 'Leave' && status !== 'Holiday' && (
                          <div className="text-[10px] text-slate-500 truncate" title={type}>{type}</div>
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
      <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Legend</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-emerald-500/60 bg-emerald-500/15"></div>
            <span className="text-slate-300">Present</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-red-500/60 bg-red-500/15"></div>
            <span className="text-slate-300">Absent</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-blue-500/60 bg-blue-500/15"></div>
            <span className="text-slate-300">Paid Leave</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-red-500/60 bg-red-500/15"></div>
            <span className="text-slate-300">Unpaid Leave</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-cyan-500/60 bg-cyan-500/15"></div>
            <span className="text-slate-300">Holiday</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-amber-500/60 bg-amber-500/15"></div>
            <span className="text-slate-300">Late</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-slate-500/60 bg-slate-800/50"></div>
            <span className="text-slate-300">No Record</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-indigo-500/60 bg-indigo-500/15"></div>
            <span className="text-slate-300">WFH / OHD / other special</span>
          </div>
          {approvedRequests.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-amber-500/60 bg-amber-500/15 flex items-center justify-center">
                  <FileCheck className="w-2.5 h-2.5 text-amber-400" />
                </div>
                <span className="text-slate-300">Pending Request</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-purple-500/60 bg-purple-500/15 flex items-center justify-center">
                  <FileCheck className="w-2.5 h-2.5 text-purple-400" />
                </div>
                <span className="text-slate-300">Approved</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-rose-500/60 bg-rose-500/15 flex items-center justify-center">
                  <FileCheck className="w-2.5 h-2.5 text-rose-400" />
                </div>
                <span className="text-slate-300">Rejected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-teal-500/60 bg-teal-500/15 flex items-center justify-center">
                  <FileCheck className="w-2.5 h-2.5 text-teal-400" />
                </div>
                <span className="text-slate-300">Custom/Other</span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
