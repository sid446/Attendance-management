import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import AttendanceRequest from '@/models/AttendanceRequest';
import User, { IUser } from '@/models/User';
import Holiday from '@/models/Holiday';
import { calculateLeaveUsageForMultipleDays, updateLeaveBalanceOnApproval, reconcilePartialLeaveFromAttendance } from '@/lib/leaveManagement';
import { getScheduledTimes } from '@/lib/scheduleUtils';

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
      .populate('userId', 'name employeeId odId employeeCode email department team designation workingUnderPartner paidFrom category schedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth')
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

    // Debug: Log the summaries to ensure they are present
    if (serialized.length > 0) {
      console.log(`[DEBUG] Fetched ${serialized.length} attendance records. First summary:`, JSON.stringify(serialized[0].summary));
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
      // Track uploaded absent/leave candidates by user for paid-leave allocation.
      const uploadedLeaveCandidates = new Map<string, Set<string>>();
      // Track uploaded dates by user to reconcile partial leave deductions idempotently.
      const uploadedPartialReconcileDates = new Map<string, Set<string>>();
      // Track user-month combinations where attendance is being created for the first time
      const newAttendanceUserMonths = new Set<string>();

      // Pre-fetch all users and holidays for efficient in-memory matching
      const allUsers = await User.find({}).select('name _id odId employeeCode designation category employmentType schedules seasonalSchedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth');
      const allHolidays = await Holiday.find({ isActive: true });
      
      // Helper to strip non-alphanumeric characters for fuzzy matching
      const normalizeForMatch = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      for (const rec of records) {
        try {
          const odId = String(rec.id || rec.employeeCode || 'UNKNOWN');
          const recName = rec.name ? String(rec.name).trim() : (rec.employeeName ? String(rec.employeeName).trim() : '');
          const fixedPresenceCode = String(rec.presentAbsent || rec.statusCode || '').trim();
          const isFixedDataUpload = Boolean(rec.fixedData) || fixedPresenceCode.length > 0;

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

          // Preserve old state to avoid double-deducting leave on re-uploads.
          const existingRecordBeforeUpdate = attendance.records.get(isoDate);

          let checkin = normalizeTimeToHHmm(rec.inTime || rec.actualInTime);
          let checkout = normalizeTimeToHHmm(rec.outTime || rec.actualOutTime);

          // MERGE LOGIC: If a record already exists for this date, merge raw times before processing
          // Keep earliest In, Latest Out
          let wasMerged = false;
          if (existingRecordBeforeUpdate) {
            const oldIn = existingRecordBeforeUpdate.checkin || '00:00';
            const oldOut = existingRecordBeforeUpdate.checkout || '00:00';
            
            if (oldIn !== '00:00' && (checkin === '00:00' || oldIn < checkin)) {
              checkin = oldIn;
              wasMerged = true;
            } else if (oldIn === '00:00' && checkin !== '00:00') {
              // checkin is already new value
            } else if (oldIn !== '00:00' && checkin !== '00:00' && oldIn < checkin) {
               checkin = oldIn;
               wasMerged = true;
            }

            if (oldOut !== '00:00' && (checkout === '00:00' || oldOut > checkout)) {
              checkout = oldOut;
              wasMerged = true;
            } else if (oldOut === '00:00' && checkout !== '00:00') {
              // checkout is already new value
            } else if (oldOut !== '00:00' && checkout !== '00:00' && oldOut > checkout) {
               checkout = oldOut;
               wasMerged = true;
            }
          }

          // Anomaly Detection: If checkin is late (>= 16:00) AND checkout is 00:00/empty,
          // person likely only punched OUT, so the checkin value is actually the exit time.
          // Swap: move checkin to checkout, set checkin to 00:00
          const isCheckinLate = checkin >= '16:00';
          const isCheckoutMissing = checkout === '00:00' || checkout === '';
          let exitOnlyPunchDetected = false;
          if (!isFixedDataUpload && isCheckinLate && isCheckoutMissing) {
            // Swap: the "checkin" is actually the checkout time
            checkout = checkin;
            checkin = '00:00';
            exitOnlyPunchDetected = true;
          }

          // For Excel uploads, edited times are initially set to same as original times
          const editedCheckin = checkin;
          const editedCheckout = checkout;

          // Use edited times for calculations
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
          let typeOfPresence = 'ThumbMachine';
          let finalCheckin = checkin;
          let finalCheckout = checkout;
          let finalEditedCheckin = editedCheckin; 
          let finalEditedCheckout = editedCheckout; 
          let finalTotalHour = totalHour;
          let finalValue = totalHour > 0 ? 1 : 0;
          let finalHalfDay = false;
          let remarksStr = wasMerged ? '(Merged from multiple uploads)' : '';

          if (isFixedDataUpload) {
            const mappedType = rec.typeOfPresence ? String(rec.typeOfPresence).trim() : mapFixedPresenceCodeToType(fixedPresenceCode);
            typeOfPresence = mappedType || 'Absent';
            finalTotalHour = calculateTotalHours(finalCheckin, finalCheckout);
            const uploadedValueRaw = rec.value;
            const uploadedValue = typeof uploadedValueRaw === 'number' ? uploadedValueRaw : Number(uploadedValueRaw);
            const hasUploadedValue = Number.isFinite(uploadedValue);
            const normalizedFixedCode = fixedPresenceCode.toUpperCase();
            const isWFHFixedType =
              normalizedFixedCode === 'WFH' ||
              normalizedFixedCode === 'WO-WFH' ||
              typeOfPresence === 'WFH - weekdays' ||
              typeOfPresence === 'WFH - weekoff' ||
              typeOfPresence === 'Work From Home (WFH)' ||
              typeOfPresence === 'Weekly Off - Work From Home (WO-WFH)';
            const isOutStationFixedType =
              normalizedFixedCode === 'OS-P' ||
              typeOfPresence === 'Onsite Presence (OS-P)' ||
              typeOfPresence === 'Present - Outstation (Weekdays)' ||
              typeOfPresence === 'Present - Outstation (Weekoff)' ||
              typeOfPresence === 'Present - outstation';

            if (hasUploadedValue && (isWFHFixedType || isOutStationFixedType)) {
              finalValue = uploadedValue;
            } else {
              finalValue = getPresenceValueByType(typeOfPresence);
            }
            finalHalfDay = typeOfPresence === 'Half Day - weekdays' || typeOfPresence === 'Half Day - weekoff' || typeOfPresence === 'Half Day (HD)';
            if (typeOfPresence === 'Holiday' || typeOfPresence === 'Sunday' || typeOfPresence === 'Weekoff' || typeOfPresence === 'Absent') {
              finalTotalHour = 0;
            }
            remarksStr = (fixedPresenceCode ? `Fixed upload status: ${fixedPresenceCode}` : '') + (wasMerged ? ' (Merged)' : '');
          }

          // Special case: if checkin is 00:00 but checkout is valid, mark as half day
          if (finalCheckin === '00:00' && finalCheckout !== '00:00' && finalCheckout !== '' && finalTotalHour > 0) {
            finalHalfDay = true;
            finalValue = 0.5;
            remarksStr += (remarksStr ? ' | ' : '') + (exitOnlyPunchDetected ? 'Exit-only punch detected' : 'No check-in time');
          }

          // Check if date is a Sunday or Holiday
          if (!approvedRequest) {
            const recordDate = new Date(isoDate);
            const dayOfWeek = recordDate.getDay(); // 0 = Sunday
            const holiday = allHolidays.find(h => h.date === isoDate);

            if (dayOfWeek === 0 || holiday) {
              const holidayName = holiday ? holiday.name : 'Weekly Off (Sunday)';
              // Determine presence: machine logs use hours, fixed uploads may use presence value
              const isPresent = totalHour > 0 || finalValue > 0;

              if (isPresent) {
                // If present on a holiday/Sunday, assign the weekoff presence type
                // For fixed uploads, only do this if the original code was "PRESENT" or "P"
                const originalCodeLower = fixedPresenceCode.toLowerCase();
                const isGenericPresent = !isFixedDataUpload || originalCodeLower === 'present' || originalCodeLower === 'p';

                if (isGenericPresent && 
                    !typeOfPresence.toLowerCase().includes('weekoff') && 
                    !typeOfPresence.toLowerCase().includes('sunday') && 
                    !typeOfPresence.toLowerCase().includes('holiday')) {
                  typeOfPresence = 'Present - in office - weekoff';
                  finalValue = 1;
                }
              } else {
                typeOfPresence = 'Holiday';
                finalValue = 0;
              }
              
              if (!remarksStr.includes(holidayName)) {
                remarksStr += (remarksStr ? ' | ' : '') + holidayName;
              }
            }
          }
          // Override if Approved Request Exists
          if (!isFixedDataUpload && approvedRequest) {
             let requestTotalHour = 0;
             if (approvedRequest.startTime && approvedRequest.endTime) {
                 const [h1, m1] = String(approvedRequest.startTime).split(':').map(Number);
                 const [h2, m2] = String(approvedRequest.endTime).split(':').map(Number);
                 if (!isNaN(h1) && !isNaN(m1) && !isNaN(h2) && !isNaN(m2)) {
                    const minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
                    requestTotalHour = Math.max(0, Math.round((minutes / 60) * 100) / 100);
                 }
             }
             
             if (totalHour > requestTotalHour) {
                 typeOfPresence = 'Present'; 
                 remarksStr += (remarksStr ? ' | ' : '') + `Present (Machine ${totalHour}h > Request ${requestTotalHour}h)`;
                 finalValue = 1;
             } else {
                 typeOfPresence = approvedRequest.requestedStatus;
                 remarksStr += (remarksStr ? ' | ' : '') + `Overridden by Approved Request: ${approvedRequest.requestedStatus}`;

                 if (approvedRequest.startTime && approvedRequest.endTime) {
                     finalCheckin = approvedRequest.startTime;
                     finalCheckout = approvedRequest.endTime;
                     finalEditedCheckin = approvedRequest.startTime;
                     finalEditedCheckout = approvedRequest.endTime;
                     finalTotalHour = requestTotalHour;
                 } else {
                     const isLeaveType = ['On leave', 'Absent'].includes(approvedRequest.requestedStatus);
                     if (isLeaveType) {
                         finalCheckin = '';
                         finalCheckout = '';
                         finalTotalHour = 0;
                     }
                 }

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

          // Special handling for Article employees (case-insensitive employmentType)
          const empTypeStr = String(user?.employmentType || '').toLowerCase();
          const isArticleEmployee = user && (empTypeStr === 'article' || user.designation?.toLowerCase() === 'article');
          if (!isFixedDataUpload && isArticleEmployee) {
            if (finalTotalHour === 0 && typeOfPresence !== 'Holiday') {
              finalValue = 0;
              typeOfPresence = 'ThumbMachine';
            }
            if (finalCheckin !== '00:00' || finalCheckout !== '00:00') {
              const isAfter1PM = finalCheckin ? finalCheckin >= '13:00' : false;
              finalHalfDay = isAfter1PM || finalTotalHour < 3.5;
              if (finalHalfDay) finalValue = 0.5;
            }
          }

          // Special handling for halftime employees (accept case variants like 'half', 'half-time')
          // Also exempting Partners from half-day/late marking
          const isPartner = user && (user.category === 'Partner' || (user.designation && user.designation.toLowerCase().includes('partner')));
          const isHalftimeEmployee = user && (empTypeStr === 'halftime' || empTypeStr.includes('half') || isPartner);
          if (isHalftimeEmployee) {
            const inMissing = !finalCheckin || finalCheckin === '00:00';
            const outMissing = !finalCheckout || finalCheckout === '00:00';
            
            if (inMissing && outMissing) {
              // Only mark as Absent if not a holiday/weekly off
              if (typeOfPresence !== 'Holiday' && typeOfPresence !== 'Sunday' && typeOfPresence !== 'Weekoff' && !typeOfPresence.includes('Present')) {
                finalValue = 0;
                finalHalfDay = false;
                typeOfPresence = 'Absent';
              }
            } else {
              // Halftime employees are full present (value 1) if they have any punch, and never half-day
              finalValue = 1;
              finalHalfDay = false;
              // If current type is a half-day or absent variant, normalize to Present
              if (!typeOfPresence || typeOfPresence.includes('Half Day') || typeOfPresence === 'Absent' || typeOfPresence === 'ThumbMachine') {
                typeOfPresence = 'Present';
              }
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

          // If this date was previously a paid 'On leave' but the new upload
          // changed it to a non-leave type, remove earlier paid-leave transactions
          // so ledger and snapshots reflect the corrected status.
          try {
            const prev = existingRecordBeforeUpdate;
            const wasOnLeave = prev && (String(prev.typeOfPresence || '').toLowerCase().includes('leave') || Number(prev.value || 0) >= 1);
            const nowIsLeave = (typeOfPresence === 'On leave' || typeOfPresence === 'Absent');
            if (wasOnLeave && !nowIsLeave) {
              try {
                const lm = await import('@/lib/leaveManagement');
                await lm.removePaidLeaveForDate(user._id, isoDate);
                console.log(`[LEAVE DEBUG] Removed prior paid-leave transactions for ${user._id} on ${isoDate} due to re-upload change`);
              } catch (e) {
                console.error('Failed to remove prior paid-leave transactions on re-upload:', e);
              }
            }
          } catch (e) {
            console.error('Error while checking/removing prior leave transactions on upload:', e);
          }

          // Collect absent/leave days that were newly uploaded and not already paid leave.
          const isLeaveCandidateType = typeOfPresence === 'Absent' || typeOfPresence === 'On leave';
          const wasAlreadyPaidLeave = Boolean(
            existingRecordBeforeUpdate &&
            existingRecordBeforeUpdate.typeOfPresence === 'On leave' &&
            Number(existingRecordBeforeUpdate.value || 0) >= 1
          );
          if (isLeaveCandidateType && !wasAlreadyPaidLeave) {
            const key = String(user._id);
            if (!uploadedLeaveCandidates.has(key)) {
              uploadedLeaveCandidates.set(key, new Set<string>());
            }
            uploadedLeaveCandidates.get(key)?.add(isoDate);
          }

          // Always track uploaded dates so partial leave deductions can be reconciled
          // (including reducing previously deducted partial leave on re-uploads).
          const partialKey = String(user._id);
          if (!uploadedPartialReconcileDates.has(partialKey)) {
            uploadedPartialReconcileDates.set(partialKey, new Set<string>());
          }
          uploadedPartialReconcileDates.get(partialKey)?.add(isoDate);

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

            // Also ensure Sundays (weekly off) are added as Holiday records
            try {
              const [yStr, mStr] = sampleRecord.monthYear.split('-');
              const yNum = parseInt(yStr, 10);
              const mNum = parseInt(mStr, 10); // 1-based month
              // days in month
              const daysInMonth = new Date(yNum, mNum, 0).getDate();

              for (let d = 1; d <= daysInMonth; d++) {
                const dd = String(d).padStart(2, '0');
                const mm = String(mNum).padStart(2, '0');
                const dateKey = `${yNum}-${mm}-${dd}`;

                // If already present, skip
                const existing = attendance.records.get(dateKey);
                if (existing) continue;

                const dateObj = new Date(dateKey);
                if (dateObj.getDay() === 0) { // Sunday
                  attendance.records.set(dateKey, {
                    checkin: '00:00',
                    checkout: '00:00',
                    totalHour: 0,
                    excessHour: 0,
                    typeOfPresence: 'Holiday',
                    halfDay: false,
                    value: 0,
                    remarks: 'Weekly Off (Sunday)',
                  });

                  processed.push({
                    odId: user.odId || user._id.toString(),
                    userId: user._id.toString(),
                    monthYear: sampleRecord.monthYear,
                    date: dateKey,
                    createdUser: false,
                  });
                }
              }
            } catch (sundayErr) {
              console.error('Error adding Sunday weekly-off records:', sundayErr);
            }

            // Recalculate summary after adding holidays
            attendance.summary = calculateSummary(attendance.records as any, user);
            await attendance.save();
          }
        }
      }

      // Apply leave-credit allocation for uploaded Absent/On leave days:
      // earliest dates consume leave first; paid ones become On leave, rest stay Absent.
      if (uploadedLeaveCandidates.size > 0) {
        for (const [userId, dateSet] of uploadedLeaveCandidates.entries()) {
          try {
            const dates = Array.from(dateSet).sort();
            if (dates.length === 0) continue;

            const user = allUsers.find(u => String(u._id) === userId);
            if (!user) continue;

            const leaveCalc = await calculateLeaveUsageForMultipleDays(user._id as any, dates, 'On leave');
            const details = leaveCalc?.leaveDetails || [];
            if (details.length === 0) continue;

            const detailByDate = new Map(details.map(d => [d.date, d]));
            const attendanceByMonth = new Map<string, any>();
            const paidDetails: Array<{ date: string; isPaidLeave: boolean; value: number }> = [];

            for (const date of dates) {
              const monthYear = date.slice(0, 7);
              let attendance = attendanceByMonth.get(monthYear);
              if (!attendance) {
                attendance = await Attendance.findOne({ userId: user._id, monthYear });
                if (attendance) {
                  attendanceByMonth.set(monthYear, attendance);
                }
              }
              if (!attendance) continue;

              const rec = attendance.records.get(date);
              if (!rec) continue;

              const detail = detailByDate.get(date);
              const isPaidLeave = Boolean(detail?.isPaidLeave && Number(detail?.value || 0) >= 1);

              rec.typeOfPresence = isPaidLeave ? 'On leave' : 'Absent';
              rec.value = isPaidLeave ? 1 : 0;
              rec.halfDay = false;
              attendance.records.set(date, rec);

              if (isPaidLeave) {
                paidDetails.push({ date, isPaidLeave: true, value: 1 });
              }
            }

            for (const attendance of attendanceByMonth.values()) {
              attendance.summary = calculateSummary(attendance.records as any, user as any);
              await attendance.save();
            }

            if (paidDetails.length > 0) {
              await updateLeaveBalanceOnApproval(user._id as any, paidDetails as any);
            }
          } catch (leaveApplyErr) {
            console.error('Error applying uploaded leave allocation for user', userId, leaveApplyErr);
          }
        }
      }

      // Reconcile partial leave for weekday WFH/HD records based on value shortfall.
      // Example: value 0.8 -> leave deduction 0.2 for that date.
      if (uploadedPartialReconcileDates.size > 0) {
        for (const [userId, dateSet] of uploadedPartialReconcileDates.entries()) {
          try {
            const user = allUsers.find(u => String(u._id) === userId);
            if (!user) continue;

            const dates = Array.from(dateSet).sort();
            const attendanceByMonth = new Map<string, any>();
            const partialEntries: Array<{ date: string; amount: number }> = [];

            for (const date of dates) {
              const monthYear = date.slice(0, 7);
              let attendance = attendanceByMonth.get(monthYear);
              if (!attendance) {
                attendance = await Attendance.findOne({ userId: user._id, monthYear });
                if (attendance) {
                  attendanceByMonth.set(monthYear, attendance);
                }
              }
              if (!attendance) continue;

              const rec = attendance.records.get(date);
              if (!rec) continue;

              const day = new Date(date).getDay();
              const isWeekday = day >= 1 && day <= 5;
              const type = String(rec.typeOfPresence || '');
              const isEligibleType = type === 'WFH - weekdays' || type === 'Half Day - weekdays' || type === 'Half Day (HD)';

              const rawValue = Number(rec.value);
              const normalizedValue = Number.isFinite(rawValue) ? Math.min(1, Math.max(0, rawValue)) : 0;
              const amount = isWeekday && isEligibleType
                ? Math.round((1 - normalizedValue) * 100) / 100
                : 0;

              partialEntries.push({ date, amount: Math.max(0, amount) });
            }

            if (partialEntries.length > 0) {
              await reconcilePartialLeaveFromAttendance(user._id as any, partialEntries);
            }
          } catch (partialErr) {
            console.error('Error reconciling partial leave for uploaded records for user', userId, partialErr);
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



// Helper to convert time string to minutes
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function mapFixedPresenceCodeToType(codeRaw: string): string {
  const code = String(codeRaw || '').trim().toUpperCase();
  switch (code) {
    case 'PRESENT':
      return 'Present - in office - weekdays';
    case 'WO-PRESENT':
      return 'Present - in office - weekoff';
    case 'HD':
      return 'Half Day - weekdays';
    case 'OS-P':
      return 'Present - ClientPlace (Weekdays)';
    case 'WO-HD':
      return 'Half Day - weekoff';
    case 'WFH':
      return 'WFH - weekdays';
    case 'WO-WFH':
      return 'WFH - weekoff';
    case 'SUN':
      return 'Sunday';
    case 'A':
      return 'Absent';
    case 'WEEKOFF':
      return 'Weekoff';
    case 'OHD-P':
      return 'Present - in office - weekoff';
    case 'OHD':
      return 'Holiday';
    default:
      return String(codeRaw || '').trim();
  }
}

function getPresenceValueByType(typeOfPresence: string): number {
  if (!typeOfPresence) return 0;
  if (typeOfPresence === 'Absent' || typeOfPresence === 'Holiday' || typeOfPresence === 'Sunday' || typeOfPresence === 'Weekoff') return 0;
  if (typeOfPresence === 'Half Day - weekdays' || typeOfPresence === 'Half Day - weekoff' || typeOfPresence === 'Half Day (HD)') return 0.5;
  if (typeOfPresence === 'On leave' || typeOfPresence === 'Leave') return 0;
  return 1;
}

function shouldExcludeFromSummaryHours(typeOfPresence: string, dateStr: string): boolean {
  const day = new Date(dateStr).getDay();
  if (day === 0) return true;

  const excluded = new Set<string>([
    'Holiday',
    'Sunday',
    'Weekoff',
    'Absent',
    'On leave',
    'Leave',
    'WFH - weekdays',
    'WFH - weekoff',
    'Work From Home (WFH)',
    'Weekly Off - Work From Home (WO-WFH)',
    'Onsite Presence (OS-P)',
    'Present - ClientPlace (Weekdays)',
    'Present - ClientPlace (Weekoff)',
    'Present - client place',
    'Present - outstation',
    'Present - Outstation (Weekdays)',
    'Present - Outstation (Weekoff)',
    'Present - in office - weekoff',
    'Present - weekoff',
    'Weekly Off - Present (WO-Present)',
    'Half Day - weekoff',
    'Weekoff - special allowance',
  ]);

  return excluded.has(typeOfPresence);
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
    value?: number;
    remarks?: string;
  }>,
  user?: IUser | null
) {
  let totalHour = 0;
  let totalLateArrival = 0;
  let excessHour = 0;
  let totalScheduledHour = 0;
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
    let dayScheduledHours = 0;
    if (scheduledInTime && scheduledOutTime && scheduledInTime !== '00:00' && scheduledOutTime !== '00:00') {
      const [schInH, schInM] = scheduledInTime.split(':').map(Number);
      const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
      const schInMin = schInH * 60 + schInM;
      const schOutMin = schOutH * 60 + schOutM;
      const scheduledMinutes = schOutMin - schInMin >= 0 ? schOutMin - schInMin : (24 * 60 + schOutMin - schInMin);
      dayScheduledHours = Number((scheduledMinutes / 60).toFixed(2));
    }
    const recordDateObj = new Date(dateStr);
    const isSundayDate = recordDateObj.getDay() === 0;
    const isNonWorkingDayRecord =
      record.typeOfPresence === 'Holiday' ||
      record.typeOfPresence === 'Sunday' ||
      record.typeOfPresence === 'Weekoff' ||
      record.typeOfPresence === 'Weekoff - special allowance' ||
      isSundayDate;
    // Set excess = 0 for non-working days (Sunday/Holiday/Weekoff)
    if (isNonWorkingDayRecord) {
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
    const includeInHoursSummary = !shouldExcludeFromSummaryHours(record.typeOfPresence, dateStr);
    if (includeInHoursSummary) {
      totalHour += record.totalHour;
      totalScheduledHour += dayScheduledHours;
    }
    // ...existing halfday/late/present/absent/leave logic...
    // Ensure holidays and Sundays are NOT treated as half-days (some uploads set halfDay=true when totalHour=0)
    if (isNonWorkingDayRecord) {
      // Force clear any half-day flag for holidays or Sundays
      record.halfDay = false;
    }

    // Determine half-day based on employmentType (only for summary calculation, don't override individual record flags)
    const employmentType = String(user?.employmentType || 'fulltime').toLowerCase();
    const designation = user?.designation?.toLowerCase();
    const isPartner = user && (user.category === 'Partner' || (user.designation && user.designation.toLowerCase().includes('partner')));
    const isHalftime = employmentType === 'halftime' || employmentType.includes('half') || isPartner;

    let calculatedHalfDay = record.halfDay || false; // Use existing halfDay flag if already set
    
    // Halftime employees are never marked as half-day
    if (isHalftime) {
      calculatedHalfDay = false;
    } else if (!record.halfDay && !isNonWorkingDayRecord) { // Only recalculate if not already set
      // Special case: if inTime is 00:00 but outTime is valid, mark as half day
      if (inTime === '00:00' && outTime !== '00:00' && outTime !== '' && record.totalHour > 0) {
        calculatedHalfDay = true;
      } else if ((inTime === '00:00' && outTime === '00:00') ||
          (record.editedCheckin === '' && record.editedCheckout === '')) {
        calculatedHalfDay = false;
      } else {
        const isArticle = employmentType === 'article' || designation === 'article';
        const isAfter1PM = inTime ? inTime >= '13:00' : false;
        if (employmentType === 'fulltime' && !isArticle) {
          // For non-articles, half day depends only on 6-hour threshold.
          calculatedHalfDay = record.totalHour < 6;
        } else if (isArticle) {
          // Half day if arrive after 1:00 PM or spent less than 3:30 hours
          calculatedHalfDay = isAfter1PM || record.totalHour < 3.5;
        }
      }
    }
    
    // Update the record's halfDay flag
    record.halfDay = calculatedHalfDay;
    if (calculatedHalfDay) {
      totalHalfDay++;
    }
    // Late arrival: if inTime > scheduled in
    const userEmpType = String(user?.employmentType || '').toLowerCase();
    if (inTime && scheduledInTime && inTime > scheduledInTime && !(userEmpType === 'halftime' || userEmpType.includes('half'))) {
      totalLateArrival++;
    }
    const t = String(record.typeOfPresence || '').toLowerCase();
    if (t === 'leave' || t === 'on leave') {
      totalLeave++;
    } else if (t === 'holiday' || t === 'sunday' || t.includes('weekoff')) {
      // Holidays/Weekoffs don't count as present/absent for the 1.0/0.5 metrics
    } else if (t === 'absent') {
      totalAbsent++;
    } else {
      // Everything else is treated as presence if there's any duration or value, else absent
      if (record.totalHour > 0 || (record.value && record.value > 0)) {
        totalPresent++;
      } else {
        totalAbsent++;
      }
    }
  });

  excessHour = Number((totalHour - totalScheduledHour).toFixed(2));

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
