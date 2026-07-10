"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isHolidayDate } from '@/lib/holidaysClient';
import { useRouter } from 'next/navigation';
import { EmployeeMonthView } from '@/components/EmployeeMonthView';
import { AttendanceRecord, AttendanceSummaryView, User } from '@/types/ui';
import type { EmployeeAttendanceRequest } from '@/types/employeeAttendanceRequest';
import { employeeCredentialsInit } from '@/lib/employeeCredentialsInit';
import { TeamMemberProfileCard } from '@/components/TeamMemberProfileCard';
import { LocationAttendanceSection } from '@/components/LocationAttendanceSection';
import { EmployeeDashboardOverview } from '@/components/EmployeeDashboardOverview';
import { EmployeeSummaryMonthPicker } from '@/components/EmployeeSummaryMonthPicker';
import { TeamAttendanceSkeleton } from '@/components/TeamAttendanceSkeleton';
import { TeamFineSection } from '@/components/TeamFineSection';
import {
  PartnerTeamOverview,
  type PartnerTeamRow,
} from '@/components/PartnerTeamOverview';
import { ManageAttendanceApproverSection } from '@/components/ManageAttendanceApproverSection';
import { ManageExcessHourAllowanceSection } from '@/components/ManageExcessHourAllowanceSection';
import { TeamDailyUpdatesSection } from '@/components/TeamDailyUpdatesSection';
import { SummarySection } from '@/components/SummarySection';
import {
  computeSummaryAlignedMetrics,
  getDailyWorkedHoursSeries,
  getEmploymentTypeForDate,
  isHalftimeEmploymentType,
} from '@/lib/attendanceSummaryMetrics';
import { isValidPunchTime } from '@/lib/attendanceHours';
import {
  requestWindowRejectionMessage,
  istDateString,
  type RequestWindowConfig,
} from '@/lib/attendanceRequestWindow';
import type { ExcessAllowanceLookup, ExcessDisplayLookup } from '@/lib/excessHourAllowance';
import {
  calculateExtraWorkHours,
  EXTRA_WORK_REQUEST_STATUS,
  formatExtraWorkHoursLabel,
  isExtraWorkRequest,
  sumExtraWorkSlotHours,
} from '@/lib/extraWorkRequest';
import { requiresAttendanceRequestTimePair } from '@/lib/attendanceRequestTimeRules';
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
  UserCog,
  IndianRupee,
  Clock,
  Newspaper,
  Plus,
  Trash2,
} from 'lucide-react';

type ExtraWorkSlotDraft = {
  id: string;
  startTime: string;
  endTime: string;
  reason: string;
  copyPreviousReason: boolean;
};

function createExtraWorkSlotDraft(): ExtraWorkSlotDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    startTime: '',
    endTime: '',
    reason: '',
    copyPreviousReason: false,
  };
}

function createInitialExtraWorkSlots(): ExtraWorkSlotDraft[] {
  return [createExtraWorkSlotDraft()];
}

function normalizeUserId(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return normalizeUserId((value as { _id?: unknown })._id);
  }
  return String(value).trim();
}

function normalizeSubordinateUser(raw: User): User {
  return { ...raw, _id: normalizeUserId(raw._id) };
}

function emptyAttendanceSummary(
  userId: string,
  sub: User,
  monthYear: string
): AttendanceSummaryView {
  return {
    id: '',
    userId,
    userName: sub.name,
    monthYear,
    odId: sub.odId,
    employeeCode: sub.employeeCode,
    team: sub.team,
    designation: sub.designation,
    schedules: { effectiveFrom: new Date().toISOString(), daily: {} },
    summary: {
      scheduledHours: '0:00',
      shortHours: '0:00',
      excessHours: '0:00',
      totalHour: 0,
      totalLateArrival: 0,
      excessHour: 0,
      totalHalfDay: 0,
      totalPresent: 0,
      totalAbsent: 0,
      totalLeave: 0,
    },
    recordDetails: {},
    calcScheduled: 0,
    calcExcessDeficit: 0,
  };
}

