import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import EmployeeHistory from '@/models/EmployeeHistory';
import Attendance from '@/models/Attendance';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import {
  assertCanApplyUserPutBody,
  assertCanReadEmployees,
  effectiveFromDoc,
} from '@/lib/hrConsolePermissionUtils';
import {
  calculateTotalHours as calculateHours,
  isSinglePunch,
  isValidPunchTime,
} from '@/lib/attendanceHours';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { reapplyExtraWorkEntriesToRecord } from '@/lib/extraWorkRequest';
import {
  calculateArticleDayExcessMinutes,
  isArticleEmployee,
} from '@/lib/isArticleEmployee';
import { applyLateCheckinAbsentRule, applyLateCheckinHalfDayRule } from '@/lib/lateCheckinAbsentRule';
import {
  isHalftimeEmployeeForDate,
  normalizeHalftimeDayRecord,
} from '@/lib/halftimeAttendance';
import {
  applyManagedEffectiveHistories,
  ManagedEffectiveField,
  LEGACY_BASELINE_EFFECTIVE_FROM,
  MANAGED_EFFECTIVE_FIELDS,
  normalizeManagedFieldValue,
  syncUserFieldsFromFieldHistories,
  getActiveFieldHistoryEntry,
} from '@/lib/userFieldHistory';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Fetch single user by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    const readDenied = assertCanReadEmployees(effective);
    if (readDenied) return readDenied;

    const { id } = await params;
    const user = await User.findById(id).lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Ensure attendanceEmail is set for backward compatibility
    const userData = { ...user } as Record<string, unknown>;
    if (!userData.attendanceEmail && userData.email) {
      userData.attendanceEmail = userData.email;
    }

    return NextResponse.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PUT - Update user
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);

    const { id } = await params;
    const body = await request.json();
    const putDenied = assertCanApplyUserPutBody(body as Record<string, unknown>, effective);
    if (putDenied) return putDenied;
    const {
      odId,
      name,
      email,
      attendanceEmail,
      designation,
      team,
      joiningDate,
      schedules, // New year-wise schedules
      seasonalSchedules, // Seasonal overrides
      // Legacy fields for backward compatibility
      scheduleInOutTime,
      scheduleInOutTimeSat,
      scheduleInOutTimeMonth,
      isActive,
      inactiveAsOf,
      extraInfo,
      // Extended fields
      registrationNo,
      employeeCode,
      paidFrom,
      category,
      tallyName,
      gender,
      parentName,
      parentOccupation,
      mobileNumber,
      alternateMobileNumber,
      alternateEmail,
      address1,
      address2,
      emergencyContactNo,
      emergencyContactRelation,
      anniversaryDate,
      bankName,
      branchName,
      accountNumber,
      ifscCode,
      accountType,
      accountHolderName,
      aadhaarNumber,
      panNumber,
      basicSalary,
      laptopAllowance,
      otherAllowance,
      bonus,
      incentive,
      totalSalaryPerMonth,
      totalSalaryPerAnnum,
      pf,
      esi,
      gratuity,
      articleshipStartDate,
      transferCase,
      firstYearArticleship,
      secondYearArticleship,
      thirdYearArticleship,
      filledScholarship,
      qualificationLevel,
      nextAttemptDueDate,
      registeredUnderPartner,
      workingUnderPartner,
      workingTiming,
      employmentType,
      employmentTypeHistory,
      changedBy, // Who made the change
      changeReason, // Reason for the change
      managedEffectiveFrom,
      managedEffectiveFromByField,
      fieldHistories,
    } = body;
  const managedChangeAt = parseAnyDate(managedEffectiveFrom) || new Date();
  const managedFieldDates: Partial<Record<ManagedEffectiveField, Date>> = {};
  if (managedEffectiveFromByField && typeof managedEffectiveFromByField === 'object') {
    for (const field of MANAGED_EFFECTIVE_FIELDS) {
      const parsed = parseAnyDate((managedEffectiveFromByField as any)[field]);
      if (parsed) {
        managedFieldDates[field] = parsed;
      }
    }
  }


    // Get current user data before update for history tracking
    const currentUser = await User.findById(id);
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Track changes for history fields
    const historyFields = ['workingUnderPartner', 'designation', 'paidFrom', 'category', 'qualificationLevel', 'registeredUnderPartner'];
    const historyEntries = [];

    // Detect whether schedule timelines changed and from which effective date we must recalculate.
    const scheduleRecalcFrom = findScheduleRecalcStartDate(
      (currentUser as any).schedules, 
      schedules,
      (currentUser as any).seasonalSchedules,
      seasonalSchedules
    );

    for (const field of historyFields) {
      const newValue = body[field];
      const oldValue = currentUser[field as keyof typeof currentUser];

      // Check if the field value has changed
      if (newValue !== undefined && String(newValue) !== String(oldValue || '')) {
        historyEntries.push({
          employeeId: id,
          fieldName: field,
          oldValue: String(oldValue || ''),
          newValue: String(newValue || ''),
          changedBy: changedBy || 'System',
          changeReason: changeReason || 'Employee update',
          changedAt: new Date()
        });
      }
    }

    // Determine attendanceEmail:
    // 1. If explicitly provided, use it
    // 2. If workingUnderPartner is changing, look up new partner's email
    // 3. Keep existing or fall back to email
    let finalAttendanceEmail: string | undefined = undefined;
    if (attendanceEmail !== undefined) {
      // Explicitly provided
      finalAttendanceEmail = attendanceEmail;
    } else if (workingUnderPartner !== undefined && workingUnderPartner !== currentUser.workingUnderPartner) {
      // workingUnderPartner is changing, auto-update attendanceEmail from new partner
      if (workingUnderPartner) {
        const cleanName = workingUnderPartner.trim();
        const dottedName = cleanName.replace(/\s+/g, '.');
        const partnerUser = await User.findOne({
          $or: [
            { name: { $regex: new RegExp(`^${cleanName}$`, 'i') } },
            { name: { $regex: new RegExp(`^${dottedName}$`, 'i') } }
          ]
        });
        if (partnerUser) {
          finalAttendanceEmail = partnerUser.attendanceEmail || partnerUser.email;
        } else {
          // Partner not found, fall back to employee email
          finalAttendanceEmail = email || currentUser.email;
        }
      } else {
        // workingUnderPartner is being cleared, fall back to employee email
        finalAttendanceEmail = email || currentUser.email;
      }
    }

    // If employmentTypeHistory is provided, update it
    const updateObj: any = {
        ...(odId && { odId }),
        ...(name && { name }),
        ...(email && { email }),
        // Set attendanceEmail if determined
        ...(finalAttendanceEmail !== undefined && { attendanceEmail: finalAttendanceEmail }),
        ...(designation !== undefined && { designation }),
        ...(team !== undefined && { team }),
        ...(joiningDate && { joiningDate: new Date(joiningDate) }),
        ...(schedules && { schedules }), // New year-wise schedules
        ...(seasonalSchedules && { seasonalSchedules }), // Seasonal overrides
        // Legacy fields for backward compatibility
        ...(scheduleInOutTime && { scheduleInOutTime }),
        ...(scheduleInOutTimeSat && { scheduleInOutTimeSat }),
        ...(scheduleInOutTimeMonth && { scheduleInOutTimeMonth }),
        ...(isActive !== undefined && { isActive }),
        ...(Array.isArray(extraInfo) && { extraInfo }),
        // Extended fields
        ...(registrationNo !== undefined && { registrationNo }),
        ...(employeeCode !== undefined && { employeeCode }),
        ...(paidFrom !== undefined && { paidFrom }),
        ...(category !== undefined && { category }),
        ...(tallyName !== undefined && { tallyName }),
        ...(gender !== undefined && { gender }),
        ...(parentName !== undefined && { parentName }),
        ...(parentOccupation !== undefined && { parentOccupation }),
        ...(mobileNumber !== undefined && { mobileNumber }),
        ...(alternateMobileNumber !== undefined && { alternateMobileNumber }),
        ...(alternateEmail !== undefined && { alternateEmail }),
        ...(address1 !== undefined && { address1 }),
        ...(address2 !== undefined && { address2 }),
        ...(emergencyContactNo !== undefined && { emergencyContactNo }),
        ...(emergencyContactRelation !== undefined && { emergencyContactRelation }),
        ...(anniversaryDate && { anniversaryDate: anniversaryDate ? new Date(anniversaryDate) : undefined }),
        ...(bankName !== undefined && { bankName }),
        ...(branchName !== undefined && { branchName }),
        ...(accountNumber !== undefined && { accountNumber }),
        ...(ifscCode !== undefined && { ifscCode }),
        ...(accountType !== undefined && { accountType }),
        ...(accountHolderName !== undefined && { accountHolderName }),
        ...(aadhaarNumber !== undefined && { aadhaarNumber }),
        ...(panNumber !== undefined && { panNumber }),
        ...(basicSalary !== undefined && { basicSalary }),
        ...(laptopAllowance !== undefined && { laptopAllowance }),
        ...(otherAllowance !== undefined && { otherAllowance }),
        ...(bonus !== undefined && { bonus }),
        ...(incentive !== undefined && { incentive }),
        ...(totalSalaryPerMonth !== undefined && { totalSalaryPerMonth }),
        ...(totalSalaryPerAnnum !== undefined && { totalSalaryPerAnnum }),
        ...(pf !== undefined && { pf }),
        ...(esi !== undefined && { esi }),
        ...(gratuity !== undefined && { gratuity }),
        ...(articleshipStartDate && { articleshipStartDate: articleshipStartDate ? new Date(articleshipStartDate) : undefined }),
        ...(transferCase !== undefined && { transferCase }),
        ...(firstYearArticleship !== undefined && { firstYearArticleship }),
        ...(secondYearArticleship !== undefined && { secondYearArticleship }),
        ...(thirdYearArticleship !== undefined && { thirdYearArticleship }),
        ...(filledScholarship !== undefined && { filledScholarship }),
        ...(qualificationLevel !== undefined && { qualificationLevel }),
        ...(nextAttemptDueDate && { nextAttemptDueDate: nextAttemptDueDate ? new Date(nextAttemptDueDate) : undefined }),
        ...(registeredUnderPartner !== undefined && { registeredUnderPartner }),
        ...(workingUnderPartner !== undefined && { workingUnderPartner }),
        ...(workingTiming !== undefined && { workingTiming }),
        ...(employmentType !== undefined && { employmentType }),
        ...(employmentTypeHistory && { employmentTypeHistory }),
      };

    if (isActive === true) {
      updateObj.inactiveAsOf = null;
    }
    const staysInactive =
      isActive === false || (isActive === undefined && currentUser.isActive === false);
    if (staysInactive) {
      const raw =
        inactiveAsOf !== undefined && inactiveAsOf !== null && inactiveAsOf !== ''
          ? inactiveAsOf
          : currentUser.inactiveAsOf;
      const parsed = parseAnyDate(raw);
      if (!parsed) {
        return NextResponse.json(
          {
            success: false,
            error:
              'inactiveAsOf is required for inactive employees (first calendar day they are inactive).',
          },
          { status: 400 }
        );
      }
      if (isActive === false || (inactiveAsOf !== undefined && inactiveAsOf !== null && inactiveAsOf !== '')) {
        updateObj.inactiveAsOf = parsed;
      }
    }

    const managedEffectiveIncoming: Partial<Record<ManagedEffectiveField, unknown>> = {};
    for (const field of MANAGED_EFFECTIVE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        managedEffectiveIncoming[field] = (body as Record<string, unknown>)[field];
      }
    }

    const priorManaged: Partial<Record<ManagedEffectiveField, string>> = {};
    for (const field of Object.keys(managedEffectiveIncoming) as ManagedEffectiveField[]) {
      priorManaged[field] = normalizeManagedFieldValue(currentUser[field]);
    }

    Object.assign(currentUser, updateObj);

    const fieldsWithExplicitHistory = new Set<ManagedEffectiveField>();
    if (fieldHistories && typeof fieldHistories === 'object') {
      if (!currentUser.fieldHistories) {
        currentUser.fieldHistories = {};
      }
      for (const field of MANAGED_EFFECTIVE_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(fieldHistories, field)) continue;
        const incomingHistory = (fieldHistories as Record<string, unknown>)[field];
        if (!Array.isArray(incomingHistory)) continue;

        const bodyFieldValue = Object.prototype.hasOwnProperty.call(body, field)
          ? normalizeManagedFieldValue((body as Record<string, unknown>)[field])
          : null;
        const incomingActive = getActiveFieldHistoryEntry(
          incomingHistory as Parameters<typeof getActiveFieldHistoryEntry>[0]
        );
        const incomingActiveValue = normalizeManagedFieldValue(incomingActive?.value);
        const staleHistory =
          bodyFieldValue !== null && bodyFieldValue !== incomingActiveValue;

        if (staleHistory) {
          continue;
        }

        (currentUser.fieldHistories as any)[field] = incomingHistory.map((entry: any) => ({
          value: entry?.value != null ? String(entry.value) : '',
          effectiveFrom: parseAnyDate(entry?.effectiveFrom) || entry?.effectiveFrom,
          effectiveTo:
            entry?.effectiveTo === null || entry?.effectiveTo === undefined || entry?.effectiveTo === ''
              ? null
              : parseAnyDate(entry?.effectiveTo) || entry?.effectiveTo,
          source: entry?.source || 'manual-update',
        }));
        fieldsWithExplicitHistory.add(field);
      }
      if (fieldsWithExplicitHistory.size > 0) {
        syncUserFieldsFromFieldHistories(currentUser as any, [...fieldsWithExplicitHistory]);
        currentUser.markModified('fieldHistories');
        for (const field of fieldsWithExplicitHistory) {
          delete managedEffectiveIncoming[field];
        }
      }
    }

    applyManagedEffectiveHistories(currentUser as any, managedEffectiveIncoming, {
      changedAt: managedChangeAt,
      source: 'manual-update',
      baselineEffectiveFrom: LEGACY_BASELINE_EFFECTIVE_FROM,
      fieldChangedAt: managedFieldDates,
      priorValues: priorManaged,
    });

    if (Object.keys(managedEffectiveIncoming).length > 0) {
      currentUser.markModified('fieldHistories');
    }

    if (
      Object.prototype.hasOwnProperty.call(managedEffectiveIncoming, 'workingUnderPartner') ||
      workingUnderPartner !== undefined
    ) {
      const syncedPartner = normalizeManagedFieldValue(currentUser.workingUnderPartner);
      if (syncedPartner) {
        currentUser.team = syncedPartner;
      } else if (team !== undefined) {
        currentUser.team = team;
      }
    }

    const user = await currentUser.save();

    // Recalculate attendance summaries/day metrics when schedule/effective employment changes impact history.
    const recalcFromCandidates: Date[] = [];
    if (scheduleRecalcFrom) {
      recalcFromCandidates.push(scheduleRecalcFrom);
    }
    if (employmentTypeHistory && Array.isArray(employmentTypeHistory) && employmentTypeHistory.length > 0) {
      const minEmploymentDate = employmentTypeHistory.reduce((min, entry) => {
        const d = parseAnyDate(entry.effectiveFrom);
        if (!d) return min;
        return !min || d < min ? d : min;
      }, null as Date | null);
      if (minEmploymentDate) {
        recalcFromCandidates.push(minEmploymentDate);
      }
    }
    if (user && recalcFromCandidates.length > 0) {
      const earliest = recalcFromCandidates.sort((a, b) => a.getTime() - b.getTime())[0];
      await recalculateAttendanceFromDate(String(user._id), earliest);
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Save history entries
    if (historyEntries.length > 0) {
      try {
        await EmployeeHistory.insertMany(historyEntries);
      } catch (historyError) {
        console.error('Error saving employee history:', historyError);
        // Don't fail the main update if history saving fails
      }
    }

    // If extraInfo labels were updated for this user, propagate those labels
    // to all other users so every employee shares the same set of fields.
    if (Array.isArray(extraInfo) && extraInfo.length > 0) {
      try {
        await syncExtraInfoLabelsFromUser(user._id.toString());
      } catch (syncError) {
        console.error('Error syncing extraInfo labels to all users:', syncError);
        // Do not fail the main request because of sync issues; just log.
      }
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error('Error updating user:', error);
    
    // Handle duplicate key error (E11000)
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
      const duplicateValue = error.keyValue ? Object.values(error.keyValue)[0] : 'value';
      return NextResponse.json(
        { 
          success: false, 
          error: `A user with this ${duplicateField} already exists: ${duplicateValue}` 
        },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

function parseAnyDate(value: any): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthYearFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeDailySchedule(daily: any): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const normalized = days.map((day) => {
    const s = daily?.[day] || {};
    return {
      day,
      inTime: s.inTime || '',
      outTime: s.outTime || '',
      isHoliday: Boolean(s.isHoliday),
      isHalfDay: Boolean(s.isHalfDay),
    };
  });
  return JSON.stringify(normalized);
}

function findScheduleRecalcStartDate(currentSchedules: any, newSchedules: any, currentSeasonal?: any, newSeasonal?: any): Date | null {
  const changedDates: Date[] = [];

  // Check regular schedules
  if (Array.isArray(newSchedules)) {
    const currentArr = Array.isArray(currentSchedules) ? currentSchedules : [];
    const currentMap = new Map<string, string>();
    const nextMap = new Map<string, string>();

    for (const entry of currentArr) {
      const d = parseAnyDate(entry?.effectiveFrom);
      if (!d) continue;
      const key = d.toISOString().split('T')[0];
      currentMap.set(key, normalizeDailySchedule(entry?.daily));
    }

    for (const entry of newSchedules) {
      const d = parseAnyDate(entry?.effectiveFrom);
      if (!d) continue;
      const key = d.toISOString().split('T')[0];
      nextMap.set(key, normalizeDailySchedule(entry?.daily));
    }

    for (const [key, nextValue] of nextMap.entries()) {
      const prevValue = currentMap.get(key);
      if (!prevValue || prevValue !== nextValue) {
        const d = parseAnyDate(key);
        if (d) changedDates.push(d);
      }
    }

    for (const key of currentMap.keys()) {
      if (!nextMap.has(key)) {
        const d = parseAnyDate(key);
        if (d) changedDates.push(d);
      }
    }
  }

  // Check seasonal schedules
  if (Array.isArray(newSeasonal)) {
    const currentSArr = Array.isArray(currentSeasonal) ? currentSeasonal : [];
    // Seasonal schedules don't have a unique key other than maybe index, but they are recurring.
    // However, they have an effectiveFrom for versioning.
    // Let's compare the stringified arrays if they are different.
    if (JSON.stringify(currentSArr) !== JSON.stringify(newSeasonal)) {
      // If different, find the earliest effectiveFrom in newSeasonal
      for (const entry of newSeasonal) {
        const d = parseAnyDate(entry?.effectiveFrom);
        if (d) changedDates.push(d);
      }
      // Also check old ones that might have been removed
      for (const entry of currentSArr) {
        const d = parseAnyDate(entry?.effectiveFrom);
        if (d) changedDates.push(d);
      }
    }
  } else if (Array.isArray(currentSeasonal) && currentSeasonal.length > 0) {
    // All seasonal schedules removed
    for (const entry of currentSeasonal) {
      const d = parseAnyDate(entry?.effectiveFrom);
      if (d) changedDates.push(d);
    }
  }

  if (changedDates.length === 0) return null;
  changedDates.sort((a, b) => a.getTime() - b.getTime());
  return changedDates[0];
}

function shouldExcludeFromHoursSummary(typeOfPresence: string, dateStr: string): boolean {
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

async function recalculateAttendanceFromDate(userId: string, fromDate: Date) {
  const user = await User.findById(userId);
  if (!user) return;

  const startMonthYear = monthYearFromDate(fromDate);
  const attendances = await Attendance.find({
    userId: user._id,
    monthYear: { $gte: startMonthYear },
  }).sort({ monthYear: 1 });

  for (const attendance of attendances) {
    const summary = {
      totalHour: 0,
      totalLateArrival: 0,
      excessHour: 0,
      totalHalfDay: 0,
      totalPresent: 0,
      totalAbsent: 0,
      totalLeave: 0,
    };

    let totalScheduledHour = 0;

    attendance.records.forEach((record: any, dateStr: string) => {
      if (applyLateCheckinAbsentRule(record, user, dateStr)) {
        summary.totalAbsent++;
        return;
      }

      applyLateCheckinHalfDayRule(record, user, dateStr);
      normalizeHalftimeDayRecord(record, user, dateStr);

      const inTime = String(record.editedCheckin || record.checkin || '').trim();
      const outTime = String(record.editedCheckout || record.checkout || '').trim();

      const schedule = getScheduledTimes(user as any, dateStr);
      const scheduledIn = schedule.inTime;
      const scheduledOut = schedule.outTime;
      record.totalHour = calculateHours(inTime, outTime, {
        scheduledIn,
        scheduledOut,
      });

      let dayScheduledHours = 0;
      if (scheduledIn && scheduledOut && scheduledIn !== '00:00' && scheduledOut !== '00:00') {
        dayScheduledHours = calculateHours(scheduledIn, scheduledOut);
      }

      // Excess/short using updated schedule.
      let dayExcess = 0;
      if (record.typeOfPresence === 'Holiday') {
        dayExcess = 0;
      } else if (!isValidPunchTime(inTime) && !isValidPunchTime(outTime)) {
        dayExcess = dayScheduledHours > 0 ? -dayScheduledHours : 0;
      } else if (isSinglePunch(inTime, outTime)) {
        dayExcess = dayScheduledHours > 0 ? Number((record.totalHour - dayScheduledHours).toFixed(2)) : 0;
      } else if (
        isValidPunchTime(inTime) &&
        isValidPunchTime(outTime) &&
        scheduledIn &&
        scheduledOut &&
        scheduledIn !== '00:00' &&
        scheduledOut !== '00:00'
      ) {
        const [schInH, schInM] = scheduledIn.split(':').map(Number);
        const [schOutH, schOutM] = scheduledOut.split(':').map(Number);
        const [actInH, actInM] = inTime.split(':').map(Number);
        const [actOutH, actOutM] = outTime.split(':').map(Number);
        const schInMin = schInH * 60 + schInM;
        const schOutMin = schOutH * 60 + schOutM;
        const actInMin = actInH * 60 + actInM;
        const actOutMin = actOutH * 60 + actOutM;
        const scheduledMinutes = schOutMin - schInMin >= 0 ? schOutMin - schInMin : 24 * 60 + schOutMin - schInMin;
        const actualMinutes = actOutMin - actInMin >= 0 ? actOutMin - actInMin : 24 * 60 + actOutMin - actInMin;
        if (actualMinutes < scheduledMinutes) {
          dayExcess = -(scheduledMinutes - actualMinutes) / 60;
        } else if (isArticleEmployee(user)) {
          const excessMinutes = calculateArticleDayExcessMinutes(
            scheduledIn,
            scheduledOut,
            inTime,
            outTime
          );
          dayExcess = excessMinutes > 0 ? excessMinutes / 60 : 0;
        } else {
          dayExcess = Number((record.totalHour - dayScheduledHours).toFixed(2));
        }
      } else {
        dayExcess = Number((record.totalHour - dayScheduledHours).toFixed(2));
      }
      record.excessHour = dayExcess;
      reapplyExtraWorkEntriesToRecord(record);

      const includeInHoursSummary = !shouldExcludeFromHoursSummary(String(record.typeOfPresence || ''), dateStr);
      if (includeInHoursSummary) {
        summary.totalHour += record.totalHour;
        totalScheduledHour += dayScheduledHours;
      }

      // Recompute half-day with latest employment/schedule assumptions.
      const isSunday = new Date(dateStr).getDay() === 0;
      if (record.typeOfPresence === 'Holiday' || isSunday) {
        record.halfDay = false;
      } else if (isHalftimeEmployeeForDate(user, dateStr)) {
        record.halfDay = false;
        normalizeHalftimeDayRecord(record, user, dateStr);
      } else {
        const employmentType = (user as any).employmentType || 'fulltime';
        const isArticle = isArticleEmployee(user);
        const isAfter1PM = inTime ? inTime >= '13:00' : false;
        if ((inTime === '00:00' && outTime === '00:00') || (!inTime && !outTime)) {
          record.halfDay = false;
        } else if (isSinglePunch(inTime, outTime)) {
          record.halfDay = true;
        } else if (employmentType === 'fulltime' && !isArticle) {
          record.halfDay = record.totalHour < 6;
        } else if (isArticle) {
          record.halfDay = isAfter1PM || record.totalHour < 3.5;
        }
      }

      if (record.halfDay) summary.totalHalfDay++;
      if (inTime && scheduledIn && inTime > scheduledIn) summary.totalLateArrival++;

      switch (record.typeOfPresence) {
        case 'ThumbMachine':
        case 'Manual':
        case 'Remote':
        case 'Weekly Off - Present (WO-Present)':
        case 'Half Day (HD)':
        case 'Work From Home (WFH)':
        case 'Weekly Off - Work From Home (WO-WFH)':
        case 'Onsite Presence (OS-P)':
          if (record.totalHour > 0) summary.totalPresent++;
          else summary.totalAbsent++;
          break;
        case 'On leave':
        case 'Leave':
          summary.totalLeave++;
          break;
        case 'Holiday':
        case 'Sunday':
        case 'Weekoff':
        case 'Weekoff - special allowance':
          break;
        default:
          summary.totalAbsent++;
      }
    });

    summary.excessHour = Number((summary.totalHour - totalScheduledHour).toFixed(2));
    attendance.summary = summary as any;
    attendance.markModified('records');
    attendance.markModified('summary');
    await attendance.save();
  }
}

async function syncExtraInfoLabelsFromUser(sourceUserId: string) {
  const sourceUser = await User.findById(sourceUserId).select('extraInfo');

  if (!sourceUser || !Array.isArray((sourceUser as any).extraInfo)) {
    return;
  }

  const sourceExtraInfo = (sourceUser as any).extraInfo as Array<{ label?: string; value?: string }>;

  const labelSet = new Set(
    sourceExtraInfo
      .map((item) => (typeof item.label === 'string' ? item.label.trim() : ''))
      .filter((label) => label)
  );

  if (labelSet.size === 0) {
    return;
  }

  const otherUsers = await User.find({ _id: { $ne: sourceUserId } }).select('extraInfo');

  const bulkOps: any[] = [];

  for (const other of otherUsers) {
    const otherExtraInfo = (other as any).extraInfo as Array<{ label?: string; value?: string }> | undefined;
    const existingLabels = new Set(
      (otherExtraInfo || [])
        .map((item) => (typeof item.label === 'string' ? item.label.trim() : ''))
        .filter((label) => label)
    );

    const newItems: { label: string; value: string }[] = [];

    for (const label of labelSet) {
      if (!existingLabels.has(label)) {
        newItems.push({ label, value: '' });
      }
    }

    if (newItems.length > 0) {
      bulkOps.push({
        updateOne: {
          filter: { _id: (other as any)._id },
          update: { $push: { extraInfo: { $each: newItems } } },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    await (User as any).bulkWrite(bulkOps);
  }
}

// DELETE - Delete user (soft delete by setting isActive to false)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    if (effective.sections.employees !== 'edit' || effective.employeeTabs.basic !== 'edit') {
      return NextResponse.json({ success: false, error: 'Not allowed to deactivate employees' }, { status: 403 });
    }

    const { id } = await params;
    const now = new Date();
    const inactiveAsOf = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const user = await User.findByIdAndUpdate(
      id,
      { isActive: false, inactiveAsOf },
      { new: true }
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = user.toObject();
    if (!userData.attendanceEmail && userData.email) {
      userData.attendanceEmail = userData.email;
    }

    return NextResponse.json({
      success: true,
      message: 'User deactivated successfully',
      data: userData,
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
