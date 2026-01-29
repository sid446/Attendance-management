import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import AttendanceRequest from '@/models/AttendanceRequest';
import User, { IUser } from '@/models/User';
import Holiday from '@/models/Holiday';

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
      .populate('userId', 'name employeeId odId employeeCode email department team designation workingUnderPartner scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth')
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
      const uploadedMonths = new Set<string>();

      // Pre-fetch all users for efficient in-memory matching
      const allUsers = await User.find({}).select('name _id odId scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth');
      
      // Helper to strip non-alphanumeric characters for fuzzy matching
      const normalizeForMatch = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      for (const rec of records) {
        try {
          const odId = String(rec.id);
          const recName = rec.name ? String(rec.name).trim() : '';

          // 1. Match ONLY by Name (User request)
          let user = null;

          if (recName) {
            // A. Try exact match
            user = allUsers.find(u => u.name === recName);
            
            // B. Case-insensitive
            if (!user) {
              user = allUsers.find(u => u.name.toLowerCase() === recName.toLowerCase());
            }

            // C. Stripped Match (ignores all spaces, dots, special chars)
            // e.g. "Padmaja Vikas.Sunkad" -> "padmajavikassunkad" match "Padmaja.Vikas.Sunkad" -> "padmajavikassunkad"
            if (!user) {
              const target = normalizeForMatch(recName);
              user = allUsers.find(u => normalizeForMatch(u.name) === target);
            }
          }

          // 2. If still not found, skip this record (DO NOT create new user)
          if (!user) {
             errors.push({ odId, reason: `User not found by Name "${recName}"` });
             continue;
          }

          let createdUser = false; // logic changed: we never create user here now

          const { isoDate, isoMonthYear } = normalizeExcelDate(rec.date);

          // Track uploaded months for leave increment
          uploadedMonths.add(isoMonthYear);

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

          // Check for Approved Requests (Future/Correction) that override Excel data
          const approvedRequest = await AttendanceRequest.findOne({
            userId: user._id,
            date: isoDate,
            status: 'Approved'
          });

          // Map page status to typeOfPresence;
          // User Requirement: typeOfPresence should always be 'ThumbMachine' for Excel uploads indicating source.
          // Absent status will be determined by 0 totalHour in summary calculation.
          let typeOfPresence = 'ThumbMachine';
          let finalCheckin = checkin;
          let finalCheckout = checkout;
          let finalTotalHour = totalHour;
          let finalValue = totalHour > 0 ? 1 : 0;
          let finalHalfDay = false;
          let remarksStr = '';

          // Override if Approved Request Exists
          if (approvedRequest) {
             // Calculate Request Duration
             let requestTotalHour = 0;
             if (approvedRequest.startTime && approvedRequest.endTime) {
                 const [h1, m1] = String(approvedRequest.startTime).split(':').map(Number);
                 const [h2, m2] = String(approvedRequest.endTime).split(':').map(Number);
                 if (!isNaN(h1) && !isNaN(m1) && !isNaN(h2) && !isNaN(m2)) {
                    const minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
                    requestTotalHour = Math.max(0, Math.round((minutes / 60) * 100) / 100);
                 }
             }

             // Logic: If Machine Data hours > Request Data hours, Machine Data prevails.
             // This handles:
             // 1. Applied for Leave (0 hrs) but worked (e.g. 5 hrs) -> Machine Data (Present)
             // 2. Applied for Half Day (4 hrs) but worked Full Day (8 hrs) -> Machine Data (Present)
             // 3. Applied for WFH (9 hrs) and Machine is 0 or less -> Request Data (WFH)
             
             if (totalHour > requestTotalHour) {
                 typeOfPresence = 'Present'; 
                 remarksStr = `Present (Machine ${totalHour}h > Request ${requestTotalHour}h)`;
                 // finalCheckin, finalCheckout, finalTotalHour are already set to machine values
                 finalValue = 1;
             } else {
                 // Standard Override: Approved Request takes precedence
                 typeOfPresence = approvedRequest.requestedStatus;
                 remarksStr = `Overridden by Approved Request: ${approvedRequest.requestedStatus}`;

                 // If request provides specific times, use them
                 if (approvedRequest.startTime && approvedRequest.endTime) {
                     finalCheckin = approvedRequest.startTime;
                     finalCheckout = approvedRequest.endTime;
                     finalTotalHour = requestTotalHour;
                 } else {
                     // If it's a leave type and no times (or times resulted in 0), ensure cleared
                     const isLeaveType = ['On leave', 'Absent'].includes(approvedRequest.requestedStatus);
                     if (isLeaveType) {
                         finalCheckin = '';
                         finalCheckout = '';
                         finalTotalHour = 0;
                     }
                 }

                 // Adjust Value based on Status
                 if (typeOfPresence === 'On leave' || typeOfPresence === 'Absent') {
                     finalValue = 0;
                 } else if (typeOfPresence && typeOfPresence.includes('Half Day')) {
                     finalValue = 0.75; 
                     finalHalfDay = true;
                 } else {
                     finalValue = 1;
                 }
             }
          }

          attendance.records.set(isoDate, {
            checkin: finalCheckin,
            checkout: finalCheckout,
            totalHour: finalTotalHour,
            excessHour: 0,
            typeOfPresence: typeOfPresence as any,
            halfDay: finalHalfDay,
            value: finalValue, 
            remarks: remarksStr,
          });

          // Recalculate summary with user-specific schedule
          attendance.summary = calculateSummary(attendance.records as any, user);
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

      // Process holidays for the uploaded month/year
      if (processed.length > 0) {
        const sampleRecord = processed[0];
        const [yearStr] = sampleRecord.monthYear.split('-');
        const year = parseInt(yearStr);

        // Fetch active holidays for this year
        const holidays = await Holiday.find({ year, isActive: true });

        if (holidays.length > 0) {
          // Get unique users from processed records
          const uniqueUserIds = [...new Set(processed.map(p => p.userId))];

          for (const userId of uniqueUserIds) {
            const user = allUsers.find(u => u._id.toString() === userId);
            if (!user) continue;

            // Find or create attendance record for this user
            let attendance = await Attendance.findOne({ userId: user._id, monthYear: sampleRecord.monthYear });

            if (!attendance) {
              attendance = await Attendance.create({
                userId: user._id,
                monthYear: sampleRecord.monthYear,
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

            // Check each holiday for this month
            for (const holiday of holidays) {
              const holidayDate = new Date(holiday.date);
              const holidayMonthYear = `${holidayDate.getFullYear()}-${String(holidayDate.getMonth() + 1).padStart(2, '0')}`;

              // Only process holidays for the current month being uploaded
              if (holidayMonthYear === sampleRecord.monthYear) {
                const dateKey = holiday.date;

                // Check if user already has a record for this holiday date
                const existingRecord = attendance.records.get(dateKey);

                // If no record exists for this holiday date, add a holiday record
                if (!existingRecord) {
                  attendance.records.set(dateKey, {
                    checkin: '00:00',
                    checkout: '00:00',
                    totalHour: 0,
                    excessHour: 0,
                    typeOfPresence: 'Holiday',
                    halfDay: false,
                    value: 0,
                    remarks: holiday.name,
                  });

                  processed.push({
                    odId: user.odId || user._id.toString(),
                    userId: user._id.toString(),
                    monthYear: sampleRecord.monthYear,
                    date: holiday.date,
                    createdUser: false,
                  });
                }
              }
            }

            // Recalculate summary after adding holidays
            attendance.summary = calculateSummary(attendance.records as any, user);
            await attendance.save();
          }
        }
      }

      // Increment leave balance for processed users
      try {
        const now = new Date();
        // Group processed by monthYear
        const processedByMonth: Record<string, string[]> = {};
        for (const p of processed) {
          if (!processedByMonth[p.monthYear]) processedByMonth[p.monthYear] = [];
          processedByMonth[p.monthYear].push(p.userId);
        }

        for (const [monthYear, userIds] of Object.entries(processedByMonth)) {
          for (const userId of userIds) {
            const user = await User.findById(userId);
            if (!user || !user.isActive) continue;

            const monthlyEarned = user.leaveBalance?.monthlyEarned || 2;

            // Check if leave was already incremented for this month
            const lastUpdated = user.leaveBalance?.lastUpdated;
            const currentEarned = user.leaveBalance?.earned || 0;
            if (lastUpdated) {
              const lastUpdatedMonth = `${lastUpdated.getFullYear()}-${String(lastUpdated.getMonth() + 1).padStart(2, '0')}`;
              if (lastUpdatedMonth === monthYear) {
                continue; // Already incremented for this month
              }
            }

            // Increment earned leave
            const newEarned = currentEarned + monthlyEarned;
            const currentUsed = user.leaveBalance?.used || 0;
            const newRemaining = newEarned - currentUsed;

            await User.findByIdAndUpdate(user._id, {
              'leaveBalance.earned': newEarned,
              'leaveBalance.remaining': Math.max(0, newRemaining),
              'leaveBalance.lastUpdated': now,
            });
          }
          console.log(`Leave balance incremented for ${userIds.length} users in month ${monthYear}`);
        }
      } catch (leaveError) {
        console.error('Error incrementing leave balance:', leaveError);
        // Don't fail the upload if leave increment fails
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
        value: dailyRecord.value ?? 0,
        remarks: dailyRecord.remarks || '',
      });

      // Recalculate summary with user-specific logic
      const user = await User.findById(userId);
      if (user) {
        attendance.summary = calculateSummary(attendance.records, user);
      }
      
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
function calculateSummary(
  records: Map<string, {
    checkin: string;
    checkout: string;
    totalHour: number;
    excessHour: number;
    typeOfPresence: string;
    halfDay: boolean;
    remarks?: string;
  }>,
  user?: IUser | null
) {
  let totalHour = 0;
  let totalLateArrival = 0;
  let excessHour = 0;
  let totalHalfDay = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLeave = 0;

  records.forEach((record, dateStr) => {
    totalHour += record.totalHour || 0;
    excessHour += record.excessHour || 0;

    // Determine if this is an articleship employee
    const isArticleship = user && user.designation && user.designation.toLowerCase() === 'article';

    // Determine half-day based on user type and check-in time
    let isHalfDay = false;
    if (record.checkin) {
      const checkinTime = record.checkin;
      const isAfter1PM = checkinTime >= '13:00';
      
      if (isArticleship) {
        // For articleship: half-day if arrive after 1 PM
        isHalfDay = isAfter1PM;
      } else {
        // For others: half-day if arrive after 1 PM AND less than 6 hours worked
        isHalfDay = isAfter1PM && (record.totalHour < 6);
      }
    }

    // Update the record's halfDay flag
    record.halfDay = isHalfDay;

    if (isHalfDay) {
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
      case 'Weekly Off - Present (WO-Present)':
      case 'Half Day (HD)':
      case 'Work From Home (WFH)':
      case 'Weekly Off - Work From Home (WO-WFH)':
      case 'Onsite Presence (OS-P)':
        // If hours are > 0, they are present. If 0, they are Absent (but source was Machine/Manual)
        if (record.totalHour > 0) {
           totalPresent++;
        } else {
           totalAbsent++;
        }
        break;
      case 'On leave':
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
