import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';

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

      attendance.records.set(date, {
        checkin: dailyRecord.checkin ?? attendance.records.get(date)?.checkin ?? '',
        checkout: dailyRecord.checkout ?? attendance.records.get(date)?.checkout ?? '',
        totalHour: dailyRecord.totalHour ?? attendance.records.get(date)?.totalHour ?? 0,
        excessHour: dailyRecord.excessHour ?? attendance.records.get(date)?.excessHour ?? 0,
        typeOfPresence: dailyRecord.typeOfPresence ?? attendance.records.get(date)?.typeOfPresence ?? 'ThumbMachine',
        halfDay: dailyRecord.halfDay ?? attendance.records.get(date)?.halfDay ?? false,
        remarks: dailyRecord.remarks ?? attendance.records.get(date)?.remarks ?? '',
      });

      // Recalculate summary
      attendance.summary = calculateSummary(attendance.records);
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
      attendance.summary = calculateSummary(attendance.records);
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

// Helper function to calculate summary from records
function calculateSummary(records: Map<string, {
  checkin: string;
  checkout: string;
  totalHour: number;
  excessHour: number;
  typeOfPresence: string;
  halfDay: boolean;
  remarks?: string;
}>) {
  let totalHour = 0;
  let totalLateArrival = 0;
  let excessHour = 0;
  let totalHalfDay = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLeave = 0;

  const STANDARD_CHECKIN = '09:00';

  records.forEach((record) => {
    totalHour += record.totalHour || 0;
    excessHour += record.excessHour || 0;

    if (record.halfDay) {
      totalHalfDay++;
    }

    if (record.checkin && record.checkin > STANDARD_CHECKIN) {
      totalLateArrival++;
    }

    switch (record.typeOfPresence) {
      case 'ThumbMachine':
      case 'Manual':
      case 'Remote':
      case 'Official Holiday Duty (OHD)':
      case 'Weekly Off - Present (WO-Present)':
      case 'Half Day (HD)':
      case 'Work From Home (WFH)':
      case 'Weekly Off - Work From Home (WO-WFH)':
      case 'Onsite Presence (OS-P)':
        totalPresent++;
        break;
      case 'Leave':
        totalLeave++;
        break;
      case 'Holiday':
      case 'Week Off':
        break;
      default:
        totalAbsent++;
    }
  });

  return {
    totalHour,
    totalLateArrival,
    excessHour,
    totalHalfDay,
    totalPresent,
    totalAbsent,
    totalLeave,
  };
}
