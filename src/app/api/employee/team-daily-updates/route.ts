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
  formatDailyUpdateLabel,
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
  };
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
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : istDateString();

    if (!mongoose.Types.ObjectId.isValid(viewerUserId)) {
      return NextResponse.json({ success: false, error: 'Valid viewerUserId is required' }, { status: 400 });
    }

    const { members } = await getVisibleTeamMembersForViewer(viewerUserId);
    if (members.length === 0) {
      return NextResponse.json({
        success: true,
        data: { date, entries: [], summary: { total: 0, onLeave: 0, away: 0, pending: 0 } },
      });
    }

    const memberById = new Map(members.map((m) => [m._id, m]));
    const memberIds = members.map((m) => m._id);
    const monthYear = date.slice(0, 7);

    const [requests, attendanceDocs] = await Promise.all([
      AttendanceRequest.find({
        userId: { $in: memberIds },
        date,
        status: { $in: ['Approved', 'Pending', 'PendingHr'] },
      })
        .select(
          'userId userName date requestedStatus status reason startTime endTime approvedBy approvedAt'
        )
        .sort({ userName: 1 })
        .lean(),
      Attendance.find({ userId: { $in: memberIds }, monthYear })
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

    const coveredUserIds = new Set<string>();
    const entries: TeamDailyUpdateEntry[] = [];

    for (const req of requests) {
      const userId = String(req.userId);
      const member = memberById.get(userId);
      if (!member) continue;

      coveredUserIds.add(userId);
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
        approvedBy: req.approvedBy ? String(req.approvedBy) : undefined,
        reason: req.reason ? String(req.reason) : undefined,
        startTime: req.startTime ? String(req.startTime) : undefined,
        endTime: req.endTime ? String(req.endTime) : undefined,
      });
    }

    for (const member of members) {
      if (coveredUserIds.has(member._id)) continue;
      const fromAttendance = attendanceEntryForDate(member._id, date, attendanceByUser);
      if (!fromAttendance) continue;
      entries.push({
        ...fromAttendance,
        userId: member._id,
        name: member.name,
        odId: member.odId,
        employeeCode: member.employeeCode,
      });
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    const summary = {
      total: entries.length,
      onLeave: entries.filter((e) => e.category === 'leave').length,
      away: entries.filter((e) =>
        ['leave', 'wfh', 'outstation', 'half_day', 'other_approved'].includes(e.category)
      ).length,
      pending: entries.filter((e) => e.category === 'pending' || e.category === 'pending_hr').length,
    };

    return NextResponse.json({
      success: true,
      data: { date, entries, summary },
    });
  } catch (error) {
    console.error('Team daily updates GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch team daily updates' }, { status: 500 });
  }
}
