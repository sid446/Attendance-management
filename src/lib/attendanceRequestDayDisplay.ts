export type AttendanceRequestStatus = 'Pending' | 'PendingHr' | 'Approved' | 'Rejected';

const REQUEST_STATUS_PRIORITY: Record<AttendanceRequestStatus, number> = {
  Approved: 4,
  PendingHr: 3,
  Pending: 2,
  Rejected: 1,
};

export type AttendanceRequestForDisplay = {
  date: string;
  status: AttendanceRequestStatus;
  updatedAt?: string;
  approvedAt?: string;
  createdAt?: string;
};

function requestTimestamp(req: AttendanceRequestForDisplay): number {
  for (const field of [req.updatedAt, req.approvedAt, req.createdAt]) {
    if (!field) continue;
    const t = new Date(field).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/** When multiple requests exist for one day, show the highest-priority status (e.g. Approved over Rejected). */
export function pickCanonicalAttendanceRequestForDay<T extends AttendanceRequestForDisplay>(
  existing: T | undefined,
  candidate: T
): T {
  if (!existing) return candidate;

  const existingPriority = REQUEST_STATUS_PRIORITY[existing.status] ?? 0;
  const candidatePriority = REQUEST_STATUS_PRIORITY[candidate.status] ?? 0;

  if (candidatePriority > existingPriority) return candidate;
  if (candidatePriority < existingPriority) return existing;

  return requestTimestamp(candidate) >= requestTimestamp(existing) ? candidate : existing;
}

/** One row per date — keeps the approved request with the latest approval/update time. */
export function pickLatestApprovedRequestPerDate<T extends AttendanceRequestForDisplay & { date: string }>(
  requests: T[]
): T[] {
  const byDate = new Map<string, T>();
  for (const req of requests) {
    const date = String(req.date).split('T')[0];
    const existing = byDate.get(date);
    if (!existing || requestTimestamp(req) >= requestTimestamp(existing)) {
      byDate.set(date, req);
    }
  }
  return Array.from(byDate.values());
}

export function buildAttendanceRequestDayMap<T extends AttendanceRequestForDisplay>(
  requests: T[],
  year: number,
  month: number
): Map<number, T> {
  const map = new Map<number, T>();

  for (const req of requests) {
    const dateStr = req.date.split('T')[0];
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() + 1 !== month) {
      continue;
    }
    const day = d.getDate();
    map.set(day, pickCanonicalAttendanceRequestForDay(map.get(day), req));
  }

  return map;
}

type ApprovedRequestLike = {
  status?: string;
  requestedStatus?: string;
  startTime?: string;
  endTime?: string;
};

type AttendanceDayLike = {
  date?: string;
  id?: string | number;
  name?: string;
  typeOfPresence?: string;
  editedCheckin?: string;
  editedCheckout?: string;
  checkin?: string;
  checkout?: string;
  inTime?: string;
  outTime?: string;
  value?: number;
  status?: string;
  halfDay?: boolean;
  remarks?: string;
  schedule?: unknown;
};

function effectiveIn(rec: AttendanceDayLike | null | undefined): string {
  return String(rec?.editedCheckin || rec?.checkin || rec?.inTime || '').trim();
}

function effectiveOut(rec: AttendanceDayLike | null | undefined): string {
  return String(rec?.editedCheckout || rec?.checkout || rec?.outTime || '').trim();
}

/** True when HR directly edited this day in admin (remark stamped on the attendance record). */
export function isHrModifiedAttendanceRecord(rec: AttendanceDayLike | null | undefined): boolean {
  return /updated\s+by\s+hr/i.test(String(rec?.remarks ?? ''));
}

/** True when stored attendance already matches an approved request. */
export function attendanceRecordReflectsApprovedRequest(
  rec: AttendanceDayLike | null | undefined,
  req: ApprovedRequestLike
): boolean {
  const requestedStatus = String(req.requestedStatus || '').trim();
  if (!requestedStatus) return true;
  if (!rec) return false;

  // HR manual edit wins over an older approved employee/partner request.
  if (isHrModifiedAttendanceRecord(rec)) return true;
  if (String(rec.typeOfPresence || '').trim() !== requestedStatus) return false;

  const reqIn = String(req.startTime || '').trim();
  const reqOut = String(req.endTime || '').trim();
  if (reqIn && reqOut && reqIn !== '00:00' && reqOut !== '00:00') {
    if (effectiveIn(rec) !== reqIn || effectiveOut(rec) !== reqOut) return false;
  }

  const reqLower = requestedStatus.toLowerCase();
  if (
    (reqLower.includes('present') || reqLower.includes('wfh') || reqLower.includes('client')) &&
    Number(rec.value ?? 0) <= 0
  ) {
    return false;
  }

  return true;
}

/** Build a calendar row from an approved request when attendance is missing or stale. */
export function buildDisplayRecordFromApprovedRequest<T extends AttendanceDayLike>(
  existing: T | null | undefined,
  req: ApprovedRequestLike,
  date: string,
  defaults?: { id?: string; name?: string }
): T {
  const requestedStatus = String(req.requestedStatus || 'Present').trim();
  const reqIn = String(req.startTime || '').trim();
  const reqOut = String(req.endTime || '').trim();
  const reqLower = requestedStatus.toLowerCase();

  let status: string = 'Present';
  if (reqLower.includes('leave') || requestedStatus === 'On leave') {
    status = 'On leave';
  } else if (requestedStatus === 'Holiday') {
    status = 'Holiday';
  } else if (requestedStatus === 'Absent') {
    status = 'Absent';
  } else if (reqLower.includes('half day')) {
    status = 'HalfDay';
  } else if (reqLower.includes('present') || reqLower.includes('wfh') || reqLower.includes('client')) {
    status = 'Present';
  }

  const value =
    existing?.value ??
    (reqLower.includes('outstation') ? 1.2 : reqLower.includes('half day') ? 0.5 : 1);

  return {
    ...(existing || ({} as T)),
    id: existing?.id ?? defaults?.id ?? '',
    name: existing?.name ?? defaults?.name ?? '',
    date,
    schedule: existing?.schedule,
    typeOfPresence: requestedStatus,
    inTime: reqIn || existing?.inTime || '',
    outTime: reqOut || existing?.outTime || '',
    checkin: existing?.checkin ?? '',
    checkout: existing?.checkout ?? '',
    editedCheckin: reqIn || existing?.editedCheckin || '',
    editedCheckout: reqOut || existing?.editedCheckout || '',
    status: status as T['status'],
    value,
    halfDay: existing?.halfDay ?? reqLower.includes('half day'),
    remarks: existing?.remarks ?? '',
  };
}
