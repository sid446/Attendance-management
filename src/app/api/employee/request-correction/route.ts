import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import User from '@/models/User';
import {
  isDateWithinRequestWindow,
  requestWindowRejectionMessage,
} from '@/lib/attendanceRequestWindow';
import { getEffectiveRequestWindowBoundsForUser } from '@/lib/attendanceRequestWindowDb';
import { forbidUnlessSelf, requireEmployeeOrHrSession, requireEmployeeSession } from '@/lib/employeeRouteAuth';
import { autoApproveSelfRequests } from '@/lib/selfApproveAttendanceRequests';
import { isExtraWorkRequest } from '@/lib/extraWorkRequest';
import { requiresAttendanceRequestTimePair } from '@/lib/attendanceRequestTimeRules';
import { canViewerAccessTeamMember } from '@/lib/teamRequestAuthorization';
import { resolveRequestRoutingForDate } from '@/lib/attendanceRequestNotifications';

const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseTimeToMinutes(time: string): number | null {
  if (!TIME_INPUT_PATTERN.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployeeOrHrSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const { searchParams } = new URL(request.url);
    let userId = searchParams.get('userId');
    const partnerName = searchParams.get('partnerName');
    const status = searchParams.get('status');

    if (auth.type === 'employee') {
      if (userId) {
        const forbidden = forbidUnlessSelf(auth.userId, userId);
        if (forbidden) {
          const allowed = await canViewerAccessTeamMember(auth.userId, userId);
          if (!allowed) return forbidden;
        }
      } else {
        userId = auth.userId;
      }
    }

    let query: any = {};

    if (userId) {
      query.userId = userId;
    }

    if (partnerName) {
      query.partnerName = partnerName;
    }

    if (status) {
      query.status = status;
    }

    const requests = await AttendanceRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email designation employmentType category')
      .lean();

    return NextResponse.json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('Fetch Requests Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const { userId, date, requestedStatus, reason, startTime, endTime } = await request.json();

    if (!userId || !date || !requestedStatus) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const forbidden = forbidUnlessSelf(auth.userId, userId);
    if (forbidden) return forbidden;

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, error: 'Invalid date format. Expected YYYY-MM-DD' }, { status: 400 });
    }

    const requestWindowBounds = await getEffectiveRequestWindowBoundsForUser(userId);
    if (!isDateWithinRequestWindow(date, requestWindowBounds.config)) {
      return NextResponse.json(
        {
          success: false,
          error: requestWindowRejectionMessage(date, requestWindowBounds),
        },
        { status: 400 }
      );
    }

    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    /** Partner who covered this attendance date (history), not necessarily current work partner. */
    const routing = await resolveRequestRoutingForDate(user, date);
    if ('error' in routing) {
      return NextResponse.json({ success: false, error: routing.error }, { status: 400 });
    }
    const { partnerName, notificationEmail: approverNotificationEmail } = routing;

    const monthYear = date.substring(0, 7); // YYYY-MM

    const needsTimes = requiresAttendanceRequestTimePair(requestedStatus);
    const hasStartTime = typeof startTime === 'string' && startTime.trim() !== '';
    const hasEndTime = typeof endTime === 'string' && endTime.trim() !== '';

    if (needsTimes) {
      if (!hasStartTime || !hasEndTime) {
        return NextResponse.json(
          { success: false, error: 'This status requires both in time and out time.' },
          { status: 400 }
        );
      }

      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);
      if (startMinutes === null || endMinutes === null) {
        return NextResponse.json(
          { success: false, error: 'Invalid time format. Use 24-hour HH:MM.' },
          { status: 400 }
        );
      }
      if (startMinutes >= endMinutes) {
        return NextResponse.json(
          { success: false, error: 'In time must be earlier than out time.' },
          { status: 400 }
        );
      }
    } else if (hasStartTime || hasEndTime) {
      return NextResponse.json(
        { success: false, error: 'This status does not accept manual time values.' },
        { status: 400 }
      );
    }

    const existingForDate = await AttendanceRequest.find({ userId: user._id, date });
    const hasActiveCorrection = existingForDate.some(
      (r) => r.status !== 'Rejected' && !isExtraWorkRequest(r)
    );

    if (hasActiveCorrection) {
      return NextResponse.json(
        { success: false, error: 'You already have a correction request for this date which is not rejected yet.' },
        { status: 400 }
      );
    }

    if (existingForDate.length > 0) {
      await AttendanceRequest.deleteMany({ userId: user._id, date, status: 'Rejected' });
    }

    const newRequest = await AttendanceRequest.create({
      userId: user._id,
      userName: user.name,
      partnerName: partnerName,
      date,
      monthYear,
      requestedStatus,
      requestType: 'correction',
      reason,
      startTime,
      endTime,
      originalStatus: 'Absent',
      status: 'Pending'
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';

    const autoApprovedIds = await autoApproveSelfRequests(
      [{ requestId: String(newRequest._id), date }],
      user,
      baseUrl
    );

    return NextResponse.json({
      success: true,
      message:
        autoApprovedIds.length > 0
          ? 'Request auto-approved (self approver)'
          : 'Request submitted. Your partner will be notified in the next morning digest.',
      sentTo: approverNotificationEmail,
      autoApproved: autoApprovedIds.length > 0,
    });
  } catch (error) {
    console.error('Request Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to submit request' }, { status: 500 });
  }
}