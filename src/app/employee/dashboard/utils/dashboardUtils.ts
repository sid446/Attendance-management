import { AttendanceRecord, AttendanceSummaryView, User } from '@/types/ui';
import type { EmployeeAttendanceRequest } from '@/types/employeeAttendanceRequest';
import { employeeCredentialsInit } from '@/lib/employeeCredentialsInit';
import { getEmploymentTypeForDate, isHalftimeEmploymentType } from '@/lib/attendanceSummaryMetrics';
import { isValidPunchTime } from '@/lib/attendanceHours';
import { isExtraWorkRequest } from '@/lib/extraWorkRequest';
import type { ExtraWorkSlotDraft, TeamAccessFetchResult, SubordinateAttendancePack, EmployeeDashboardTab } from '../types';
import { TIME_INPUT_PATTERN, EMPLOYEE_DASHBOARD_TABS } from '../constants';

export function createExtraWorkSlotDraft(): ExtraWorkSlotDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    startTime: '',
    endTime: '',
    reason: '',
    copyPreviousReason: false,
  };
}

export function createInitialExtraWorkSlots(): ExtraWorkSlotDraft[] {
  return [createExtraWorkSlotDraft()];
}

export function normalizeUserId(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return normalizeUserId((value as { _id?: unknown })._id);
  }
  return String(value).trim();
}

export function normalizeSubordinateUser(raw: User): User {
  return { ...raw, _id: normalizeUserId(raw._id) };
}

export function emptyAttendanceSummary(
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

// Helper to fetch people visible in Team tab.
export async function fetchSubordinates(viewerUserId: string): Promise<TeamAccessFetchResult> {
  if (!viewerUserId) {
    return { members: [], includeViewerSelf: false, approverInboxCount: 0, canApproveRequests: false };
  }
  const res = await fetch(
    `/api/employee/team-attendance-access?viewerUserId=${encodeURIComponent(viewerUserId)}`,
    employeeCredentialsInit({ cache: 'no-store' })
  );
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) {
    return { members: [], includeViewerSelf: false, approverInboxCount: 0, canApproveRequests: false };
  }
  return {
    members: json.data.map((user: User) => normalizeSubordinateUser(user)),
    includeViewerSelf: json.access?.includeViewerSelf === true,
    approverInboxCount:
      typeof json.access?.approverInboxCount === 'number' ? json.access.approverInboxCount : 0,
    canApproveRequests: json.access?.canApproveRequests !== false,
  };
}

// Helper to fetch attendance for a user
export async function fetchAttendanceForUser(userId: string, monthYear: string) {
  const res = await fetch(`/api/attendance?userId=${userId}&monthYear=${monthYear}`);
  const json = await res.json();
  if (json.success && json.data && json.data.length > 0) {
    return json.data[0];
  }
  return null;
}

export async function fetchEmployeeRequestsForMonth(
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

export function sessionToUser(raw: Record<string, unknown>): User {
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

export function formatExcessHourForSummary(val: number): string {
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);
  const h = Math.floor(abs);
  const m = Math.round((abs % 1) * 60);
  return `${sign}${h}:${m.toString().padStart(2, '0')}`;
}

export function mapEmployeeDayStatus(
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
    typeLower.includes('client place') ||
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

export function mergeAttendanceProfile(session: User, docUser: unknown): User {
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
export function calculateScheduledHoursForSummary(attData: any): number {
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

export function buildSubordinateAttendancePack(
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

export function parseTimeToMinutes(time: string): number | null {
  if (!TIME_INPUT_PATTERN.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Prefer the profile that actually carries schedule data (attendance merge or login). */
export function userWithSchedule(primary: User | null, fallback: User | null): User | null {
  const hasSchedule = (u: User | null | undefined) =>
    !!u &&
    ((Array.isArray((u as any).schedules) && (u as any).schedules.length > 0) ||
      (Array.isArray((u as any).seasonalSchedules) && (u as any).seasonalSchedules.length > 0) ||
      !!(u as any).scheduleInOutTime ||
      !!(u as any).scheduleInOutTimeSat ||
      !!(u as any).scheduleInOutTimeMonth);

  if (hasSchedule(primary)) return primary;
  if (hasSchedule(fallback)) return fallback;
  return primary || fallback;
}

export function isTimeRangeValid(startTime: string, endTime: string): boolean {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  return startMinutes !== null && endMinutes !== null && startMinutes < endMinutes;
}

/** e.g. "Wednesday, 1 Jul 2026" for request / approval date labels */
export function formatRequestDateWithDay(dateStr: string): string {
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

export function formatRequestDateRangeWithDay(start: string, end: string): string {
  if (!start) return '';
  if (!end || start === end) return formatRequestDateWithDay(start);
  return `${formatRequestDateWithDay(start)} → ${formatRequestDateWithDay(end)}`;
}

export function getCorrectionTimeDraft(dayRecord?: AttendanceRecord | null) {
  const startTime = dayRecord?.inTime && dayRecord.inTime !== '00:00' ? dayRecord.inTime : '';
  const endTime = dayRecord?.outTime && dayRecord.outTime !== '00:00' ? dayRecord.outTime : '';

  return {
    startTime,
    endTime,
  };
}

/** Day has uploaded attendance (punch or present status) — eligible for extra-work requests. */
export function hasUploadedAttendance(dayRecord?: AttendanceRecord | null): boolean {
  if (!dayRecord) return false;
  const inMarked = !!dayRecord.inTime && dayRecord.inTime !== '00:00';
  const outMarked = !!dayRecord.outTime && dayRecord.outTime !== '00:00';
  if (inMarked || outMarked) return true;
  const typeLower = String(dayRecord.typeOfPresence || '').toLowerCase();
  if (typeLower.includes('leave') || typeLower === 'absent') return false;
  return dayRecord.status === 'Present' || dayRecord.status === 'HalfDay';
}

export function hasPendingCorrectionRequest(
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

export function hasPendingExtraWorkRequest(
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

export function parseEmployeeDashboardUrlParams(): { tab?: EmployeeDashboardTab; monthYear?: string } {
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

export function getEmployeeLoginRedirectPath(): string {
  if (typeof window === 'undefined') return '/employee/login';
  const destination = `${window.location.pathname}${window.location.search}`;
  return `/employee/login?next=${encodeURIComponent(destination)}`;
}
