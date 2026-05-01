"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isHolidayDate } from '@/lib/holidaysClient';
import { useRouter } from 'next/navigation';
import { EmployeeMonthView } from '@/components/EmployeeMonthView';
import { AttendanceRecord, AttendanceSummaryView, User } from '@/types/ui';
// Helper to fetch users working under a partner by normalized name match
async function fetchSubordinates(partnerName: string) {
  // Fetch all users (or all active users)
  const res = await fetch(`/api/users?activeOnly=true`);
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) return [];
  // Normalize function: remove dots, spaces, lowercase
  const normalize = (str: string) => str.replace(/[.\s]/g, '').toLowerCase();
  const normalizedPartner = normalize(partnerName);
  // Find users whose workingUnderPartner matches normalized partner name
  return json.data.filter((user: any) => {
    if (!user.workingUnderPartner) return false;
    return normalize(user.workingUnderPartner) === normalizedPartner;
  });
}

// Helper to fetch attendance for a user
async function fetchAttendanceForUser(userId: string, monthYear: string) {
  const res = await fetch(`/api/attendance?userId=${userId}&monthYear=${monthYear}`);
  const json = await res.json();
  if (json.success && json.data && json.data.length > 0) {
    return json.data[0];
  }
  return null;
}
import { LocationAttendanceSection } from '@/components/LocationAttendanceSection';
import { EmployeeDashboardOverview } from '@/components/EmployeeDashboardOverview';
import { EmployeeSummaryMonthPicker } from '@/components/EmployeeSummaryMonthPicker';
import { TeamAttendanceSkeleton } from '@/components/TeamAttendanceSkeleton';

import {
  PartnerTeamOverview,
  type PartnerTeamRow,
} from '@/components/PartnerTeamOverview';
import { SummarySection } from '@/components/SummarySection';
import {
  computeSummaryAlignedMetrics,
  getDailyWorkedHoursSeries,
} from '@/lib/attendanceSummaryMetrics';
import {
  LogOut,
  X,
  Loader2,
  Send,
  PanelLeft,
  PanelLeftClose,
  LayoutDashboard,
  CalendarDays,
  MapPin,
  Users as UsersIcon,
  ClipboardList,
} from 'lucide-react';

function sessionToUser(raw: Record<string, unknown>): User {
  return {
    _id: String(raw._id ?? ''),
    odId: String(raw.odId ?? ''),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    joiningDate: String(raw.joiningDate ?? ''),
    leaveBalance: raw.leaveBalance,
    ...raw,
  } as User;
}

function formatExcessHourForSummary(val: number): string {
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);
  const h = Math.floor(abs);
  const m = Math.round((abs % 1) * 60);
  return `${sign}${h}:${m.toString().padStart(2, '0')}`;
}

