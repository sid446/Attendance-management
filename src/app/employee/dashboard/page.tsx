"use client";

import React from 'react';
import { EmployeeMonthView } from '@/components/employee-month-view';
import dynamic from 'next/dynamic';
import { TeamMemberProfileCard } from '@/components/team-member-profile-card';
import { EmployeeDashboardOverview } from '@/components/employee-dashboard-overview';
import { EmployeeSummaryMonthPicker } from '@/components/employee-summary-month-picker';
import { TeamAttendanceSkeleton } from '@/components/team-attendance-skeleton';
import { calculateExtraWorkHours, EXTRA_WORK_REQUEST_STATUS, formatExtraWorkHoursLabel } from '@/lib/extraWorkRequest';
import { requiresAttendanceRequestTimePair, usesWorkHoursInputForRequest } from '@/lib/attendanceRequestTimeRules';
import { LogOut, X, Loader2, Send, PanelLeft, PanelLeftClose, LayoutDashboard, CalendarDays, MapPin, Users as UsersIcon, ClipboardList, UserCog, IndianRupee, Clock, Newspaper, Plus, Trash2 } from 'lucide-react';
import { TIMED_CATEGORIES } from './constants';
import { formatRequestDateWithDay, formatRequestDateRangeWithDay, emptyAttendanceSummary } from './utils';
import { useEmployeeDashboardLogic } from './hooks';

const LocationAttendanceSection = dynamic(() => import('@/components/location-attendance').then((m) => m.LocationAttendanceSection));

const TeamFineSection = dynamic(() => import('@/components/team-fine').then((m) => m.TeamFineSection));

const EmployeeFineSection = dynamic(() => import('@/components/employee-fine').then((m) => m.EmployeeFineSection));

const PartnerTeamOverview = dynamic(() => import('@/components/partner-team-overview').then((m) => m.PartnerTeamOverview));

const ManageAttendanceApproverSection = dynamic(() => import('@/components/manage-attendance-approver').then((m) => m.ManageAttendanceApproverSection));

const ManageExcessHourAllowanceSection = dynamic(() => import('@/components/manage-excess-hour-allowance').then((m) => m.ManageExcessHourAllowanceSection));

const TeamDailyUpdatesSection = dynamic(() => import('@/components/team-daily-updates').then((m) => m.TeamDailyUpdatesSection));

const TeamAttendanceRequestsSection = dynamic(() => import('@/components/team-attendance-requests').then((m) => m.TeamAttendanceRequestsSection));

const SummarySection = dynamic(() => import('@/components/summary').then((m) => m.SummarySection));

