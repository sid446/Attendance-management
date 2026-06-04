import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';

interface InvalidRecord {
  date: string;
  checkin: string;
  checkout: string;
  issue: 'missing-checkin' | 'missing-checkout';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const monthYear = searchParams.get('monthYear');

    const forbidden = forbidUnlessSelf(auth.userId, userId);
    if (forbidden) return forbidden;

    if (!userId || !monthYear) {
      return NextResponse.json({
        success: false,
        error: 'userId and monthYear parameters are required'
      }, { status: 400 });
    }

    // Get user
    const user = await User.findById(userId).select('name email');
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }

    // Get attendance for this user
    const attendance = await Attendance.findOne({ userId, monthYear }).lean();
    if (!attendance) {
      return NextResponse.json({
        success: true,
        data: {
          userName: user.name,
          records: []
        }
      });
    }

    // Find invalid records
    const invalidRecords: InvalidRecord[] = [];
    let records: Record<string, any> = {};

    if (attendance.records instanceof Map) {
      for (const [k, v] of (attendance.records as Map<string, any>).entries()) {
        records[k] = v;
      }
    } else if (attendance.records) {
      records = attendance.records as Record<string, any>;
    }

    for (const [date, record] of Object.entries(records)) {
      if (!record) continue;

      // Use editedCheckin/editedCheckout if available, otherwise fall back to original values
      const checkin = record.editedCheckin || record.checkin || '';
      const checkout = record.editedCheckout || record.checkout || '';
      const typeOfPresence = record.typeOfPresence || '';

      // Skip holidays and leave
      if (typeOfPresence === 'Holiday' || typeOfPresence === 'On leave' || typeOfPresence === 'Leave') {
        continue;
      }

      // Skip Sundays
      const recordDate = new Date(date);
      if (recordDate.getDay() === 0) continue;

      const isCheckinInvalid = !checkin || checkin === '00:00' || checkin === '';
      const isCheckoutInvalid = !checkout || checkout === '00:00' || checkout === '';

      if (!isCheckinInvalid && !isCheckoutInvalid) continue;

      // Both times missing means absent, not invalid - skip
      if (isCheckinInvalid && isCheckoutInvalid) continue;

      let issue: InvalidRecord['issue'];
      if (isCheckinInvalid) {
        issue = 'missing-checkin';
      } else {
        issue = 'missing-checkout';
      }

      invalidRecords.push({ date, checkin, checkout, issue });
    }

    // Sort by date
    invalidRecords.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      data: {
        userName: user.name,
        records: invalidRecords
      }
    });
  } catch (error) {
    console.error('Error fetching invalid records for employee:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch records'
    }, { status: 500 });
  }
}
