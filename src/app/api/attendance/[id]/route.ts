import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';

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
        value: dailyRecord.value ?? attendance.records.get(date)?.value ?? 0,
        remarks: dailyRecord.remarks ?? attendance.records.get(date)?.remarks ?? '',
      });

      // Calculate value based on typeOfPresence if not explicitly provided
      const record = attendance.records.get(date);
      if (record && dailyRecord.value === undefined) {
        const typeOfPresence = record.typeOfPresence;
        if (typeOfPresence.includes('Half Day')) {
          record.value = 0.75;
          record.halfDay = true;
        } else if (typeOfPresence === 'Absent' || typeOfPresence === 'Leave') {
          record.value = 0;
        } else if (typeOfPresence === 'Holiday' || typeOfPresence === 'Week Off' || typeOfPresence === 'Weekoff - special allowance') {
          record.value = 0;
        } else if (typeOfPresence.includes('outstation')) {
          // Outstation work gets higher value due to travel/additional effort
          record.value = 1.2;
        } else {
          // All other present types
          record.value = 1;
        }
      }

      // Recalculate summary
      const user = await User.findById(attendance.userId);
      attendance.summary = calculateSummary(attendance.records, user);
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

// Helper function to calculate summary from records
function calculateSummary(records: Map<string, {
  checkin: string;
  checkout: string;
  totalHour: number;
  excessHour: number;
  typeOfPresence: string;
  halfDay: boolean;
  remarks?: string;
}>, user?: any) {
  let totalHour = 0;
  let totalLateArrival = 0;
  let excessHour = 0;
  let totalHalfDay = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLeave = 0;

  records.forEach((record, dateStr) => {
    // Determine if user is an article (articleship)
    const isArticle = user && user.designation && user.designation.toLowerCase() === 'article';

    // Calculate halfDay based on user type
    let halfDay = false;
    if (record.checkin) {
      const checkinTime = record.checkin;
      const checkinMinutes = timeToMinutes(checkinTime);
      const onePMMinutes = timeToMinutes('13:00');
      
      if (checkinMinutes > onePMMinutes) {
        if (isArticle) {
          // For articles: half day if arrive after 1 PM
          halfDay = true;
        } else {
          // For others: half day if arrive after 1 PM AND work less than 6 hours
          halfDay = record.totalHour < 6;
        }
      }
    }

    // Update the record's halfDay flag
    record.halfDay = halfDay;

    totalHour += record.totalHour || 0;
    excessHour += record.excessHour || 0;

    if (halfDay) {
      totalHalfDay++;
    }

    // Determine scheduled in-time for this specific date
    let scheduledIn = '10:00'; // Default fallback
    
    if (user) {
      const dateDate = new Date(dateStr);
      // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
      const dayOfWeek = dateDate.getDay(); 
      const month = dateDate.getMonth() + 1; // 1-12

      // "Sch-Out (Dec- Jan)" logic: Special schedule for Dec (12) and Jan (1)
      if (month === 12 || month === 1) {
         scheduledIn = user.scheduleInOutTimeMonth?.inTime || '09:00';
      } else if (dayOfWeek === 6) { // Saturday
         scheduledIn = user.scheduleInOutTimeSat?.inTime || '09:00';
      } else if (dayOfWeek !== 0) { // Regular (Mon-Fri)
         scheduledIn = user.scheduleInOutTime?.inTime || '09:00';
      }
      // Sunday (0) usually doesn't have late arrival, but if record exists, use regular or ignore?
      // Assuming no late arrival calc for Sunday usually, but let's stick to Regular if present
      if (dayOfWeek === 0) scheduledIn = user.scheduleInOutTime?.inTime || '09:00';
    }

    if (record.checkin && record.checkin > scheduledIn) {
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
        // Same rule as main attendance summary: only count as Present
        // when totalHour > 0; 0 hours should be treated as Absent.
        if (record.totalHour > 0) {
          totalPresent++;
        } else {
          totalAbsent++;
        }
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

// Convert "HH:mm" to total minutes since midnight
function timeToMinutes(time: string): number {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
