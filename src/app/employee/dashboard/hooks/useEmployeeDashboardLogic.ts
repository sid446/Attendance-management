"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isHolidayDate } from '@/lib/holidaysClient';
import { useRouter } from 'next/navigation';
import { AttendanceRecord, AttendanceSummaryView, User } from '@/types/ui';
import type { EmployeeAttendanceRequest } from '@/types/employeeAttendanceRequest';
import { employeeCredentialsInit } from '@/lib/employeeCredentialsInit';
import type { PartnerTeamRow } from '@/components/partner-team-overview';
import { computeSummaryAlignedMetrics, getDailyWorkedHoursSeries } from '@/lib/attendanceSummaryMetrics';
import { isValidPunchTime } from '@/lib/attendanceHours';
import { isDateInRequestWindowSegments, requestWindowRejectionMessage, istDateString, type RequestWindowConfig, type RequestWindowSegment } from '@/lib/attendanceRequestWindow';
import type { ExcessAllowanceLookup, ExcessDisplayLookup } from '@/lib/excessHourAllowance';
import { calculateExtraWorkHours, formatExtraWorkHoursLabel, sumExtraWorkSlotHours, validateExtraWorkSlotsOutsidePunchRange } from '@/lib/extraWorkRequest';
import { requiresAttendanceRequestTimePair, usesWorkHoursInputForRequest } from '@/lib/attendanceRequestTimeRules';
import { deriveInOutFromWorkHours, getWorkHoursReferenceSchedule } from '@/lib/deriveRequestInOutFromWorkHours';
import type { EmployeeDashboardTab, SubordinateAttendancePack, ExtraWorkSlotDraft } from '../types';
import { PARTNER_PENDING_COUNT_TTL_MS, TIMED_CATEGORIES } from '../constants';
import { createInitialExtraWorkSlots, getCorrectionTimeDraft, userWithSchedule, createExtraWorkSlotDraft, parseEmployeeDashboardUrlParams, getEmployeeLoginRedirectPath, sessionToUser, fetchSubordinates, normalizeUserId, fetchAttendanceForUser, buildSubordinateAttendancePack, fetchEmployeeRequestsForMonth, mapEmployeeDayStatus, calculateScheduledHoursForSummary, mergeAttendanceProfile, hasUploadedAttendance, hasPendingExtraWorkRequest, hasPendingCorrectionRequest, parseTimeToMinutes, isTimeRangeValid, emptyAttendanceSummary } from '../utils/dashboardUtils';

