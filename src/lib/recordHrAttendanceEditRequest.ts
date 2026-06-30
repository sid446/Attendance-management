import AttendanceRequest from '@/models/AttendanceRequest';
import User from '@/models/User';

export type HrAttendanceSnapshot = {
  status: string;
  startTime: string;
  endTime: string;
  value?: number;
};

export type HrEditHistoryEntry = {
  editedAt: Date;
  editedBy: string;
  editedByEmail: string;
  previousStatus?: string;
  previousStartTime?: string;
  previousEndTime?: string;
  previousValue?: string;
  newStatus?: string;
  newStartTime?: string;
  newEndTime?: string;
  newValue?: string;
  remarks?: string;
  changeSummary?: string;
};

function formatTimeRange(startTime?: string, endTime?: string): string {
  const start = startTime && startTime !== '00:00' ? startTime : '—';
  const end = endTime && endTime !== '00:00' ? endTime : '—';
  return `${start} – ${end}`;
}

function formatValue(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return String(value);
}

/** Human-readable diff for HR attendance edits. */
export function buildAttendanceChangeSummary(
  before: HrAttendanceSnapshot,
  after: HrAttendanceSnapshot
): string {
  const parts: string[] = [];

  if (String(before.status || '') !== String(after.status || '')) {
    parts.push(`Status: ${before.status || '—'} → ${after.status || '—'}`);
  }

  const beforeTime = formatTimeRange(before.startTime, before.endTime);
  const afterTime = formatTimeRange(after.startTime, after.endTime);
  if (beforeTime !== afterTime) {
    parts.push(`Time: ${beforeTime} → ${afterTime}`);
  }

  if (formatValue(before.value) !== formatValue(after.value)) {
    parts.push(`Value: ${formatValue(before.value)} → ${formatValue(after.value)}`);
  }

  return parts.length > 0 ? parts.join('; ') : 'No field changes detected';
}

function snapshotFromRecord(rec: Record<string, unknown> | null | undefined): HrAttendanceSnapshot {
  if (!rec) {
    return { status: 'Absent', startTime: '', endTime: '', value: 0 };
  }
  return {
    status: String(rec.typeOfPresence || 'Absent'),
    startTime: String(rec.editedCheckin || rec.checkin || ''),
    endTime: String(rec.editedCheckout || rec.checkout || ''),
    value: typeof rec.value === 'number' ? rec.value : undefined,
  };
}

export function captureAttendanceSnapshot(
  rec: Record<string, unknown> | null | undefined
): HrAttendanceSnapshot {
  return snapshotFromRecord(rec);
}

/**
 * Upsert an AttendanceRequest when HR edits a day from the calendar.
 * Stores editor email, final values, and a before/after change log.
 */
export async function recordHrAttendanceEditRequest(params: {
  userId: string;
  date: string;
  monthYear: string;
  before: HrAttendanceSnapshot;
  after: HrAttendanceSnapshot;
  editorEmail: string;
  remarks?: string;
}): Promise<void> {
  const { userId, date, monthYear, before, after, editorEmail, remarks } = params;
  const normalizedEmail = String(editorEmail || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('HR editor email is required');
  }

  const user = await User.findById(userId).select('name workingUnderPartner').lean();
  if (!user) {
    throw new Error('Employee not found');
  }

  const changeSummary = buildAttendanceChangeSummary(before, after);
  const historyEntry: HrEditHistoryEntry = {
    editedAt: new Date(),
    editedBy: 'HR',
    editedByEmail: normalizedEmail,
    previousStatus: before.status,
    previousStartTime: before.startTime || undefined,
    previousEndTime: before.endTime || undefined,
    previousValue: formatValue(before.value),
    newStatus: after.status,
    newStartTime: after.startTime || undefined,
    newEndTime: after.endTime || undefined,
    newValue: formatValue(after.value),
    remarks: remarks?.trim() || undefined,
    changeSummary,
  };

  const existing = await AttendanceRequest.findOne({
    userId,
    date,
    requestType: { $ne: 'extra_work' },
  }).sort({ createdAt: -1 });

  const now = new Date();
  const hrValue =
    after.value !== undefined && after.value !== null ? String(after.value) : undefined;

  if (existing) {
    if (!existing.originalStatus || existing.originalStatus === 'Absent') {
      existing.originalStatus = before.status || existing.originalStatus || 'Absent';
    }
    existing.requestedStatus = after.status;
    existing.startTime = after.startTime || undefined;
    existing.endTime = after.endTime || undefined;
    existing.status = 'Approved';
    existing.approvedBy = 'HR';
    existing.approvedByEmail = normalizedEmail;
    existing.approvedAt = now;
    existing.hrValue = hrValue;
    if (remarks?.trim()) {
      existing.hrRemarks = remarks.trim();
    }
    if (!existing.requestSource) {
      existing.requestSource = 'employee';
    }
    const history = Array.isArray(existing.hrEditHistory) ? [...existing.hrEditHistory] : [];
    history.push(historyEntry);
    existing.hrEditHistory = history;
    await existing.save();
    return;
  }

  await AttendanceRequest.create({
    userId,
    userName: user.name || 'Employee',
    partnerName: user.workingUnderPartner || 'HR',
    date,
    monthYear,
    requestedStatus: after.status,
    originalStatus: before.status || 'Absent',
    reason: 'HR direct calendar edit',
    status: 'Approved',
    startTime: after.startTime || undefined,
    endTime: after.endTime || undefined,
    requestType: 'correction',
    requestSource: 'hr_direct',
    approvedBy: 'HR',
    approvedByEmail: normalizedEmail,
    approvedAt: now,
    hrRemarks: remarks?.trim() || undefined,
    hrValue,
    hrEditHistory: [historyEntry],
  });
}
