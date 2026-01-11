import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';

// GET - Fetch attendance records
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const monthYear = searchParams.get('monthYear');

    let query: Record<string, unknown> = {};

    if (userId) {
      query.userId = userId;
    }

    if (monthYear) {
      query.monthYear = monthYear;
    }

    const attendanceRecords = await Attendance.find(query)
      .populate('userId', 'name employeeId email department')
      .sort({ monthYear: -1 });

    return NextResponse.json({
      success: true,
      data: attendanceRecords,
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch attendance records' },
      { status: 500 }
    );
  }
}

// POST - Create new attendance record for a month or add daily record
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { userId, monthYear, date, dailyRecord, records } = body;

    // Bulk upload mode (from Excel page): body contains an array of records
    if (Array.isArray(records) && records.length > 0) {
      const processed: Array<{ odId: string; userId: string; monthYear: string; date: string; createdUser: boolean }> = [];
      const errors: Array<{ odId: string; reason: string }> = [];

      for (const rec of records) {
        try {
          const odId = String(rec.id);

          // Try to find existing user by OD ID; if not found, create one from Excel row
          let user = await User.findOne({ odId });
          let createdUser = false;

          if (!user) {
            const { isoDate } = normalizeExcelDate(rec.date);
            const joiningDate = new Date(isoDate);

            const rawName = (rec.name ?? `Employee ${odId}`).toString();
            const safeName = rawName.trim() || `Employee ${odId}`;

            // Generate a simple placeholder email to satisfy required/unique constraint
            const emailLocalPart = safeName
              .toLowerCase()
              .replace(/\s+/g, '.')
              .replace(/[^a-z0-9.]/g, '') || `user${odId}`;
            const email = `${emailLocalPart}.${odId}@auto.local`;

            user = await User.create({
              odId,
              name: safeName,
              email,
              joiningDate,
            });
            createdUser = true;
          }

          const { isoDate, isoMonthYear } = normalizeExcelDate(rec.date);

          // Find existing attendance or create new one per user per month
          let attendance = await Attendance.findOne({ userId: user._id, monthYear: isoMonthYear });

          if (!attendance) {
            attendance = await Attendance.create({
              userId: user._id,
              monthYear: isoMonthYear,
              records: new Map(),
              summary: {
                totalHour: 0,
                totalLateArrival: 0,
                excessHour: 0,
                totalHalfDay: 0,
                totalPresent: 0,
                totalAbsent: 0,
                totalLeave: 0,
              },
            });
          }

          const checkin = normalizeTimeToHHmm(rec.inTime);
          const checkout = normalizeTimeToHHmm(rec.outTime);

          const totalHour = calculateTotalHours(checkin, checkout);

          // Map page status to typeOfPresence; "Absent" is treated as "Leave" for now
          const typeOfPresence = rec.status === 'Present' ? 'ThumbMachine' : 'Leave';

          attendance.records.set(isoDate, {
            checkin,
            checkout,
            totalHour,
            excessHour: 0,
            typeOfPresence,
            halfDay: false,
            remarks: '',
          });

          attendance.summary = calculateSummary(attendance.records as any);
          await attendance.save();

          processed.push({
            odId,
            userId: String(user._id),
            monthYear: isoMonthYear,
            date: isoDate,
            createdUser,
          });
        } catch (e: unknown) {
          const odIdFallback = rec && rec.id ? String(rec.id) : 'UNKNOWN';
          let reason = 'Failed to process record';

          if (e && typeof e === 'object') {
            const anyErr = e as { message?: string; code?: number; keyValue?: unknown };
            if (anyErr.message) {
              reason = anyErr.message;
            }
          }

          errors.push({ odId: odIdFallback, reason });
        }
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            processed,
            errors,
          },
        },
        { status: 201 }
      );
    }

    if (!userId || !monthYear) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: userId, monthYear' },
        { status: 400 }
      );
    }

    // Validate monthYear format
    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json(
        { success: false, error: 'monthYear must be in format YYYY-MM' },
        { status: 400 }
      );
    }

    // Find existing attendance or create new one
    let attendance = await Attendance.findOne({ userId, monthYear });

    if (!attendance) {
      // Create new attendance record for the month
      attendance = await Attendance.create({
        userId,
        monthYear,
        records: new Map(),
        summary: {
          totalHour: 0,
          totalLateArrival: 0,
          excessHour: 0,
          totalHalfDay: 0,
          totalPresent: 0,
          totalAbsent: 0,
          totalLeave: 0,
        },
      });
    }

    // If daily record is provided, add/update it
    if (date && dailyRecord) {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json(
          { success: false, error: 'date must be in format YYYY-MM-DD' },
          { status: 400 }
        );
      }

      // Ensure date belongs to the monthYear
      if (!date.startsWith(monthYear)) {
        return NextResponse.json(
          { success: false, error: 'date must belong to the specified monthYear' },
          { status: 400 }
        );
      }

      attendance.records.set(date, {
        checkin: dailyRecord.checkin || '',
        checkout: dailyRecord.checkout || '',
        totalHour: dailyRecord.totalHour || 0,
        excessHour: dailyRecord.excessHour || 0,
        typeOfPresence: dailyRecord.typeOfPresence || 'ThumbMachine',
        halfDay: dailyRecord.halfDay || false,
        remarks: dailyRecord.remarks || '',
      });

      // Recalculate summary
      attendance.summary = calculateSummary(attendance.records);

      await attendance.save();
    }

    return NextResponse.json(
      { success: true, data: attendance },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating attendance:', error);
    
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Attendance record already exists for this user and month' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create attendance record' },
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

  const STANDARD_CHECKIN = '10:00'; // 10 AM standard check-in time

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
        totalPresent++;
        break;
      case 'Leave':
        totalLeave++;
        break;
      case 'Holiday':
        // Holidays don't count as present/absent
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

// Convert Excel page date formats to ISO strings used by Attendance model
function normalizeExcelDate(rawDate: string): { isoDate: string; isoMonthYear: string } {
  // Supported formats: "DD-MM-YYYY" or already "YYYY-MM-DD"
  if (/^\d{2}-\d{2}-\d{4}$/.test(rawDate)) {
    const [dd, mm, yyyy] = rawDate.split('-');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const isoMonthYear = `${yyyy}-${mm}`;
    return { isoDate, isoMonthYear };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const [yyyy, mm, dd] = rawDate.split('-');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const isoMonthYear = `${yyyy}-${mm}`;
    return { isoDate, isoMonthYear };
  }

  const date = new Date(rawDate);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return {
    isoDate: `${yyyy}-${mm}-${dd}`,
    isoMonthYear: `${yyyy}-${mm}`,
  };
}

// Normalize times like "HH:mm:ss" or "HH:mm" to "HH:mm"
function normalizeTimeToHHmm(rawTime: string | null | undefined): string {
  if (!rawTime) return '';

  const str = String(rawTime).trim();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return '';

  const hours = match[1].padStart(2, '0');
  const minutes = match[2];
  return `${hours}:${minutes}`;
}

// Calculate total hours between two times in "HH:mm" format
function calculateTotalHours(checkin: string, checkout: string): number {
  if (!checkin || !checkout) return 0;

  const [inH, inM] = checkin.split(':').map(Number);
  const [outH, outM] = checkout.split(':').map(Number);

  const startMinutes = inH * 60 + inM;
  const endMinutes = outH * 60 + outM;
  if (endMinutes <= startMinutes) return 0;

  const diffMinutes = endMinutes - startMinutes;
  const hours = diffMinutes / 60;
  return Number(hours.toFixed(2));
}