export function useEmployeeDashboardLogic() {
  const [activeTab, setActiveTab] = useState<EmployeeDashboardTab>('dashboard');
  // Mobile drawer open
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** Desktop: narrow icon rail vs full labels */
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  // Selected subordinate for dropdown
  const [selectedSubordinateId, setSelectedSubordinateId] = useState<string | null>(null);
  // Search state for filtering subordinates
  const [searchTerm, setSearchTerm] = useState('');
  // Sidebar tab state

  // State for subordinates (if any)
  const [subordinates, setSubordinates] = useState<User[]>([]);
  /** Admin Team Attendance Access: "Include viewer (self)" for this user. */
  const [teamAccessIncludeViewerSelf, setTeamAccessIncludeViewerSelf] = useState(false);
  /** Employees whose Work Partner is this user (direct team for approver management). */
  const [ownTeamCount, setOwnTeamCount] = useState(0);
  /** Employees whose attendanceEmail is this user's login email. */
  const [approverInboxCount, setApproverInboxCount] = useState(0);
  /** Team Attendance Access rule allows this viewer to approve requests for people they can see. */
  const [teamAccessCanApproveRequests, setTeamAccessCanApproveRequests] = useState(false);
  const [showTeamExportModal, setShowTeamExportModal] = useState(false);
  const [subordinateAttendance, setSubordinateAttendance] = useState<Record<string, SubordinateAttendancePack>>({});
  const [subordinatesListLoading, setSubordinatesListLoading] = useState(false);
  /** Team overview + calendars refetching for a new month (after initial subordinate list exists). */
  const [teamAttendanceLoading, setTeamAttendanceLoading] = useState(false);
  const teamAttendanceLoadedMonthRef = useRef<string | null>(null);
  const [teamAttendanceLoadedMonth, setTeamAttendanceLoadedMonth] = useState<string | null>(null);
  const teamAttendanceLoadInFlightRef = useRef(false);
  const partnerReviewTokenRef = useRef<string | null>(null);
  const partnerPendingCountFetchedAtRef = useRef(0);
  const subordinateRequestsLoadedRef = useRef(new Set<string>());
  const [teamPanelView, setTeamPanelView] = useState<'attendance' | 'fines' | 'requests'>('attendance');
  /** Team tab: scroll here after picking someone from the leaderboard (or overview). */
  const teamSubordinateCalendarRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /** Pending attendance requests for this user as partner (review queue). */
  const [partnerPendingReviewCount, setPartnerPendingReviewCount] = useState(0);
  /** Team leave / WFH / pending items for today (IST). */
  const [teamDailyUpdatesCount, setTeamDailyUpdatesCount] = useState(0);
  const [showDailyUpdatesModal, setShowDailyUpdatesModal] = useState(false);

  const canReviewTeamRequests =
    subordinates.length > 0 && (teamAccessCanApproveRequests || approverInboxCount > 0);

  const fetchPartnerReviewAccessToken = useCallback(async () => {
    if (partnerReviewTokenRef.current) return partnerReviewTokenRef.current;

    try {
      const res = await fetch(
        '/api/partner/review-token',
        employeeCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success || !json.data?.token) return null;

      partnerReviewTokenRef.current = json.data.token as string;
      return partnerReviewTokenRef.current;
    } catch {
      return null;
    }
  }, []);

  const fetchPartnerPendingReviewCount = useCallback(async (force = false) => {
    if (
      !force &&
      Date.now() - partnerPendingCountFetchedAtRef.current < PARTNER_PENDING_COUNT_TTL_MS
    ) {
      return;
    }

    try {
      const res = await fetch(
        '/api/employee/team-attendance-requests?status=Pending',
        employeeCredentialsInit({ cache: 'no-store' })
      );
      const json = await res.json();
      partnerPendingCountFetchedAtRef.current = Date.now();
      if (json.success && Array.isArray(json.data)) {
        setPartnerPendingReviewCount(json.data.length);
      } else {
        setPartnerPendingReviewCount(0);
      }
    } catch {
      setPartnerPendingReviewCount(0);
    }
  }, []);

  const fetchTeamDailyUpdatesCount = useCallback(async () => {
    if (!user?._id || subordinates.length === 0) {
      setTeamDailyUpdatesCount(0);
      return;
    }
    try {
      const res = await fetch(
        `/api/employee/team-daily-updates?viewerUserId=${encodeURIComponent(user._id)}&date=${encodeURIComponent(istDateString())}`,
        employeeCredentialsInit({ cache: 'no-store' })
      );
      const json = await res.json();
      if (json.success && json.data?.summary && typeof json.data.summary.total === 'number') {
        setTeamDailyUpdatesCount(json.data.summary.total);
      } else {
        setTeamDailyUpdatesCount(0);
      }
    } catch {
      setTeamDailyUpdatesCount(0);
    }
  }, [user?._id, subordinates.length]);

  const handleDailyUpdatesLoaded = useCallback(
    (payload: { date: string; from?: string; to?: string; summary: { total: number } }) => {
      const today = istDateString();
      const from = payload.from ?? payload.date;
      const to = payload.to ?? payload.date;
      if (from === today && to === today) {
        setTeamDailyUpdatesCount(payload.summary.total);
      }
    },
    []
  );

  useEffect(() => {
    if (!user?._id || subordinates.length === 0) {
      setTeamDailyUpdatesCount(0);
      return;
    }
    void fetchTeamDailyUpdatesCount();
  }, [user?._id, subordinates.length, fetchTeamDailyUpdatesCount]);

  useEffect(() => {
    if (!user?._id || subordinates.length === 0) return;
    const id = window.setInterval(() => {
      void fetchTeamDailyUpdatesCount();
    }, PARTNER_PENDING_COUNT_TTL_MS);
    return () => window.clearInterval(id);
  }, [user?._id, subordinates.length, fetchTeamDailyUpdatesCount]);

  useEffect(() => {
    if (!user?._id || !canReviewTeamRequests) {
      setPartnerPendingReviewCount(0);
      return;
    }
    void fetchPartnerPendingReviewCount(true);
  }, [user?._id, canReviewTeamRequests, fetchPartnerPendingReviewCount]);

  useEffect(() => {
    if (!user?._id) {
      setOwnTeamCount(0);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/employee/team-attendance-approver?viewerUserId=${encodeURIComponent(user._id)}`,
          employeeCredentialsInit({ cache: 'no-store' })
        );
        const json = await res.json();
        if (json.success && Array.isArray(json.data?.members)) {
          setOwnTeamCount(json.data.members.length);
        } else {
          setOwnTeamCount(0);
        }
      } catch {
        setOwnTeamCount(0);
      }
    })();
  }, [user?._id]);

  useEffect(() => {
    if (!user?._id || !canReviewTeamRequests) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void fetchPartnerPendingReviewCount(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user?._id, canReviewTeamRequests, fetchPartnerPendingReviewCount]);

  // Attendance Data State
  const [summary, setSummary] = useState<AttendanceSummaryView | null>(null);
  const [employeeDays, setEmployeeDays] = useState<AttendanceRecord[]>([]);
  const [monthYear, setMonthYear] = useState<string>(
    new Date().toISOString().substring(0, 7)
  );
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal State
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDateStatus, setSelectedDateStatus] = useState<string | null>(null); // Track the status of selected date
  const [selectedDateIsMissedEntry, setSelectedDateIsMissedEntry] = useState(false);
  const [selectedDateHasUploadedAttendance, setSelectedDateHasUploadedAttendance] = useState(false);
  const [requestModalTab, setRequestModalTab] = useState<'correction' | 'extra_work'>('correction');
  const [requestStatus, setRequestStatus] = useState('Official Holiday Duty (OHD)');
  const [requestReason, setRequestReason] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [requestWorkHours, setRequestWorkHours] = useState('');
  const [extraWorkSlots, setExtraWorkSlots] = useState<ExtraWorkSlotDraft[]>(createInitialExtraWorkSlots);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [sendingExtraWorkRequest, setSendingExtraWorkRequest] = useState(false);

  // Future Request Modal State
  const [showFutureModal, setShowFutureModal] = useState(false);
  const [showHolidayListModal, setShowHolidayListModal] = useState(false);
  const [futureStartDate, setFutureStartDate] = useState('');
  const [futureEndDate, setFutureEndDate] = useState('');
  const [futureType, setFutureType] = useState('On leave');
  const [futureCustomType, setFutureCustomType] = useState(''); // For "Other" option
  const [futureReason, setFutureReason] = useState('');
  const [futureStartTime, setFutureStartTime] = useState('');
  const [futureEndTime, setFutureEndTime] = useState('');
  const [futureWorkHours, setFutureWorkHours] = useState('');
  const [sendingFutureRequest, setSendingFutureRequest] = useState(false);

  // Calendar selection state
  const [calendarSelectionStart, setCalendarSelectionStart] = useState<string | null>(null);

  // Employee requests state
  const [employeeRequests, setEmployeeRequests] = useState<EmployeeAttendanceRequest[]>([]);

  /** HR-configured allowed date range for attendance requests (IST). */
  const [requestWindow, setRequestWindow] = useState<{
    earliestDate: string;
    latestDate: string;
    segments?: RequestWindowSegment[];
    config: RequestWindowConfig;
  } | null>(null);

  /** Partner excess-hour caps for dashboard metrics (userId:monthYear → hours). */
  const [excessAllowanceMap, setExcessAllowanceMap] = useState<ExcessAllowanceLookup>({});
  /** Day-wise approved display excess (userId:monthYear → hours). */
  const [excessDisplayMap, setExcessDisplayMap] = useState<ExcessDisplayLookup>({});

  const [holidays, setHolidays] = useState<{ date: string; name: string }[]>([]);
  /** Populated user from attendance API (schedules, employment type, etc.) for summary-aligned math */
  const [attendanceUser, setAttendanceUser] = useState<User | null>(null);
  const selectedDayRecord = useMemo(
    () => employeeDays.find((day) => day.date === selectedDate) ?? null,
    [employeeDays, selectedDate]
  );
  const selectedCorrectionTimeDraft = useMemo(
    () => getCorrectionTimeDraft(selectedDayRecord),
    [selectedDayRecord]
  );
  const correctionStatusRequiresTimePair = requiresAttendanceRequestTimePair(requestStatus);
  const correctionUsesWorkHours = usesWorkHoursInputForRequest(requestStatus);
  const futureUsesWorkHours = usesWorkHoursInputForRequest(futureType);

  const scheduleUserForRequests = useMemo(
    () => userWithSchedule(attendanceUser, user),
    [attendanceUser, user]
  );

  const correctionScheduleHint = useMemo(() => {
    if (!selectedDate || !correctionUsesWorkHours || !scheduleUserForRequests) return null;
    const sch = getWorkHoursReferenceSchedule(scheduleUserForRequests, selectedDate);
    if (!sch.inTime || sch.inTime === '00:00') return null;
    return sch;
  }, [selectedDate, correctionUsesWorkHours, scheduleUserForRequests]);

  const futureScheduleHint = useMemo(() => {
    if (!futureStartDate || !futureUsesWorkHours || !scheduleUserForRequests) return null;
    const sch = getWorkHoursReferenceSchedule(scheduleUserForRequests, futureStartDate);
    if (!sch.inTime || sch.inTime === '00:00') return null;
    return sch;
  }, [futureStartDate, futureUsesWorkHours, scheduleUserForRequests]);

  useEffect(() => {
    if (!selectedDate || !correctionUsesWorkHours) return;
    const hours = Number(requestWorkHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setStartTime('');
      setEndTime('');
      return;
    }
    const derived = deriveInOutFromWorkHours(scheduleUserForRequests, selectedDate, hours);
    if (derived) {
      setStartTime(derived.startTime);
      setEndTime(derived.endTime);
    } else {
      setStartTime('');
      setEndTime('');
    }
  }, [selectedDate, correctionUsesWorkHours, requestWorkHours, scheduleUserForRequests]);

  useEffect(() => {
    if (!futureStartDate || !futureUsesWorkHours) return;
    const hours = Number(futureWorkHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setFutureStartTime('');
      setFutureEndTime('');
      return;
    }
    const derived = deriveInOutFromWorkHours(scheduleUserForRequests, futureStartDate, hours);
    if (derived) {
      setFutureStartTime(derived.startTime);
      setFutureEndTime(derived.endTime);
    } else {
      setFutureStartTime('');
      setFutureEndTime('');
    }
  }, [futureStartDate, futureUsesWorkHours, futureWorkHours, scheduleUserForRequests]);

  const extraWorkHoursPreview = useMemo(() => {
    const withHours = extraWorkSlots
      .map((slot) => {
        const hours = calculateExtraWorkHours(slot.startTime, slot.endTime);
        return hours != null && hours > 0 ? hours : 0;
      })
      .filter((h) => h > 0);
    if (withHours.length === 0) return null;
    return sumExtraWorkSlotHours(withHours.map((hours) => ({ hours })));
  }, [extraWorkSlots]);

  const updateExtraWorkSlot = (id: string, patch: Partial<ExtraWorkSlotDraft>) => {
    setExtraWorkSlots((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;

      let next = prev.map((slot, index) => {
        if (slot.id !== id) return slot;
        const updated = { ...slot, ...patch };
        if (patch.copyPreviousReason === true && index > 0) {
          updated.reason = prev[index - 1].reason;
        }
        if (patch.copyPreviousReason === false) {
          updated.copyPreviousReason = false;
        }
        return updated;
      });

      if (patch.reason !== undefined && idx + 1 < next.length && next[idx + 1].copyPreviousReason) {
        next = next.map((slot, index) =>
          index === idx + 1 ? { ...slot, reason: String(patch.reason) } : slot
        );
      }

      return next;
    });
  };

  const addExtraWorkSlot = () => {
    setExtraWorkSlots((prev) => [...prev, createExtraWorkSlotDraft()]);
  };

  const removeExtraWorkSlot = (id: string) => {
    setExtraWorkSlots((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/holidays?activeOnly=true');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setHolidays(json.data);
        }
      } catch {
        setHolidays([]);
      }
    })();
  }, []);

  const fetchRequestWindow = useCallback(async (userId: string) => {
    try {
      const res = await fetch(
        `/api/employee/request-window?userId=${encodeURIComponent(userId)}`,
        employeeCredentialsInit({ cache: 'no-store' })
      );
      const json = await res.json();
      if (json.success && json.data) {
        setRequestWindow(json.data);
      }
    } catch {
      setRequestWindow(null);
    }
  }, []);

  const isDateInRequestWindow = useCallback(
    (date: string) => {
      if (!requestWindow) return true;
      const segments = requestWindow.segments?.length
        ? requestWindow.segments
        : [{ startDate: requestWindow.earliestDate, endDate: requestWindow.latestDate }];
      return isDateInRequestWindowSegments(date, segments);
    },
    [requestWindow]
  );

  const futureDateMin = istDateString();
  const futureDateMax = requestWindow?.latestDate ?? '';

  const isFutureRequestDateAllowed = useCallback(
    (date: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      if (date < futureDateMin) return false;
      if (futureDateMax && date > futureDateMax) return false;
      return isDateInRequestWindow(date);
    },
    [futureDateMin, futureDateMax, isDateInRequestWindow]
  );

  const openFutureRequestModal = () => {
    const seed = !futureDateMax || futureDateMin <= futureDateMax ? futureDateMin : '';
    if (!futureStartDate) setFutureStartDate(seed);
    if (!futureEndDate) setFutureEndDate(futureStartDate || seed);
    setShowFutureModal(true);
  };

  const applyFutureStartDate = (value: string) => {
    if (!value) {
      setFutureStartDate('');
      return;
    }
    if (!isFutureRequestDateAllowed(value)) {
      alert(
        value < futureDateMin
          ? 'Future requests start from today.'
          : getRequestWindowBlockMessage(value)
      );
      return;
    }
    setFutureStartDate(value);
    if (TIMED_CATEGORIES.includes(futureType) || !futureEndDate || futureEndDate < value) {
      setFutureEndDate(value);
    }
  };

  const applyFutureEndDate = (value: string) => {
    if (!value) {
      setFutureEndDate('');
      return;
    }
    if (!isFutureRequestDateAllowed(value)) {
      alert(
        value < futureDateMin
          ? 'Future requests start from today.'
          : getRequestWindowBlockMessage(value)
      );
      return;
    }
    if (futureStartDate && value < futureStartDate) {
      setFutureStartDate(value);
    }
    setFutureEndDate(value);
  };

  const fetchExcessAllowancesForMonth = useCallback(async (userIds: string[], my: string) => {
    const ids = userIds.filter(Boolean);
    if (ids.length === 0 || !my) {
      setExcessAllowanceMap({});
      setExcessDisplayMap({});
      return;
    }
    try {
      const res = await fetch(
        `/api/excess-hour-allowance?userIds=${encodeURIComponent(ids.join(','))}&monthYear=${encodeURIComponent(my)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (json.success && json.data && typeof json.data === 'object') {
        setExcessAllowanceMap(json.data as ExcessAllowanceLookup);
      } else {
        setExcessAllowanceMap({});
      }
      if (json.success && json.displayExcess && typeof json.displayExcess === 'object') {
        setExcessDisplayMap(json.displayExcess as ExcessDisplayLookup);
      } else {
        setExcessDisplayMap({});
      }
    } catch {
      setExcessAllowanceMap({});
      setExcessDisplayMap({});
    }
  }, []);

  const getRequestWindowBlockMessage = useCallback(
    (date: string) => {
      if (!requestWindow) {
        return 'Request window is loading. Please try again in a moment.';
      }
      return requestWindowRejectionMessage(date, requestWindow);
    },
    [requestWindow]
  );

  useEffect(() => {
    void (async () => {
      const { tab, monthYear: urlMonth } = parseEmployeeDashboardUrlParams();
      if (tab) setActiveTab(tab);
      const effectiveMonth = urlMonth ?? monthYear;
      if (urlMonth) setMonthYear(urlMonth);

      let userData: Record<string, unknown> | null = null;
      try {
        const res = await fetch('/api/auth/employee-session', employeeCredentialsInit());
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            userData = json.data as Record<string, unknown>;
            localStorage.setItem('employeeUser', JSON.stringify(json.data));
          }
        }
      } catch {
        // fall through to localStorage
      }

      if (!userData) {
        localStorage.removeItem('employeeUser');
        router.push(getEmployeeLoginRedirectPath());
        return;
      }

      const u = sessionToUser(userData);
      setUser(u);
      setAttendanceUser(u);
      void fetchRequestWindow(u._id);

      // Own attendance loads in parallel; reveal shell once team list (if any) is known.
      fetchAttendance(u._id, effectiveMonth, u);

      setSubordinatesListLoading(true);
      try {
        const teamAccess = await fetchSubordinates(String(userData!._id ?? ''));
        setSubordinates(teamAccess.members);
        setTeamAccessIncludeViewerSelf(teamAccess.includeViewerSelf);
        setApproverInboxCount(teamAccess.approverInboxCount);
        setTeamAccessCanApproveRequests(teamAccess.canApproveRequests);
      } catch {
        setSubordinates([]);
        setTeamAccessIncludeViewerSelf(false);
        setApproverInboxCount(0);
        setTeamAccessCanApproveRequests(false);
      } finally {
        setSubordinatesListLoading(false);
        setLoading(false);
      }
    })();
  }, []);

  const loadTeamAttendanceSummaries = useCallback(async (
    my: string,
    subs: User[],
    viewerId: string,
    includeViewerSelf: boolean
  ) => {
    if (subs.length === 0) {
      setSubordinateAttendance({});
      teamAttendanceLoadedMonthRef.current = my;
      setTeamAttendanceLoadedMonth(my);
      return;
    }
    if (teamAttendanceLoadInFlightRef.current) return;

    teamAttendanceLoadInFlightRef.current = true;
    setTeamAttendanceLoading(true);
    try {
      const results = await Promise.all(
        subs.map(async (sub) => {
          const subId = normalizeUserId(sub._id);
          if (!subId) return null;
          if (viewerId && subId === viewerId && !includeViewerSelf) return null;
          const attData = await fetchAttendanceForUser(sub._id, my);
          return {
            subId,
            pack: buildSubordinateAttendancePack(sub, attData, [], false),
          };
        })
      );

      const att: Record<string, SubordinateAttendancePack> = {};
      for (const row of results) {
        if (row) att[row.subId] = row.pack;
      }
      setSubordinateAttendance(att);
      teamAttendanceLoadedMonthRef.current = my;
      setTeamAttendanceLoadedMonth(my);
    } finally {
      setTeamAttendanceLoading(false);
      teamAttendanceLoadInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'employees' || !user || subordinates.length === 0) return;
    if (teamAttendanceLoadedMonthRef.current === monthYear) return;
    void loadTeamAttendanceSummaries(
      monthYear,
      subordinates,
      normalizeUserId(user._id),
      teamAccessIncludeViewerSelf
    );
  }, [activeTab, user, subordinates, monthYear, teamAccessIncludeViewerSelf, loadTeamAttendanceSummaries]);

  useEffect(() => {
    if (!selectedSubordinateId || activeTab !== 'employees') return;
    const subId = normalizeUserId(selectedSubordinateId);
    if (!subId) return;

    const loadKey = `${subId}:${monthYear}`;
    if (subordinateRequestsLoadedRef.current.has(loadKey)) return;

    let cancelled = false;
    void (async () => {
      const requests = await fetchEmployeeRequestsForMonth(subId, monthYear);
      if (cancelled) return;
      subordinateRequestsLoadedRef.current.add(loadKey);
      setSubordinateAttendance((prev) => {
        const current = prev[subId];
        if (!current) return prev;
        return {
          ...prev,
          [subId]: { ...current, requests, requestsLoaded: true },
        };
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSubordinateId, monthYear, activeTab]);

  const fetchAttendance = async (userId: string, my: string, sessionUser?: User | null) => {
    const baseSession = sessionUser ?? user;
    setFetchLoading(true);
    setFetchError(null);
    try {
      const [resSum, filteredRequests] = await Promise.all([
        fetch(`/api/attendance?userId=${userId}&monthYear=${my}`),
        fetchEmployeeRequestsForMonth(userId, my),
      ]);

      const jsonSum = await resSum.json();
      setEmployeeRequests(filteredRequests);

      if (jsonSum.success && jsonSum.data && jsonSum.data.length > 0) {
        const doc = jsonSum.data[0];
        // For each day, fetch the latest user schedule (in case of changes mid-month)
        const recordsObj = doc.records || {};
        const days: AttendanceRecord[] = await Promise.all(
          Object.entries(recordsObj).map(async ([dateKey, value]: [string, any]) => {
            const userForDay = doc.userId;
            const dateObj = new Date(dateKey);
            const dayOfWeek = dateObj.getDay();
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = dayNames[dayOfWeek];
            let schedule = undefined;
            // --- NEW LOGIC: Use schedules array with effective date ---
            if (userForDay.schedules && Array.isArray(userForDay.schedules) && userForDay.schedules.length > 0) {
              // Find the most recent schedule effective on or before this date
              const effSchedules = userForDay.schedules
                .filter((s: any) => new Date(s.effectiveFrom) <= dateObj)
                .sort((a: any, b: any) => Number(new Date(b.effectiveFrom).getTime()) - Number(new Date(a.effectiveFrom).getTime()));
              if (effSchedules.length > 0) {
                const eff = effSchedules[0];
                if (eff.daily && eff.daily[dayName]) {
                  schedule = { ...eff.daily[dayName] };
                }
              }
            }
            // Fallback to legacy fields if no schedule found
            if (!schedule) {
              if (dayName === 'saturday' && userForDay.scheduleInOutTimeSat) {
                schedule = { ...userForDay.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
              } else if (userForDay.scheduleInOutTime) {
                schedule = { ...userForDay.scheduleInOutTime, isHoliday: false, isHalfDay: false };
              } else if (dayName === 'sunday') {
                schedule = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
              }
            }

            // Use edited times for display if available, otherwise use original times
            const effectiveCheckin = value.editedCheckin || value.checkin;
            const effectiveCheckout = value.editedCheckout || value.checkout;

            const status = mapEmployeeDayStatus(value, userForDay as User, dateObj);

            return {
              id: userForDay._id,
              name: userForDay.name,
              date: dateKey,
              inTime: effectiveCheckin ?? '',
              outTime: effectiveCheckout ?? '',
              status: status,
              typeOfPresence: value.typeOfPresence,
              value: value.value,
              schedule: schedule, // Attach schedule for this day
              remarks: value.remarks ?? '',
              checkin: value.checkin ?? '',
              checkout: value.checkout ?? '',
              editedCheckin: value.editedCheckin ?? '',
              editedCheckout: value.editedCheckout ?? '',
              extraWorkEntries: Array.isArray(value.extraWorkEntries) ? value.extraWorkEntries : [],
            };
          })
        );
        setEmployeeDays(days);

        // Build summary.schedules.daily using the latest user schedule for each weekday
        const daily: any = {};
        const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        weekdays.forEach((day) => {
          if (day === 'saturday' && doc.userId.scheduleInOutTimeSat) {
            daily[day] = { ...doc.userId.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
          } else if (day === 'sunday') {
            daily[day] = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
          } else if (doc.userId.scheduleInOutTime) {
            daily[day] = { ...doc.userId.scheduleInOutTime, isHoliday: false, isHalfDay: false };
          } else {
            daily[day] = undefined;
          }
        });
        // Format excessHour as string for legacy UI fields
        const formatExcessHour = (val: number) => {
          const sign = val < 0 ? '-' : '';
          const abs = Math.abs(val);
          const h = Math.floor(abs);
          const m = Math.round((abs % 1) * 60);
          return `${sign}${h}:${m.toString().padStart(2, '0')}`;
        };
        const recordDetailsPlain: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(recordsObj)) {
          recordDetailsPlain[k] =
            v && typeof v === 'object' ? { ...(v as object) } : v;
        }

        const calcScheduled = calculateScheduledHoursForSummary(doc);
        const calcExcessDeficit = doc.summary?.excessHour ?? 0;
        const mappedSum: AttendanceSummaryView = {
          id: doc._id,
          userId: String(doc.userId._id ?? doc.userId),
          userName: doc.userId.name,
          monthYear: doc.monthYear,
          odId: doc.userId.odId,
          employeeCode: doc.userId.employeeCode,
          team: doc.userId.team,
          designation: doc.userId.designation,
          schedules: {
            effectiveFrom: new Date().toISOString(),
            daily
          },
          summary: {
            ...doc.summary,
            excessHours: formatExcessHour(doc.summary?.excessHour ?? 0),
          },
          recordDetails: recordDetailsPlain as AttendanceSummaryView['recordDetails'],
          calcScheduled,
          calcExcessDeficit,
        };
        setSummary(mappedSum);
        if (baseSession && doc.userId) {
          setAttendanceUser(mergeAttendanceProfile(baseSession, doc.userId));
        } else if (baseSession) {
          setAttendanceUser(baseSession);
        }
      } else {
        setSummary(null);
        setEmployeeDays([]);
        if (baseSession) setAttendanceUser(baseSession);
      }

    } catch (e) {
      setFetchError('Failed to load data');
    } finally {
      setFetchLoading(false);
    }
  };

  const handleMonthChange = (val: string) => {
    setMonthYear(val);
    if (user) fetchAttendance(user._id, val, user);
    setCalendarSelectionStart(null);
    setFutureStartDate('');
    setFutureEndDate('');
    setFutureReason('');
    setFutureStartTime('');
    setFutureEndTime('');
    setFutureCustomType('');
    teamAttendanceLoadedMonthRef.current = null;
    setTeamAttendanceLoadedMonth(null);
    subordinateRequestsLoadedRef.current.clear();
    if (activeTab === 'employees' && subordinates.length > 0) {
      void loadTeamAttendanceSummaries(
        val,
        subordinates,
        user ? normalizeUserId(user._id) : '',
        teamAccessIncludeViewerSelf
      );
    } else {
      setSubordinateAttendance({});
    }
  };

  const handleDayClick = (date: string) => {
    if (!isDateInRequestWindow(date)) {
      alert(getRequestWindowBlockMessage(date));
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const clickedDate = new Date(date);
    clickedDate.setHours(0, 0, 0, 0);

    if (clickedDate >= today) {
      // Future date - handle future request
      if (!futureStartDate) {
        // First future date clicked - set as start date, don't open modal yet
        setFutureStartDate(date);
        setFutureEndDate(date); // Default to same date
        setFutureType('On leave');
        setFutureReason('');
        setFutureStartTime('');
        setFutureEndTime('');
        setCalendarSelectionStart(date); // Set calendar selection for highlighting
        // Don't open modal yet - let user select second date
      } else if (futureStartDate === date) {
        // Clicking the same date - open modal for single date request
        setShowFutureModal(true);
        setCalendarSelectionStart(null); // Clear calendar selection
      } else {
        // Second future date clicked - set as end date and open modal
        const start = new Date(futureStartDate);
        const end = new Date(date);
        if (end >= start) {
          setFutureEndDate(date);
        } else {
          // If clicked date is before start, swap them
          setFutureEndDate(futureStartDate);
          setFutureStartDate(date);
        }
        setShowFutureModal(true);
        setCalendarSelectionStart(null); // Clear calendar selection
      }
    } else {
      // Past date - handle correction request
      // Find the attendance record for this date
      const dayRecord = employeeDays.find(d => d.date === date);
      const timeDraft = getCorrectionTimeDraft(dayRecord);

      // Check if correction request is allowed
      // Allowed when: Absent, Present, Half Day, Holiday/Week Off, missed entry (partial punch), or in/out time is missing
      const status = dayRecord?.status;
      const inTime = dayRecord?.inTime;
      const outTime = dayRecord?.outTime;
      const typeOfPresence = dayRecord?.typeOfPresence;
      const typeOfPresenceLower = typeOfPresence?.toLowerCase() || '';

      const isAbsent = status === 'Absent' || !dayRecord;
      const isPresent = status === 'Present';
      const isHalfDay = status === 'HalfDay' || typeOfPresenceLower.includes('half');
      const isHoliday =
        status === 'Holiday' ||
        typeOfPresence === 'Holiday' ||
        typeOfPresence === 'Week Off' ||
        typeOfPresenceLower.includes('weekoff') ||
        typeOfPresenceLower.includes('week off');
      const isLeaveDay =
        status === 'Leave' ||
        status === 'On leave' ||
        typeOfPresenceLower.includes('leave');
      const inMarked = isValidPunchTime(inTime);
      const outMarked = isValidPunchTime(outTime);
      const isPartialPunch = inMarked !== outMarked;
      const isMissingPunch = !inMarked && !outMarked;
      /** Single-sided punch only — not every present day with both times filled. */
      const isMissedEntry =
        !!dayRecord && isPartialPunch && !isHoliday && !isLeaveDay && !isAbsent;

      const uploadedAttendance = hasUploadedAttendance(dayRecord);

      if (!isAbsent && !isPresent && !isHalfDay && !isHoliday && !isMissingPunch && !isMissedEntry) {
        alert('Correction requests are only allowed for days marked as Present, Absent, Half Day, Holiday/Week Off, Missed Entry, or when attendance in/out is not marked.');
        return;
      }

      setSelectedDate(date);
      setSelectedDateStatus(isHoliday ? 'Holiday' : null);
      setSelectedDateIsMissedEntry(isMissedEntry);
      setSelectedDateHasUploadedAttendance(uploadedAttendance);
      setRequestModalTab('correction');
      setExtraWorkSlots(createInitialExtraWorkSlots());
      // Set default status based on the day type
      if (isMissedEntry) {
        setRequestStatus('Present - in office');
      } else if (isHoliday) {
        setRequestStatus('Weekoff - special allowance');
      } else if (isHalfDay) {
        setRequestStatus('Half Day');
      } else if (isAbsent || !dayRecord) {
        setRequestStatus('On leave');
      } else if (isPresent) {
        setRequestStatus('Present - in office');
      } else {
        setRequestStatus('On leave');
      }
      setRequestReason('');
      setRequestWorkHours('');
      setStartTime(timeDraft.startTime);
      setEndTime(timeDraft.endTime);
    }
  };

  const closeDayRequestModal = () => {
    setSelectedDate(null);
    setSelectedDateIsMissedEntry(false);
    setSelectedDateHasUploadedAttendance(false);
    setRequestModalTab('correction');
    setExtraWorkSlots(createInitialExtraWorkSlots());
    setRequestWorkHours('');
    setRequestReason('');
    setStartTime('');
    setEndTime('');
  };

  const submitExtraWorkRequest = async () => {
    if (!selectedDate || !user) return;
    if (hasPendingExtraWorkRequest(employeeRequests, selectedDate)) {
      alert('You already have a pending extra work request for this date.');
      return;
    }

    const slotsPayload = extraWorkSlots.map((slot) => ({
      startTime: slot.startTime,
      endTime: slot.endTime,
      reason: slot.reason.trim(),
    }));

    for (let i = 0; i < slotsPayload.length; i++) {
      const slot = slotsPayload[i];
      if (!slot.startTime || !slot.endTime) {
        alert(`Slot ${i + 1}: enter both start and end time.`);
        return;
      }
      const hours = calculateExtraWorkHours(slot.startTime, slot.endTime);
      if (hours === null) {
        alert(`Slot ${i + 1}: use valid times with start earlier than end.`);
        return;
      }
      if (!slot.reason) {
        alert(`Slot ${i + 1}: provide a work explanation.`);
        return;
      }
    }

    const punchIn = selectedDayRecord?.inTime || '';
    const punchOut = selectedDayRecord?.outTime || '';
    const outsidePunch = validateExtraWorkSlotsOutsidePunchRange(slotsPayload, punchIn, punchOut);
    if (!outsidePunch.ok) {
      alert(outsidePunch.error);
      return;
    }

    const totalHours = sumExtraWorkSlotHours(
      slotsPayload.map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
      }))
    );

    setSendingExtraWorkRequest(true);
    try {
      const res = await fetch('/api/employee/request-extra-work', employeeCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          date: selectedDate,
          slots: slotsPayload,
        }),
      }));
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Failed to send extra work request');
        return;
      }
      if (json.success) {
        if (json.autoApproved) {
          alert('Extra work request auto-approved.');
        } else {
          alert(
            `Extra work request (${formatExtraWorkHoursLabel(totalHours)}) submitted. Your partner will get one email tomorrow morning with yesterday's requests.`
          );
        }
        closeDayRequestModal();
        fetchAttendance(user._id, monthYear, user);
        void fetchPartnerPendingReviewCount(true);
      } else {
        alert(json.error || 'Failed to send extra work request');
      }
    } catch {
      alert('Error sending extra work request');
    } finally {
      setSendingExtraWorkRequest(false);
    }
  };

  const submitRequest = async () => {
    if (!selectedDate || !user) return;
    if (hasPendingCorrectionRequest(employeeRequests, selectedDate)) {
      alert('You already have a pending correction request for this date.');
      return;
    }
    if (!requestReason.trim()) {
      alert('Please provide a reason for your attendance correction request.');
      return;
    }

    if (correctionStatusRequiresTimePair) {
      if (correctionUsesWorkHours) {
        const hours = Number(requestWorkHours);
        if (!Number.isFinite(hours) || hours <= 0) {
          alert('Please enter the number of hours worked.');
          return;
        }
      }
      if (!startTime || !endTime) {
        alert(
          correctionUsesWorkHours
            ? 'In and out times could not be calculated from the hours entered.'
            : 'Please fill both in time and out time for this request.'
        );
        return;
      }

      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);
      if (startMinutes === null || endMinutes === null) {
        alert('Please enter valid 24-hour times.');
        return;
      }
      if (startMinutes >= endMinutes) {
        alert('In time must be earlier than out time.');
        return;
      }
    }

    let finalStartTime = startTime;
    let finalEndTime = endTime;
    // Determine if selectedDate is Sunday or holiday (from DB)
    let isSunday = false;
    let isHoliday = false;
    const dateObj = new Date(selectedDate);
    isSunday = dateObj.getDay() === 0;
    isHoliday = await isHolidayDate(selectedDate);
    // Map requestStatus to correct suffix
    let mappedStatus = requestStatus;
    if (
      requestStatus.startsWith('WFH') ||
      requestStatus.startsWith('Half Day') ||
      requestStatus.startsWith('Present - in office') ||
      requestStatus.startsWith('Present - outstation') ||
      requestStatus.startsWith('Present - client place')
    ) {
      if (isSunday || isHoliday) {
        if (requestStatus.startsWith('WFH')) mappedStatus = 'WFH - weekoff';
        else if (requestStatus.startsWith('Half Day')) mappedStatus = 'Half Day - weekoff';
        else if (requestStatus.startsWith('Present - in office')) mappedStatus = 'Present - in office - weekoff';
        else if (requestStatus.startsWith('Present - outstation')) mappedStatus = 'Present - Outstation (Weekoff)';
        else if (requestStatus.startsWith('Present - client place')) mappedStatus = 'Present - ClientPlace (Weekoff)';
      } else {
        if (requestStatus.startsWith('WFH')) mappedStatus = 'WFH - weekdays';
        else if (requestStatus.startsWith('Half Day')) mappedStatus = 'Half Day - weekdays';
        else if (requestStatus.startsWith('Present - in office')) mappedStatus = 'Present - in office - weekdays';
        else if (requestStatus.startsWith('Present - outstation')) mappedStatus = 'Present - Outstation (Weekdays)';
        else if (requestStatus.startsWith('Present - client place')) mappedStatus = 'Present - ClientPlace (Weekdays)';
      }
    }
    setSendingRequest(true);
    try {
      const res = await fetch('/api/employee/request-correction', employeeCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          date: selectedDate,
          requestedStatus: mappedStatus,
          reason: requestReason,
          startTime: finalStartTime || undefined,
          endTime: finalEndTime || undefined
        })
      }));
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 400 && typeof json.error === 'string' && json.error.includes('already have a correction request for this date')) {
          alert('You have already sent a correction request for this date. Please wait until it is approved or rejected before sending another.');
        } else {
          alert(json.error || 'Failed to send request');
        }
        return;
      }
      if (json.success) {
        if (json.autoApproved) {
          alert('Request auto-approved.');
        } else {
          alert(
            'Request submitted. Your partner will get one email tomorrow morning with yesterday’s requests.'
          );
        }
        closeDayRequestModal();
        fetchAttendance(user._id, monthYear, user);
        void fetchPartnerPendingReviewCount(true);
      } else {
        alert(json.error || 'Failed to send request');
      }
    } catch (e) {
      alert('Error sending request');
    } finally {
      setSendingRequest(false);
    }
  };

  const submitFutureRequest = async () => {
    if (!user) return;
    if (!futureStartDate || !futureEndDate) {
      alert('Please select start and end dates.');
      return;
    }
    if (futureEndDate < futureStartDate) {
      alert('End date must be on or after the start date.');
      return;
    }
    if (!isFutureRequestDateAllowed(futureStartDate) || !isFutureRequestDateAllowed(futureEndDate)) {
      alert(
        futureStartDate < futureDateMin || futureEndDate < futureDateMin
          ? 'Future requests start from today.'
          : getRequestWindowBlockMessage(
              !isFutureRequestDateAllowed(futureStartDate) ? futureStartDate : futureEndDate
            )
      );
      return;
    }
    const isTimed = TIMED_CATEGORIES.includes(futureType);
    if (isTimed) {
      if (futureStartDate !== futureEndDate) {
        alert('For this category, only singular date selection is allowed (Start Date must equal End Date).');
        return;
      }
      if (futureUsesWorkHours) {
        const hours = Number(futureWorkHours);
        if (!Number.isFinite(hours) || hours <= 0) {
          alert('Please enter the number of hours worked.');
          return;
        }
      }
      if (!futureStartTime || !futureEndTime) {
        alert(
          futureUsesWorkHours
            ? 'In and out times could not be calculated from the hours entered.'
            : 'Please provide Start Time and End Time.'
        );
        return;
      }
      if (!isTimeRangeValid(futureStartTime, futureEndTime)) {
        alert('Start time must be earlier than end time.');
        return;
      }
    }
    if (!futureReason.trim()) {
      alert('Please provide a reason.');
      return;
    }
    if (futureType === 'Other' && !futureCustomType.trim()) {
      alert('Please specify the request type.');
      return;
    }
    // Determine if the chosen date is a Sunday or holiday (from DB)
    let isSunday = false;
    let isHoliday = false;
    const dateObj = new Date(futureStartDate);
    isSunday = dateObj.getDay() === 0;
    isHoliday = await isHolidayDate(futureStartDate);
    // Map requestType to correct suffix
    let mappedType = futureType;
    if (
      futureType.startsWith('WFH') ||
      futureType.startsWith('Half Day') ||
      futureType.startsWith('Present - in office') ||
      futureType.startsWith('Present - outstation') ||
      futureType.startsWith('Present - client place')
    ) {
      if (isSunday || isHoliday) {
        if (futureType.startsWith('WFH')) mappedType = 'WFH - weekoff';
        else if (futureType.startsWith('Half Day')) mappedType = 'Half Day - weekoff';
        else if (futureType.startsWith('Present - in office')) mappedType = 'Present - in office - weekoff';
        else if (futureType.startsWith('Present - outstation')) mappedType = 'Present - Outstation (Weekoff)';
        else if (futureType.startsWith('Present - client place')) mappedType = 'Present - ClientPlace (Weekoff)';
      } else {
        if (futureType.startsWith('WFH')) mappedType = 'WFH - weekdays';
        else if (futureType.startsWith('Half Day')) mappedType = 'Half Day - weekdays';
        else if (futureType.startsWith('Present - in office')) mappedType = 'Present - in office - weekdays';
        else if (futureType.startsWith('Present - outstation')) mappedType = 'Present - Outstation (Weekdays)';
        else if (futureType.startsWith('Present - client place')) mappedType = 'Present - ClientPlace (Weekdays)';
      }
    }
    if (futureType === 'Other') mappedType = futureCustomType.trim();
    // Determine time values
    let reqStartTime: string | undefined = undefined;
    let reqEndTime: string | undefined = undefined;
    const ZERO_TIME_CATEGORIES = [
      'On leave',
      'Weekoff - special allowance'
    ];
    if (isTimed) {
      reqStartTime = futureStartTime;
      reqEndTime = futureEndTime;
    } else if (ZERO_TIME_CATEGORIES.includes(futureType)) {
      reqStartTime = '00:00';
      reqEndTime = '00:00';
    }
    setSendingFutureRequest(true);
    try {
      const res = await fetch('/api/employee/request-future-leave', employeeCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          startDate: futureStartDate,
          endDate: futureEndDate,
          requestType: mappedType,
          reason: futureReason,
          startTime: reqStartTime,
          endTime: reqEndTime
        })
      }));
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Failed to send request');
        return;
      }
      if (json.success) {
        if (json.autoApproved) {
          alert(
            json.autoApprovedCount != null && json.autoApprovedCount < json.count
              ? `${json.autoApprovedCount} of ${json.count} day(s) auto-approved; others sent for partner/HR review.`
              : `Future request auto-approved (${json.count} day${json.count === 1 ? '' : 's'}).`
          );
        } else {
          alert(
            `Request submitted (${json.count} day${json.count === 1 ? '' : 's'}). Your partner will get one email tomorrow morning with yesterday’s requests.`
          );
        }
        setShowFutureModal(false);
        setFutureStartDate('');
        setFutureEndDate('');
        setFutureReason('');
        setFutureStartTime('');
        setFutureEndTime('');
        setFutureCustomType('');
        setCalendarSelectionStart(null);
        fetchAttendance(user._id, monthYear, user);
        void fetchPartnerPendingReviewCount(true);
      } else {
        alert(json.error || 'Failed to send request');
      }
    } catch (e) {
      alert('Error sending request');
    } finally {
      setSendingFutureRequest(false);
    }
  };

  const handleLogout = () => {
    void (async () => {
      try {
        await fetch('/api/auth/employee-logout', employeeCredentialsInit({ method: 'POST' }));
      } catch {
        // ignore
      }
      localStorage.removeItem('employeeUser');
      router.push('/employee/login');
    })();
  };

  const alignedMetrics = useMemo(
    () =>
      computeSummaryAlignedMetrics(
        summary,
        (attendanceUser ?? user) ?? undefined,
        holidays,
        monthYear,
        { excessAllowanceMap, excessDisplayMap }
      ),
    [summary, attendanceUser, user, holidays, monthYear, excessAllowanceMap, excessDisplayMap]
  );

  const chartDailySeries = useMemo(
    () =>
      summary
        ? getDailyWorkedHoursSeries(
            summary,
            (attendanceUser ?? user) ?? undefined,
            monthYear
          )
        : [],
    [summary, attendanceUser, user, monthYear]
  );

  const partnerTeamRows: PartnerTeamRow[] = useMemo(() => {
    const viewerId = user?._id ? normalizeUserId(user._id) : '';
    const out: PartnerTeamRow[] = [];
    for (const sub of subordinates) {
      const userId = normalizeUserId(sub._id);
      if (!userId) continue;
      if (viewerId && userId === viewerId && !teamAccessIncludeViewerSelf) continue;
      const pack = subordinateAttendance[userId];
      const metricsUser = pack?.userForMetrics ?? sub;
      const summaryForMetrics =
        pack?.summary ?? emptyAttendanceSummary(userId, sub, monthYear);
      const m = computeSummaryAlignedMetrics(
        summaryForMetrics,
        metricsUser,
        holidays,
        monthYear,
        { treatSinglePunchAsAbsent: true, excessAllowanceMap, excessDisplayMap }
      );
      if (!m) continue;
      out.push({
        userId,
        name: sub.name,
        code: sub.employeeCode?.trim() || sub.odId || '—',
        metrics: m,
      });
    }
    return out;
  }, [subordinates, subordinateAttendance, holidays, monthYear, excessAllowanceMap, excessDisplayMap, user?._id, teamAccessIncludeViewerSelf]);

  const teamExportMembers = useMemo(() => {
    const viewerId = user?._id ? normalizeUserId(user._id) : '';
    if (teamAccessIncludeViewerSelf || !viewerId) return subordinates;
    return subordinates.filter((sub) => normalizeUserId(sub._id) !== viewerId);
  }, [subordinates, user?._id, teamAccessIncludeViewerSelf]);

  const teamExportSummaries = useMemo(() => {
    const viewerId = user?._id ? normalizeUserId(user._id) : '';
    return Object.values(subordinateAttendance)
      .map((pack) => pack.summary)
      .filter((summary): summary is AttendanceSummaryView => {
        if (!summary) return false;
        if (teamAccessIncludeViewerSelf || !viewerId) return true;
        return normalizeUserId(summary.userId) !== viewerId;
      });
  }, [subordinateAttendance, user?._id, teamAccessIncludeViewerSelf]);

  const canManageTeam = subordinates.length > 0;
  /** Excess hours: work-partner team or attendance-approver inbox (independent of team tab list). */
  const canManageExcessHours = approverInboxCount > 0 || ownTeamCount > 0;

  useEffect(() => {
    if (!canReviewTeamRequests && teamPanelView === 'requests') {
      setTeamPanelView('attendance');
    }
  }, [canReviewTeamRequests, teamPanelView]);

  useEffect(() => {
    if (!user?._id) return;
    const ids = [user._id];
    if (teamAttendanceLoadedMonth === monthYear && subordinates.length > 0) {
      ids.push(...subordinates.map((s) => normalizeUserId(s._id)).filter(Boolean));
    }
    void fetchExcessAllowancesForMonth(Array.from(new Set(ids)), monthYear);
  }, [
    user?._id,
    teamAttendanceLoadedMonth,
    subordinates,
    monthYear,
    fetchExcessAllowancesForMonth,
  ]);

  const handleSelectTeamMember = useCallback((userId: string) => {
    if (!userId) return;
    setSelectedSubordinateId(userId);
    setSearchTerm('');
    setActiveTab('employees');
    setTeamPanelView('attendance');
    setSidebarOpen(false);
    window.setTimeout(() => {
      teamSubordinateCalendarRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 120);
  }, []);

  const selectedSubordinate = useMemo(
    () => subordinates.find((s) => normalizeUserId(s._id) === selectedSubordinateId) ?? null,
    [subordinates, selectedSubordinateId]
  );

  const selectedSubordinatePack = selectedSubordinateId
    ? subordinateAttendance[selectedSubordinateId]
    : undefined;

  return {
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
  } as const;
}