type TeamAccessFetchResult = {
  members: User[];
  includeViewerSelf: boolean;
  approverInboxCount: number;
};

// Helper to fetch people visible in Team tab.
async function fetchSubordinates(viewerUserId: string): Promise<TeamAccessFetchResult> {
  if (!viewerUserId) return { members: [], includeViewerSelf: false, approverInboxCount: 0 };
  const res = await fetch(
    `/api/employee/team-attendance-access?viewerUserId=${encodeURIComponent(viewerUserId)}`,
    employeeCredentialsInit({ cache: 'no-store' })
  );
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) {
    return { members: [], includeViewerSelf: false, approverInboxCount: 0 };
  }
  return {
    members: json.data.map((user: User) => normalizeSubordinateUser(user)),
    includeViewerSelf: json.access?.includeViewerSelf === true,
    approverInboxCount:
      typeof json.access?.approverInboxCount === 'number' ? json.access.approverInboxCount : 0,
  };
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

async function fetchEmployeeRequestsForMonth(
  userId: string,
  monthYear: string
): Promise<EmployeeAttendanceRequest[]> {
  try {
    const res = await fetch(
      `/api/employee/request-correction?userId=${encodeURIComponent(userId)}`,
      employeeCredentialsInit()
    );
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return [];
    return json.data
      .filter((req: EmployeeAttendanceRequest) => req.date.split('T')[0].startsWith(monthYear))
      .map((req: Record<string, unknown>) => ({
        _id: String(req._id || ''),
        date: String(req.date || ''),
        requestedStatus: String(req.requestedStatus || ''),
        requestType: req.requestType as EmployeeAttendanceRequest['requestType'],
        originalStatus: req.originalStatus ? String(req.originalStatus) : undefined,
        reason: req.reason ? String(req.reason) : undefined,
        startTime: req.startTime ? String(req.startTime) : undefined,
        endTime: req.endTime ? String(req.endTime) : undefined,
        extraWorkSlots: req.extraWorkSlots as EmployeeAttendanceRequest['extraWorkSlots'],
        status: req.status as EmployeeAttendanceRequest['status'],
        partnerName: req.partnerName ? String(req.partnerName) : undefined,
        partnerRemarks: req.partnerRemarks ? String(req.partnerRemarks) : undefined,
        partnerApprovedAt: req.partnerApprovedAt ? String(req.partnerApprovedAt) : undefined,
        partnerProposedValue: req.partnerProposedValue ? String(req.partnerProposedValue) : undefined,
        hrRemarks: req.hrRemarks ? String(req.hrRemarks) : undefined,
        hrValue: req.hrValue ? String(req.hrValue) : undefined,
        requestSource: req.requestSource as EmployeeAttendanceRequest['requestSource'],
        hrEditHistory: Array.isArray(req.hrEditHistory)
          ? req.hrEditHistory.map((entry: Record<string, unknown>) => ({
              editedAt: entry.editedAt ? String(entry.editedAt) : undefined,
              editedBy: entry.editedBy ? String(entry.editedBy) : undefined,
              editedByEmail: entry.editedByEmail ? String(entry.editedByEmail) : undefined,
              previousStatus: entry.previousStatus ? String(entry.previousStatus) : undefined,
              previousStartTime: entry.previousStartTime ? String(entry.previousStartTime) : undefined,
              previousEndTime: entry.previousEndTime ? String(entry.previousEndTime) : undefined,
              previousValue: entry.previousValue ? String(entry.previousValue) : undefined,
              newStatus: entry.newStatus ? String(entry.newStatus) : undefined,
              newStartTime: entry.newStartTime ? String(entry.newStartTime) : undefined,
              newEndTime: entry.newEndTime ? String(entry.newEndTime) : undefined,
              newValue: entry.newValue ? String(entry.newValue) : undefined,
              remarks: entry.remarks ? String(entry.remarks) : undefined,
              changeSummary: entry.changeSummary ? String(entry.changeSummary) : undefined,
            }))
          : undefined,
        approvedBy: req.approvedBy ? String(req.approvedBy) : undefined,
        approvedByEmail: req.approvedByEmail ? String(req.approvedByEmail) : undefined,
        approvedAt: req.approvedAt ? String(req.approvedAt) : undefined,
        rejectedBy: req.rejectedBy ? String(req.rejectedBy) : undefined,
        rejectedByEmail: req.rejectedByEmail ? String(req.rejectedByEmail) : undefined,
        rejectedAt: req.rejectedAt ? String(req.rejectedAt) : undefined,
        createdAt: req.createdAt ? String(req.createdAt) : undefined,
        updatedAt: req.updatedAt ? String(req.updatedAt) : undefined,
      }));
  } catch {
    return [];
  }
}

