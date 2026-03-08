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
      .populate('userId', 'name employeeId odId employeeCode email department team designation workingUnderPartner schedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth')
      .sort({ monthYear: -1 });

    // Serialize records to plain JS objects and ensure summary fields are present
    const serialized = attendanceRecords.map((doc: any) => {
      // Convert Mongoose Map to plain object if needed
      let recordsObj: Record<string, any> = {};
      if (doc.records instanceof Map) {
        for (const [k, v] of doc.records.entries()) {
          recordsObj[k] = v;
        }
      } else {
        recordsObj = doc.records;
      }
      // Ensure summary is a plain object and excessHour is present
      const summary = doc.summary ? {
        totalHour: doc.summary.totalHour ?? 0,
        totalLateArrival: doc.summary.totalLateArrival ?? 0,
        excessHour: doc.summary.excessHour ?? 0,
        totalHalfDay: doc.summary.totalHalfDay ?? 0,
        totalPresent: doc.summary.totalPresent ?? 0,
        totalAbsent: doc.summary.totalAbsent ?? 0,
        totalLeave: doc.summary.totalLeave ?? 0,
      } : {
        totalHour: 0,
        totalLateArrival: 0,
        excessHour: 0,
        totalHalfDay: 0,
        totalPresent: 0,
        totalAbsent: 0,
        totalLeave: 0,
      };
      return {
        _id: doc._id,
        userId: doc.userId,
        monthYear: doc.monthYear,
        records: recordsObj,
        summary,
      };
    });

    // Debug: Log the serialized data and summaries
    console.log('[DEBUG] Attendance GET serialized:', JSON.stringify(serialized, null, 2));
    if (serialized.length > 0) {
      console.log('[DEBUG] First summary:', JSON.stringify(serialized[0].summary, null, 2));
    }

    return NextResponse.json({
      success: true,
      data: serialized,
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
      // Track user-month combinations where attendance is being created for the first time
      const newAttendanceUserMonths = new Set<string>();

      // Pre-fetch all users for efficient in-memory matching
      const allUsers = await User.find({}).select('name _id odId employeeCode designation employmentType schedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth');
      
      // Helper to strip non-alphanumeric characters for fuzzy matching
      const normalizeForMatch = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      for (const rec of records) {
        try {
          const odId = String(rec.id || rec.employeeCode || 'UNKNOWN');
          const recName = rec.name ? String(rec.name).trim() : '';

          // 1. Match by Name only
          let user = null;

          if (recName) {
            // A. Try exact match by name
            user = allUsers.find(u => u.name === recName);
            
            // B. Case-insensitive name match
            if (!user) {
              user = allUsers.find(u => u.name.toLowerCase() === recName.toLowerCase());
            }

            // C. Stripped Match by name (ignores all spaces, dots, special chars)
            if (!user) {
              const target = normalizeForMatch(recName);
              user = allUsers.find(u => normalizeForMatch(u.name) === target);
            }
          }

          // 2. If still not found, skip this record
          if (!user) {
             errors.push({ odId, reason: `User not found by Name "${recName}"` });
             continue;
          }

          // 3. Process attendance record
          let createdUser = false; // logic changed: we never create user here now

          const { isoDate, isoMonthYear } = normalizeExcelDate(rec.date);

          // Track uploaded months for leave increment
          uploadedMonths.add(isoMonthYear);

          // Find existing attendance or create new one per user per month
          let attendance = await Attendance.findOne({ userId: user._id, monthYear: isoMonthYear });
          const isNewAttendanceForMonth = !attendance;

          if (!attendance) {
            // Track this as a new attendance record for this user-month (first time upload)
            const userMonthKey = `${user._id}_${isoMonthYear}`;
            newAttendanceUserMonths.add(userMonthKey);
            
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

          let checkin = normalizeTimeToHHmm(rec.inTime);
          let checkout = normalizeTimeToHHmm(rec.outTime);

          // Anomaly Detection: If checkin is late (>= 16:00) AND checkout is 00:00/empty,
          // person likely only punched OUT, so the checkin value is actually the exit time.
          // Swap: move checkin to checkout, set checkin to 00:00
          const isCheckinLate = checkin >= '16:00';
          const isCheckoutMissing = checkout === '00:00' || checkout === '';
          let exitOnlyPunchDetected = false;
          if (isCheckinLate && isCheckoutMissing) {
            // Swap: the "checkin" is actually the checkout time
            checkout = checkin;
            checkin = '00:00';
            exitOnlyPunchDetected = true;
          }

          // For Excel uploads, edited times are initially set to same as original times
          // They can be modified later through employee correction requests
          const editedCheckin = checkin;
          const editedCheckout = checkout;

          // Use edited times for calculations (which are initially same as original)
          const calculationCheckin = editedCheckin;
          const calculationCheckout = editedCheckout;
          const totalHour = calculateTotalHours(calculationCheckin, calculationCheckout);

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
          let finalEditedCheckin = editedCheckin; // Initially same as original
          let finalEditedCheckout = editedCheckout; // Initially same as original
          let finalTotalHour = totalHour;
          let finalValue = totalHour > 0 ? 1 : 0;
          let finalHalfDay = false;
          let remarksStr = '';

          // Special case: if checkin is 00:00 but checkout is valid, mark as half day
          if (finalCheckin === '00:00' && finalCheckout !== '00:00' && finalCheckout !== '' && finalTotalHour > 0) {
            finalHalfDay = true;
            finalValue = 0.5;
            remarksStr = exitOnlyPunchDetected 
              ? 'Exit-only punch detected, marked as Half Day' 
              : 'Marked as Half Day (no check-in time)';
          }

          // Check if date is a Sunday or Holiday when there's no working hours
          if (totalHour === 0 && !approvedRequest) {
            const recordDate = new Date(isoDate);
            const dayOfWeek = recordDate.getDay(); // 0 = Sunday
            
            // Check if it's a Sunday (Weekly Off)
            if (dayOfWeek === 0) {
              typeOfPresence = 'Holiday';
              finalValue = 0;
              remarksStr = 'Weekly Off (Sunday)';
            } else {
              // Check if it's a Holiday
              const holiday = await Holiday.findOne({ date: isoDate, isActive: true });
              if (holiday) {
                typeOfPresence = 'Holiday';
                finalValue = 0;
                remarksStr = holiday.name;
              }
            }
          }
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
                     finalEditedCheckin = approvedRequest.startTime;
                     finalEditedCheckout = approvedRequest.endTime;
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
                     finalValue = 0.5; 
                     finalHalfDay = true;
                 } else {
                     finalValue = 1;
                 }
             }
          }

          // Special handling for Article employees
          const isArticleEmployee = user && (user.employmentType === 'article' || user.designation?.toLowerCase() === 'article');
          if (isArticleEmployee) {
            // Article employees are treated as full-time
            // Even with 00:00 times, they should be marked as present (not absent)
            // But preserve Holiday status for Sundays/holidays
            if (finalTotalHour === 0 && typeOfPresence !== 'Holiday') {
              finalValue = 0; // Treat as present
              typeOfPresence = 'ThumbMachine';
            }
            
            // Determine half-day for Article employees: arrive after 1:00 PM or spent less than 3:30 hours
            // Skip half-day calculation if times are 00:00
            if (finalCheckin !== '00:00' || finalCheckout !== '00:00') {
              const isAfter1PM = finalCheckin ? finalCheckin >= '13:00' : false;
              finalHalfDay = isAfter1PM || finalTotalHour < 3.5;
            }
          }

          // Ensure half-day is NOT set when both check-in and check-out are invalid/00:00
          const bothTimesInvalid = (!finalCheckin || finalCheckin === '00:00') && (!finalCheckout || finalCheckout === '00:00');
          if (bothTimesInvalid) {
            finalHalfDay = false;
          }

          attendance.records.set(isoDate, {
            checkin: finalCheckin,
            checkout: finalCheckout,
            editedCheckin: finalEditedCheckin,
            editedCheckout: finalEditedCheckout,
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

      // Increment leave balance for users who got their FIRST attendance record for this month
      // Only increment if attendance didn't exist before for that user-month combination
      // Only increment for months >= January 2026 (2026-01)
      try {
        const now = new Date();
        let incrementedCount = 0;
        
        // Process only users who had NEW attendance created (not updates to existing)
        for (const userMonthKey of newAttendanceUserMonths) {
          const [userId, monthYear] = userMonthKey.split('_');
          
          // Skip leave increment for months before January 2026
          if (monthYear < '2026-01') {
            console.log(`Skipping leave increment for ${userId} - month ${monthYear} is before Jan 2026`);
            continue;
          }
          
          const user = await User.findById(userId);
          if (!user || !user.isActive) continue;
          
          // Skip leave balance increment for articles - check both employmentType and designation
          const designationLower = (user.designation || '').toLowerCase();
          const employmentTypeLower = (user.employmentType || '').toLowerCase();
          const isArticle = employmentTypeLower.includes('article') || designationLower.includes('article');
          if (isArticle) continue;
          
          const currentEarned = user.leaveBalance?.earned || 0;
          const currentUsed = user.leaveBalance?.used || 0;
          const currentUsedAfterJan26 = user.leaveBalance?.usedAfterJan26 || 0;
          const currentBalanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
          
          // Increment earned by 2 for non-articles (first time attendance for this month)
          const increment = 2;
          const newEarned = currentEarned + increment;
          const newRemaining = currentBalanceAsOfJan26 + newEarned - currentUsed - currentUsedAfterJan26;
          
          await User.findByIdAndUpdate(user._id, {
            'leaveBalance.earned': newEarned,
            'leaveBalance.remaining': newRemaining,
            'leaveBalance.lastUpdated': now,
            'leaveBalance.monthlyEarned': 2,
          });
          incrementedCount++;
        }
        console.log(`Leave balance incremented for ${incrementedCount} users (first time attendance upload for month >= Jan 2026)`);
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
// Helper to get scheduled times for a user on a specific date
function getScheduledTimes(user: IUser | null | undefined, dateStr: string): { inTime: string; outTime: string; isHoliday: boolean; isHalfDay: boolean } {
  if (!user) {
    console.log(`[getScheduledTimes] No user provided for date ${dateStr}, using default 09:00-18:00`);
    return { inTime: '09:00', outTime: '18:00', isHoliday: false, isHalfDay: false };
  }

  const date = new Date(dateStr);
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Try to use the user's schedules array (new structure)
  if (user.schedules && Array.isArray(user.schedules)) {
    // Find the most recent schedule entry effective on or before this date
    const normalizeDate = (d: any) => {
      if (!d) return new Date('1900-01-01');
      if (d instanceof Date) return d;
      if (typeof d === 'string') return new Date(d);
      if (typeof d === 'object' && d.$date) return new Date(d.$date);
      return new Date(d);
    };
    console.log(`[getScheduledTimes] User: ${user.name} (${user._id}), Date: ${dateStr}, Checking schedules:`);
    user.schedules.forEach((entry, idx) => {
      const eff = entry.effectiveFrom;
      const effNorm = normalizeDate(eff);
      console.log(`  [${idx}] effectiveFrom:`, eff, `(type: ${typeof eff}), normalized: ${effNorm.toISOString()}, compare to: ${date.toISOString()}`);
    });
    const applicableEntry = user.schedules
      .filter(entry => {
        const eff = normalizeDate(entry.effectiveFrom);
        return eff <= date;
      })
      .sort((a, b) => {
        const aEff = normalizeDate(a.effectiveFrom);
        const bEff = normalizeDate(b.effectiveFrom);
        return bEff.getTime() - aEff.getTime();
      })[0];
    if (applicableEntry) {
      const effNorm = normalizeDate(applicableEntry.effectiveFrom);
      console.log(`[getScheduledTimes] User: ${user.name} (${user._id}), Date: ${dateStr}, Selected applicableEntry effectiveFrom: ${applicableEntry.effectiveFrom} (normalized: ${effNorm.toISOString()})`);
    } else {
      console.log(`[getScheduledTimes] User: ${user.name} (${user._id}), Date: ${dateStr}, No applicableEntry found (all effectiveFrom > date)`);
    }
    if (applicableEntry && applicableEntry.daily) {
      const daily = applicableEntry.daily;
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
      type DayName = typeof dayNames[number];
      const dayName = dayNames[dayOfWeek] as DayName;
      let daySchedule = daily[dayName as keyof typeof daily];
      // If no specific day schedule, fallback to Monday for weekdays
      if ((!daySchedule || !daySchedule.inTime) && dayOfWeek >= 1 && dayOfWeek <= 5) {
        daySchedule = daily['monday'];
      }
      if (daySchedule) {
        console.log(`[getScheduledTimes] User: ${user.name} (${user._id}), Date: ${dateStr}, Using schedule from entry effective ${applicableEntry.effectiveFrom}, Day: ${dayName}, In: ${daySchedule.inTime}, Out: ${daySchedule.outTime}`);
        return {
          inTime: daySchedule.inTime || '09:00',
          outTime: daySchedule.outTime || '18:00',
          isHoliday: daySchedule.isHoliday || false,
          isHalfDay: daySchedule.isHalfDay || false,
        };
      } else {
        console.log(`[getScheduledTimes] User: ${user.name} (${user._id}), Date: ${dateStr}, No daySchedule found for day: ${dayName}, entry effective: ${applicableEntry.effectiveFrom}`);
      }
    } else {
      console.log(`[getScheduledTimes] User: ${user.name} (${user._id}), Date: ${dateStr}, No applicableEntry.daily found`);
    }
  }

  // Fallback to legacy schedule fields if schedules array is not set
  // (This logic is unchanged, but only used if no schedules array)
  const month = date.getMonth() + 1; // 1-12
  let inTime = '09:00';
  let outTime = '18:00';
  let isHoliday = false;
  let isHalfDay = false;

  if (month === 12 || month === 1) {
    inTime = user.scheduleInOutTimeMonth?.inTime || '09:00';
    outTime = user.scheduleInOutTimeMonth?.outTime || '18:00';
    isHoliday = user.scheduleInOutTimeMonth?.isHoliday || false;
    isHalfDay = user.scheduleInOutTimeMonth?.isHalfDay || false;
  } else if (dayOfWeek === 6) { // Saturday
    inTime = user.scheduleInOutTimeSat?.inTime || '09:00';
    outTime = user.scheduleInOutTimeSat?.outTime || '18:00';
    isHoliday = user.scheduleInOutTimeSat?.isHoliday || false;
    isHalfDay = user.scheduleInOutTimeSat?.isHalfDay || false;
  } else if (dayOfWeek !== 0) { // Regular (Mon-Fri)
    inTime = user.scheduleInOutTime?.inTime || '09:00';
    outTime = user.scheduleInOutTime?.outTime || '18:00';
    isHoliday = user.scheduleInOutTime?.isHoliday || false;
    isHalfDay = user.scheduleInOutTime?.isHalfDay || false;
  } else { // Sunday
    inTime = user.scheduleInOutTime?.inTime || '09:00';
    outTime = user.scheduleInOutTime?.outTime || '18:00';
    isHoliday = user.scheduleInOutTime?.isHoliday || true; // Sunday default holiday
    isHalfDay = user.scheduleInOutTime?.isHalfDay || false;
  }

  console.log(`[getScheduledTimes] User: ${user.name} (${user._id}), Date: ${dateStr}, FALLBACK to legacy/default. In: ${inTime}, Out: ${outTime}`);
  return { inTime, outTime, isHoliday, isHalfDay };
}

// Helper to convert time string to minutes
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function calculateSummary(
  records: Map<string, {
    checkin: string;
    checkout: string;
    editedCheckin?: string;
    editedCheckout?: string;
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
    // Attach scheduled times for this day
    let scheduledInTime = '';
    let scheduledOutTime = '';
    let isHoliday = false;
    let isHalfDay = false;
    if (user) {
      const schedule = getScheduledTimes(user, dateStr);
      scheduledInTime = schedule.inTime;
      scheduledOutTime = schedule.outTime;
      isHoliday = schedule.isHoliday;
      isHalfDay = schedule.isHalfDay;
    }
    // Calculate excess/short for the day (same as daywise/export logic)
    let presentAbsent = 'Absent';
    const inTime = String(record.editedCheckin ?? record.checkin ?? '').trim();
    const outTime = String(record.editedCheckout ?? record.checkout ?? '').trim();
    if (
      (record.typeOfPresence === 'Present - outstation') ||
      (record.typeOfPresence === 'WFH - weekdays') ||
      (record.typeOfPresence === 'WFH - weekoff') ||
      (inTime !== '00:00' && outTime !== '00:00')
    ) {
      presentAbsent = 'Present';
    }
    let dayExcess = 0;
    // Set excess = 0 for Sundays and Holidays
    if (record.typeOfPresence === 'Holiday') {
      dayExcess = 0;
    } else if (presentAbsent === 'Absent' && scheduledInTime && scheduledOutTime && scheduledInTime !== '00:00' && scheduledOutTime !== '00:00') {
      const [schInH, schInM] = scheduledInTime.split(':').map(Number);
      const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
      const schInMin = schInH * 60 + schInM;
      const schOutMin = schOutH * 60 + schOutM;
      const scheduledMinutes = schOutMin - schInMin >= 0 ? schOutMin - schInMin : (24 * 60 + schOutMin - schInMin);
      dayExcess = -scheduledMinutes / 60;
    } else if (scheduledInTime && scheduledOutTime && scheduledInTime !== '00:00' && scheduledOutTime !== '00:00' && inTime && outTime && inTime !== '00:00' && outTime !== '00:00') {
      const [schInH, schInM] = scheduledInTime.split(':').map(Number);
      const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
      const [actInH, actInM] = inTime.split(':').map(Number);
      const [actOutH, actOutM] = outTime.split(':').map(Number);
      const schInMin = schInH * 60 + schInM;
      const schOutMin = schOutH * 60 + schOutM;
      const actInMin = actInH * 60 + actInM;
      const actOutMin = actOutH * 60 + actOutM;
      const scheduledMinutes = schOutMin - schInMin >= 0 ? schOutMin - schInMin : (24 * 60 + schOutMin - schInMin);
      const actualMinutes = actOutMin - actInMin >= 0 ? actOutMin - actInMin : (24 * 60 + actOutMin - actInMin);
      let isArticle = false;
      if (user && user.designation && user.designation.toLowerCase() === 'article') {
        isArticle = true;
      }
      if (actualMinutes < scheduledMinutes) {
        dayExcess = -(scheduledMinutes - actualMinutes) / 60;
      } else if (actualMinutes > scheduledMinutes) {
        if (isArticle) {
          let excess = 0;
          if (actInH * 60 + actInM < schInH * 60 + schInM) {
            excess += (schInH * 60 + schInM) - (actInH * 60 + actInM);
          }
          if (actOutH * 60 + actOutM > schOutH * 60 + schOutM) {
            const late = (actOutH * 60 + actOutM) - (schOutH * 60 + schOutM);
            if (late > 30) excess += late;
          }
          dayExcess = excess > 0 ? excess / 60 : 0;
        } else {
          dayExcess = (actualMinutes - scheduledMinutes) / 60;
        }
      } else {
        dayExcess = 0;
      }
    } else {
      dayExcess = 0;
    }
    // Update record's totalHour
    record.totalHour = calculateTotalHours(inTime, outTime);
    // Update record's excessHour
    record.excessHour = Number(dayExcess.toFixed(2));
    totalHour += record.totalHour;
    excessHour += record.excessHour;
    // ...existing halfday/late/present/absent/leave logic...
    // Determine half-day based on employmentType (only for summary calculation, don't override individual record flags)
    let calculatedHalfDay = record.halfDay || false; // Use existing halfDay flag if already set
    if (!record.halfDay) { // Only recalculate if not already set
      // Special case: if inTime is 00:00 but outTime is valid, mark as half day
      if (inTime === '00:00' && outTime !== '00:00' && outTime !== '' && record.totalHour > 0) {
        calculatedHalfDay = true;
      } else if ((inTime === '00:00' && outTime === '00:00') ||
          (record.editedCheckin === '' && record.editedCheckout === '')) {
        calculatedHalfDay = false;
      } else {
        const employmentType = user?.employmentType || 'fulltime';
        const designation = user?.designation?.toLowerCase();
        const isArticle = employmentType === 'article' || designation === 'article';
        const isAfter1PM = inTime ? inTime >= '13:00' : false;
        if (employmentType === 'fulltime' && !isArticle) {
          // Half day if arrive after 1:30 PM or spent less than 6.5 hours
          calculatedHalfDay = isAfter1PM || record.totalHour < 6.5;
        } else if (employmentType === 'halftime') {
          // Can come anytime, half day if spent less than 60% of scheduled time
          const scheduledHours = scheduledInTime && scheduledOutTime ? calculateTotalHours(scheduledInTime, scheduledOutTime) : 0;
          const requiredHours = scheduledHours * 0.6;
          calculatedHalfDay = record.totalHour < requiredHours;
        } else if (isArticle) {
          // Half day if arrive after 1:00 PM or spent less than 3:30 hours
          calculatedHalfDay = isAfter1PM || record.totalHour < 3.5;
        }
      }
      // Update the record's halfDay flag only if it wasn't already set
      record.halfDay = calculatedHalfDay;
    }
    if (calculatedHalfDay) {
      totalHalfDay++;
    }
    // Late arrival: if inTime > scheduled in
    if (inTime && scheduledInTime && inTime > scheduledInTime) {
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
