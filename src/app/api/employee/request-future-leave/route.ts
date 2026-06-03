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

const TIME_REQUIRED_PREFIXES = [
  'Present - in office',
  'Half Day',
  'WFH',
  'Present - outstation',
  'Present - client place'
];

const ZERO_TIME_PREFIXES = ['On leave', 'Weekoff - special allowance'];

const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseTimeToMinutes(time: string): number | null {
  if (!TIME_INPUT_PATTERN.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function requiresTimePair(requestType: string): boolean {
  const normalized = requestType.trim().toLowerCase();
  return TIME_REQUIRED_PREFIXES.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}

function isZeroTimeRequest(requestType: string): boolean {
  const normalized = requestType.trim().toLowerCase();
  return ZERO_TIME_PREFIXES.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { userId, startDate, endDate, requestType, reason, startTime, endTime } = await request.json();

    if (!userId || !startDate || !endDate || !requestType) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (!user.workingUnderPartner) {
        return NextResponse.json({ success: false, error: 'No Partner assigned to this employee' }, { status: 400 });
    }

    const partnerName = user.workingUnderPartner;
    const approverNotificationEmail = String((user as any).attendanceEmail || user.email || '').trim();

    if (!approverNotificationEmail) {
        return NextResponse.json({ success: false, error: 'No attendance email configured for this employee. Please contact admin.' }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const needsTimes = requiresTimePair(requestType);
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

    const datesToProcess = [];
    let currentDate = new Date(start);
    
    while (currentDate <= end) {
        datesToProcess.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Process requests
    const createdRequests = [];

    for (const d of datesToProcess) {
        // Skip Sundays (getDay() === 0)
        if (d.getDay() === 0) continue;
        
        const dateStr = d.toISOString().split('T')[0];
        const monthYear = dateStr.substring(0, 7); // YYYY-MM
        
        // Check if request already exists for this date? 
        // We probably should overwrite or fail. For now, let's create dynamic checking or just upsert logic if we want to valid duplicates
        // But schema doesn't enforce unique date per user. 
        // We will create a fresh request.
        
        // Calculate times for Present - outstation requests
        let finalStartTime = startTime;
        let finalEndTime = endTime;
        
        if (requestType === 'Present - outstation') {
            // Determine scheduled times based on day of week and user schedule
            const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            const month = d.getMonth() + 1; // 1-12
            
            let scheduleToUse;
            if (month === 12 || month === 1) {
                // December or January - use monthly schedule
                scheduleToUse = user.scheduleInOutTimeMonth;
            } else if (dayOfWeek === 6) {
                // Saturday - use saturday schedule
                scheduleToUse = user.scheduleInOutTimeSat;
            } else if (dayOfWeek !== 0) {
                // Monday to Friday - use regular schedule
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
            partnerName: user.workingUnderPartner || 'Admin',
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

    // Send Email Notification to Partner
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';

    // Fetch all pending requests assigned to this partner (across all employees)
    const pendingRequests = await AttendanceRequest.find({ partnerName: partnerName, status: 'Pending' }).sort({ createdAt: 1 });

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
    } catch (emailError) {
        console.error('Failed to send email:', emailError);
        // Don't fail the request just because email failed? 
        // If partner doesn't get email, they might not review it.
        // But preventing data creation might be annoying.
        // Let's keep it as warning.
    }

    return NextResponse.json({ success: true, count: createdRequests.length, sentTo: approverNotificationEmail });

  } catch (error) {
    console.error('Future request error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
