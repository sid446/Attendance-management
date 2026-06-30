import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { reapplyExtraWorkEntriesToRecord } from '@/lib/extraWorkRequest';
import { calculateSummary } from '@/lib/attendanceSummaryCalculation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Fetch single attendance record by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const { id } = await params;
    const attendance = await Attendance.findById(id)
      .populate('userId', 'name employeeId email department');

    if (!attendance) {
      return NextResponse.json(
        { success: false, error: 'Attendance record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch attendance record' },
      { status: 500 }
    );
  }
}

// PUT - Update attendance record (add/update daily record)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const { id } = await params;
    const body = await request.json();
    const { date, dailyRecord, summary } = body;

    const attendance = await Attendance.findById(id);

    if (!attendance) {
      return NextResponse.json(
        { success: false, error: 'Attendance record not found' },
        { status: 404 }
      );
    }

    // Update specific daily record
    if (date && dailyRecord) {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json(
          { success: false, error: 'date must be in format YYYY-MM-DD' },
          { status: 400 }
        );
      }

      // Ensure date belongs to the monthYear
      if (!date.startsWith(attendance.monthYear)) {
        return NextResponse.json(
          { success: false, error: 'date must belong to the attendance monthYear' },
          { status: 400 }
        );
      }

      // If approving outstation or by HR, set checkin/checkout to scheduled in/out time for that user/date
      let checkin = dailyRecord.checkin ?? attendance.records.get(date)?.checkin ?? '';
      let checkout = dailyRecord.checkout ?? attendance.records.get(date)?.checkout ?? '';
      let typeOfPresence = dailyRecord.typeOfPresence ?? attendance.records.get(date)?.typeOfPresence ?? 'ThumbMachine';
      let user = await User.findById(attendance.userId);
      let setScheduledTime = false;
      // Outstation or HR approval (hrValue present or typeOfPresence includes 'outstation')
      if ((typeOfPresence && typeOfPresence.toLowerCase().includes('outstation')) || (dailyRecord.hrValue !== undefined && user)) {
        setScheduledTime = true;
      }
      if (setScheduledTime && user) {
        // Prefer per-day schedule from user.schedules (like EmployeeMonthView)
        let scheduleEntry = Array.isArray(user.schedules)
           ? user.schedules.filter(s => new Date(s.effectiveFrom) <= new Date(date)).sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0]
          : undefined;
        let dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date).getDay()];
        let daySchedule = scheduleEntry?.daily?.[dayName];
        // Fallback to legacy fields if no per-day schedule
        if (!daySchedule) {
          if (dayName === 'saturday' && user.scheduleInOutTimeSat) {
            daySchedule = user.scheduleInOutTimeSat;
          } else if (dayName === 'sunday' && user.scheduleInOutTimeMonth) {
            daySchedule = user.scheduleInOutTimeMonth;
          } else if (user.scheduleInOutTime) {
            daySchedule = user.scheduleInOutTime;
          }
        }
        if (daySchedule) {
          checkin = daySchedule.inTime || checkin;
          checkout = daySchedule.outTime || checkout;
        }
      }
      attendance.records.set(date, {
        checkin,
        checkout,
        totalHour: dailyRecord.totalHour ?? attendance.records.get(date)?.totalHour ?? 0,
        excessHour: dailyRecord.excessHour ?? attendance.records.get(date)?.excessHour ?? 0,
        typeOfPresence,
        halfDay: dailyRecord.halfDay ?? attendance.records.get(date)?.halfDay ?? false,
        value: dailyRecord.value ?? attendance.records.get(date)?.value ?? 0,
        remarks: dailyRecord.remarks ?? attendance.records.get(date)?.remarks ?? '',
      });

      // Calculate value based on typeOfPresence if not explicitly provided
      const record = attendance.records.get(date);
      if (record && dailyRecord.value === undefined) {
        const typeOfPresence = record.typeOfPresence;
        if (typeOfPresence.includes('Half Day')) {
          record.value = 0.5;
          record.halfDay = true;
        } else if (typeOfPresence === 'Absent' || typeOfPresence === 'On leave') {
          record.value = 0;
        } else if (typeOfPresence === 'Holiday' || typeOfPresence === 'Weekoff - special allowance') {
          record.value = 0;
        } else if (typeOfPresence.includes('outstation')) {
          // Outstation work gets higher value due to travel/additional effort
          record.value = 1.2;
        } else {
          // All other present types
          record.value = 1;
        }
      }

      const isSundayDate = new Date(date).getDay() === 0;
      const isNonWorkingDayRecord =
        record?.typeOfPresence === 'Holiday' ||
        record?.typeOfPresence === 'Sunday' ||
        record?.typeOfPresence === 'Weekoff' ||
        record?.typeOfPresence === 'Weekoff - special allowance' ||
        isSundayDate;
      if (record && isNonWorkingDayRecord) {
        record.halfDay = false;
        record.excessHour = 0;
      }
      if (record) {
        reapplyExtraWorkEntriesToRecord(record);
      }

      // Recalculate summary
      const attendanceUser = await User.findById(attendance.userId);
      attendance.summary = calculateSummary(attendance.records, attendanceUser);
    }

    // Directly update summary if provided (for manual adjustments)
    if (summary) {
      attendance.summary = {
        ...attendance.summary,
        ...summary,
      };
    }

    await attendance.save();

    return NextResponse.json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    console.error('Error updating attendance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update attendance record' },
      { status: 500 }
    );
  }
}

// DELETE - Delete attendance record or specific daily record
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const attendance = await Attendance.findById(id);

    if (!attendance) {
      return NextResponse.json(
        { success: false, error: 'Attendance record not found' },
        { status: 404 }
      );
    }

    // If date is provided, delete only that daily record
    if (date) {
      if (!attendance.records.has(date)) {
        return NextResponse.json(
          { success: false, error: 'Daily record not found for this date' },
          { status: 404 }
        );
      }

      attendance.records.delete(date);
      const user = await User.findById(attendance.userId);
      attendance.summary = calculateSummary(attendance.records, user);
      await attendance.save();

      return NextResponse.json({
        success: true,
        message: `Daily record for ${date} deleted successfully`,
        data: attendance,
      });
    }

    // Delete entire monthly attendance record
    await Attendance.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: 'Attendance record deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete attendance record' },
      { status: 500 }
    );
  }
}
