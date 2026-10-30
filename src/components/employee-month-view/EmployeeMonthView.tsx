import React from 'react';
import { Clock, XCircle, ChevronLeft, ChevronRight, User as UserIcon, Calendar, Search, Edit3, Info, Loader2 } from 'lucide-react';
import { getEmploymentTypeForDate, isHalftimeEmploymentType, isLateArrivalLikeSummary, calendarStatusLabelForDay, calendarStatusShortLabel } from '@/lib/attendanceSummaryMetrics';
import { isValidPunchTime } from '@/lib/attendanceHours';
import { scheduledWindowForAttendanceDay } from '@/lib/deriveRequestInOutFromWorkHours';
import { SummaryAlignedMetricsStrip } from '@/components/summary-aligned-metrics-strip';
import { buildDisplayRecordFromApprovedRequest, shouldOverlayApprovedRequestOnAttendance } from '@/lib/attendanceRequestDayDisplay';
import { isArticleEmployee } from '@/lib/isArticleEmployee';
import { getDefaultNumericValueForType, isLeaveRequestType } from '@/lib/attendanceRequestValues';
import { effectiveWfhAttendanceValue, presenceKindForStatus } from '@/lib/presenceCredit';
import { hasPhysicalAttendancePresence } from '@/lib/attendancePhysicalPresence';
import type { EmployeeMonthViewProps } from './types';
import { resolveAttendanceCellStyle, hasDayActivityUpdates, getDayUpdatesButtonLabel, resolveExtraWorkTimeLines, formatPunchTimeRange } from './utils';
import { DayActivityModalPanel } from './components';
import { useEmployeeMonthViewLogic } from './hooks';

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
  holidays = [],
  summaryMetricsOptions,
  alignedMetrics: alignedMetricsProp,
  sectionTitle = 'Employee Month View',
  subtitle: subtitleProp,
  sectionClassName = ''
}) => {
  const {
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
  } = useEmployeeMonthViewLogic({
    summaries,
    users,
    selectedEmployeeId,
    selectedMonthYear,
    onMonthYearChange,
    employeeDays,
    selectionStart: externalSelectionStart,
    onSelectionStartChange,
    approvedRequests,
    holidays,
    summaryMetricsOptions,
    alignedMetrics: alignedMetricsProp,
    subtitle: subtitleProp,
  });

  return (
    <section
      className={`space-y-4 rounded-xl border border-blue-200/65 bg-panel p-4 text-slate-900 shadow-sm sm:space-y-5 sm:p-6 ${sectionClassName}`.trim()}
    >
      {/* Monthly summary row — same rules as admin Attendance Summary */}
      {showSummaryStrip && alignedMetrics && (
        <SummaryAlignedMetricsStrip metrics={alignedMetrics} />
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
                              className={`${fieldCls} mt-1`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-700">End time (HH:MM)</label>
                            <input
                              value={formEndTime}
                              onChange={(e) => setFormEndTime(e.target.value)}
                              placeholder="18:00"
                              className={`${fieldCls} mt-1`}
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
                                };

                                const res = await fetch('/api/attendance/admin-update', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
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

                  {dayActivityModal && (
                    <DayActivityModalPanel
                      data={dayActivityModal}
                      onClose={() => setDayActivityModal(null)}
                    />
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
                const storedRec = calendarData.dayRecordMap.get(day) || null;
                const approvedReq = approvedRequests.length > 0 ? calendarData.approvedRequestMap.get(day) : null;
                const dateObj = new Date(selectedYear, selectedMonth - 1, day);
                const currentDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                let rec = storedRec;
                if (
                  approvedReq &&
                  shouldOverlayApprovedRequestOnAttendance(storedRec, approvedReq)
                ) {
                  rec = buildDisplayRecordFromApprovedRequest(
                    storedRec,
                    approvedReq,
                    currentDateStr,
                    {
                      id: String(scheduleUser?._id || ''),
                      name: scheduleUser?.name || '',
                      isArticle: scheduleUser ? isArticleEmployee(scheduleUser) : undefined,
                      employee: scheduleUser ?? undefined,
                      rules: presenceRules,
                    }
                  );
                }

                if (
                  rec &&
                  isLeaveRequestType(String(rec.typeOfPresence || '')) &&
                  hasPhysicalAttendancePresence(rec)
                ) {
                  rec = {
                    ...rec,
                    typeOfPresence: 'Present - in office - weekdays',
                    status: 'Present',
                  };
                }

                let status: any = rec?.status;
                const type = rec?.typeOfPresence;

                // Treat partial punch records (only one side marked) as Absent for red highlight.
                const normalizedType = String(type || '').toLowerCase();
                const isNonWorkingType =
                  normalizedType.includes('leave') ||
                  normalizedType.includes('holiday') ||
                  normalizedType.includes('week off') ||
                  normalizedType.includes('weekoff');
                const inMarked = isValidPunchTime(rec?.editedCheckin || rec?.checkin || rec?.inTime);
                const outMarked = isValidPunchTime(rec?.editedCheckout || rec?.checkout || rec?.outTime);
                const isPartialPunch = rec ? inMarked !== outMarked : false;
                if (isPartialPunch && !isNonWorkingType) {
                  status = 'Missed Entry';
                }
                
                // Override status if both punches missing (Absent)
                const bothMissing = rec && !inMarked && !outMarked;
                if (bothMissing) {
                    // Check if there is a specific type like Leave, Holiday, etc.
                    if (type && type !== 'ThumbMachine' && type !== 'Manual' && type !== 'Remote') {
                        status = type; // Use the specific type (e.g. Leave, OHD, WFH)
                    } else {
                        status = 'Absent';
                    }
                }
                
                const isHalftimeDay = scheduleUser
                  ? isHalftimeEmploymentType(getEmploymentTypeForDate(scheduleUser, dateObj))
                  : false;

                if (isHalftimeDay && rec && status !== 'Missed Entry') {
                  const tl = String(rec.typeOfPresence || '').toLowerCase();
                  if (
                    status === 'HalfDay' ||
                    status === 'Half Day (HD)' ||
                    tl.includes('half day') ||
                    rec.halfDay
                  ) {
                    status = 'Present';
                  }
                }

                let isLate = false;
                if (rec && scheduleUser) {
                  isLate = isLateArrivalLikeSummary(
                    currentDateStr,
                    {
                      checkin: rec.checkin,
                      editedCheckin: rec.editedCheckin,
                      inTime: rec.inTime,
                      typeOfPresence: rec.typeOfPresence,
                    },
                    scheduleUser
                  );
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
                  } else if (approvedReq.status === 'Pending' || approvedReq.status === 'PendingHr') {
                    borderClass = 'border-teal-200';
                    bgClass = 'bg-teal-50/70';
                  } else {
                    borderClass = 'border-teal-200';
                    bgClass = 'bg-teal-50/40';
                  }
                } else if (rec) {
                  status = calendarStatusLabelForDay(
                    String(status ?? ''),
                    type,
                    dateObj
                  );
                  const cell = resolveAttendanceCellStyle({
                    status,
                    type,
                    rec,
                    isLate,
                    isHalftime: isHalftimeDay,
                  });
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
                        {hasDayActivityUpdates(approvedReq, storedRec) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDayActivityModal({
                                date: currentDateStr,
                                request: approvedReq ?? null,
                                record: storedRec,
                              });
                            }}
                            className="inline-flex max-w-[5.5rem] items-center gap-0.5 rounded border border-slate-300/90 bg-white/95 px-1 py-0.5 text-[9px] font-semibold leading-none text-slate-700 shadow-sm hover:bg-slate-50 sm:max-w-none"
                            title="View request and HR edit details"
                          >
                            <Info className="h-2.5 w-2.5 shrink-0" aria-hidden />
                            <span className="truncate">
                              {getDayUpdatesButtonLabel(approvedReq, storedRec)}
                            </span>
                          </button>
                        )}
                        {/* Admin Edit Button */}
                        {showEmployeeSelector && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // populate form with existing values
                              const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                              setEditDate(dateStr);
                              const existingStart = storedRec?.editedCheckin || storedRec?.checkin || storedRec?.inTime || '';
                              const existingEnd = storedRec?.editedCheckout || storedRec?.checkout || storedRec?.outTime || '';
                              const chosenStatus = (storedRec && (storedRec.typeOfPresence || storedRec.status)) || 'Present';
                              const hasExistingTimes = !!(existingStart || existingEnd);

                              setFormStatus(chosenStatus);
                              setFormRemarks(storedRec?.remarks || '');
                              setEditError(null);

                              const spentWindow = scheduledWindowForAttendanceDay(
                                scheduleUser,
                                dateStr,
                                storedRec,
                                presenceRules
                              );
                              if (spentWindow) {
                                setFormStartTime(spentWindow.scheduledIn);
                                setFormEndTime(spentWindow.scheduledOut);
                                const storedCredit = typeof storedRec?.value === 'number' ? storedRec.value : undefined;
                                setFormValue(
                                  storedCredit != null && presenceKindForStatus(chosenStatus) === 'wfh'
                                    ? effectiveWfhAttendanceValue(
                                        storedCredit,
                                        scheduleUser ?? undefined,
                                        dateStr,
                                        presenceRules
                                      )
                                    : storedCredit
                                );
                              } else if (hasExistingTimes) {
                                setFormStartTime(existingStart || '');
                                setFormEndTime(existingEnd || '');
                                setFormValue(
                                  typeof storedRec?.value === 'number'
                                    ? storedRec.value
                                    : chosenStatus.toLowerCase().includes('outstation')
                                      ? getDefaultNumericValueForType(chosenStatus, {
                                          employee: scheduleUser ?? undefined,
                                          date: dateStr,
                                          rules: presenceRules,
                                        }) ?? 1
                                      : undefined
                                );
                              } else {
                                setFormStartTime('');
                                setFormEndTime('');
                                setFormValue(undefined);
                                applyStatusAutoFill(chosenStatus, dateStr);
                              }

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
                        {approvedReq &&
                          (approvedReq.status === 'Pending' || approvedReq.status === 'PendingHr') && (
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold ${
                              approvedReq.status === 'PendingHr'
                                ? 'border-violet-200 bg-violet-50 text-violet-900'
                                : 'border-amber-200 bg-amber-50 text-amber-900'
                            }`}
                          >
                            {approvedReq.status === 'PendingHr' ? 'HR PENDING' : 'PENDING'}
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
                              if (!isHalftimeDay && (tl.includes('half day') || rec?.halfDay)) return '½ day';
                              if ((tl.includes('weekoff') || tl.includes('week off')) && tl.includes('present'))
                                return 'WO+';
                              if (tl === 'thumbmachine' || tl === 'manual' || tl === 'remote') return 'Punch';
                              return isLate ? 'Late' : 'In';
                            }
                            if (status === 'Absent') return 'Absent';
                            if (status === 'Missed Entry') return 'Missed';
                            if (status === 'Leave' || status === 'On leave') return 'Leave';
                            if (status === 'Unpaid Leave') return 'Unpaid';
                            if (status === 'Holiday' || status === 'Week Off') {
                              return calendarStatusShortLabel(status);
                            }
                            if (
                              !isHalftimeDay &&
                              (status === 'HalfDay' || status === 'Half Day (HD)' || tl.includes('half day'))
                            )
                              return '½ day';
                            return typeof status === 'string' && status.length > 10
                              ? `${status.slice(0, 9)}…`
                              : status || '?';
                          })()}
                        </span>
                      </span>
                    )}
                    
                    {/* Time info — punch times from stored record; extra work shown separately */}
                    {rec && (() => {
                      const punchRec = storedRec ?? rec;
                      const extraWorkLines = resolveExtraWorkTimeLines(storedRec, approvedReq);
                      const showPunchTimes =
                        status !== 'Leave' &&
                        status !== 'On leave' &&
                        status !== 'Unpaid Leave' &&
                        status !== 'Holiday' &&
                        status !== 'Week Off';

                      return (
                      <div className="mt-auto space-y-0.5 text-[11px] text-slate-600">
                        {showPunchTimes && (
                          <div className="flex items-center gap-2">
                            <span className={isLate ? 'font-medium text-amber-800' : 'text-slate-600'}>
                              {formatPunchTimeRange(punchRec)}
                            </span>
                          </div>
                        )}
                        {extraWorkLines.length > 0 && (
                          <div className="space-y-0.5">
                            {extraWorkLines.map((line, lineIdx) => (
                              <div
                                key={`${line.startTime}-${line.endTime}-${lineIdx}`}
                                className={`font-mono text-[10px] leading-tight ${
                                  line.pending ? 'text-amber-800' : 'text-amber-900'
                                }`}
                                title={
                                  line.pending
                                    ? 'Extra work (pending approval)'
                                    : 'Approved extra work'
                                }
                              >
                                <span className="font-sans font-medium">+ </span>
                                {line.startTime || '--:--'} → {line.endTime || '--:--'}
                                {line.pending ? (
                                  <span className="ml-0.5 font-sans text-[9px] font-medium">(pending)</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Show type if different from status */}
                        {type &&
                          type !== status &&
                          status !== 'Missed Entry' &&
                          status !== 'Leave' &&
                          status !== 'On leave' &&
                          status !== 'Unpaid Leave' &&
                          status !== 'Holiday' &&
                          status !== 'Week Off' &&
                          !(
                            isHalftimeDay &&
                            String(type).toLowerCase().includes('half day')
                          ) &&
                          !(
                            dateObj.getDay() === 0 &&
                            (type === 'Holiday' || type === 'Sunday')
                          ) && (
                          <div className="truncate text-[10px] text-slate-500" title={type}>
                            {type}
                          </div>
                        )}
                      </div>
                      );
                    })()}
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
            <span className="text-slate-700">On leave</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-rose-300 bg-rose-100" />
            <span className="text-slate-700">Unpaid leave</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-cyan-300 bg-cyan-100" />
            <span className="text-slate-700">Holiday</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-cyan-300 bg-cyan-100" />
            <span className="text-slate-700">Week off (Sunday)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-slate-300 bg-panel" />
            <span className="text-slate-700">No record</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-fuchsia-300 bg-fuchsia-100" />
            <span className="text-slate-700">HR edit on record</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-indigo-300 bg-indigo-100" />
            <span className="text-slate-700">Other / unmapped type</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-amber-300 bg-amber-50" />
            <span className="text-slate-700">Extra work (below punch)</span>
          </div>
          {approvedRequests.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex h-4 w-4 items-center justify-center rounded border border-slate-300 bg-white">
                <Info className="h-2.5 w-2.5 text-slate-600" aria-hidden />
              </div>
              <span className="text-slate-700">Details — request / approval / HR edit</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
