export type TeamDailyUpdateCategory =
  | 'leave'
  | 'wfh'
  | 'outstation'
  | 'half_day'
  | 'other_approved'
  | 'pending'
  | 'pending_hr';

export interface TeamDailyUpdateEntry {
  userId: string;
  name: string;
  odId: string;
  employeeCode: string;
  category: TeamDailyUpdateCategory;
  label: string;
  requestedStatus: string;
  requestStatus: 'Approved' | 'Pending' | 'PendingHr' | 'Attendance';
  source: 'request' | 'attendance';
  approvedBy?: string;
  reason?: string;
  startTime?: string;
  endTime?: string;
}

const LEAVE_STATUSES = new Set(['on leave', 'leave']);

function statusLower(value: string): string {
  return String(value || '').trim().toLowerCase();
}

export function categorizePresenceStatus(requestedStatus: string): TeamDailyUpdateCategory | null {
  const t = statusLower(requestedStatus);
  if (!t) return null;
  if (LEAVE_STATUSES.has(t) || t.includes('on leave')) return 'leave';
  if (t.includes('wfh') || t.includes('work from home')) return 'wfh';
  if (
    t.includes('outstation') ||
    t.includes('client place') ||
    t.includes('clientplace') ||
    t.includes('os-p') ||
    t.includes('onsite')
  ) {
    return 'outstation';
  }
  if (t.includes('half day') || t === 'half day (hd)' || t.includes('halfday')) return 'half_day';
  if (t === 'absent' || t === 'holiday' || t.includes('weekoff')) return 'other_approved';
  return 'other_approved';
}

export function formatDailyUpdateLabel(requestedStatus: string): string {
  const t = String(requestedStatus || '').trim();
  if (!t) return 'Updated attendance';
  if (LEAVE_STATUSES.has(statusLower(t)) || statusLower(t).includes('on leave')) return 'On leave';
  return t;
}

export function groupDailyUpdates(entries: TeamDailyUpdateEntry[]) {
  const groups: Record<TeamDailyUpdateCategory, TeamDailyUpdateEntry[]> = {
    leave: [],
    wfh: [],
    outstation: [],
    half_day: [],
    other_approved: [],
    pending: [],
    pending_hr: [],
  };
  for (const entry of entries) {
    groups[entry.category].push(entry);
  }
  return groups;
}

export const DAILY_UPDATE_GROUP_META: Record<
  TeamDailyUpdateCategory,
  { title: string; description: string; tone: 'rose' | 'sky' | 'amber' | 'emerald' | 'violet' | 'slate' }
> = {
  leave: {
    title: 'On leave',
    description: 'Approved leave or absence for this day',
    tone: 'rose',
  },
  wfh: {
    title: 'Work from home',
    description: 'Approved WFH for this day',
    tone: 'sky',
  },
  outstation: {
    title: 'Outstation / client place',
    description: 'Approved travel or client-site work',
    tone: 'violet',
  },
  half_day: {
    title: 'Half day',
    description: 'Approved half-day attendance',
    tone: 'amber',
  },
  other_approved: {
    title: 'Other approved changes',
    description: 'Other approved attendance for this day',
    tone: 'emerald',
  },
  pending: {
    title: 'Awaiting your approval',
    description: 'Requests submitted for this day',
    tone: 'amber',
  },
  pending_hr: {
    title: 'Pending HR',
    description: 'You approved — HR final approval required',
    tone: 'slate',
  },
};