/** Same title-case name used for partner review URLs and pending-request API. */
function formatPartnerNameForReview(name: string): string {
  let n = name.replace(/\./g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function mergeAttendanceProfile(session: User, docUser: unknown): User {
  if (!docUser || typeof docUser !== 'object') return session;
  const d = docUser as Record<string, unknown>;
  const id = d._id != null ? String(d._id) : session._id;
  return {
    ...session,
    ...d,
    _id: id,
    odId: (d.odId as string) ?? session.odId,
    name: (d.name as string) ?? session.name,
    email: (d.email as string) ?? session.email,
    employeeCode: (d.employeeCode as string) ?? session.employeeCode,
    joiningDate: session.joiningDate || String(d.joiningDate ?? ''),
  } as User;
}

// Helper to calculate scheduled hours from recordDetails
function calculateScheduledHoursForSummary(attData: any): number {
  let totalScheduled = 0;
  const recordDetails = attData.recordDetails || {};
  const user = attData.userId;
  
  if (!user || !recordDetails) return 0;
  
  Object.entries(recordDetails).forEach(([dateStr, rec]: [string, any]) => {
    const d = new Date(dateStr);
    const typeOfPresence = rec.typeOfPresence || '';
    
    // Skip holidays and non-working records
    if (typeOfPresence === 'Holiday' || typeOfPresence === 'Sunday' || typeOfPresence === 'Weekoff') {
      return;
    }
    
    // Get schedule for this date
    let scheduledInTime = '';
    let scheduledOutTime = '';
    
    if (user.schedules && Array.isArray(user.schedules) && user.schedules.length > 0) {
      const effSchedules = user.schedules
        .filter((s: any) => new Date(s.effectiveFrom) <= d)
        .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
      
      if (effSchedules.length > 0) {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[d.getDay()];
        const daySchedule = effSchedules[0].daily?.[dayName];
        if (daySchedule && !daySchedule.isHoliday) {
          scheduledInTime = daySchedule.inTime || '';
          scheduledOutTime = daySchedule.outTime || '';
        }
      }
    }
    
    // Fallback to legacy fields
    if (!scheduledInTime && !scheduledOutTime) {
      const dayName = d.getDay();
      if (dayName === 6 && user.scheduleInOutTimeSat) {
        scheduledInTime = user.scheduleInOutTimeSat.inTime || '';
        scheduledOutTime = user.scheduleInOutTimeSat.outTime || '';
      } else if (dayName !== 0 && user.scheduleInOutTime) {
        scheduledInTime = user.scheduleInOutTime.inTime || '';
        scheduledOutTime = user.scheduleInOutTime.outTime || '';
      }
    }
    
    // Calculate hours from schedule times
    if (scheduledInTime && scheduledOutTime && scheduledInTime !== '00:00' && scheduledOutTime !== '00:00') {
      const [inH, inM] = scheduledInTime.split(':').map(Number);
      const [outH, outM] = scheduledOutTime.split(':').map(Number);
      let minutes = (outH * 60 + outM) - (inH * 60 + inM);
      if (minutes < 0) minutes += 24 * 60;
      
      // Deduct 1 hour lunch
      const hoursWithoutLunch = Math.max(0, minutes - 60) / 60;
      totalScheduled += hoursWithoutLunch;
    }
  });
  
  return Number(totalScheduled.toFixed(2));
}


const TIMED_CATEGORIES = [
  'Present - in office',
  'Half Day',
  'WFH',
  'Present - outstation',
  'Present - client place'
];

const CORRECTION_TIME_REQUIRED_PREFIXES = [
  'Present - in office',
  'Half Day',
  'WFH',
  'Present - outstation',
  'Present - client place',
];

const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseTimeToMinutes(time: string): number | null {
  if (!TIME_INPUT_PATTERN.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function isTimeRangeValid(startTime: string, endTime: string): boolean {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  return startMinutes !== null && endMinutes !== null && startMinutes < endMinutes;
}

function requiresCorrectionTimePair(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return CORRECTION_TIME_REQUIRED_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix.toLowerCase())
  );
}

function getCorrectionTimeDraft(dayRecord?: AttendanceRecord | null) {
  const startTime = dayRecord?.inTime && dayRecord.inTime !== '00:00' ? dayRecord.inTime : '';
  const endTime = dayRecord?.outTime && dayRecord.outTime !== '00:00' ? dayRecord.outTime : '';

  return {
    startTime,
    endTime,
  };
}

export default function EmployeeDashboard() {
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'attendance' | 'clientPunch' | 'employees'
  >('dashboard');
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
  const [showTeamExportModal, setShowTeamExportModal] = useState(false);
  const [subordinateAttendance, setSubordinateAttendance] = useState<
    Record<
      string,
      {
        summary: AttendanceSummaryView | null;
        employeeDays: AttendanceRecord[];
        userForMetrics?: User;
      }
    >
  >({});
  const [subLoading, setSubLoading] = useState(false);
  /** Team overview + calendars refetching for a new month (after initial subordinate list exists). */
  const [teamAttendanceLoading, setTeamAttendanceLoading] = useState(false);
  /** Team tab: scroll here after picking someone from the leaderboard (or overview). */
  const teamSubordinateCalendarRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /** Pending attendance requests for this user as partner (review queue). */
  const [partnerPendingReviewCount, setPartnerPendingReviewCount] = useState(0);
  const [partnerReviewAccessToken, setPartnerReviewAccessToken] = useState<string | null>(null);

  const getPartnerReviewIdentity = useCallback(() => {
    if (!user?.name || !user?.email) return null;
    return {
      partnerName: formatPartnerNameForReview(user.name),
      partnerEmail: String(user.email).trim(),
    };
  }, [user?.email, user?.name]);

  const fetchPartnerReviewAccessToken = useCallback(async () => {
    if (partnerReviewAccessToken) return partnerReviewAccessToken;

    const identity = getPartnerReviewIdentity();
    if (!identity) return null;

    try {
      const res = await fetch('/api/partner/review-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(identity),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data?.token) return null;

      setPartnerReviewAccessToken(json.data.token);
      return json.data.token as string;
    } catch {
      return null;
    }
  }, [getPartnerReviewIdentity, partnerReviewAccessToken]);

  const fetchPartnerPendingReviewCount = useCallback(async () => {
    const token = await fetchPartnerReviewAccessToken();
    if (!token) {
      setPartnerPendingReviewCount(0);
      return;
    }
    try {
      const res = await fetch(
        `/api/partner/pending-requests?token=${encodeURIComponent(token)}`
      );
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setPartnerPendingReviewCount(json.data.length);
      } else {
        setPartnerPendingReviewCount(0);
      }
    } catch {
      setPartnerPendingReviewCount(0);
    }
  }, [fetchPartnerReviewAccessToken]);

  useEffect(() => {
    fetchPartnerPendingReviewCount();
  }, [fetchPartnerPendingReviewCount]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') fetchPartnerPendingReviewCount();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [fetchPartnerPendingReviewCount]);

  // Attendance Data State
  const [summary, setSummary] = useState<AttendanceSummaryView | null>(null);
  const [employeeDays, setEmployeeDays] = useState<AttendanceRecord[]>([]);
  const [monthYear, setMonthYear] = useState<string>(
    new Date().toISOString().substring(0, 7) // YYYY-MM
  );
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal State
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDateStatus, setSelectedDateStatus] = useState<string | null>(null); // Track the status of selected date
  const [selectedDateIsMissedEntry, setSelectedDateIsMissedEntry] = useState(false);
  const [requestStatus, setRequestStatus] = useState('Official Holiday Duty (OHD)');
  const [requestReason, setRequestReason] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);

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
  const [sendingFutureRequest, setSendingFutureRequest] = useState(false);

  // Calendar selection state
  const [calendarSelectionStart, setCalendarSelectionStart] = useState<string | null>(null);

  // Employee requests state
  const [employeeRequests, setEmployeeRequests] = useState<Array<{
    _id: string;
    date: string;
    requestedStatus: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    approvedBy?: string;
    approvedByEmail?: string;
    approvedAt?: string;
    updatedAt?: string;
  }>>([]);

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
  const correctionStatusRequiresTimePair = requiresCorrectionTimePair(requestStatus);

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

  useEffect(() => {
    const stored = localStorage.getItem('employeeUser');
    if (!stored) {
      router.push('/employee/login');
      return;
    }
    let userData: Record<string, unknown>;
    try {
      userData = JSON.parse(stored) as Record<string, unknown>;
    } catch {
      router.push('/employee/login');
      return;
    }

    (async () => {
      const u = sessionToUser(userData);
      setUser(u);
      setAttendanceUser(u);

      // Own attendance loads in parallel; do not reveal the shell until we know if this user has a team (sidebar).
      fetchAttendance(u._id, monthYear, u);

      setSubLoading(true);
      try {
        let subs: User[] = [];
        try {
          subs = await fetchSubordinates(String(userData._id ?? ''));
          if (!subs.length && userData.name) {
            subs = await fetchSubordinates(String(userData.name));
          }
        } catch {
          subs = [];
        }
        setSubordinates(subs);
        setLoading(false);

        const att: Record<
          string,
          {
            summary: AttendanceSummaryView | null;
            employeeDays: AttendanceRecord[];
            userForMetrics?: User;
          }
        > = {};
      for (const sub of subs) {
        const attData = await fetchAttendanceForUser(sub._id, monthYear);
        if (attData) {
          // Build summary and employeeDays as in main fetchAttendance
          const recordsObj = attData.records || {};
          const days: AttendanceRecord[] = Object.entries(recordsObj).map(([dateKey, value]: [string, any]) => {
            const userForDay = attData.userId;
            const dateObj = new Date(dateKey);
            const dayOfWeek = dateObj.getDay();
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = dayNames[dayOfWeek];
            let schedule = undefined;
            if (userForDay.schedules && Array.isArray(userForDay.schedules) && userForDay.schedules.length > 0) {
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
            if (!schedule) {
              if (dayName === 'saturday' && userForDay.scheduleInOutTimeSat) {
                schedule = { ...userForDay.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
              } else if (userForDay.scheduleInOutTime) {
                schedule = { ...userForDay.scheduleInOutTime, isHoliday: false, isHalfDay: false };
              } else if (dayName === 'sunday') {
                schedule = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
              }
            }
            const effectiveCheckin = value.editedCheckin || value.checkin;
            const effectiveCheckout = value.editedCheckout || value.checkout;
            const typeLower = String(value.typeOfPresence || '').toLowerCase();
            const isPresenceType = typeLower.includes('wfh') || 
                                   typeLower.includes('outstation') || 
                                   typeLower.includes('clientplace') || 
                                   typeLower.includes('half day') ||
                                   value.halfDay;

            let status: any = 'Present';
            if (value.typeOfPresence === 'Leave' || value.typeOfPresence === 'On leave') status = 'On leave';
            else if (value.typeOfPresence === 'Holiday') status = 'Holiday';
            else if (isPresenceType) status = value.halfDay ? 'HalfDay' : 'Present';
            else if (!effectiveCheckin && !effectiveCheckout && value.typeOfPresence !== 'Leave' && value.typeOfPresence !== 'On leave') status = 'Absent';
            if (status === 'Present' && !effectiveCheckin && !effectiveCheckout && !isPresenceType) status = 'Absent';
            return {
              id: userForDay._id,
              name: userForDay.name,
              date: dateKey,
              inTime: effectiveCheckin ?? '',
              outTime: effectiveCheckout ?? '',
              status: status,
              typeOfPresence: value.typeOfPresence,
              value: value.value,
              schedule: schedule
            };
          });
          const daily: any = {};
          const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          weekdays.forEach((day) => {
            if (day === 'saturday' && attData.userId.scheduleInOutTimeSat) {
              daily[day] = { ...attData.userId.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
            } else if (day === 'sunday') {
              daily[day] = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
            } else if (attData.userId.scheduleInOutTime) {
              daily[day] = { ...attData.userId.scheduleInOutTime, isHoliday: false, isHalfDay: false };
            } else {
              daily[day] = undefined;
            }
          });
          const recordDetailsPlain: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(recordsObj)) {
            recordDetailsPlain[k] =
              v && typeof v === 'object' ? { ...(v as object) } : v;
          }
          const calcScheduled = calculateScheduledHoursForSummary(attData);
          const calcExcessDeficit = attData.summary?.excessHour ?? 0;
          const mappedSum: AttendanceSummaryView = {
            id: attData._id,
            userId: attData.userId._id,
            userName: attData.userId.name,
            monthYear: attData.monthYear,
            odId: attData.userId.odId,
            employeeCode: attData.userId.employeeCode,
            team: attData.userId.team,
            designation: attData.userId.designation,
            schedules: {
              effectiveFrom: new Date().toISOString(),
              daily
            },
            summary: {
              ...attData.summary,
              excessHours: formatExcessHourForSummary(
                attData.summary?.excessHour ?? 0
              ),
            },
            recordDetails: recordDetailsPlain as AttendanceSummaryView['recordDetails'],
            calcScheduled,
            calcExcessDeficit,
          };
          att[sub._id] = {
            summary: mappedSum,
            employeeDays: days,
            userForMetrics: mergeAttendanceProfile(sub, attData.userId) as User,
          };
        } else {
          att[sub._id] = { summary: null, employeeDays: [] };
        }
      }
        setSubordinateAttendance(att);
      } finally {
        setSubLoading(false);
      }
    })();
  }, []);

  const fetchAttendance = async (userId: string, my: string, sessionUser?: User | null) => {
    const baseSession = sessionUser ?? user;
    setFetchLoading(true);
    setFetchError(null);
    try {
      // Fetch Summary and Employee Requests in parallel
      const [resSum, resRequests] = await Promise.all([
        fetch(`/api/attendance?userId=${userId}&monthYear=${my}`),
        fetch(`/api/employee/request-correction?userId=${userId}`)
      ]);

      const jsonSum = await resSum.json();
      const jsonRequests = await resRequests.json();

      // Process employee requests
      if (jsonRequests.success && jsonRequests.data) {
        // Filter requests for the selected month
        const filteredRequests = jsonRequests.data.filter((req: any) => {
          const reqDate = req.date.split('T')[0];
          return reqDate.startsWith(my);
        });
        setEmployeeRequests(filteredRequests);
      } else {
        setEmployeeRequests([]);
      }

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

            const typeLower = String(value.typeOfPresence || '').toLowerCase();
            const isPresenceType = typeLower.includes('wfh') || 
                                   typeLower.includes('outstation') || 
                                   typeLower.includes('clientplace') || 
                                   typeLower.includes('half day') ||
                                   value.halfDay;

            let status: any = 'Present';
            if (value.typeOfPresence === 'Leave' || value.typeOfPresence === 'On leave') status = 'On leave';
            else if (value.typeOfPresence === 'Holiday') status = 'Holiday';
            else if (isPresenceType) status = value.halfDay ? 'HalfDay' : 'Present';
            else if (!effectiveCheckin && !effectiveCheckout && value.typeOfPresence !== 'Leave' && value.typeOfPresence !== 'On leave') status = 'Absent';

            // Fallback
            if (status === 'Present' && !effectiveCheckin && !effectiveCheckout && !isPresenceType) status = 'Absent';

            return {
              id: userForDay._id,
              name: userForDay.name,
              date: dateKey,
              inTime: effectiveCheckin ?? '',
              outTime: effectiveCheckout ?? '',
              status: status,
              typeOfPresence: value.typeOfPresence,
              value: value.value,
              schedule: schedule // Attach schedule for this day
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
    // Also reload subordinate attendance for new month
    (async () => {
      if (!user) return;
      let subs: User[] = subordinates;
      if (!subs.length) {
        subs = await fetchSubordinates(user._id);
        if (!subs.length && user.name) {
          subs = await fetchSubordinates(user.name);
        }
      }
      if (subs.length === 0) {
        setSubordinateAttendance({});
        return;
      }
      setTeamAttendanceLoading(true);
      const att: Record<
        string,
        {
          summary: AttendanceSummaryView | null;
          employeeDays: AttendanceRecord[];
          userForMetrics?: User;
        }
      > = {};
      try {
      for (const sub of subs) {
        const attData = await fetchAttendanceForUser(sub._id, val);
        if (attData) {
          const recordsObj = attData.records || {};
          const days: AttendanceRecord[] = Object.entries(recordsObj).map(([dateKey, value]: [string, any]) => {
            const userForDay = attData.userId;
            const dateObj = new Date(dateKey);
            const dayOfWeek = dateObj.getDay();
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = dayNames[dayOfWeek];
            let schedule = undefined;
            if (userForDay.schedules && Array.isArray(userForDay.schedules) && userForDay.schedules.length > 0) {
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
            if (!schedule) {
              if (dayName === 'saturday' && userForDay.scheduleInOutTimeSat) {
                schedule = { ...userForDay.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
              } else if (userForDay.scheduleInOutTime) {
                schedule = { ...userForDay.scheduleInOutTime, isHoliday: false, isHalfDay: false };
              } else if (dayName === 'sunday') {
                schedule = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
              }
            }
            const effectiveCheckin = value.editedCheckin || value.checkin;
            const effectiveCheckout = value.editedCheckout || value.checkout;
            const typeLower = String(value.typeOfPresence || '').toLowerCase();
            const isPresenceType = typeLower.includes('wfh') || 
                                   typeLower.includes('outstation') || 
                                   typeLower.includes('clientplace') || 
                                   typeLower.includes('half day') ||
                                   value.halfDay;

            let status: any = 'Present';
            if (value.typeOfPresence === 'Leave' || value.typeOfPresence === 'On leave') status = 'On leave';
            else if (value.typeOfPresence === 'Holiday') status = 'Holiday';
            else if (isPresenceType) status = value.halfDay ? 'HalfDay' : 'Present';
            else if (!effectiveCheckin && !effectiveCheckout && value.typeOfPresence !== 'Leave' && value.typeOfPresence !== 'On leave') status = 'Absent';
            if (status === 'Present' && !effectiveCheckin && !effectiveCheckout && !isPresenceType) status = 'Absent';
            return {
              id: userForDay._id,
              name: userForDay.name,
              date: dateKey,
              inTime: effectiveCheckin ?? '',
              outTime: effectiveCheckout ?? '',
              status: status,
              typeOfPresence: value.typeOfPresence,
              value: value.value,
              schedule: schedule
            };
          });
          const daily: any = {};
          const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          weekdays.forEach((day) => {
            if (day === 'saturday' && attData.userId.scheduleInOutTimeSat) {
              daily[day] = { ...attData.userId.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
            } else if (day === 'sunday') {
              daily[day] = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
            } else if (attData.userId.scheduleInOutTime) {
              daily[day] = { ...attData.userId.scheduleInOutTime, isHoliday: false, isHalfDay: false };
            } else {
              daily[day] = undefined;
            }
          });
          const recordDetailsPlain: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(recordsObj)) {
            recordDetailsPlain[k] =
              v && typeof v === 'object' ? { ...(v as object) } : v;
          }
          const calcScheduled = calculateScheduledHoursForSummary(attData);
          const calcExcessDeficit = attData.summary?.excessHour ?? 0;
          const mappedSum: AttendanceSummaryView = {
            id: attData._id,
            userId: attData.userId._id,
            userName: attData.userId.name,
            monthYear: attData.monthYear,
            odId: attData.userId.odId,
            employeeCode: attData.userId.employeeCode,
            team: attData.userId.team,
            designation: attData.userId.designation,
            schedules: {
              effectiveFrom: new Date().toISOString(),
              daily
            },
            summary: {
              ...attData.summary,
              excessHours: formatExcessHourForSummary(
                attData.summary?.excessHour ?? 0
              ),
            },
            recordDetails: recordDetailsPlain as AttendanceSummaryView['recordDetails'],
            calcScheduled,
            calcExcessDeficit,
          };
          att[sub._id] = {
            summary: mappedSum,
            employeeDays: days,
            userForMetrics: mergeAttendanceProfile(sub, attData.userId) as User,
          };
        } else {
          att[sub._id] = { summary: null, employeeDays: [] };
        }
      }
      setSubordinateAttendance(att);
      } finally {
        setTeamAttendanceLoading(false);
      }
    })();
  };

  const handleDayClick = (date: string) => {
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
      // Allowed when: Absent, Half Day, Holiday/Week Off, or in/out time is missing
      const status = dayRecord?.status;
      const inTime = dayRecord?.inTime;
      const outTime = dayRecord?.outTime;
      const typeOfPresence = dayRecord?.typeOfPresence;

      const isAbsent = status === 'Absent' || !dayRecord;
      const isHalfDay = status === 'HalfDay' || typeOfPresence?.toLowerCase().includes('half');
      const isHoliday = status === 'Holiday' || typeOfPresence === 'Holiday' || typeOfPresence === 'Week Off';
      const isMissingPunch = !inTime || !outTime || inTime === '00:00' || outTime === '00:00';

      // Check if there's already a pending request for this date
      const existingRequest = employeeRequests.find(r => r.date.split('T')[0] === date);
      if (existingRequest && existingRequest.status === 'Pending') {
        alert('You already have a pending request for this date. Please wait for it to be processed.');
        return;
      }

      if (!isAbsent && !isHalfDay && !isHoliday && !isMissingPunch) {
        alert('Correction requests are only allowed for days marked as Absent, Half Day, Holiday/Week Off, or when attendance in/out is not marked.');
        return;
      }

      setSelectedDate(date);
      setSelectedDateStatus(isHoliday ? 'Holiday' : null);
      setSelectedDateIsMissedEntry(isMissingPunch);
      // Set default status based on the day type
      if (isMissingPunch) {
        setRequestStatus('Present - in office');
      } else if (isHoliday) {
        setRequestStatus('Weekoff - special allowance');
      } else {
        setRequestStatus('On leave');
      }
      setRequestReason('');
      setStartTime(timeDraft.startTime);
      setEndTime(timeDraft.endTime);
    }
  };

  const submitRequest = async () => {
    if (!selectedDate || !user) return;
    if (!requestReason.trim()) {
      alert('Please provide a reason for your attendance correction request.');
      return;
    }

    if (correctionStatusRequiresTimePair) {
      if (!startTime || !endTime) {
        alert('Please fill both in time and out time for this request.');
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
    // For Present - outstation, use the actual schedule attached to the attendance record for that date if available
    const dayRecord = employeeDays.find(d => d.date === selectedDate);
    if (requestStatus.startsWith('Present - outstation')) {
      if (dayRecord && dayRecord.schedule && !dayRecord.schedule.isHoliday) {
        finalStartTime = dayRecord.schedule.inTime;
        finalEndTime = dayRecord.schedule.outTime;
      } else if (summary?.schedules) {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dateObj.getDay()];
        let scheduleToUse = summary?.schedules?.daily?.[dayName];
        if (scheduleToUse && !scheduleToUse.isHoliday) {
          finalStartTime = scheduleToUse.inTime;
          finalEndTime = scheduleToUse.outTime;
        }
      }
    }
    setSendingRequest(true);
    try {
      const res = await fetch('/api/employee/request-correction', {
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
      });
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
        alert(`Request sent successfully to ${json.sentTo}!`);
        setSelectedDate(null);
        fetchAttendance(user._id, monthYear, user);
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
    const isTimed = TIMED_CATEGORIES.includes(futureType);
    if (isTimed) {
      if (futureStartDate !== futureEndDate) {
        alert('For this category, only singular date selection is allowed (Start Date must equal End Date).');
        return;
      }
      if (!futureStartTime || !futureEndTime) {
        alert('Please provide Start Time and End Time.');
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
    const SCHEDULED_TIME_CATEGORIES = [
      'Present - outstation'
    ];
    if (isTimed) {
      reqStartTime = futureStartTime;
      reqEndTime = futureEndTime;
    } else if (ZERO_TIME_CATEGORIES.includes(futureType)) {
      reqStartTime = '00:00';
      reqEndTime = '00:00';
    } else if (SCHEDULED_TIME_CATEGORIES.includes(futureType)) {
      reqStartTime = undefined;
      reqEndTime = undefined;
    }
    setSendingFutureRequest(true);
    try {
      const res = await fetch('/api/employee/request-future-leave', {
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
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Failed to send request');
        return;
      }
      if (json.success) {
        alert(`Future request sent successfully! Created ${json.count} requests.`);
        setShowFutureModal(false);
        setFutureStartDate('');
        setFutureEndDate('');
        setFutureReason('');
        setFutureStartTime('');
        setFutureEndTime('');
        setFutureCustomType('');
        setCalendarSelectionStart(null);
        fetchAttendance(user._id, monthYear, user);
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
    localStorage.removeItem('employeeUser');
    router.push('/employee/login');
  };

  const alignedMetrics = useMemo(
    () =>
      computeSummaryAlignedMetrics(
        summary,
        (attendanceUser ?? user) ?? undefined,
        holidays,
        monthYear
      ),
    [summary, attendanceUser, user, holidays, monthYear]
  );

  const chartDailySeries = useMemo(
    () => (summary ? getDailyWorkedHoursSeries(summary) : []),
    [summary]
  );

  const partnerTeamRows: PartnerTeamRow[] = useMemo(() => {
    const out: PartnerTeamRow[] = [];
    for (const sub of subordinates) {
      const pack = subordinateAttendance[sub._id];
      if (!pack?.summary || !pack.userForMetrics) continue;
      const m = computeSummaryAlignedMetrics(
        pack.summary,
        pack.userForMetrics,
        holidays,
        monthYear
      );
      if (!m) continue;
      out.push({
        userId: sub._id,
        name: sub.name,
        code: sub.employeeCode?.trim() || sub.odId || '—',
        metrics: m,
      });
    }
    return out;
  }, [subordinates, subordinateAttendance, holidays, monthYear]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 px-6">
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

  const pendingRequestCount = employeeRequests.filter((r) => r.status === 'Pending').length;

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

  const navItemClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors touch-manipulation ${
      desktopSidebarCollapsed ? 'md:justify-center md:gap-0 md:px-0' : 'px-3'
    } ${
      active
        ? 'bg-zinc-100 text-zinc-900 md:bg-zinc-800 md:text-zinc-50'
        : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200'
    }`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="hidden md:inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
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
              className="md:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300"
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
            </button>
            <img src="/lg.png" alt="" className="h-9 w-9 object-contain shrink-0 opacity-95" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-100 sm:text-base">
                {activeTab === 'dashboard'
                  ? 'Dashboard'
                  : activeTab === 'attendance'
                    ? 'Attendance'
                    : activeTab === 'clientPunch'
                      ? 'Client location punch'
                      : 'Team'}
              </h1>
              <p className="truncate text-[11px] text-zinc-500 sm:text-xs">
                <span className="hidden sm:inline">Asija and Associates LLP · </span>
                {user.name}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              className="relative hidden md:inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 sm:text-sm"
              onClick={() => setShowHolidayListModal(true)}
              title={`Holiday list (${selectedYear})`}
            >
              <CalendarDays className="h-4 w-4 opacity-80" aria-hidden />
              Holidays
            </button>
            <button
              type="button"
              className="relative hidden md:inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 sm:text-sm"
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
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-rose-400"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        {futureStartDate && (
          <div className="border-t border-zinc-800/60 px-3 py-2 sm:px-5">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-950/30 p-2">
              <button
                type="button"
                onClick={() => setShowFutureModal(true)}
                className="min-w-0 flex-1 truncate rounded-md bg-emerald-700 px-3 py-2 text-left text-xs font-medium text-white hover:bg-emerald-600"
              >
                {futureStartDate === futureEndDate
                  ? `Continue request · ${futureStartDate}`
                  : `${futureStartDate} → ${futureEndDate}`}
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
                className="shrink-0 rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
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
            className="fixed inset-0 z-30 bg-zinc-950/70 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}

        <aside
          aria-label="Workspace navigation"
          className={`
            fixed bottom-0 left-0 top-14 z-40 flex flex-col border-r border-zinc-800 bg-zinc-900
            transition-[transform,width] duration-200 ease-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0 md:z-40
            ${desktopSidebarCollapsed ? 'md:w-18' : 'md:w-56'}
            w-56 shrink-0 px-2 py-4 md:py-6
          `}
        >
          <div
            className={`mb-3 border-b border-zinc-800 pb-3 ${desktopSidebarCollapsed ? 'md:px-0 md:text-center' : ''}`}
          >
            <p
              className={`text-[10px] font-medium uppercase tracking-wider text-zinc-500 ${desktopSidebarCollapsed ? 'md:sr-only' : ''}`}
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
            className={navItemClass(activeTab === 'attendance')}
            onClick={() => {
              setActiveTab('attendance');
              setSidebarOpen(false);
            }}
            title="Attendance — monthly calendar"
          >
            <CalendarDays className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <span className={desktopSidebarCollapsed ? 'md:sr-only' : ''}>Attendance</span>
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

          {subordinates.length > 0 && (
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
        </aside>

        <main className={`min-h-0 min-w-0 flex-1 overflow-y-auto transition-[margin] duration-200 ${desktopSidebarCollapsed ? 'md:ml-18' : 'md:ml-56'}`}>
          <div className="mx-auto max-w-7xl space-y-6 px-3 py-5 sm:px-6 sm:py-8 lg:px-10">
            {activeTab === 'dashboard' && (
              <EmployeeDashboardOverview
                user={attendanceUser ?? user}
                monthYear={monthYear}
                onMonthYearChange={handleMonthChange}
                alignedMetrics={alignedMetrics}
                chartDailySeries={chartDailySeries}
                requestsPending={pendingRequestCount}
                isLoadingMetrics={fetchLoading}
              />
            )}

            {activeTab === 'attendance' && (
              <section aria-label="Monthly calendar and attendance requests">
                <EmployeeMonthView
                  summaries={summary ? [summary] : []}
                  users={[user]}
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
                  onApplyFutureRequest={() => setShowFutureModal(true)}
                  approvedRequests={employeeRequests}
                  showSummaryStrip={false}
                  sectionTitle="Monthly calendar"
                  subtitle="Past days: request a correction. Future days: select a range, then apply for leave or other status."
                  sectionClassName="!border-blue-100 !bg-blue-50/50"
                />
              </section>
            )}

            {activeTab === 'clientPunch' && (
              <section
                aria-labelledby="client-location-punch-heading"
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 shadow-sm"
              >
                <header className="border-b border-zinc-800/80 bg-zinc-950/30 px-4 py-4 sm:px-5 sm:py-4">
                  <h2
                    id="client-location-punch-heading"
                    className="text-lg font-semibold tracking-tight text-zinc-100"
                  >
                    Client location punch
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Mark in/out when visiting assigned client sites today (GPS must be on).
                  </p>
                </header>
                <div className="p-4 sm:p-5">
                  <LocationAttendanceSection userId={user._id} embedded />
                </div>
              </section>
            )}

            {activeTab === 'employees' && (
              <>
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-100">Team attendance</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      View monthly calendars for people reporting to you.
                    </p>
                  </div>
                  <EmployeeSummaryMonthPicker
                    monthYear={monthYear}
                    onMonthYearChange={handleMonthChange}
                    disabled={fetchLoading || subLoading || teamAttendanceLoading}
                  />
                </div>
                {(subLoading || teamAttendanceLoading) && <TeamAttendanceSkeleton />}
                {!subLoading && !teamAttendanceLoading && subordinates.length > 0 && (
                  <section className="space-y-6">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
                      <PartnerTeamOverview
                        monthYear={monthYear}
                        rows={partnerTeamRows}
                        onSelectMember={(id) => {
                          setSelectedSubordinateId(id);
                          setSearchTerm('');
                          window.setTimeout(() => {
                            teamSubordinateCalendarRef.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }, 80);
                        }}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTeamExportModal(true)}
                        className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900/50 transition-colors"
                      >
                        Export team
                      </button>
                    </div>

                    
                    <div className="flex max-w-md flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                      <label htmlFor="search-subordinate" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Find employee
                      </label>
                      <input
                        id="search-subordinate"
                        type="text"
                        className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
                        placeholder="Name or OD ID…"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setSelectedSubordinateId(null);
                        }}
                      />
                      <select
                        id="subordinate-select"
                        className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                        value={selectedSubordinateId ?? ''}
                        onChange={(e) => setSelectedSubordinateId(e.target.value || null)}
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
                      {selectedSubordinateId && subordinateAttendance[selectedSubordinateId] ? (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                          <h3 className="mb-4 flex flex-wrap items-center gap-2 text-base font-semibold text-zinc-200">
                            <span className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-300">
                              {subordinates.find((s) => s._id === selectedSubordinateId)?.odId}
                            </span>
                            {subordinates.find((s) => s._id === selectedSubordinateId)?.name}
                          </h3>
                          <EmployeeMonthView
                            summaries={
                              subordinateAttendance[selectedSubordinateId]?.summary
                                ? [subordinateAttendance[selectedSubordinateId].summary!]
                                : []
                            }
                            users={[subordinates.find((s) => s._id === selectedSubordinateId)!]}
                            selectedEmployeeId={selectedSubordinateId}
                            setSelectedEmployeeId={() => {}}
                            selectedMonthYear={monthYear}
                            onMonthYearChange={handleMonthChange}
                            employeeDays={subordinateAttendance[selectedSubordinateId]?.employeeDays || []}
                            isLoading={false}
                            error={null}
                            onLoadAttendance={() => {}}
                            showSummaryStrip={true}
                            sectionTitle="Calendar"
                            subtitle={null}
                            sectionClassName="!border-blue-100 !bg-white"
                          />
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center text-sm text-zinc-500">
                          Select an employee to load their calendar.
                        </div>
                      )}
                    </div>
                  </section>
                )}
                {!subLoading && !teamAttendanceLoading && subordinates.length === 0 && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 py-12 text-center text-sm text-zinc-500">
                    No team members are linked to your profile.
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Correction Modal */}
      {showTeamExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4">
          <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-5xl bg-slate-50 sm:border border-slate-200 sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="shrink-0 p-3 sm:p-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10">
              <h3 className="font-semibold text-slate-900 text-sm sm:text-base">Team Export</h3>
              <button onClick={() => setShowTeamExportModal(false)} className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors" aria-label="Close team export"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-50">
              <SummarySection
                summaries={Object.values(subordinateAttendance).map(p => p.summary).filter(Boolean) as AttendanceSummaryView[]}
                allUsers={subordinates}
                holidays={holidays}
                isLoading={subLoading || teamAttendanceLoading}
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
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-3 sm:p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
              <h3 className="font-semibold text-white text-sm sm:text-base">Holiday List ({selectedYear})</h3>
              <button
                onClick={() => setShowHolidayListModal(false)}
                className="text-zinc-500 hover:text-white"
                aria-label="Close holiday list"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6">
              {holidaysForSelectedYear.length === 0 ? (
                <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-4 text-sm text-zinc-300">
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
                        className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-zinc-100">{holiday.name}</p>
                          <p className="shrink-0 text-xs text-zinc-400">{dateLabel}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-4 text-xs text-zinc-500">Read-only list. Holiday edits are managed by HR/Admin.</p>
            </div>
          </div>
        </div>
      )}

      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-3 sm:p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
              <h3 className="font-semibold text-white text-sm sm:text-base">Request Correction</h3>
              <button
                onClick={() => {
                  setSelectedDate(null);
                  setSelectedDateIsMissedEntry(false);
                }}
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg text-emerald-200 text-sm">
                Requesting change for <strong>{selectedDate}</strong>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Select Correct Status</label>
                <select
                  value={requestStatus}
                  onChange={(e) => setRequestStatus(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-emerald-500 text-sm sm:text-base"
                >
                  {getCorrectionStatusOptions().map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {correctionStatusRequiresTimePair && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Start Time</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-emerald-500 text-sm sm:text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">End Time</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-emerald-500 text-sm sm:text-base"
                    />
                  </div>
                </div>
              )}

              {correctionStatusRequiresTimePair && (
                <p className="text-xs text-zinc-500">
                  Enter both times in 24-hour format. In time must be earlier than out time.
                </p>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Reason *</label>
                <textarea
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="E.g., Forgot to punch out due to client meeting..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-zinc-200 outline-none focus:border-emerald-500 min-h-20 text-sm sm:text-base"
                  required
                />
              </div>

              <button
                onClick={submitRequest}
                disabled={sendingRequest || !requestReason.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 mt-4 text-sm sm:text-base"
              >
                {sendingRequest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Request to Partner
              </button>
            </div>
          </div>
        </div>
      )}

      {showFutureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-3 sm:p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
              <h3 className="font-semibold text-white text-sm sm:text-base">Future Request</h3>
              <button onClick={() => {
                setShowFutureModal(false);
                setFutureStartDate('');
                setFutureEndDate('');
                setFutureReason('');
                setFutureStartTime('');
                setFutureEndTime('');
                setFutureCustomType('');
                setCalendarSelectionStart(null);
              }} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg text-indigo-200 text-sm">
                {futureStartDate === futureEndDate
                  ? `Selected date: ${futureStartDate}`
                  : `Selected range: ${futureStartDate} to ${futureEndDate}`
                }
                <div className="mt-2 text-xs text-indigo-300">
                  📅 Dates selected from calendar. Click another date to change range, or proceed with request.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={TIMED_CATEGORIES.includes(futureType) ? "col-span-1 sm:col-span-2 space-y-2" : "space-y-2"}>
                  <label className="text-sm font-medium text-zinc-300">
                    {TIMED_CATEGORIES.includes(futureType) ? "Date" : "Start Date"}
                  </label>
                  <input
                    type="date"
                    value={futureStartDate}
                    readOnly
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-lg p-2.5 text-zinc-300 cursor-not-allowed text-sm sm:text-base"
                  />
                </div>
                {!TIMED_CATEGORIES.includes(futureType) && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">End Date</label>
                    <input
                      type="date"
                      value={futureEndDate}
                      readOnly
                      className="w-full bg-zinc-800 border border-zinc-600 rounded-lg p-2.5 text-zinc-300 cursor-not-allowed text-sm sm:text-base"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Request Type</label>
                <select
                  value={futureType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFutureType(val);
                    if (TIMED_CATEGORIES.includes(val)) {
                      if (futureStartDate) setFutureEndDate(futureStartDate);
                      setFutureStartTime('');
                      setFutureEndTime('');
                    }
                    if (val !== 'Other') {
                      setFutureCustomType('');
                    }
                  }}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-indigo-500 text-sm sm:text-base"
                >
                  {futureStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {futureType === 'Other' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Specify Request Type *</label>
                  <input
                    type="text"
                    value={futureCustomType}
                    onChange={(e) => setFutureCustomType(e.target.value)}
                    placeholder="Enter your request type..."
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-indigo-500 text-sm sm:text-base"
                    required
                  />
                </div>
              )}

              {TIMED_CATEGORIES.includes(futureType) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Start Time *</label>
                    <input
                      type="time"
                      value={futureStartTime}
                      onChange={(e) => setFutureStartTime(e.target.value)}
                      required
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-indigo-500 text-sm sm:text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">End Time *</label>
                    <input
                      type="time"
                      value={futureEndTime}
                      onChange={(e) => setFutureEndTime(e.target.value)}
                      required
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-indigo-500 text-sm sm:text-base"
                    />
                  </div>
                </div>
              )}

              {TIMED_CATEGORIES.includes(futureType) && (
                <p className="text-xs text-zinc-500">
                  Start time must be earlier than end time.
                </p>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Reason *</label>
                <textarea
                  value={futureReason}
                  onChange={(e) => setFutureReason(e.target.value)}
                  placeholder="Reason for future absence..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-zinc-200 outline-none focus:border-indigo-500 min-h-20 text-sm sm:text-base"
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