type SubordinateAttendancePack = {
  summary: AttendanceSummaryView | null;
  employeeDays: AttendanceRecord[];
  userForMetrics?: User;
  requests: EmployeeAttendanceRequest[];
  /** Set after correction requests are fetched for the member calendar. */
  requestsLoaded?: boolean;
};

const PARTNER_PENDING_COUNT_TTL_MS = 60_000;

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

function mapEmployeeDayStatus(
  value: {
    typeOfPresence?: string;
    halfDay?: boolean;
    editedCheckin?: string;
    editedCheckout?: string;
    checkin?: string;
    checkout?: string;
  },
  userForDay: User,
  dateObj: Date
): AttendanceRecord['status'] {
  const effectiveCheckin = value.editedCheckin || value.checkin;
  const effectiveCheckout = value.editedCheckout || value.checkout;
  const typeLower = String(value.typeOfPresence || '').toLowerCase();
  const hasIn = isValidPunchTime(effectiveCheckin);
  const hasOut = isValidPunchTime(effectiveCheckout);
  const isPartialPunch = hasIn !== hasOut;
  const isNonWorkingType =
    typeLower.includes('leave') ||
    typeLower.includes('holiday') ||
    typeLower.includes('weekoff') ||
    typeLower.includes('week off');
  const isPresenceType =
    typeLower.includes('wfh') ||
    typeLower.includes('outstation') ||
    typeLower.includes('clientplace') ||
    typeLower.includes('half day') ||
    typeLower.includes('present - in office') ||
    typeLower.includes('present in office') ||
    !!value.halfDay;
  const isHalftime = isHalftimeEmploymentType(getEmploymentTypeForDate(userForDay, dateObj));

  if (isPartialPunch && !isNonWorkingType && value.typeOfPresence !== 'Holiday') {
    return 'Missed Entry' as AttendanceRecord['status'];
  }

  let status: AttendanceRecord['status'] = 'Present';
  const hasPunch = hasIn || hasOut;
  if (
    (value.typeOfPresence === 'Leave' || value.typeOfPresence === 'On leave') &&
    hasPunch
  ) {
    status = 'Present';
  } else if (value.typeOfPresence === 'Leave' || value.typeOfPresence === 'On leave') {
    status = 'On leave';
  } else if (value.typeOfPresence === 'Holiday') {
    status = 'Holiday';
  } else if (isPresenceType) {
    status = !isHalftime && (value.halfDay || typeLower.includes('half day')) ? 'HalfDay' : 'Present';
  } else if (
    !effectiveCheckin &&
    !effectiveCheckout &&
    value.typeOfPresence !== 'Leave' &&
    value.typeOfPresence !== 'On leave'
  ) {
    status = 'Absent';
  }
  if (status === 'Present' && !hasIn && !hasOut && !isPresenceType) {
    status = 'Absent';
  }
  return status;
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

function buildSubordinateAttendancePack(
  sub: User,
  attData: {
    _id?: string;
    userId: User & Record<string, unknown>;
    monthYear?: string;
    records?: Record<string, unknown>;
    summary?: AttendanceSummaryView['summary'];
  } | null,
  requests: EmployeeAttendanceRequest[] = [],
  requestsLoaded = false
): SubordinateAttendancePack {
  if (!attData) {
    return {
      summary: null,
      employeeDays: [],
      userForMetrics: sub,
      requests,
      requestsLoaded,
    };
  }

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
        .sort(
          (a: any, b: any) =>
            Number(new Date(b.effectiveFrom).getTime()) - Number(new Date(a.effectiveFrom).getTime())
        );
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
    const status = mapEmployeeDayStatus(value, userForDay as User, dateObj);
    return {
      id: userForDay._id,
      name: userForDay.name,
      date: dateKey,
      inTime: effectiveCheckin ?? '',
      outTime: effectiveCheckout ?? '',
      status,
      typeOfPresence: value.typeOfPresence,
      value: value.value,
      schedule,
      remarks: value.remarks ?? '',
      checkin: value.checkin ?? '',
      checkout: value.checkout ?? '',
      editedCheckin: value.editedCheckin ?? '',
      editedCheckout: value.editedCheckout ?? '',
      extraWorkEntries: Array.isArray(value.extraWorkEntries) ? value.extraWorkEntries : [],
    };
  });

  const daily: Record<string, any> = {};
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
    recordDetailsPlain[k] = v && typeof v === 'object' ? { ...(v as object) } : v;
  }

  const calcScheduled = calculateScheduledHoursForSummary(attData);
  const calcExcessDeficit = attData.summary?.excessHour ?? 0;
  const mappedSum = {
    id: attData._id ?? '',
    userId: String(attData.userId._id ?? attData.userId),
    userName: attData.userId.name,
    monthYear: attData.monthYear ?? '',
    odId: attData.userId.odId,
    employeeCode: attData.userId.employeeCode,
    team: attData.userId.team,
    designation: attData.userId.designation,
    schedules: {
      effectiveFrom: new Date().toISOString(),
      daily,
    },
    summary: {
      ...attData.summary,
      excessHours: formatExcessHourForSummary(attData.summary?.excessHour ?? 0),
    },
    recordDetails: recordDetailsPlain as AttendanceSummaryView['recordDetails'],
    calcScheduled,
    calcExcessDeficit,
  } as AttendanceSummaryView;

  return {
    summary: mappedSum,
    employeeDays: days,
    userForMetrics: mergeAttendanceProfile(sub, attData.userId) as User,
    requests,
    requestsLoaded,
  };
}


