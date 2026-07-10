import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import AttendanceRequest from '@/models/AttendanceRequest';
import PendingAttendance from '@/models/PendingAttendance';
import User, { IUser } from '@/models/User';
import Holiday from '@/models/Holiday';
import { normalizeForMatch } from '@/lib/attendanceNameMatch';
import {
  calculateLeaveUsage,
  calculateLeaveUsageForMultipleDays,
  updateLeaveBalanceOnApproval,
  reconcilePartialLeaveFromAttendance,
} from '@/lib/leaveManagement';
import {
  calculateTotalHours,
  isSinglePunch,
  isValidPunchTime,
  normalizeTimeToHHmm,
} from '@/lib/attendanceHours';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { reconcileApprovedRequestsForMonth } from '@/lib/applyApprovedAttendanceRequest';
import { isArticleEmployee } from '@/lib/isArticleEmployee';
import { calculateSummary } from '@/lib/attendanceSummaryCalculation';
import { hasPhysicalAttendancePresence } from '@/lib/attendancePhysicalPresence';
import { invalidateSupersededLeaveRequest } from '@/lib/invalidateSupersededLeaveRequest';
import {
  isHalftimeEmployeeForDate,
  normalizeHalftimeDayRecord,
} from '@/lib/halftimeAttendance';

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

    if (userId && monthYear) {
      await reconcileApprovedRequestsForMonth(userId, monthYear);
    }

    const populateFields =
      'name employeeId odId employeeCode email department team designation workingUnderPartner paidFrom category employmentType employmentTypeHistory schedules seasonalSchedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth';

    let attendanceRecords = await Attendance.find(query)
      .populate('userId', populateFields)
      .sort({ monthYear: -1 });

    if (userId && monthYear && attendanceRecords.length === 1) {
      const doc = attendanceRecords[0];
      const user = doc.userId as unknown as IUser | null;
      if (user) {
        let recordsChanged = false;
        const recordsMap = doc.records as Map<string, unknown>;
        recordsMap.forEach((record, dateStr) => {
          if (normalizeHalftimeDayRecord(record as import('@/lib/halftimeAttendance').HalftimeDayRecord, user, dateStr)) {
            recordsChanged = true;
          }
        });
        if (recordsChanged) {
          doc.summary = calculateSummary(doc.records as any, user);
          doc.markModified('records');
          doc.markModified('summary');
          await doc.save();
          attendanceRecords = await Attendance.find(query)
            .populate('userId', populateFields)
            .sort({ monthYear: -1 });
        }
      }
    }

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
      const pendingQueued: Array<{ odId: string; uploadName: string; isoDate: string }> = [];
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

          // 2. If still not found, queue pending attendance (same raw row) when name + date are valid
          if (!user) {
            if (!recName) {
              errors.push({ odId, reason: 'User not found: missing name in row' });
              continue;
            }
            const rawDateStr = rec.date != null ? String(rec.date) : '';
            if (!rawDateStr.trim()) {
              errors.push({ odId, reason: `User not found by Name "${recName}" — missing date` });
              continue;
            }
            const { isoDate, isoMonthYear } = normalizeExcelDate(rawDateStr);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || Number.isNaN(Date.parse(isoDate))) {
              errors.push({ odId, reason: `User not found by Name "${recName}" — invalid date` });
              continue;
            }
            try {
              const rawRecord = JSON.parse(JSON.stringify(rec)) as Record<string, unknown>;
              const nn = normalizeForMatch(recName);
              const dayPath = `records.${isoDate}`;
              await PendingAttendance.updateOne(
                { nameNormalized: nn, monthYear: isoMonthYear, status: 'pending' },
                {
                  $set: {
                    uploadName: recName,
                    nameNormalized: nn,
                    monthYear: isoMonthYear,
                    [dayPath]: { odId, rawRecord },
                    'source.uploadedAt': new Date(),
                  },
                },
                { upsert: true }
              );
              pendingQueued.push({ odId, uploadName: recName, isoDate });
            } catch (pendErr) {
              console.error('Pending attendance save failed:', pendErr);
              errors.push({
                odId,
                reason: `User not found by Name "${recName}" — could not queue pending`,
              });
            }
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

          // Use edited times for calculations (partial punches use schedule as missing boundary)
          const calculationCheckin = editedCheckin;
          const calculationCheckout = editedCheckout;
          const daySchedule = user ? getScheduledTimes(user as IUser, isoDate) : null;
          const scheduleHourOpts = daySchedule
            ? { scheduledIn: daySchedule.inTime, scheduledOut: daySchedule.outTime }
            : undefined;
          const totalHour = calculateTotalHours(
            calculationCheckin,
            calculationCheckout,
            scheduleHourOpts
          );

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
            finalTotalHour = calculateTotalHours(finalCheckin, finalCheckout, scheduleHourOpts);
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

            // NEW: Automatically fill missing times with scheduled hours for specific work types
            const isMissingTimes = (!finalCheckin || finalCheckin === '00:00' || finalCheckin === '') && 
                                   (!finalCheckout || finalCheckout === '00:00' || finalCheckout === '');
            const isRelevantType = typeOfPresence.includes('ClientPlace') || 
                                   typeOfPresence.includes('WFH') || 
                                   typeOfPresence.includes('Present - in office') ||
                                   typeOfPresence.includes('Half Day');

            if (isMissingTimes && isRelevantType && user) {
                // Get scheduled times for this date
                let sch = getScheduledTimes(user, isoDate);
                
                // If it's a holiday or Sunday, get the nearest Monday's schedule for calculation purposes
                const recordDate = new Date(isoDate);
                const isHolidayOrSunday = recordDate.getDay() === 0 || allHolidays.some(h => h.date === isoDate);
                
                if (isHolidayOrSunday) {
                    const mondayDate = new Date(isoDate);
                    const dayOfWeek = mondayDate.getDay();
                    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
                    mondayDate.setDate(mondayDate.getDate() + daysUntilMonday);
                    const mondayStr = mondayDate.toISOString().split('T')[0];
                    sch = getScheduledTimes(user, mondayStr);
                }
                
                if (sch && sch.inTime && sch.outTime && sch.inTime !== '00:00') {
                    finalCheckin = sch.inTime;
                    finalCheckout = sch.outTime;
                    finalEditedCheckin = sch.inTime;
                    finalEditedCheckout = sch.outTime;
                    
                    // Recalculate total hours based on scheduled times
                    let calculatedHours = calculateTotalHours(finalCheckin, finalCheckout, scheduleHourOpts);
                    
                    // If it's a Half Day type, set total hours to 50% of scheduled
                    if (finalHalfDay || typeOfPresence.includes('Half Day')) {
                        calculatedHours = Math.round((calculatedHours / 2) * 100) / 100;
                    }
                    
                    finalTotalHour = calculatedHours;
                    remarksStr += (remarksStr ? ' | ' : '') + 'Auto-filled scheduled times';
                }
            }
          }

          // Single punch (only in or only out): no worked hours; half-day presence
          if (!isFixedDataUpload && isSinglePunch(finalCheckin, finalCheckout)) {
            finalTotalHour = 0;
            finalHalfDay = true;
            finalValue = 0.5;
            const hasIn = isValidPunchTime(finalCheckin);
            if (!hasIn) {
              remarksStr += (remarksStr ? ' | ' : '') + (exitOnlyPunchDetected ? 'Exit-only punch detected' : 'No check-in time');
            } else {
              remarksStr += (remarksStr ? ' | ' : '') + 'No check-out time';
            }
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
                } else if (typeOfPresence === 'Present - ClientPlace (Weekdays)') {
                  typeOfPresence = 'Present - ClientPlace (Weekoff)';
                } else if (typeOfPresence === 'WFH - weekdays') {
                  typeOfPresence = 'WFH - weekoff';
                } else if (typeOfPresence === 'Half Day - weekdays') {
                  typeOfPresence = 'Half Day - weekoff';
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
          // Special handling for Article employees (case-insensitive employmentType)
          const isArticleEmployeeFlag = isArticleEmployee(user);
          if (!isFixedDataUpload && isArticleEmployeeFlag) {
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

          // Special handling for halftime employees (history-aware; partners exempt from half-day/late)
          if (isHalftimeEmployeeForDate(user, isoDate)) {
            const halftimeRecord = {
              checkin: finalCheckin,
              checkout: finalCheckout,
              editedCheckin: finalEditedCheckin,
              editedCheckout: finalEditedCheckout,
              typeOfPresence,
              halfDay: finalHalfDay,
              value: finalValue,
              remarks: remarksStr,
            };
            normalizeHalftimeDayRecord(halftimeRecord, user, isoDate);
            typeOfPresence = halftimeRecord.typeOfPresence || typeOfPresence;
            finalHalfDay = !!halftimeRecord.halfDay;
            finalValue = halftimeRecord.value ?? finalValue;
            remarksStr = String(halftimeRecord.remarks ?? remarksStr);
          }

          // Ensure half-day is NOT set when both check-in and check-out are invalid/00:00
          const bothTimesInvalid = (!finalCheckin || finalCheckin === '00:00') && (!finalCheckout || finalCheckout === '00:00');
          if (bothTimesInvalid) {
            finalHalfDay = false;
          }

          // Machine punch with no in/out on a working day → absent, eligible for paid-leave allocation
          if (!isFixedDataUpload && bothTimesInvalid) {
            const machinePunchTypes = new Set(['ThumbMachine', 'Manual', 'Remote']);
            const typeLower = String(typeOfPresence || '').toLowerCase();
            const isNonWorkingDay =
              new Date(isoDate).getDay() === 0 ||
              allHolidays.some((h) => h.date === isoDate) ||
              typeOfPresence === 'Holiday' ||
              typeOfPresence === 'Sunday' ||
              typeOfPresence === 'Weekoff' ||
              typeLower.includes('holiday') ||
              typeLower.includes('weekoff') ||
              typeLower.includes('week off');

            if (machinePunchTypes.has(typeOfPresence) && !isNonWorkingDay) {
              typeOfPresence = 'Absent';
              finalValue = 0;
              finalTotalHour = 0;
              remarksStr += (remarksStr ? ' | ' : '') + 'No machine punch (00:00–00:00)';
            }
          }

          // Approved request wins last — unless machine punch proves physical attendance on a leave day.
          let appliedApprovedLeaveOverride = false;
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

            const machinePresence = hasPhysicalAttendancePresence({
              checkin: finalCheckin,
              checkout: finalCheckout,
              editedCheckin: finalEditedCheckin,
              editedCheckout: finalEditedCheckout,
              totalHour: Math.max(totalHour, finalTotalHour),
            });
            const approvedLeave = isLeaveRequestStatus(approvedRequest.requestedStatus);

            if (approvedLeave && machinePresence) {
              const recordDate = new Date(isoDate);
              const isSunday = recordDate.getDay() === 0;
              const sched = user ? getScheduledTimes(user as IUser, isoDate) : null;
              const useWeekoff = isSunday || !!sched?.isHoliday;
              typeOfPresence = useWeekoff
                ? 'Present - in office - weekoff'
                : 'Present - in office - weekdays';
              finalValue = 1;
              finalHalfDay = false;
              remarksStr +=
                (remarksStr ? ' | ' : '') +
                'Present (machine punch supersedes approved leave)';
              await invalidateSupersededLeaveRequest(approvedRequest);
            } else if (totalHour > requestTotalHour) {
              typeOfPresence = 'Present';
              remarksStr += (remarksStr ? ' | ' : '') + `Present (Machine ${totalHour}h > Request ${requestTotalHour}h)`;
              finalValue = 1;
              if (approvedLeave) {
                await invalidateSupersededLeaveRequest(approvedRequest);
              }
            } else {
              typeOfPresence = approvedRequest.requestedStatus;
              remarksStr += (remarksStr ? ' | ' : '') + `Overridden by Approved Request: ${approvedRequest.requestedStatus}`;
              appliedApprovedLeaveOverride = isLeaveRequestStatus(approvedRequest.requestedStatus);

              if (approvedRequest.startTime && approvedRequest.endTime) {
                finalCheckin = approvedRequest.startTime;
                finalCheckout = approvedRequest.endTime;
                finalEditedCheckin = approvedRequest.startTime;
                finalEditedCheckout = approvedRequest.endTime;
                finalTotalHour = requestTotalHour;
              } else if (isLeaveRequestStatus(approvedRequest.requestedStatus)) {
                finalCheckin = '';
                finalCheckout = '';
                finalEditedCheckin = '';
                finalEditedCheckout = '';
                finalTotalHour = 0;
                finalHalfDay = false;
              }

              if (isLeaveRequestStatus(approvedRequest.requestedStatus)) {
                const existingWasLeave = existingRecordBeforeUpdate &&
                  String(existingRecordBeforeUpdate.typeOfPresence || '').toLowerCase().includes('leave');
                if (existingWasLeave) {
                  typeOfPresence = 'On leave';
                  finalValue = Number(existingRecordBeforeUpdate?.value ?? 0);
                  finalHalfDay = false;
                } else {
                  const leaveUsage = await calculateLeaveUsage(
                    user._id,
                    isoDate,
                    approvedRequest.requestedStatus
                  );
                  finalValue = leaveUsage.value;
                  typeOfPresence = leaveUsage.isPaidLeave ? 'On leave' : 'Absent';
                  finalHalfDay = false;
                }
              } else if (typeOfPresence === 'Absent') {
                finalValue = 0;
              } else if (typeOfPresence && typeOfPresence.includes('Half Day')) {
                finalValue = 0.5;
                finalHalfDay = true;
              } else {
                finalValue = 1;
              }
            }
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
            ...(Array.isArray(existingRecordBeforeUpdate?.extraWorkEntries) &&
            existingRecordBeforeUpdate.extraWorkEntries.length > 0
              ? { extraWorkEntries: existingRecordBeforeUpdate.extraWorkEntries }
              : {}),
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
          if (isLeaveCandidateType && !wasAlreadyPaidLeave && !appliedApprovedLeaveOverride) {
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
          
          if (isArticleEmployee(user)) continue;
          
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
            pendingQueued,
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

      const existingDailyRecord = attendance.records.get(date);
      attendance.records.set(date, {
        checkin: dailyRecord.checkin || '',
        checkout: dailyRecord.checkout || '',
        totalHour: dailyRecord.totalHour || 0,
        excessHour: dailyRecord.excessHour || 0,
        typeOfPresence: dailyRecord.typeOfPresence || 'ThumbMachine',
        halfDay: dailyRecord.halfDay || false,
        value: dailyRecord.value ?? 0,
        remarks: dailyRecord.remarks || '',
        ...(Array.isArray(existingDailyRecord?.extraWorkEntries) &&
        existingDailyRecord.extraWorkEntries.length > 0
          ? { extraWorkEntries: existingDailyRecord.extraWorkEntries }
          : Array.isArray(dailyRecord.extraWorkEntries) && dailyRecord.extraWorkEntries.length > 0
            ? { extraWorkEntries: dailyRecord.extraWorkEntries }
            : {}),
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

function isLeaveRequestStatus(status: string): boolean {
  const normalized = String(status || '').toLowerCase();
  return normalized.includes('leave') || normalized === 'absent' || status === 'On leave';
}

function getPresenceValueByType(typeOfPresence: string): number {
  if (!typeOfPresence) return 0;
  if (typeOfPresence === 'Absent' || typeOfPresence === 'Holiday' || typeOfPresence === 'Sunday' || typeOfPresence === 'Weekoff') return 0;
  if (typeOfPresence === 'Half Day - weekdays' || typeOfPresence === 'Half Day - weekoff' || typeOfPresence === 'Half Day (HD)') return 0.5;
  if (typeOfPresence === 'On leave' || typeOfPresence === 'Leave') return 0;
  return 1;
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

