import AttendanceRequest from '@/models/AttendanceRequest';

export type OpenAttendanceRequestInfo = {
  status: 'Pending' | 'PendingHr';
  requestedStatus: string;
  requestType?: string;
};

/**
 * Open employee-raised requests for a month, keyed by `userId:YYYY-MM-DD`.
 * Excludes HR-direct edits; when several exist for a date, Pending wins over PendingHr.
 */
export async function loadOpenEmployeeRequestsByUserDate(
  monthYear: string
): Promise<Map<string, OpenAttendanceRequestInfo>> {
  const requests = await AttendanceRequest.find({
    monthYear,
    status: { $in: ['Pending', 'PendingHr'] },
    requestSource: { $nin: ['hr_direct'] },
  })
    .select('userId date status requestedStatus requestType')
    .lean();

  const byUserDate = new Map<string, OpenAttendanceRequestInfo>();

  for (const req of requests) {
    const userId = String((req as { userId?: unknown }).userId || '');
    const date = String((req as { date?: unknown }).date || '').slice(0, 10);
    if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const status = (req as { status?: string }).status;
    if (status !== 'Pending' && status !== 'PendingHr') continue;

    const key = `${userId}:${date}`;
    const next: OpenAttendanceRequestInfo = {
      status,
      requestedStatus: String((req as { requestedStatus?: unknown }).requestedStatus || ''),
      requestType: (req as { requestType?: string }).requestType,
    };

    const existing = byUserDate.get(key);
    if (!existing || (existing.status === 'PendingHr' && next.status === 'Pending')) {
      byUserDate.set(key, next);
    }
  }

  return byUserDate;
}