export default function EmployeeDashboard() {
  const {
    activeTab,
    setActiveTab,
    sidebarOpen,
    setSidebarOpen,
    desktopSidebarCollapsed,
    setDesktopSidebarCollapsed,
    selectedSubordinateId,
    setSelectedSubordinateId,
    searchTerm,
    setSearchTerm,
    subordinates,
    ownTeamCount,
    showTeamExportModal,
    setShowTeamExportModal,
    subordinatesListLoading,
    teamAttendanceLoading,
    teamPanelView,
    setTeamPanelView,
    teamSubordinateCalendarRef,
    router,
    user,
    loading,
    partnerPendingReviewCount,
    teamDailyUpdatesCount,
    showDailyUpdatesModal,
    setShowDailyUpdatesModal,
    canReviewTeamRequests,
    fetchPartnerReviewAccessToken,
    fetchPartnerPendingReviewCount,
    fetchTeamDailyUpdatesCount,
    handleDailyUpdatesLoaded,
    summary,
    employeeDays,
    monthYear,
    setMonthYear,
    fetchLoading,
    fetchError,
    selectedDate,
    selectedDateStatus,
    selectedDateIsMissedEntry,
    selectedDateHasUploadedAttendance,
    requestModalTab,
    setRequestModalTab,
    requestStatus,
    setRequestStatus,
    requestReason,
    setRequestReason,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    requestWorkHours,
    setRequestWorkHours,
    extraWorkSlots,
    sendingRequest,
    sendingExtraWorkRequest,
    showFutureModal,
    setShowFutureModal,
    showHolidayListModal,
    setShowHolidayListModal,
    futureStartDate,
    setFutureStartDate,
    futureEndDate,
    setFutureEndDate,
    futureType,
    setFutureType,
    futureCustomType,
    setFutureCustomType,
    futureReason,
    setFutureReason,
    futureStartTime,
    setFutureStartTime,
    futureEndTime,
    setFutureEndTime,
    futureWorkHours,
    setFutureWorkHours,
    sendingFutureRequest,
    calendarSelectionStart,
    setCalendarSelectionStart,
    employeeRequests,
    requestWindow,
    excessAllowanceMap,
    excessDisplayMap,
    holidays,
    attendanceUser,
    selectedDayRecord,
    selectedCorrectionTimeDraft,
    correctionStatusRequiresTimePair,
    correctionUsesWorkHours,
    futureUsesWorkHours,
    correctionScheduleHint,
    futureScheduleHint,
    extraWorkHoursPreview,
    updateExtraWorkSlot,
    addExtraWorkSlot,
    removeExtraWorkSlot,
    futureDateMin,
    futureDateMax,
    openFutureRequestModal,
    applyFutureStartDate,
    applyFutureEndDate,
    fetchAttendance,
    handleMonthChange,
    handleDayClick,
    closeDayRequestModal,
    submitExtraWorkRequest,
    submitRequest,
    submitFutureRequest,
    handleLogout,
    alignedMetrics,
    chartDailySeries,
    partnerTeamRows,
    teamExportMembers,
    teamExportSummaries,
    canManageTeam,
    canManageExcessHours,
    handleSelectTeamMember,
    selectedSubordinate,
    selectedSubordinatePack,
  } = useEmployeeDashboardLogic();

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-foreground">
        <div
          className="flex flex-col items-center gap-6"
          role="status"
          aria-live="polite"
          aria-label="Loading workspace"
        >
          <div className="animate-workspace-logo">
            <img
              src="/lg.png"
              alt=""
              width={72}
              height={72}
              className="h-18 w-18 object-contain drop-shadow-[0_0_28px_rgba(16,185,129,0.12)]"
            />
          </div>
          <div className="flex items-center justify-center gap-1.5" aria-hidden>
            <span
              className="animate-workspace-dot h-2.5 w-2.5 rounded-full bg-emerald-400"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="animate-workspace-dot h-2.5 w-2.5 rounded-full bg-sky-400"
              style={{ animationDelay: '120ms' }}
            />
            <span
              className="animate-workspace-dot h-2.5 w-2.5 rounded-full bg-amber-400"
              style={{ animationDelay: '240ms' }}
            />
            <span
              className="animate-workspace-dot h-2.5 w-2.5 rounded-full bg-violet-400"
              style={{ animationDelay: '360ms' }}
            />
          </div>
          <p className="workspace-loading-shimmer text-center text-sm font-medium tracking-tight">
            Loading your workspace
          </p>
          <div className="workspace-loading-bar-track" aria-hidden>
            <div className="workspace-loading-bar-fill" />
          </div>
        </div>
      </div>
    );
  }

  const selectedYear = Number(monthYear.split('-')[0] || new Date().getFullYear());
  const holidaysForSelectedYear = holidays
    .filter((h) => {
      const d = new Date(h.date);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === selectedYear;
    })
    .sort((a, b) => Number(new Date(a.date).getTime()) - Number(new Date(b.date).getTime()));

  const pendingRequests = employeeRequests.filter(
    (r) => r.status === 'Pending' || r.status === 'PendingHr'
  );
  const pendingRequestCount = pendingRequests.length;

  // Correction request dropdown options (simplified)
  const statusOptions = [
    'Present - in office',
    'Half Day',
    'WFH',
    'Present - outstation',
    'Present - client place',
    'On leave',
    'Holiday',
    'Absent',
    'Weekoff - special allowance',
    'Other'
  ];

  // Week off options for Holiday/Week Off days (simplified)
  const weekOffStatusOptions = [
    'Weekoff - special allowance',
    'Present - in office',
    'Half Day',
    'WFH',
    'Present - outstation',
    'Present - client place'
  ];

  // Keep options narrow for missed in/out entry correction.
  const missedEntryStatusOptions = [
    'Present - in office',
    'Half Day'
  ];

  // Get the appropriate options based on selected date status
  const getCorrectionStatusOptions = () => {
    if (selectedDateIsMissedEntry) {
      return missedEntryStatusOptions;
    }
    if (selectedDateStatus === 'Holiday') {
      return weekOffStatusOptions;
    }
    return statusOptions;
  };

  // Limited options for future requests (simplified)
  const futureStatusOptions = [
    'On leave',
    'Half Day',
    'WFH',
    'Present - outstation',
    'Present - client place',
    'Weekoff - special allowance',
    'Other'
  ];

  const goPartnerReview = () => {
    void (async () => {
      const token = await fetchPartnerReviewAccessToken();
      if (!token) {
        alert('Unable to create review access token. Please refresh and try again.');
        return;
      }
      router.push(`/partner/review-all?token=${encodeURIComponent(token)}`);
      setSidebarOpen(false);
    })();
  };

  const navItemClass = (active: boolean, multiline = false) =>
    `flex w-full ${multiline ? 'items-start' : 'items-center'} gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors touch-manipulation ${
      desktopSidebarCollapsed ? 'md:justify-center md:gap-0 md:px-0' : 'px-3'
    } ${
      active
        ? 'bg-surface text-foreground shadow-[inset_0_0_0_1px_rgba(147,197,253,0.35)]'
        : 'text-muted-foreground hover:bg-surface/70 hover:text-foreground'
    }`;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="hidden md:inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground hover:bg-surface/80 hover:text-foreground"
              onClick={() => setDesktopSidebarCollapsed((c) => !c)}
              title={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!desktopSidebarCollapsed}
            >
              {desktopSidebarCollapsed ? (
                <PanelLeft className="h-5 w-5" aria-hidden />
              ) : (
                <PanelLeftClose className="h-5 w-5" aria-hidden />
              )}
            </button>
            <button
              type="button"
              className="md:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground"
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
            </button>
            <img src="/lg.png" alt="" className="h-9 w-9 object-contain shrink-0 opacity-95" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
                {activeTab === 'dashboard'
                  ? 'Dashboard'
                  : activeTab === 'attendance'
                    ? 'Attendance'
                    : activeTab === 'clientPunch'
                      ? 'Client location punch'
                      : activeTab === 'fines'
                        ? 'My fines'
                        : activeTab === 'manageApprovers'
                          ? 'Manage approvers'
                          : activeTab === 'manageExcessHours'
                            ? 'Excess hours by day'
                            : 'Team'}
              </h1>
              <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
                <span className="hidden sm:inline">Asija and Associates LLP · </span>
                {user.name}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              className="relative inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-medium text-foreground hover:bg-surface/80 sm:px-3 sm:text-sm"
              onClick={() => setShowHolidayListModal(true)}
              title={`Holiday list (${selectedYear})`}
              aria-label={`Holiday list ${selectedYear}`}
            >
              <CalendarDays className="h-4 w-4 opacity-80" aria-hidden />
              <span className="hidden sm:inline">Holidays</span>
            </button>
            {canManageTeam && (
              <button
                type="button"
                className="relative inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-medium text-foreground hover:bg-surface/80 sm:px-3 sm:text-sm"
                onClick={() => setShowDailyUpdatesModal(true)}
                title={
                  teamDailyUpdatesCount > 0
                    ? `${teamDailyUpdatesCount} team update${teamDailyUpdatesCount === 1 ? '' : 's'} today`
                    : 'Daily team updates'
                }
                aria-label={
                  teamDailyUpdatesCount > 0
                    ? `Daily updates, ${teamDailyUpdatesCount} for today`
                    : 'Daily updates'
                }
              >
                <span className="relative inline-flex shrink-0">
                  <Newspaper className="h-4 w-4 opacity-80" aria-hidden />
                  {teamDailyUpdatesCount > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
                      {teamDailyUpdatesCount > 99 ? '99+' : teamDailyUpdatesCount}
                    </span>
                  )}
                </span>
                <span className="hidden sm:inline">Daily updates</span>
              </button>
            )}
            {canReviewTeamRequests && (
              <button
                type="button"
                className="relative hidden md:inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface/80 sm:text-sm"
                onClick={goPartnerReview}
              title={
                partnerPendingReviewCount > 0
                  ? `${partnerPendingReviewCount} pending request${partnerPendingReviewCount === 1 ? '' : 's'} to review`
                  : 'Review requests'
              }
            >
              <span className="relative inline-flex shrink-0">
                <ClipboardList className="h-4 w-4 opacity-80" aria-hidden />
                {partnerPendingReviewCount > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
                    {partnerPendingReviewCount > 99 ? '99+' : partnerPendingReviewCount}
                  </span>
                )}
              </span>
              Review requests
            </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-rose-600"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        {futureStartDate && (
          <div className="border-t border-border px-3 py-2 sm:px-5">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-950/30 p-2">
              <button
                type="button"
                onClick={() => setShowFutureModal(true)}
                className="min-w-0 flex-1 truncate rounded-md bg-emerald-700 px-3 py-2 text-left text-xs font-medium text-white hover:bg-emerald-600"
              >
                {futureStartDate === futureEndDate
                  ? `Continue request · ${formatRequestDateWithDay(futureStartDate)}`
                  : formatRequestDateRangeWithDay(futureStartDate, futureEndDate)}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFutureStartDate('');
                  setFutureEndDate('');
                  setFutureReason('');
                  setFutureStartTime('');
                  setFutureEndTime('');
                  setCalendarSelectionStart(null);
                }}
                className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 w-full">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}

        <aside
          aria-label="Workspace navigation"
          className={`
            fixed bottom-0 left-0 top-14 z-40 flex flex-col border-r border-border bg-surface
            transition-[transform,width] duration-200 ease-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0 md:z-40
            ${desktopSidebarCollapsed ? 'md:w-18' : 'md:w-56'}
            w-56 shrink-0 px-2 py-4 md:py-6
          `}
        >
          <div
            className={`mb-3 border-b border-border pb-3 ${desktopSidebarCollapsed ? 'md:flex md:flex-col md:items-center md:px-0' : 'px-1'}`}
            title={`${user.name} · ${user.email}`}
          >
            {desktopSidebarCollapsed ? (
              <span
                className="hidden md:flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-900"
                aria-hidden
              >
                {(user.name || user.email || '?').charAt(0).toUpperCase()}
              </span>
            ) : (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </div>
            )}
            <p
              className={`mt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground ${desktopSidebarCollapsed ? 'md:sr-only' : ''}`}
            >
              Workspace
            </p>
          </div>

          <button
            type="button"
            className={navItemClass(activeTab === 'dashboard')}
            onClick={() => {
              setActiveTab('dashboard');
              setSidebarOpen(false);
            }}
            title="Dashboard"
          >
            <LayoutDashboard className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <span className={desktopSidebarCollapsed ? 'md:sr-only' : ''}>Dashboard</span>
          </button>

          <button
            type="button"
            className={navItemClass(activeTab === 'attendance', true)}
            onClick={() => {
              setActiveTab('attendance');
              setSidebarOpen(false);
            }}
            title="Your Attendance & Request — monthly calendar"
          >
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <span
              className={`min-w-0 flex-1 text-left leading-snug ${desktopSidebarCollapsed ? 'md:sr-only' : ''}`}
            >
              Your Attendance
              <br />
              & Request
            </span>
          </button>

          <button
            type="button"
            className={navItemClass(activeTab === 'clientPunch')}
            onClick={() => {
              setActiveTab('clientPunch');
              setSidebarOpen(false);
            }}
            title="Client location punch"
          >
            <MapPin className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <span className={desktopSidebarCollapsed ? 'md:sr-only' : ''}>Client punch</span>
          </button>

          <button
            type="button"
            className={navItemClass(activeTab === 'fines')}
            onClick={() => {
              setActiveTab('fines');
              setSidebarOpen(false);
            }}
            title="My fines"
          >
            <IndianRupee className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <span className={desktopSidebarCollapsed ? 'md:sr-only' : ''}>My fines</span>
          </button>

          {canManageTeam && (
            <button
              type="button"
              className={navItemClass(activeTab === 'employees')}
              onClick={() => {
                setActiveTab('employees');
                setSidebarOpen(false);
              }}
              title="Team attendance"
            >
              <UsersIcon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
              <span className={desktopSidebarCollapsed ? 'md:sr-only' : ''}>Team attendance</span>
            </button>
          )}

          {canManageExcessHours && (
            <button
              type="button"
              className={navItemClass(activeTab === 'manageExcessHours')}
              onClick={() => {
                setActiveTab('manageExcessHours');
                setSidebarOpen(false);
              }}
              title="Set allowed excess hours for your team or attendance-approver inbox"
            >
              <Clock className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
              <span className={desktopSidebarCollapsed ? 'md:sr-only' : ''}>Excess hours</span>
            </button>
          )}

          {ownTeamCount > 0 && (
            <button
              type="button"
              className={navItemClass(activeTab === 'manageApprovers')}
              onClick={() => {
                setActiveTab('manageApprovers');
                setSidebarOpen(false);
              }}
              title="Manage attendance approver"
            >
              <UserCog className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
              <span className={desktopSidebarCollapsed ? 'md:sr-only' : ''}>Manage approvers</span>
            </button>
          )}

          {canReviewTeamRequests && (
            <button
              type="button"
              className={`${navItemClass(false)} mt-1`}
              onClick={goPartnerReview}
              title={
                partnerPendingReviewCount > 0
                  ? `${partnerPendingReviewCount} pending — review requests`
                  : 'Review requests'
              }
            >
              <span className="relative inline-flex shrink-0">
                <ClipboardList className="h-5 w-5 opacity-90" aria-hidden />
                {partnerPendingReviewCount > 0 && (
                  <span className="absolute -right-2.5 -top-2 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
                    {partnerPendingReviewCount > 99 ? '99+' : partnerPendingReviewCount}
                  </span>
                )}
              </span>
              <span className={desktopSidebarCollapsed ? 'md:sr-only' : ''}>Review requests</span>
            </button>
          )}
        </aside>

        <main className={`min-h-0 min-w-0 flex-1 overflow-y-auto transition-[margin] duration-200 ${desktopSidebarCollapsed ? 'md:ml-18' : 'md:ml-56'}`}>
          <div className="mx-auto max-w-7xl space-y-6 px-3 py-5 sm:px-6 sm:py-8 lg:px-10">
            {activeTab === 'dashboard' && (
              <EmployeeDashboardOverview
                user={attendanceUser ?? user}
                monthYear={monthYear}
                onMonthYearChange={handleMonthChange}
                alignedMetrics={alignedMetrics}
                summary={summary}
                holidays={holidays}
                chartDailySeries={chartDailySeries}
                requestsPending={pendingRequestCount}
                pendingRequests={pendingRequests}
                teamMembers={subordinates}
                teamMembersLoading={subordinatesListLoading}
                isLoadingMetrics={fetchLoading}
                onSelectTeamMember={handleSelectTeamMember}
                onOpenFines={() => {
                  setActiveTab('fines');
                  setSidebarOpen(false);
                }}
              />
            )}

            {activeTab === 'attendance' && (
              <section aria-label="Monthly calendar and attendance requests">
                {requestWindow && (
                  <div className="mb-4 rounded-lg border border-blue-200/80 bg-blue-50/60 px-4 py-3 text-sm text-blue-950">
                    <p className="font-medium">Request window (IST)</p>
                    <p className="mt-1 text-blue-900/90">
                      You can raise requests for{' '}
                      {(requestWindow.segments?.length
                        ? requestWindow.segments
                        : [
                            {
                              startDate: requestWindow.earliestDate,
                              endDate: requestWindow.latestDate,
                            },
                          ]
                      ).map((segment, index, all) => (
                        <React.Fragment key={segment.startDate}>
                          {index > 0 && ' and '}
                          <strong>{segment.startDate}</strong> through{' '}
                          <strong>{segment.endDate}</strong>
                          {index === all.length - 1 && '.'}
                        </React.Fragment>
                      ))}
                      {requestWindow.config.previousMonthCutoffDay != null && (
                        <>
                          {' '}
                          Previous month closes after day {requestWindow.config.previousMonthCutoffDay};
                          current-month look-back is {requestWindow.config.currentMonthPastDays} days.
                        </>
                      )}
                    </p>
                  </div>
                )}
                <EmployeeMonthView
                  summaries={summary ? [summary] : []}
                  users={[attendanceUser ?? user]}
                  selectedEmployeeId={user._id}
                  setSelectedEmployeeId={() => {}}
                  selectedMonthYear={monthYear}
                  onMonthYearChange={handleMonthChange}
                  employeeDays={employeeDays}
                  isLoading={fetchLoading}
                  error={fetchError}
                  onLoadAttendance={() => user && fetchAttendance(user._id, monthYear, user)}
                  onDayClick={handleDayClick}
                  selectionStart={calendarSelectionStart}
                  onSelectionStartChange={setCalendarSelectionStart}
                  onApplyFutureRequest={openFutureRequestModal}
                  approvedRequests={employeeRequests}
                  showSummaryStrip={false}
                  sectionTitle="Monthly calendar"
                  subtitle="Past days: request a correction (within the allowed window). Future days: select a range, then apply for leave or other status."
                  sectionClassName="!border-blue-100 !bg-blue-50/50"
                />
              </section>
            )}

            {activeTab === 'fines' && (
              <EmployeeFineSection
                monthYear={monthYear}
                onMonthYearChange={handleMonthChange}
                userCategory={attendanceUser?.category ?? user.category}
              />
            )}

            {activeTab === 'clientPunch' && (
              <section
                aria-labelledby="client-location-punch-heading"
                className="rounded-xl border border-border bg-surface shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)]"
              >
                <header className="border-b border-border bg-background/60 px-4 py-4 sm:px-5 sm:py-4">
                  <h2
                    id="client-location-punch-heading"
                    className="text-lg font-semibold tracking-tight text-foreground"
                  >
                    Client location punch
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Check-in or Check-out separately at assigned client sites today (GPS must be on).
                  </p>
                </header>
                <div className="p-4 sm:p-5">
                  <LocationAttendanceSection userId={user._id} embedded />
                </div>
              </section>
            )}

            {activeTab === 'employees' && canManageTeam && (
              <>
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Team attendance</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {teamPanelView === 'attendance'
                          ? 'View monthly calendars for people reporting to you.'
                          : teamPanelView === 'fines'
                            ? 'Late-arrival fines and warnings for your team.'
                            : 'Review and approve attendance requests for people you are allowed to approve.'}
                      </p>
                    </div>
                    <div
                      className="inline-flex shrink-0 rounded-lg border border-border bg-background p-0.5"
                      role="tablist"
                      aria-label="Team view"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={teamPanelView === 'attendance'}
                        onClick={() => setTeamPanelView('attendance')}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          teamPanelView === 'attendance'
                            ? 'bg-surface text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <UsersIcon className="h-4 w-4" aria-hidden />
                        Attendance
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={teamPanelView === 'fines'}
                        onClick={() => setTeamPanelView('fines')}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          teamPanelView === 'fines'
                            ? 'bg-surface text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <IndianRupee className="h-4 w-4" aria-hidden />
                        Fines
                      </button>
                      {canReviewTeamRequests && (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={teamPanelView === 'requests'}
                          onClick={() => setTeamPanelView('requests')}
                          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            teamPanelView === 'requests'
                              ? 'bg-surface text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <ClipboardList className="h-4 w-4" aria-hidden />
                          Requests
                          {partnerPendingReviewCount > 0 && (
                            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                              {partnerPendingReviewCount > 99 ? '99+' : partnerPendingReviewCount}
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <EmployeeSummaryMonthPicker
                    monthYear={monthYear}
                    onMonthYearChange={handleMonthChange}
                    disabled={fetchLoading || subordinatesListLoading || teamAttendanceLoading}
                  />
                </div>
                {teamPanelView === 'fines' && !subordinatesListLoading && subordinates.length > 0 && (
                  <TeamFineSection monthYear={monthYear} teamMembers={subordinates} />
                )}
                {teamPanelView === 'requests' && canReviewTeamRequests && (
                  <TeamAttendanceRequestsSection
                    monthYear={monthYear}
                    onActionComplete={() => void fetchPartnerPendingReviewCount(true)}
                  />
                )}
                {teamPanelView === 'attendance' && (subordinatesListLoading || teamAttendanceLoading) && (
                  <TeamAttendanceSkeleton />
                )}
                {teamPanelView === 'attendance' && !subordinatesListLoading && !teamAttendanceLoading && subordinates.length > 0 && (
                  <section className="space-y-6">
                    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
                      <PartnerTeamOverview
                        monthYear={monthYear}
                        rows={partnerTeamRows}
                        onSelectMember={handleSelectTeamMember}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTeamExportModal(true)}
                        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-surface/70 transition-colors"
                      >
                        Export team
                      </button>
                    </div>

                    
                    <div className="flex max-w-md flex-col gap-3 rounded-xl border border-border bg-surface p-4">
                      <label htmlFor="search-subordinate" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Find employee
                      </label>
                      <input
                        id="search-subordinate"
                        type="text"
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                        placeholder="Name or OD ID…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      <select
                        id="subordinate-select"
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        value={selectedSubordinateId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value;
                          if (id) handleSelectTeamMember(id);
                          else setSelectedSubordinateId(null);
                        }}
                      >
                        <option value="">Select…</option>
                        {subordinates
                          .filter(
                            (sub) =>
                              sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              sub.odId.toLowerCase().includes(searchTerm.toLowerCase())
                          )
                          .map((sub) => (
                            <option key={sub._id} value={sub._id}>
                              {sub.name} ({sub.odId})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div
                      ref={teamSubordinateCalendarRef}
                      className="scroll-mt-6"
                      id="team-subordinate-calendar"
                    >
                      {selectedSubordinate ? (
                        <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
                          <TeamMemberProfileCard member={selectedSubordinate} className="mb-5 border-b border-border pb-5" />
                          <EmployeeMonthView
                            summaries={
                              selectedSubordinatePack?.summary
                                ? [selectedSubordinatePack.summary]
                                : selectedSubordinateId
                                  ? [emptyAttendanceSummary(selectedSubordinateId, selectedSubordinate, monthYear)]
                                  : []
                            }
                            users={[selectedSubordinatePack?.userForMetrics ?? selectedSubordinate]}
                            selectedEmployeeId={selectedSubordinateId!}
                            setSelectedEmployeeId={() => {}}
                            selectedMonthYear={monthYear}
                            onMonthYearChange={handleMonthChange}
                            employeeDays={selectedSubordinatePack?.employeeDays ?? []}
                            isLoading={teamAttendanceLoading}
                            error={null}
                            onLoadAttendance={() => {}}
                            approvedRequests={selectedSubordinatePack?.requests ?? []}
                            showSummaryStrip={true}
                            holidays={holidays}
                            summaryMetricsOptions={{
                              treatSinglePunchAsAbsent: true,
                              excessAllowanceMap,
                              excessDisplayMap,
                            }}
                            sectionTitle="Monthly calendar"
                            subtitle={`Attendance for ${monthYear}`}
                            sectionClassName="!border-blue-100 !bg-white"
                          />
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                          Select an employee to load their calendar.
                        </div>
                      )}
                    </div>
                  </section>
                )}
                {!subordinatesListLoading && !teamAttendanceLoading && subordinates.length === 0 && (
                  <div className="rounded-xl border border-border bg-surface py-12 text-center text-sm text-muted-foreground">
                    No team members are linked to your profile.
                  </div>
                )}
              </>
            )}

            {activeTab === 'manageApprovers' && user && (
              <ManageAttendanceApproverSection viewerUserId={user._id} />
            )}

            {activeTab === 'manageExcessHours' && user && canManageExcessHours && (
              <ManageExcessHourAllowanceSection viewerUserId={user._id} />
            )}
          </div>
        </main>
      </div>

      {/* Daily updates modal */}
      {showDailyUpdatesModal && user?._id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4">
          <div className="flex h-full w-full flex-col overflow-hidden bg-surface sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl">
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-background/80 p-3 backdrop-blur sm:p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground sm:text-base">Daily updates</h3>
                <p className="text-xs text-muted-foreground">
                  Team leave, WFH, travel &amp; requests · pick dates (IST)
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDailyUpdatesModal(false);
                  void fetchTeamDailyUpdatesCount();
                }}
                className="rounded-full border border-border bg-background p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
                aria-label="Close daily updates"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
              <TeamDailyUpdatesSection
                viewerUserId={user._id}
                showHeader={false}
                onLoaded={handleDailyUpdatesLoaded}
                onSelectMember={(memberId) => {
                  setShowDailyUpdatesModal(false);
                  handleSelectTeamMember(memberId);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Correction Modal */}
      {showTeamExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-5xl bg-surface sm:border border-border sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="shrink-0 p-3 sm:p-4 border-b border-border flex justify-between items-center bg-background/80 sticky top-0 z-10 backdrop-blur">
              <h3 className="font-semibold text-foreground text-sm sm:text-base">Team Export</h3>
              <button
                onClick={() => setShowTeamExportModal(false)}
                className="p-2 text-muted-foreground hover:text-foreground bg-background hover:bg-surface rounded-full transition-colors border border-border"
                aria-label="Close team export"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-background">
              <SummarySection
                summaries={teamExportSummaries}
                allUsers={teamExportMembers}
                holidays={holidays}
                isLoading={subordinatesListLoading || teamAttendanceLoading}
                onFilterChange={(filter) => { if (typeof filter === 'string') handleMonthChange(filter); }}
                onEmployeeClick={(id, my) => { setSelectedSubordinateId(id); setMonthYear(my); setShowTeamExportModal(false); }}
                initialMonthYear={monthYear}
                hideDetailedExport={true}
              />
            </div>
          </div>
        </div>
      )}

      {showHolidayListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-3 sm:p-4 border-b border-border flex justify-between items-center bg-background/60">
              <h3 className="font-semibold text-foreground text-sm sm:text-base">Holiday List ({selectedYear})</h3>
              <button
                onClick={() => setShowHolidayListModal(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close holiday list"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6">
              {holidaysForSelectedYear.length === 0 ? (
                <div className="rounded-lg border border-border bg-background p-4 text-sm text-foreground">
                  No active holidays configured for {selectedYear}.
                </div>
              ) : (
                <ul className="space-y-2">
                  {holidaysForSelectedYear.map((holiday) => {
                    const d = new Date(holiday.date);
                    const dateLabel = Number.isNaN(d.getTime())
                      ? holiday.date
                      : d.toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        });
                    return (
                      <li
                        key={`${holiday.date}-${holiday.name}`}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">{holiday.name}</p>
                          <p className="shrink-0 text-xs text-muted-foreground">{dateLabel}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-4 text-xs text-muted-foreground">Read-only list. Holiday edits are managed by HR/Admin.</p>
            </div>
          </div>
        </div>
      )}

      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-3 sm:p-4 border-b border-border flex justify-between items-center bg-background/60">
              <h3 className="font-semibold text-foreground text-sm sm:text-base">
                {requestModalTab === 'extra_work' ? 'Report extra work' : 'Request correction'}
              </h3>
              <button
                onClick={closeDayRequestModal}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              {selectedDateHasUploadedAttendance && (
                <div
                  className="inline-flex w-full gap-1 rounded-lg border border-border bg-muted/30 p-1"
                  role="tablist"
                  aria-label="Request type"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={requestModalTab === 'correction'}
                    onClick={() => setRequestModalTab('correction')}
                    className={`flex-1 rounded-md px-3 py-2.5 text-sm font-semibold transition-all ${
                      requestModalTab === 'correction'
                        ? 'bg-emerald-100 text-emerald-950 shadow-sm ring-2 ring-emerald-600 border border-emerald-500'
                        : 'text-muted-foreground hover:bg-background hover:text-foreground'
                    }`}
                  >
                    Correction
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={requestModalTab === 'extra_work'}
                    onClick={() => setRequestModalTab('extra_work')}
                    className={`flex-1 rounded-md px-3 py-2.5 text-sm font-semibold transition-all ${
                      requestModalTab === 'extra_work'
                        ? 'bg-amber-100 text-amber-950 shadow-sm ring-2 ring-amber-600 border border-amber-500'
                        : 'text-muted-foreground hover:bg-background hover:text-foreground'
                    }`}
                  >
                    Extra work
                  </button>
                </div>
              )}

              {requestModalTab === 'extra_work' ? (
                <>
                  <div className="p-3 bg-background border-2 border-amber-500 rounded-lg text-foreground text-sm">
                    Report additional hours worked on{' '}
                    <strong>{formatRequestDateWithDay(selectedDate)}</strong>.
                    Extra time must be <strong>before your in time</strong> or{' '}
                    <strong>after your out time</strong> — not between them.
                    Your partner will review this as <strong>{EXTRA_WORK_REQUEST_STATUS}</strong>.
                  </div>

                  {selectedDayRecord && (
                    <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                      Uploaded attendance:{' '}
                      <span className="font-mono text-foreground">
                        {selectedDayRecord.inTime || '--:--'} → {selectedDayRecord.outTime || '--:--'}
                      </span>
                      {selectedDayRecord.inTime &&
                        selectedDayRecord.outTime &&
                        selectedDayRecord.inTime !== '00:00' &&
                        selectedDayRecord.outTime !== '00:00' && (
                          <span className="block mt-1">
                            Allowed extra slots: before{' '}
                            <span className="font-mono text-foreground">{selectedDayRecord.inTime}</span> or
                            after{' '}
                            <span className="font-mono text-foreground">{selectedDayRecord.outTime}</span>
                          </span>
                        )}
                    </div>
                  )}

                  <div className="space-y-4">
                    {extraWorkSlots.map((slot, index) => (
                      <div
                        key={slot.id}
                        className="rounded-lg border-2 border-amber-500/70 bg-background p-3 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            Time slot {index + 1}
                          </p>
                          {extraWorkSlots.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeExtraWorkSlot(slot.id)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">From *</label>
                            <input
                              type="time"
                              value={slot.startTime}
                              onChange={(e) => updateExtraWorkSlot(slot.id, { startTime: e.target.value })}
                              className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-amber-500 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Until *</label>
                            <input
                              type="time"
                              value={slot.endTime}
                              onChange={(e) => updateExtraWorkSlot(slot.id, { endTime: e.target.value })}
                              className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-amber-500 text-sm"
                            />
                          </div>
                        </div>

                        {slot.startTime && slot.endTime && calculateExtraWorkHours(slot.startTime, slot.endTime) != null && (
                          <p className="text-xs text-foreground">
                            This slot:{' '}
                            <strong>
                              {formatExtraWorkHoursLabel(
                                calculateExtraWorkHours(slot.startTime, slot.endTime) ?? 0
                              )}
                            </strong>
                          </p>
                        )}

                        {index > 0 && (
                          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={slot.copyPreviousReason}
                              onChange={(e) =>
                                updateExtraWorkSlot(slot.id, { copyPreviousReason: e.target.checked })
                              }
                              className="h-4 w-4 rounded border-border text-amber-600 accent-amber-600"
                            />
                            Same explanation as previous slot
                          </label>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Work explanation *</label>
                          <textarea
                            value={slot.reason}
                            onChange={(e) => updateExtraWorkSlot(slot.id, { reason: e.target.value })}
                            readOnly={slot.copyPreviousReason}
                            placeholder={
                              index === 0
                                ? 'E.g., Morning client call and document review...'
                                : 'Explain what you did in this time slot...'
                            }
                            className={`w-full bg-background border border-border rounded-lg p-3 text-foreground outline-none focus:border-amber-500 min-h-20 text-sm ${
                              slot.copyPreviousReason ? 'opacity-80 cursor-not-allowed' : ''
                            }`}
                            required
                          />
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={addExtraWorkSlot}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-amber-500 bg-background px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40"
                    >
                      <Plus className="h-4 w-4" />
                      Add another time slot
                    </button>
                  </div>

                  {extraWorkHoursPreview != null && extraWorkHoursPreview > 0 && (
                    <p className="text-sm text-foreground">
                      Total extra hours claimed:{' '}
                      <strong>{formatExtraWorkHoursLabel(extraWorkHoursPreview)}</strong>
                    </p>
                  )}

                  <button
                    onClick={submitExtraWorkRequest}
                    disabled={sendingExtraWorkRequest}
                    className="w-full bg-amber-800 hover:bg-amber-700 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 mt-2 text-sm sm:text-base"
                  >
                    {sendingExtraWorkRequest ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Send extra work request
                  </button>
                </>
              ) : (
                <>
                  <div className="p-3 bg-background border-2 border-emerald-500 rounded-lg text-foreground text-sm">
                    Requesting attendance correction for{' '}
                    <strong>{formatRequestDateWithDay(selectedDate)}</strong>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Select correct status</label>
                    <select
                      value={requestStatus}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRequestStatus(val);
                        setRequestWorkHours('');
                        if (usesWorkHoursInputForRequest(val)) {
                          setStartTime('');
                          setEndTime('');
                        } else if (requiresAttendanceRequestTimePair(val)) {
                          setStartTime(selectedCorrectionTimeDraft.startTime);
                          setEndTime(selectedCorrectionTimeDraft.endTime);
                        } else {
                          setStartTime('');
                          setEndTime('');
                        }
                      }}
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-emerald-500 text-sm sm:text-base"
                    >
                      {getCorrectionStatusOptions().map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {correctionStatusRequiresTimePair && correctionUsesWorkHours && (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Number of hours *</label>
                        <input
                          type="number"
                          min="0.25"
                          step="0.25"
                          value={requestWorkHours}
                          onChange={(e) => setRequestWorkHours(e.target.value)}
                          placeholder="e.g. 5"
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-emerald-500 text-sm sm:text-base"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">In time</label>
                          <input
                            type="time"
                            value={startTime}
                            readOnly
                            className="w-full bg-surface border border-border rounded-lg p-2.5 text-muted-foreground cursor-not-allowed text-sm sm:text-base"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">Out time</label>
                          <input
                            type="time"
                            value={endTime}
                            readOnly
                            className="w-full bg-surface border border-border rounded-lg p-2.5 text-muted-foreground cursor-not-allowed text-sm sm:text-base"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        In and out times use your working schedule
                        {correctionScheduleHint
                          ? ` (scheduled in ${correctionScheduleHint.inTime}${
                              correctionScheduleHint.outTime
                                ? `, out ${correctionScheduleHint.outTime}`
                                : ''
                            })`
                          : ''}
                        {correctionScheduleHint?.scheduleSource?.includes('monday-fallback')
                          ? ' — this day is weekoff, so Monday’s in-time is used'
                          : ''}
                        . In time is schedule start; out time is start plus the hours you enter.
                      </p>
                    </>
                  )}

                  {correctionStatusRequiresTimePair && !correctionUsesWorkHours && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">In time</label>
                          <input
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-emerald-500 text-sm sm:text-base"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">Out time</label>
                          <input
                            type="time"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-emerald-500 text-sm sm:text-base"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Enter both times in 24-hour format. In time must be earlier than out time.
                      </p>
                    </>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Reason *</label>
                    <textarea
                      value={requestReason}
                      onChange={(e) => setRequestReason(e.target.value)}
                      placeholder="E.g., Forgot to punch out due to client meeting..."
                      className="w-full bg-background border border-border rounded-lg p-3 text-foreground outline-none focus:border-emerald-500 min-h-20 text-sm sm:text-base"
                      required
                    />
                  </div>

                  <button
                    onClick={submitRequest}
                    disabled={sendingRequest || !requestReason.trim()}
                    className="w-full bg-emerald-800 hover:bg-emerald-700 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 mt-4 text-sm sm:text-base"
                  >
                    {sendingRequest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send correction request
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showFutureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-3 sm:p-4 border-b border-border flex justify-between items-center bg-background/60">
              <h3 className="font-semibold text-foreground text-sm sm:text-base">Future Request</h3>
              <button onClick={() => {
                setShowFutureModal(false);
                setFutureStartDate('');
                setFutureEndDate('');
                setFutureReason('');
                setFutureStartTime('');
                setFutureEndTime('');
                setFutureWorkHours('');
                setFutureCustomType('');
                setCalendarSelectionStart(null);
              }} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg text-indigo-200 text-sm">
                {futureStartDate && futureEndDate
                  ? futureStartDate === futureEndDate
                    ? `Selected date: ${formatRequestDateWithDay(futureStartDate)}`
                    : `Selected range: ${formatRequestDateRangeWithDay(futureStartDate, futureEndDate)}`
                  : 'Choose the start and end dates for this request.'}
                <div className="mt-2 text-xs text-indigo-300">
                  You can type the dates here or pick them on the calendar. Only today through the request window is allowed.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={TIMED_CATEGORIES.includes(futureType) ? "col-span-1 sm:col-span-2 space-y-2" : "space-y-2"}>
                  <label className="text-sm font-medium text-muted-foreground" htmlFor="future-request-start">
                    {TIMED_CATEGORIES.includes(futureType) ? "Date" : "Start Date"}
                  </label>
                  <input
                    id="future-request-start"
                    type="date"
                    value={futureStartDate}
                    min={futureDateMin}
                    max={futureDateMax || undefined}
                    onChange={(e) => applyFutureStartDate(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-indigo-500 text-sm sm:text-base [color-scheme:light]"
                  />
                </div>
                {!TIMED_CATEGORIES.includes(futureType) && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground" htmlFor="future-request-end">End Date</label>
                    <input
                      id="future-request-end"
                      type="date"
                      value={futureEndDate}
                      min={futureStartDate || futureDateMin}
                      max={futureDateMax || undefined}
                      onChange={(e) => applyFutureEndDate(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-indigo-500 text-sm sm:text-base [color-scheme:light]"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Request Type</label>
                <select
                  value={futureType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFutureType(val);
                    setFutureWorkHours('');
                    if (TIMED_CATEGORIES.includes(val)) {
                      if (futureStartDate) setFutureEndDate(futureStartDate);
                      setFutureStartTime('');
                      setFutureEndTime('');
                    }
                    if (val !== 'Other') {
                      setFutureCustomType('');
                    }
                  }}
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-indigo-500 text-sm sm:text-base"
                >
                  {futureStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {futureType === 'Other' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Specify Request Type *</label>
                  <input
                    type="text"
                    value={futureCustomType}
                    onChange={(e) => setFutureCustomType(e.target.value)}
                    placeholder="Enter your request type..."
                    className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-indigo-500 text-sm sm:text-base"
                    required
                  />
                </div>
              )}

              {TIMED_CATEGORIES.includes(futureType) && futureUsesWorkHours && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Number of hours *</label>
                    <input
                      type="number"
                      min="0.25"
                      step="0.25"
                      value={futureWorkHours}
                      onChange={(e) => setFutureWorkHours(e.target.value)}
                      placeholder="e.g. 5"
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-indigo-500 text-sm sm:text-base"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">In time</label>
                      <input
                        type="time"
                        value={futureStartTime}
                        readOnly
                        className="w-full bg-surface border border-border rounded-lg p-2.5 text-muted-foreground cursor-not-allowed text-sm sm:text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Out time</label>
                      <input
                        type="time"
                        value={futureEndTime}
                        readOnly
                        className="w-full bg-surface border border-border rounded-lg p-2.5 text-muted-foreground cursor-not-allowed text-sm sm:text-base"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    In and out times use your working schedule
                    {futureScheduleHint
                      ? ` (scheduled in ${futureScheduleHint.inTime}${
                          futureScheduleHint.outTime ? `, out ${futureScheduleHint.outTime}` : ''
                        })`
                      : ''}
                    {futureScheduleHint?.scheduleSource?.includes('monday-fallback')
                      ? ' — this day is weekoff, so Monday’s in-time is used'
                      : ''}
                    . In time is schedule start; out time is start plus the hours you enter.
                  </p>
                </>
              )}

              {TIMED_CATEGORIES.includes(futureType) && !futureUsesWorkHours && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">In time *</label>
                      <input
                        type="time"
                        value={futureStartTime}
                        onChange={(e) => setFutureStartTime(e.target.value)}
                        required
                        className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-indigo-500 text-sm sm:text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Out time *</label>
                      <input
                        type="time"
                        value={futureEndTime}
                        onChange={(e) => setFutureEndTime(e.target.value)}
                        required
                        className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-indigo-500 text-sm sm:text-base"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    In time must be earlier than out time.
                  </p>
                </>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Reason *</label>
                <textarea
                  value={futureReason}
                  onChange={(e) => setFutureReason(e.target.value)}
                  placeholder="Reason for future absence..."
                  className="w-full bg-background border border-border rounded-lg p-3 text-foreground outline-none focus:border-indigo-500 min-h-20 text-sm sm:text-base"
                  required
                />
              </div>

              <button
                onClick={submitFutureRequest}
                disabled={sendingFutureRequest || !futureReason.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 mt-4 text-sm sm:text-base"
              >
                {sendingFutureRequest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
