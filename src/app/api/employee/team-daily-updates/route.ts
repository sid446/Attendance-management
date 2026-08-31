import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import AttendanceRequest from '@/models/AttendanceRequest';
import { istDateString } from '@/lib/attendanceRequestWindow';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';
import { getVisibleTeamMembersForViewer } from '@/lib/teamVisibilityForViewer';
import {
  categorizePresenceStatus,
  clampDailyUpdateRange,
  enumerateYyyyMmDd,
  formatDailyUpdateLabel,
  isYyyyMmDd,
  monthYearsInRange,
  type TeamDailyUpdateEntry,
} from '@/lib/teamDailyUpdates';

function recordsToMap(
  records: Record<string, unknown> | Map<string, unknown> | undefined
): Record<string, { typeOfPresence?: string; checkin?: string; checkout?: string }> {
  if (!records) return {};
  if (records instanceof Map) {
    return Object.fromEntries(records.entries()) as Record<
      string,
      { typeOfPresence?: string; checkin?: string; checkout?: string }
    >;
  }
  return records as Record<string, { typeOfPresence?: string; checkin?: string; checkout?: string }>;
}

function attendanceEntryForDate(
  memberId: string,
  date: string,
  attendanceByUser: Map<string, ReturnType<typeof recordsToMap>>
): TeamDailyUpdateEntry | null {
  const records = attendanceByUser.get(memberId);
  if (!records) return null;
  const rec = records[date];
  if (!rec?.typeOfPresence) return null;

  const t = String(rec.typeOfPresence).trim();
  const lower = t.toLowerCase();
  if (
    lower.includes('thumb') ||
    lower === 'present - in office' ||
    lower.includes('present - in office')
  ) {
    return null;
  }

  const category = categorizePresenceStatus(t);
  if (!category || category === 'pending' || category === 'pending_hr') return null;

  return {
    userId: memberId,
    name: '',
    odId: '',
    employeeCode: '',
    category,
    label: formatDailyUpdateLabel(t),
    requestedStatus: t,
    requestStatus: 'Attendance',
    source: 'attendance',
    date,
  };
}

function uniqueUserCount(
  entries: TeamDailyUpdateEntry[],
  predicate: (entry: TeamDailyUpdateEntry) => boolean
): number {
  return new Set(entries.filter(predicate).map((e) => e.userId)).size;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const viewerUserId = String(request.nextUrl.searchParams.get('viewerUserId') || '').trim();
    const forbidden = forbidUnlessSelf(auth.userId, viewerUserId);
    if (forbidden) return forbidden;

    const dateParam = String(request.nextUrl.searchParams.get('date') || '').trim();
    const fromParam = String(request.nextUrl.searchParams.get('from') || '').trim();
    const toParam = String(request.nextUrl.searchParams.get('to') || '').trim();
    const today = istDateString();
    const singleDate = isYyyyMmDd(dateParam) ? dateParam : today;
    const { from, to } = clampDailyUpdateRange(
      isYyyyMmDd(fromParam) ? fromParam : singleDate,
      isYyyyMmDd(toParam) ? toParam : isYyyyMmDd(fromParam) ? fromParam : singleDate
    );
    const date = from;
    const monthYears = monthYearsInRange(from, to);
    const datesInRange = enumerateYyyyMmDd(from, to);

    if (!mongoose.Types.ObjectId.isValid(viewerUserId)) {
      return NextResponse.json({ success: false, error: 'Valid viewerUserId is required' }, { status: 400 });
    }

    const emptyPayload = {
      date,
      from,
      to,
      entries: [] as TeamDailyUpdateEntry[],
      summary: { total: 0, onLeave: 0, away: 0, pending: 0 },
    };

    const { members } = await getVisibleTeamMembersForViewer(viewerUserId);
    if (members.length === 0) {
      return NextResponse.json({
        success: true,
        data: emptyPayload,
      });
    }

    const memberById = new Map(members.map((m) => [m._id, m]));
    const memberIds = members.map((m) => m._id);

    const [requests, attendanceDocs] = await Promise.all([
      AttendanceRequest.find({
        userId: { $in: memberIds },
        date: { $gte: from, $lte: to },
        status: { $in: ['Approved', 'Pending', 'PendingHr'] },
      })
        .select(
          'userId userName date requestedStatus status reason startTime endTime approvedBy approvedAt'
        )
        .sort({ date: 1, userName: 1 })
        .lean(),
      Attendance.find({ userId: { $in: memberIds }, monthYear: { $in: monthYears } })
        .select('userId records')
        .lean(),
    ]);

    const attendanceByUser = new Map<string, ReturnType<typeof recordsToMap>>();
    for (const doc of attendanceDocs) {
      attendanceByUser.set(
        String(doc.userId),
        recordsToMap(doc.records as Record<string, unknown> | Map<string, unknown>)
      );
    }

    const coveredUserDates = new Set<string>();
    const entries: TeamDailyUpdateEntry[] = [];

    for (const req of requests) {
      const userId = String(req.userId);
      const member = memberById.get(userId);
      if (!member) continue;

      const reqDate = String(req.date || '');
      if (!isYyyyMmDd(reqDate) || reqDate < from || reqDate > to) continue;

      coveredUserDates.add(`${userId}:${reqDate}`);
      const requestedStatus = String(req.requestedStatus || '');
      let category = categorizePresenceStatus(requestedStatus);
      const status = String(req.status || '');

      if (status === 'Pending') category = 'pending';
      else if (status === 'PendingHr') category = 'pending_hr';
      else if (!category) category = 'other_approved';

      entries.push({
        userId,
        name: member.name,
        odId: member.odId,
        employeeCode: member.employeeCode,
        category,
        label: formatDailyUpdateLabel(requestedStatus),
        requestedStatus,
        requestStatus: status as TeamDailyUpdateEntry['requestStatus'],
        source: 'request',
        date: reqDate,
        approvedBy: req.approvedBy ? String(req.approvedBy) : undefined,
        reason: req.reason ? String(req.reason) : undefined,
        startTime: req.startTime ? String(req.startTime) : undefined,
        endTime: req.endTime ? String(req.endTime) : undefined,
      });
    }

    for (const day of datesInRange) {
      for (const member of members) {
        if (coveredUserDates.has(`${member._id}:${day}`)) continue;
        const fromAttendance = attendanceEntryForDate(member._id, day, attendanceByUser);
        if (!fromAttendance) continue;
        entries.push({
          ...fromAttendance,
          userId: member._id,
          name: member.name,
          odId: member.odId,
          employeeCode: member.employeeCode,
          date: day,
        });
      }
    }

    entries.sort(
      (a, b) => (a.date || '').localeCompare(b.date || '') || a.name.localeCompare(b.name)
    );

    const summary = {
      total: uniqueUserCount(entries, () => true),
      onLeave: uniqueUserCount(entries, (e) => e.category === 'leave'),
      away: uniqueUserCount(entries, (e) =>
        ['leave', 'wfh', 'outstation', 'half_day', 'other_approved'].includes(e.category)
      ),
      pending: uniqueUserCount(
        entries,
        (e) => e.category === 'pending' || e.category === 'pending_hr'
      ),
    };

    return NextResponse.json({
      success: true,
      data: { date, from, to, entries, summary },
    });
  } catch (error) {
    console.error('Team daily updates GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch team daily updates' }, { status: 500 });
  }
}
