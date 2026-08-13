import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import AttendanceRequest, { TYPE_OF_PRESENCE_ENUM } from '@/models/AttendanceRequest';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';
import { createPartnerReviewAllLink } from '@/lib/partnerReviewToken';
import {
  buildAttendanceRequestEmailHtml,
  buildGroupedMobileCards,
  buildGroupedTableRows,
  escapeHtml,
  groupPendingRequestsForEmail,
} from '@/lib/attendanceRequestEmail';
import {
  isDateWithinRequestWindow,
  requestWindowRejectionMessage,
} from '@/lib/attendanceRequestWindow';
import { getEffectiveRequestWindowBoundsForUser } from '@/lib/attendanceRequestWindowDb';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';
import { autoApproveSelfRequests } from '@/lib/selfApproveAttendanceRequests';
import { requiresAttendanceRequestTimePair } from '@/lib/attendanceRequestTimeRules';
import { resolveRequestRoutingForDate } from '@/lib/attendanceRequestNotifications';
import Holiday from '@/models/Holiday';
import { isSundayDate, parseIsoDateLocal } from '@/lib/attendanceSummaryMetrics';

const ZERO_TIME_PREFIXES = ['On leave', 'Weekoff - special allowance'];

const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseTimeToMinutes(time: string): number | null {
  if (!TIME_INPUT_PATTERN.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function isZeroTimeRequest(requestType: string): boolean {
  const normalized = requestType.trim().toLowerCase();
  return ZERO_TIME_PREFIXES.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const { userId, startDate, endDate, requestType, reason, startTime, endTime } = await request.json();

    if (!userId || !startDate || !endDate || !requestType) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const forbidden = forbidUnlessSelf(auth.userId, userId);
    if (forbidden) return forbidden;

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const needsTimes = requiresAttendanceRequestTimePair(requestType);
    const zeroTimeRequest = isZeroTimeRequest(requestType);
    const hasStartTime = typeof startTime === 'string' && startTime.trim() !== '';
    const hasEndTime = typeof endTime === 'string' && endTime.trim() !== '';

    if (needsTimes) {
      if (!hasStartTime || !hasEndTime) {
        return NextResponse.json(
          { success: false, error: 'This request type requires both start time and end time.' },
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
          { success: false, error: 'Start time must be earlier than end time.' },
          { status: 400 }
        );
      }
    } else if (zeroTimeRequest) {
      if ((hasStartTime || hasEndTime) && !(startTime === '00:00' && endTime === '00:00')) {
        return NextResponse.json(
          { success: false, error: 'This request type should not include manual time values.' },
          { status: 400 }
        );
      }
    } else if (hasStartTime || hasEndTime) {
      const startMinutes = hasStartTime ? parseTimeToMinutes(startTime) : null;
      const endMinutes = hasEndTime ? parseTimeToMinutes(endTime) : null;
      if (
        startMinutes === null ||
        endMinutes === null ||
        startMinutes >= endMinutes
      ) {
        return NextResponse.json(
          { success: false, error: 'Invalid time range.' },
          { status: 400 }
        );
      }
    }
    
    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return NextResponse.json({ success: false, error: 'Invalid dates' }, { status: 400 });
    }
    
    if (end < start) {
        return NextResponse.json({ success: false, error: 'End date must be after start date' }, { status: 400 });
    }

    const requestWindowBounds = await getEffectiveRequestWindowBoundsForUser(userId);
    const startStr = startDate.split('T')[0];
    const endStr = endDate.split('T')[0];
    if (!isDateWithinRequestWindow(startStr, requestWindowBounds.config)) {
      return NextResponse.json(
        {
          success: false,
          error: requestWindowRejectionMessage(startStr, requestWindowBounds),
        },
        { status: 400 }
      );
    }
    if (!isDateWithinRequestWindow(endStr, requestWindowBounds.config)) {
      return NextResponse.json(
        {
          success: false,
          error: requestWindowRejectionMessage(endStr, requestWindowBounds),
        },
        { status: 400 }
      );
    }

    const datesToProcess: string[] = [];
    const cursor = new Date(`${startStr}T12:00:00`);
    const endLocal = new Date(`${endStr}T12:00:00`);
    while (cursor.getTime() <= endLocal.getTime()) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      datesToProcess.push(`${y}-${m}-${d}`);
      cursor.setDate(cursor.getDate() + 1);
    }

    const years = new Set(datesToProcess.map((ds) => Number(ds.slice(0, 4))));
    const holidayDates = new Set<string>();
    for (const year of years) {
      const holidays = await Holiday.find({ year, isActive: true }).select('date').lean();
      for (const h of holidays) {
        const dateKey = String(h.date || '').slice(0, 10);
        if (dateKey) holidayDates.add(dateKey);
      }
    }

    // Process requests — each day routes to the work partner covering that date
    const createdRequests = [];
    const partnerEmails = new Map<string, string>();

    for (const dateStr of datesToProcess) {
        // Skip Sundays and company holidays — they are marked Holiday on approval
        if (isSundayDate(dateStr) || holidayDates.has(dateStr)) continue;
        const monthYear = dateStr.substring(0, 7); // YYYY-MM

        const routing = await resolveRequestRoutingForDate(user, dateStr);
        if ('error' in routing) {
          return NextResponse.json({ success: false, error: routing.error }, { status: 400 });
        }
        partnerEmails.set(routing.partnerName, routing.notificationEmail);
        
        let finalStartTime = startTime;
        let finalEndTime = endTime;

        const hasCustomTimes =
          typeof startTime === 'string' &&
          typeof endTime === 'string' &&
          startTime.trim() !== '' &&
          endTime.trim() !== '' &&
          startTime !== '00:00' &&
          endTime !== '00:00';

        const isOutstationType = String(requestType || '').toLowerCase().includes('outstation');
        if (isOutstationType && !hasCustomTimes) {
            const dayDate = parseIsoDateLocal(dateStr);
            const dayOfWeek = dayDate.getDay();
            const month = dayDate.getMonth() + 1;

            let scheduleToUse;
            if (month === 12 || month === 1) {
                scheduleToUse = user.scheduleInOutTimeMonth;
            } else if (dayOfWeek === 6) {
                scheduleToUse = user.scheduleInOutTimeSat;
            } else if (dayOfWeek !== 0) {
                scheduleToUse = user.scheduleInOutTime;
            }

            if (scheduleToUse) {
                finalStartTime = scheduleToUse.inTime;
                finalEndTime = scheduleToUse.outTime;
            }
        }
        
        let originalStatus = 'Absent';
        const attendanceDoc = await Attendance.findOne({ userId: user._id, monthYear });
        const dayRecord = attendanceDoc?.records?.get?.(dateStr) ?? (attendanceDoc?.records as any)?.[dateStr];
        const recordType = dayRecord?.typeOfPresence ? String(dayRecord.typeOfPresence) : '';
        if (recordType && (TYPE_OF_PRESENCE_ENUM as readonly string[]).includes(recordType)) {
          originalStatus = recordType;
        }

        const newRequest = new AttendanceRequest({
            userId: user._id,
            userName: user.name,
            partnerName: routing.partnerName,
            date: dateStr,
            monthYear: monthYear,
            requestedStatus: requestType,
            originalStatus,
            reason: reason,
            status: 'Pending',
            startTime: finalStartTime || undefined,
            endTime: finalEndTime || undefined
        });

        await newRequest.save();
        createdRequests.push(newRequest);
    }

    if (createdRequests.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No eligible dates to create requests for (e.g. only Sundays or holidays in range).',
      }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';

    const autoApprovedIds = await autoApproveSelfRequests(
      createdRequests.map((req) => ({
        requestId: String(req._id),
        date: String(req.date),
      })),
      user,
      baseUrl
    );

    // Notify each work partner who received at least one day in this range
    const notifiedEmails: string[] = [];
    for (const [partnerName, approverNotificationEmail] of partnerEmails) {
      const pendingRequests = await AttendanceRequest.find({
        partnerName,
        status: 'Pending',
      }).sort({ createdAt: 1 });

      const groupedRows = groupPendingRequestsForEmail(pendingRequests);
      const reviewAllLink = createPartnerReviewAllLink(baseUrl, partnerName, approverNotificationEmail);

      const emailHtml = buildAttendanceRequestEmailHtml({
        title: 'Future leave requests',
        reviewAllLink,
        infoHtml: `<strong style="color:#0f172a;">New request from:</strong> ${escapeHtml(user.name)}<br/><span style="font-size:14px;color:#475569;">Dates requested: ${escapeHtml(startDate)} to ${escapeHtml(endDate)}</span>`,
        description:
          'Pending leave and attendance requests are listed below. Use <strong>Review all pending</strong> to open the review page.',
        tableBodyHtml: buildGroupedTableRows(groupedRows),
        mobileCardsHtml: buildGroupedMobileCards(groupedRows),
        showReviewColumn: false,
        noteHtml: `<strong style="color:#14532d;">Tip:</strong> Use the review link above to approve or reject requests in one place.`,
      });

      try {
        await transporter.sendMail({
          ...mailOptions,
          to: approverNotificationEmail,
          subject: `Future Leave Requests: ${user.name}`,
          html: emailHtml,
        });
        notifiedEmails.push(approverNotificationEmail);
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
      }
    }

    return NextResponse.json({
      success: true,
      count: createdRequests.length,
      sentTo: notifiedEmails.join(', ') || Array.from(partnerEmails.values()).join(', '),
      autoApprovedCount: autoApprovedIds.length,
      autoApproved: autoApprovedIds.length > 0,
    });

  } catch (error) {
    console.error('Future request error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