const TIMED_CATEGORIES = [
  'Present - in office',
  'Half Day',
  'WFH',
  'Present - outstation',
  'Present - client place'
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

/** e.g. "Wednesday, 1 Jul 2026" for request / approval date labels */
function formatRequestDateWithDay(dateStr: string): string {
  const iso = String(dateStr || '').split('T')[0];
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRequestDateRangeWithDay(start: string, end: string): string {
  if (!start) return '';
  if (!end || start === end) return formatRequestDateWithDay(start);
  return `${formatRequestDateWithDay(start)} → ${formatRequestDateWithDay(end)}`;
}

function getCorrectionTimeDraft(dayRecord?: AttendanceRecord | null) {
  const startTime = dayRecord?.inTime && dayRecord.inTime !== '00:00' ? dayRecord.inTime : '';
  const endTime = dayRecord?.outTime && dayRecord.outTime !== '00:00' ? dayRecord.outTime : '';

  return {
    startTime,
    endTime,
  };
}

/** Day has uploaded attendance (punch or present status) — eligible for extra-work requests. */
function hasUploadedAttendance(dayRecord?: AttendanceRecord | null): boolean {
  if (!dayRecord) return false;
  const inMarked = !!dayRecord.inTime && dayRecord.inTime !== '00:00';
  const outMarked = !!dayRecord.outTime && dayRecord.outTime !== '00:00';
  if (inMarked || outMarked) return true;
  const typeLower = String(dayRecord.typeOfPresence || '').toLowerCase();
  if (typeLower.includes('leave') || typeLower === 'absent') return false;
  return dayRecord.status === 'Present' || dayRecord.status === 'HalfDay';
}

function hasPendingCorrectionRequest(
  requests: EmployeeAttendanceRequest[],
  date: string
): boolean {
  return requests.some(
    (r) =>
      r.date.split('T')[0] === date &&
      (r.status === 'Pending' || r.status === 'PendingHr') &&
      !isExtraWorkRequest(r)
  );
}

function hasPendingExtraWorkRequest(
  requests: EmployeeAttendanceRequest[],
  date: string
): boolean {
  return requests.some(
    (r) =>
      r.date.split('T')[0] === date &&
      (r.status === 'Pending' || r.status === 'PendingHr') &&
      isExtraWorkRequest(r)
  );
}

type EmployeeDashboardTab =
  | 'dashboard'
  | 'attendance'
  | 'clientPunch'
  | 'employees'
  | 'manageApprovers'
  | 'manageExcessHours';

const EMPLOYEE_DASHBOARD_TABS = new Set<EmployeeDashboardTab>([
  'dashboard',
  'attendance',
  'clientPunch',
  'employees',
  'manageApprovers',
  'manageExcessHours',
]);

function parseEmployeeDashboardUrlParams(): { tab?: EmployeeDashboardTab; monthYear?: string } {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  const monthParam = params.get('monthYear');
  const tab =
    tabParam && EMPLOYEE_DASHBOARD_TABS.has(tabParam as EmployeeDashboardTab)
      ? (tabParam as EmployeeDashboardTab)
      : undefined;
  const monthYear = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : undefined;
  return { tab, monthYear };
}

function getEmployeeLoginRedirectPath(): string {
  if (typeof window === 'undefined') return '/employee/login';
  const destination = `${window.location.pathname}${window.location.search}`;
  return `/employee/login?next=${encodeURIComponent(destination)}`;
}

export default function EmployeeDashboard() {
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
  const [teamPanelView, setTeamPanelView] = useState<'attendance' | 'fines'>('attendance');
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
    (payload: { date: string; summary: { total: number } }) => {
      if (payload.date === istDateString()) {
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
    if (!user?._id || subordinates.length === 0) {
      setPartnerPendingReviewCount(0);
      return;
    }
    void fetchPartnerPendingReviewCount(true);
  }, [user?._id, subordinates.length, fetchPartnerPendingReviewCount]);

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
    if (!user?._id || subordinates.length === 0) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void fetchPartnerPendingReviewCount(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user?._id, subordinates.length, fetchPartnerPendingReviewCount]);

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
  const [sendingFutureRequest, setSendingFutureRequest] = useState(false);

  // Calendar selection state
  const [calendarSelectionStart, setCalendarSelectionStart] = useState<string | null>(null);

  // Employee requests state
  const [employeeRequests, setEmployeeRequests] = useState<EmployeeAttendanceRequest[]>([]);

  /** HR-configured allowed date range for attendance requests (IST). */
  const [requestWindow, setRequestWindow] = useState<{
    earliestDate: string;
    latestDate: string;
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
      return date >= requestWindow.earliestDate && date <= requestWindow.latestDate;
    },
    [requestWindow]
  );

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
      } catch {
        setSubordinates([]);
        setTeamAccessIncludeViewerSelf(false);
        setApproverInboxCount(0);
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
      // Allowed when: Absent, Present, Half Day, Holiday/Week Off, or in/out time is missing
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

      if (!isAbsent && !isPresent && !isHalfDay && !isHoliday && !isMissingPunch) {
        alert('Correction requests are only allowed for days marked as Present, Absent, Half Day, Holiday/Week Off, or when attendance in/out is not marked.');
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
          alert(`Extra work request (${formatExtraWorkHoursLabel(totalHours)}) sent to ${json.sentTo}!`);
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
          alert(`Request sent successfully to ${json.sentTo}!`);
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
          alert(`Future request sent successfully! Created ${json.count} requests.`);
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
            {canManageTeam && (
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

          {canManageTeam && (
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
              />
            )}

            {activeTab === 'attendance' && (
              <section aria-label="Monthly calendar and attendance requests">
                {requestWindow && (
                  <div className="mb-4 rounded-lg border border-blue-200/80 bg-blue-50/60 px-4 py-3 text-sm text-blue-950">
                    <p className="font-medium">Request window (IST)</p>
                    <p className="mt-1 text-blue-900/90">
                      You can raise requests for dates from{' '}
                      <strong>{requestWindow.earliestDate}</strong> through{' '}
                      <strong>{requestWindow.latestDate}</strong>.
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
                  onApplyFutureRequest={() => setShowFutureModal(true)}
                  approvedRequests={employeeRequests}
                  showSummaryStrip={false}
                  sectionTitle="Monthly calendar"
                  subtitle="Past days: request a correction (within the allowed window). Future days: select a range, then apply for leave or other status."
                  sectionClassName="!border-blue-100 !bg-blue-50/50"
                />
              </section>
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
                    Mark in/out when visiting assigned client sites today (GPS must be on).
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
                          : 'Late-arrival fines and warnings for your team.'}
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
                  Team leave, WFH, travel &amp; requests · IST
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
                    <strong>{formatRequestDateWithDay(selectedDate)}</strong> (outside your regular punch).
                    Your partner will review this as <strong>{EXTRA_WORK_REQUEST_STATUS}</strong>.
                  </div>

                  {selectedDayRecord && (
                    <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                      Uploaded attendance:{' '}
                      <span className="font-mono text-foreground">
                        {selectedDayRecord.inTime || '--:--'} → {selectedDayRecord.outTime || '--:--'}
                      </span>
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
                      onChange={(e) => setRequestStatus(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-emerald-500 text-sm sm:text-base"
                    >
                      {getCorrectionStatusOptions().map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {correctionStatusRequiresTimePair && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Start time</label>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-emerald-500 text-sm sm:text-base"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">End time</label>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-emerald-500 text-sm sm:text-base"
                        />
                      </div>
                    </div>
                  )}

                  {correctionStatusRequiresTimePair && (
                    <p className="text-xs text-muted-foreground">
                      Enter both times in 24-hour format. In time must be earlier than out time.
                    </p>
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
                setFutureCustomType('');
                setCalendarSelectionStart(null);
              }} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg text-indigo-200 text-sm">
                {futureStartDate === futureEndDate
                  ? `Selected date: ${formatRequestDateWithDay(futureStartDate)}`
                  : `Selected range: ${formatRequestDateRangeWithDay(futureStartDate, futureEndDate)}`}
                <div className="mt-2 text-xs text-indigo-300">
                  📅 Dates selected from calendar. Click another date to change range, or proceed with request.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={TIMED_CATEGORIES.includes(futureType) ? "col-span-1 sm:col-span-2 space-y-2" : "space-y-2"}>
                  <label className="text-sm font-medium text-muted-foreground">
                    {TIMED_CATEGORIES.includes(futureType) ? "Date" : "Start Date"}
                  </label>
                  <input
                    type="date"
                    value={futureStartDate}
                    readOnly
                    className="w-full bg-surface border border-border rounded-lg p-2.5 text-muted-foreground cursor-not-allowed text-sm sm:text-base"
                  />
                </div>
                {!TIMED_CATEGORIES.includes(futureType) && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">End Date</label>
                    <input
                      type="date"
                      value={futureEndDate}
                      readOnly
                      className="w-full bg-surface border border-border rounded-lg p-2.5 text-muted-foreground cursor-not-allowed text-sm sm:text-base"
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

              {TIMED_CATEGORIES.includes(futureType) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Start Time *</label>
                    <input
                      type="time"
                      value={futureStartTime}
                      onChange={(e) => setFutureStartTime(e.target.value)}
                      required
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-indigo-500 text-sm sm:text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">End Time *</label>
                    <input
                      type="time"
                      value={futureEndTime}
                      onChange={(e) => setFutureEndTime(e.target.value)}
                      required
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground outline-none focus:border-indigo-500 text-sm sm:text-base"
                    />
                  </div>
                </div>
              )}

              {TIMED_CATEGORIES.includes(futureType) && (
                <p className="text-xs text-muted-foreground">
                  Start time must be earlier than end time.
                </p>
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