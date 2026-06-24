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
