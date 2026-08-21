import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import InvalidAttendanceNotification from '@/models/InvalidAttendanceNotification';
import { getWorkingUnderPartnerForDate, lastDayOfMonthYear } from '@/lib/userFieldHistory';
import { loadOpenEmployeeRequestsByUserDate } from '@/lib/openAttendanceRequestsForMonth';

interface InvalidRecord {
  date: string;
  checkin: string;
  checkout: string;
  issue: 'missing-checkin' | 'missing-checkout';
  monthYear: string;
  notificationCount?: number;
  lastNotifiedAt?: string;
  requestRaised?: boolean;
  requestStatus?: 'Pending' | 'PendingHr';
  requestedStatus?: string;
}

interface EmployeeWithInvalidRecords {
  userId: string;
  name: string;
  email: string;
  designation: string;
  workingUnderPartner: string;
  attendanceEmail: string;
  invalidRecords: InvalidRecord[];
  notificationCount?: number;
  lastNotifiedAt?: string;
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const monthYear = searchParams.get('monthYear');

    if (!monthYear) {
      return NextResponse.json({
        success: false,
        error: 'monthYear parameter is required'
      }, { status: 400 });
    }

    // Fetch all attendance records for the specified month
    const attendanceRecords = await Attendance.find({ monthYear })
      .populate(
        'userId',
        'name email designation workingUnderPartner team attendanceEmail employmentType fieldHistories'
      )
      .lean();

    const partnerAsOf = lastDayOfMonthYear(monthYear);

    const [notificationLogs, openRequestsByUserDate] = await Promise.all([
      InvalidAttendanceNotification.find({ monthYear }).lean(),
      loadOpenEmployeeRequestsByUserDate(monthYear),
    ]);
    const notificationByUserDate = new Map<string, { count: number; lastNotifiedAt: Date }>();
    for (const log of notificationLogs) {
      if (log.kind === 'missing-month') continue;
      const key = `${String(log.userId)}:${log.date}`;
      const existing = notificationByUserDate.get(key);
      const sentAt = new Date(log.sentAt);
      if (!existing) {
        notificationByUserDate.set(key, { count: 1, lastNotifiedAt: sentAt });
      } else {
        existing.count += 1;
        if (sentAt > existing.lastNotifiedAt) {
          existing.lastNotifiedAt = sentAt;
        }
      }
    }

    const employeesWithInvalidRecords: EmployeeWithInvalidRecords[] = [];

    for (const attendance of attendanceRecords) {
      const user = attendance.userId as any;
      if (!user || !user._id) continue;

      const invalidRecords: InvalidRecord[] = [];

      // Convert records Map to object if needed
      let records: Record<string, any> = {};
      if (attendance.records instanceof Map) {
        for (const [k, v] of attendance.records.entries()) {
          records[k] = v;
        }
      } else if (attendance.records) {
        records = attendance.records as Record<string, any>;
      }

      // Check each daily record for invalid times
      for (const [date, record] of Object.entries(records)) {
        if (!record) continue;

        // Use editedCheckin/editedCheckout if available, otherwise fall back to original values
        const checkin = record.editedCheckin || record.checkin || '';
        const checkout = record.editedCheckout || record.checkout || '';
        const typeOfPresence = record.typeOfPresence || '';

        // Skip holidays, leave days, and approved absence
        if (typeOfPresence === 'Holiday' || typeOfPresence === 'On leave' || typeOfPresence === 'Leave') {
          continue;
        }

        // Check if record is on a Sunday (weekly off)
        const recordDate = new Date(date);
        if (recordDate.getDay() === 0) {
          continue; // Skip Sundays
        }

        const isCheckinInvalid = !checkin || checkin === '00:00' || checkin === '';
        const isCheckoutInvalid = !checkout || checkout === '00:00' || checkout === '';

        // Both times are valid - skip
        if (!isCheckinInvalid && !isCheckoutInvalid) {
          continue;
        }

        // Both times are invalid/missing - this means absent, not invalid
        if (isCheckinInvalid && isCheckoutInvalid) {
          continue;
        }

        // Only check-in is invalid
        if (isCheckinInvalid) {
          invalidRecords.push({
            date,
            checkin,
            checkout,
            issue: 'missing-checkin',
            monthYear
          });
          continue;
        }

        // Only check-out is invalid
        if (isCheckoutInvalid) {
          invalidRecords.push({
            date,
            checkin,
            checkout,
            issue: 'missing-checkout',
            monthYear
          });
        }
      }

      // Only add employee if they have invalid records
      if (invalidRecords.length > 0) {
        // Sort records by date
        invalidRecords.sort((a, b) => a.date.localeCompare(b.date));

        const userIdStr = String(user._id);
        let employeeNotificationCount = 0;

        const recordsWithNotifications = invalidRecords.map((rec) => {
          const key = `${userIdStr}:${rec.date}`;
          const notif = notificationByUserDate.get(key);
          const openReq = openRequestsByUserDate.get(key);
          const enriched = { ...rec };
          if (notif) {
            employeeNotificationCount += notif.count;
            Object.assign(enriched, {
              notificationCount: notif.count,
              lastNotifiedAt: notif.lastNotifiedAt.toISOString(),
            });
          }
          if (openReq) {
            Object.assign(enriched, {
              requestRaised: true,
              requestStatus: openReq.status,
              requestedStatus: openReq.requestedStatus,
            });
          }
          return enriched;
        });

        const employeeLastNotifiedAt = recordsWithNotifications.reduce<Date | null>((latest, rec) => {
          if (!rec.lastNotifiedAt) return latest;
          const sentAt = new Date(rec.lastNotifiedAt);
          return !latest || sentAt > latest ? sentAt : latest;
        }, null);

        employeesWithInvalidRecords.push({
          userId: userIdStr,
          name: user.name || 'Unknown',
          email: user.email || '',
          designation: user.designation || '',
          workingUnderPartner: getWorkingUnderPartnerForDate(user, partnerAsOf),
          attendanceEmail: user.attendanceEmail || '',
          invalidRecords: recordsWithNotifications,
          notificationCount: employeeNotificationCount > 0 ? employeeNotificationCount : undefined,
          lastNotifiedAt: employeeLastNotifiedAt?.toISOString(),
        });
      }
    }

    // Sort by number of invalid records (descending)
    employeesWithInvalidRecords.sort((a, b) => b.invalidRecords.length - a.invalidRecords.length);

    return NextResponse.json({
      success: true,
      data: employeesWithInvalidRecords
    });
  } catch (error) {
    console.error('Error fetching invalid records:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch invalid records'
    }, { status: 500 });
  }
}
