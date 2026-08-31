import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import {
  isDateWithinRequestWindow,
  requestWindowRejectionMessage,
} from '@/lib/attendanceRequestWindow';
import { getEffectiveRequestWindowBoundsForUser } from '@/lib/attendanceRequestWindowDb';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';
import { autoApproveSelfRequests } from '@/lib/selfApproveAttendanceRequests';
import {
  EXTRA_WORK_REQUEST_STATUS,
  formatExtraWorkSlotsReasonSummary,
  isExtraWorkRequest,
  sumExtraWorkSlotHours,
  validateExtraWorkSlots,
  validateExtraWorkSlotsOutsidePunchRange,
  type ExtraWorkSlotInput,
} from '@/lib/extraWorkRequest';
import { resolveRequestRoutingForDate } from '@/lib/attendanceRequestNotifications';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const body = await request.json();
    const { userId, date, reason, startTime, endTime, slots: slotsRaw } = body;

    if (!userId || !date) {
      return NextResponse.json(
        { success: false, error: 'Date and user are required.' },
        { status: 400 }
      );
    }

    const forbidden = forbidUnlessSelf(auth.userId, userId);
    if (forbidden) return forbidden;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Expected YYYY-MM-DD' },
        { status: 400 }
      );
    }

    let slots: ExtraWorkSlotInput[] = [];
    if (Array.isArray(slotsRaw) && slotsRaw.length > 0) {
      slots = slotsRaw.map((s: ExtraWorkSlotInput) => ({
        startTime: String(s.startTime || '').trim(),
        endTime: String(s.endTime || '').trim(),
        reason: String(s.reason || '').trim(),
      }));
    } else if (startTime && endTime && reason) {
      slots = [
        {
          startTime: String(startTime).trim(),
          endTime: String(endTime).trim(),
          reason: String(reason).trim(),
        },
      ];
    }

    const validation = validateExtraWorkSlots(slots);
    if (!validation.ok) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const validatedSlots = validation.slots;
    const extraHours = sumExtraWorkSlotHours(validatedSlots);
    const summaryReason = formatExtraWorkSlotsReasonSummary(validatedSlots);

    const requestWindowBounds = await getEffectiveRequestWindowBoundsForUser(userId);
    if (!isDateWithinRequestWindow(date, requestWindowBounds.config)) {
      return NextResponse.json(
        { success: false, error: requestWindowRejectionMessage(date, requestWindowBounds) },
        { status: 400 }
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const routing = await resolveRequestRoutingForDate(user, date);
    if ('error' in routing) {
      return NextResponse.json({ success: false, error: routing.error }, { status: 400 });
    }
    const { partnerName, notificationEmail: approverNotificationEmail } = routing;

    const monthYear = date.substring(0, 7);
    const attendance = await Attendance.findOne({ userId: user._id, monthYear }).lean();
    let dayRecord: unknown = null;
    if (attendance?.records) {
      const records = attendance.records as unknown as Map<string, unknown> | Record<string, unknown>;
      if (records instanceof Map) {
        dayRecord = records.get(date) ?? null;
      } else {
        dayRecord = records[date] ?? null;
      }
    }

    if (!dayRecord || typeof dayRecord !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: 'Extra work can only be reported for days that already have uploaded attendance.',
        },
        { status: 400 }
      );
    }

    const rec = dayRecord as {
      checkin?: string;
      checkout?: string;
      editedCheckin?: string;
      editedCheckout?: string;
      typeOfPresence?: string;
    };
    const inTime = String(rec.editedCheckin || rec.checkin || '').trim();
    const outTime = String(rec.editedCheckout || rec.checkout || '').trim();
    const hasPunch =
      (inTime && inTime !== '00:00') || (outTime && outTime !== '00:00');
    const typeLower = String(rec.typeOfPresence || '').toLowerCase();
    const isLeave = typeLower.includes('leave');
    if (!hasPunch && isLeave) {
      return NextResponse.json(
        {
          success: false,
          error: 'Extra work requests require a day with uploaded attendance (not leave/absent).',
        },
        { status: 400 }
      );
    }

    const outsidePunch = validateExtraWorkSlotsOutsidePunchRange(validatedSlots, inTime, outTime);
    if (!outsidePunch.ok) {
      return NextResponse.json({ success: false, error: outsidePunch.error }, { status: 400 });
    }

    const existingForDate = await AttendanceRequest.find({ userId: user._id, date });
    const hasPendingExtra = existingForDate.some(
      (r) =>
        (r.status === 'Pending' || r.status === 'PendingHr') && isExtraWorkRequest(r)
    );
    if (hasPendingExtra) {
      return NextResponse.json(
        {
          success: false,
          error: 'You already have a pending extra work request for this date. Please wait for it to be processed.',
        },
        { status: 400 }
      );
    }

    if (existingForDate.length > 0) {
      await AttendanceRequest.deleteMany({
        userId: user._id,
        date,
        status: 'Rejected',
        requestType: 'extra_work',
      });
    }

    const originalStatus = String(rec.typeOfPresence || 'ThumbMachine');

    const newRequest = await AttendanceRequest.create({
      userId: user._id,
      userName: user.name,
      partnerName,
      date,
      monthYear,
      requestedStatus: EXTRA_WORK_REQUEST_STATUS,
      requestType: 'extra_work',
      reason: summaryReason,
      startTime: validatedSlots[0].startTime,
      endTime: validatedSlots[validatedSlots.length - 1].endTime,
      extraWorkSlots: validatedSlots.map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        reason: s.reason,
      })),
      originalStatus,
      status: 'Pending',
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
          ? 'Extra work request auto-approved (self approver)'
          : 'Request submitted. Your partner will be notified in the next morning digest.',
      sentTo: approverNotificationEmail,
      autoApproved: autoApprovedIds.length > 0,
      extraHours,
    });
  } catch (error) {
    console.error('Extra work request error:', error);
    return NextResponse.json({ success: false, error: 'Failed to submit extra work request' }, { status: 500 });
  }
}
