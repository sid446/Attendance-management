import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';
import { createPartnerReviewAllLink } from '@/lib/partnerReviewToken';
import {
  buildAttendanceRequestEmailHtml,
  buildCorrectionMobileCards,
  buildCorrectionTableRows,
  escapeHtml,
} from '@/lib/attendanceRequestEmail';
import {
  isDateWithinRequestWindow,
  requestWindowRejectionMessage,
} from '@/lib/attendanceRequestWindow';
import { getEffectiveRequestWindowBoundsForUser } from '@/lib/attendanceRequestWindowDb';

const TIME_REQUIRED_PREFIXES = [
  'Present - in office',
  'Half Day',
  'WFH',
  'Present - outstation',
  'Present - client place'
];

const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseTimeToMinutes(time: string): number | null {
  if (!TIME_INPUT_PATTERN.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function requiresTimePair(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return TIME_REQUIRED_PREFIXES.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const partnerName = searchParams.get('partnerName');
    const status = searchParams.get('status');

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
      .populate('userId', 'name email designation')
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
    await dbConnect();

    const { userId, date, requestedStatus, reason, startTime, endTime } = await request.json();

    if (!userId || !date || !requestedStatus) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

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

    if (!user.workingUnderPartner) {
      return NextResponse.json({ success: false, error: 'No Partner assigned to this employee' }, { status: 400 });
    }

    /** Who receives the request mail + signed review links: this employee's `attendanceEmail` (approver inbox), not login email. */
    const partnerName = user.workingUnderPartner;
    const approverNotificationEmail = String((user as any).attendanceEmail || user.email || '').trim();

    if (!approverNotificationEmail) {
      return NextResponse.json(
        { success: false, error: 'No attendance email configured for this employee. Please contact admin.' },
        { status: 400 }
      );
    }

    const monthYear = date.substring(0, 7); // YYYY-MM

    const needsTimes = requiresTimePair(requestedStatus);
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
    const hasActiveForDate = existingForDate.some((r: any) => r.status !== 'Rejected');
    
    if (hasActiveForDate) {
      return NextResponse.json(
        { success: false, error: 'You already have a correction request for this date which is not rejected yet.' },
        { status: 400 }
      );
    }

    if (existingForDate.length > 0) {
      await AttendanceRequest.deleteMany({ userId: user._id, date, status: 'Rejected' });
    }

    await AttendanceRequest.create({
      userId: user._id,
      userName: user.name,
      partnerName: partnerName,
      date,
      monthYear,
      requestedStatus,
      reason,
      startTime,
      endTime,
      originalStatus: 'Absent',
      status: 'Pending'
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';
    const reviewAllLink = createPartnerReviewAllLink(baseUrl, partnerName, approverNotificationEmail);

    // Fetch all pending requests assigned to this partner (across all employees)
    const pendingRequests = await AttendanceRequest.find({ partnerName: partnerName, status: 'Pending' }).sort({ createdAt: 1 });

    const emailRows = pendingRequests.map((req: any) => ({
      id: String(req._id),
      userName: req.userName,
      date: req.date,
      requestedStatus: req.requestedStatus,
      startTime: req.startTime,
      endTime: req.endTime,
      reason: req.reason,
    }));

    const emailHtml = buildAttendanceRequestEmailHtml({
      title: 'Attendance correction requests',
      reviewAllLink,
      infoHtml: `<strong style="color:#0f172a;">New request from:</strong> ${escapeHtml(user.name)}<br/><span style="font-size:14px;color:#475569;">All pending correction requests assigned to you are listed below.</span>`,
      description:
        'Tap <strong>Review request</strong> on a card (mobile) or use the table on desktop. You can approve or reject with optional remarks.',
      tableBodyHtml: buildCorrectionTableRows(emailRows, baseUrl),
      mobileCardsHtml: buildCorrectionMobileCards(emailRows, baseUrl),
      showReviewColumn: true,
    });

    let emailSent = true;
    let emailWarning: string | undefined;
    try {
      await transporter.sendMail({
        ...mailOptions,
        to: approverNotificationEmail,
        subject: `Attendance Correction Requests: ${user.name}`,
        html: emailHtml,
      });
    } catch (emailError) {
      emailSent = false;
      emailWarning = 'Request saved, but partner email could not be delivered right now.';
      console.error('Failed to send correction request email:', emailError);
    }

    return NextResponse.json({
      success: true,
      message: 'Request sent to partner',
      sentTo: approverNotificationEmail,
      emailSent,
      warning: emailWarning,
    });
  } catch (error) {
    console.error('Request Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to submit request' }, { status: 500 });
  }
}