import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import InvalidAttendanceNotification from '@/models/InvalidAttendanceNotification';
import {
  attendanceRecordsFromDoc,
  collectDatesWithAnyAttendance,
  findMissingAttendanceDates,
  isAttendanceMissingForMonth,
  localTodayYmd,
  wasEmployeeActiveDuringMonth,
} from '@/lib/employeeMisExceptions';
import { getWorkingUnderPartnerForDate, lastDayOfMonthYear } from '@/lib/userFieldHistory';

export type MissingDayRecord = {
  date: string;
  notificationCount?: number;
  lastNotifiedAt?: string;
};

export type MissingMonthEmployee = {
  userId: string;
  odId: string;
  name: string;
  email: string;
  designation: string;
  workingUnderPartner: string;
  attendanceEmail: string;
  wholeMonthMissing: boolean;
  missingDays: MissingDayRecord[];
  notificationCount?: number;
  lastNotifiedAt?: string;
};

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const monthYear = searchParams.get('monthYear');

    if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json(
        { success: false, error: 'monthYear parameter is required (YYYY-MM)' },
        { status: 400 }
      );
    }

    const todayYmd = localTodayYmd();

    const activeUsers = await User.find({ isActive: true })
      .select(
        'odId name email designation workingUnderPartner attendanceEmail joiningDate inactiveAsOf isActive schedules seasonalSchedules fieldHistories'
      )
      .lean();

    const recordsByUserId = new Map<string, Record<string, unknown>>();
    const hasAttendanceDocByUserId = new Set<string>();

    const attendanceDocs = await Attendance.find({ monthYear }).select('userId records').lean();

    for (const doc of attendanceDocs) {
      const uid = String(doc.userId);
      hasAttendanceDocByUserId.add(uid);
      recordsByUserId.set(uid, attendanceRecordsFromDoc(doc));
    }

    const datesWithAnyAttendance = collectDatesWithAnyAttendance(recordsByUserId.values());

    const notificationLogs = await InvalidAttendanceNotification.find({
      monthYear,
      kind: 'missing-month',
    }).lean();

    const notificationByUserDate = new Map<string, { count: number; lastNotifiedAt: Date }>();
    const notificationByUser = new Map<string, { count: number; lastNotifiedAt: Date }>();
    for (const log of notificationLogs) {
      const uid = String(log.userId);
      const sentAt = new Date(log.sentAt);
      const dateKey = `${uid}:${log.date}`;
      const byDate = notificationByUserDate.get(dateKey);
      if (!byDate) {
        notificationByUserDate.set(dateKey, { count: 1, lastNotifiedAt: sentAt });
      } else {
        byDate.count += 1;
        if (sentAt > byDate.lastNotifiedAt) byDate.lastNotifiedAt = sentAt;
      }
      const byUser = notificationByUser.get(uid);
      if (!byUser) {
        notificationByUser.set(uid, { count: 1, lastNotifiedAt: sentAt });
      } else {
        byUser.count += 1;
        if (sentAt > byUser.lastNotifiedAt) byUser.lastNotifiedAt = sentAt;
      }
    }

    const partnerAsOf = lastDayOfMonthYear(monthYear);
    const data: MissingMonthEmployee[] = [];

    for (const user of activeUsers) {
      if (!wasEmployeeActiveDuringMonth(user, monthYear)) continue;

      const userId = String(user._id);
      const records = recordsByUserId.get(userId) || {};
      const hasAttendanceDoc = hasAttendanceDocByUserId.has(userId);
      const wholeMonthMissing = isAttendanceMissingForMonth(hasAttendanceDoc, records);
      const missingDateKeys = findMissingAttendanceDates({
        user,
        records,
        datesWithAnyAttendance,
        monthYear,
        todayYmd,
        wholeMonthMissing,
      });

      if (missingDateKeys.length === 0) continue;

      const missingDays: MissingDayRecord[] = missingDateKeys.map((date) => {
        const notif = notificationByUserDate.get(`${userId}:${date}`);
        return {
          date,
          notificationCount: notif?.count,
          lastNotifiedAt: notif?.lastNotifiedAt.toISOString(),
        };
      });

      const userNotif = notificationByUser.get(userId);

      data.push({
        userId,
        odId: user.odId || '',
        name: user.name || 'Unknown',
        email: user.email || '',
        designation: user.designation || '',
        workingUnderPartner: getWorkingUnderPartnerForDate(user, partnerAsOf),
        attendanceEmail: user.attendanceEmail || '',
        wholeMonthMissing,
        missingDays,
        notificationCount: userNotif?.count,
        lastNotifiedAt: userNotif?.lastNotifiedAt.toISOString(),
      });
    }

    data.sort((a, b) => {
      const byCount = b.missingDays.length - a.missingDays.length;
      if (byCount !== 0) return byCount;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ success: true, data, monthYear });
  } catch (error) {
    console.error('Error fetching missing-month attendance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch employees with no attendance recorded' },
      { status: 500 }
    );
  }
}
