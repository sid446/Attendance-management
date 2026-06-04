import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import Holiday from '@/models/Holiday';
import {
  computeMisExceptionsForUser,
  findMissingBiometricDates,
  MIS_EXCEPTION_LABELS,
  type MisExceptionRow,
  type MisExceptionType,
} from '@/lib/employeeMisExceptions';
import {
  getManagedFieldValueForDate,
  getWorkingUnderPartnerForDate,
  lastDayOfMonthYear,
} from '@/lib/userFieldHistory';

const ALL_EXCEPTION_TYPES: MisExceptionType[] = [
  'missing-attendance',
  'missing-biometric',
  'no-schedule',
  'no-pl-partner',
  'approver-same-as-employee',
];

function isValidExceptionType(v: string | null): v is MisExceptionType {
  return v !== null && ALL_EXCEPTION_TYPES.includes(v as MisExceptionType);
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const monthYear = searchParams.get('monthYear');
    const exceptionFilterRaw = searchParams.get('type');
    const exceptionFilter = isValidExceptionType(exceptionFilterRaw)
      ? exceptionFilterRaw
      : null;

    if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json(
        { success: false, error: 'monthYear parameter is required (YYYY-MM)' },
        { status: 400 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayYmd = today.toISOString().slice(0, 10);

    const [year] = monthYear.split('-').map(Number);
    const holidays = await Holiday.find({ year, isActive: true }).lean();
    const holidayDateSet = new Set(
      holidays.map((h: { date?: string }) => String(h.date || '').slice(0, 10)).filter(Boolean)
    );

    const activeUsers = await User.find({ isActive: true })
      .select(
        'odId name email designation workingUnderPartner registeredUnderPartner attendanceEmail employeeCode joiningDate inactiveAsOf isActive schedules seasonalSchedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth fieldHistories'
      )
      .lean();

    const needsMonthAttendance =
      !exceptionFilter ||
      exceptionFilter === 'missing-biometric' ||
      exceptionFilter === 'missing-attendance';
    const recordsByUserId = new Map<string, Record<string, unknown>>();
    const hasAttendanceDocByUserId = new Set<string>();

    if (needsMonthAttendance) {
      const attendanceDocs = await Attendance.find({ monthYear })
        .select('userId records')
        .lean();

      for (const doc of attendanceDocs) {
        const uid = String(doc.userId);
        hasAttendanceDocByUserId.add(uid);
        let records: Record<string, unknown> = {};
        if (doc.records instanceof Map) {
          for (const [k, v] of doc.records.entries()) records[k] = v;
        } else if (doc.records) {
          records = doc.records as Record<string, unknown>;
        }
        recordsByUserId.set(uid, records);
      }
    }

    const partnerAsOf = lastDayOfMonthYear(monthYear);
    const fullRows: MisExceptionRow[] = [];
    const counts: Record<MisExceptionType, number> = {
      'missing-attendance': 0,
      'missing-biometric': 0,
      'no-schedule': 0,
      'no-pl-partner': 0,
      'approver-same-as-employee': 0,
    };

    for (const user of activeUsers) {
      const userId = String(user._id);
      const records = recordsByUserId.get(userId) || {};
      const hasAttendanceDoc = hasAttendanceDocByUserId.has(userId);

      const exceptions = computeMisExceptionsForUser(user, {
        monthYear,
        todayYmd,
        holidayDateSet,
        records,
        hasAttendanceDoc,
        partnerAsOf,
      });

      if (exceptions.length === 0) continue;

      for (const ex of exceptions) {
        counts[ex] += 1;
      }

      const missingBiometricDates =
        exceptions.includes('missing-biometric') ||
        exceptions.includes('missing-attendance')
          ? findMissingBiometricDates(user, records, holidayDateSet, monthYear, todayYmd)
          : undefined;

      fullRows.push({
        userId,
        odId: user.odId || '',
        name: user.name || 'Unknown',
        email: user.email || '',
        designation: user.designation || '',
        workingUnderPartner: getWorkingUnderPartnerForDate(user, partnerAsOf),
        registeredUnderPartner:
          getManagedFieldValueForDate(user, 'registeredUnderPartner', partnerAsOf) ||
          user.registeredUnderPartner ||
          '',
        attendanceEmail: user.attendanceEmail || '',
        exceptions,
        missingBiometricDates,
      });
    }

    let data: MisExceptionRow[] = fullRows;

    if (exceptionFilter) {
      data = fullRows
        .filter((row) => row.exceptions.includes(exceptionFilter))
        .map((row) => ({
          ...row,
          exceptions: [exceptionFilter],
          missingBiometricDates:
            exceptionFilter === 'missing-biometric' ||
            exceptionFilter === 'missing-attendance'
              ? row.missingBiometricDates
              : undefined,
        }));
    }

    data.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      success: true,
      data,
      monthYear,
      counts,
      labels: MIS_EXCEPTION_LABELS,
      activeFilter: exceptionFilter,
    });
  } catch (error) {
    console.error('MIS exceptions error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch MIS exceptions' },
      { status: 500 }
    );
  }
}
