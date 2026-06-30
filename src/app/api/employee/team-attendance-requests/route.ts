import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import { requireEmployeeSession } from '@/lib/employeeRouteAuth';
import { getVisibleTeamMembersForViewer } from '@/lib/teamVisibilityForViewer';
import { enrichAttendanceRequestsWithOriginalTimes } from '@/lib/enrichAttendanceRequests';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const userId = searchParams.get('userId');
    const monthYear = searchParams.get('monthYear');

    const { members } = await getVisibleTeamMembersForViewer(auth.userId);
    if (members.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const visibleIds = members
      .map((member) => member._id)
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (userId) {
      if (!visibleIds.includes(userId)) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const query: Record<string, unknown> = {
      userId: userId
        ? new mongoose.Types.ObjectId(userId)
        : { $in: visibleIds.map((id) => new mongoose.Types.ObjectId(id)) },
    };

    if (status) {
      query.status = status;
    }

    if (monthYear) {
      query.monthYear = monthYear;
    }

    const requests = await AttendanceRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email designation employeeCode odId')
      .lean();

    const enriched = await enrichAttendanceRequestsWithOriginalTimes(
      requests.map((req) => ({ ...req, userId: req.userId })) as Array<Record<string, unknown>>
    );

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('Team attendance requests fetch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch team requests' }, { status: 500 });
  }
}
