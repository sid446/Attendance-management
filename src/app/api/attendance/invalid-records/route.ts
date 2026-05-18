import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { getWorkingUnderPartnerForDate, lastDayOfMonthYear } from '@/lib/userFieldHistory';

interface InvalidRecord {
  date: string;
  checkin: string;
  checkout: string;
  issue: 'missing-checkin' | 'missing-checkout';
  monthYear: string;
}

interface EmployeeWithInvalidRecords {
  userId: string;
  name: string;
  email: string;
  designation: string;
  workingUnderPartner: string;
  attendanceEmail: string;
  invalidRecords: InvalidRecord[];
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

        employeesWithInvalidRecords.push({
          userId: String(user._id),
          name: user.name || 'Unknown',
          email: user.email || '',
          designation: user.designation || '',
          workingUnderPartner: getWorkingUnderPartnerForDate(user, partnerAsOf),
          attendanceEmail: user.attendanceEmail || '',
          invalidRecords
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
