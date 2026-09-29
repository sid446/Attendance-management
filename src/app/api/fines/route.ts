import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Fine from '@/models/Fine';
import Attendance  from '@/models/Attendance';
import User from '@/models/User';
import { getWorkingUnderPartnerForDate } from '@/lib/userFieldHistory';
import { isLaterThanScheduledIn } from '@/lib/attendanceHours';

// Fine calculation rules
// Staff: 2 late days in month = warning, 3-7 late days = 50 each, 8+ = 100 each
// Article: 2 late days in month = warning, 3-7 late days = 25 each, 8+ = 50 each

interface FineRule {
  consecutiveDay: number;
  isWarning: boolean;
  amount: number;
}

function getStaffFineRules(consecutiveDay: number): FineRule {
  // This function is no longer used; replaced by new monthly logic
  return { consecutiveDay, isWarning: false, amount: 0 };
}

function getArticleFineRules(consecutiveDay: number): FineRule {
  // This function is no longer used; replaced by new monthly logic
  return { consecutiveDay, isWarning: false, amount: 0 };
}

function isLateArrival(checkin: string, scheduledIn: string): boolean {
  return isLaterThanScheduledIn(checkin, scheduledIn);
}

// Helper function to get scheduled in time for a user on a specific date
function getScheduledInTime(user: any, dateStr: string): string {
  const date = new Date(dateStr);
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(); // 'monday', 'tuesday', etc.

  // Check new schedules array first
  if (user.schedules && user.schedules.length > 0) {
    // Find the most recent schedule entry where effectiveFrom <= date
    const applicableSchedules = user.schedules
      .filter((s: any) => new Date(s.effectiveFrom) <= date)
      .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());

    if (applicableSchedules.length > 0) {
      const schedule = applicableSchedules[0].daily[dayOfWeek];
      if (schedule && schedule.inTime) {
        return schedule.inTime;
      }
    }
  }

  // Fallback to legacy schedule fields
  if (dayOfWeek === 'saturday' && user.scheduleInOutTimeSat && user.scheduleInOutTimeSat.inTime) {
    return user.scheduleInOutTimeSat.inTime;
  }
  if (user.scheduleInOutTime && user.scheduleInOutTime.inTime) {
    return user.scheduleInOutTime.inTime;
  }

  // Default fallback
  return '09:00';
}

// Helper function to check if a date is a holiday for the user
function isScheduledHoliday(user: any, dateStr: string): boolean {
  const date = new Date(dateStr);
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  // Check new schedules array
  if (user.schedules && user.schedules.length > 0) {
    const applicableSchedules = user.schedules
      .filter((s: any) => new Date(s.effectiveFrom) <= date)
      .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());

    if (applicableSchedules.length > 0) {
      const schedule = applicableSchedules[0].daily[dayOfWeek];
      if (schedule && schedule.isHoliday) {
        return true;
      }
    }
  }

  // Fallback to legacy
  if (dayOfWeek === 'saturday' && user.scheduleInOutTimeSat && user.scheduleInOutTimeSat.isHoliday) {
    return true;
  }
  if (dayOfWeek === 'sunday' && user.scheduleInOutTime && user.scheduleInOutTime.isHoliday) {
    return true;
  }

  return false;
}

// Generate initials from name (e.g., "Naim Khan" -> "NK")
function getInitials(name: string): string {
  if (!name) return 'XX';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words.map(w => w.charAt(0).toUpperCase()).join('').substring(0, 3);
}

function cloneFineRecord(record: any) {
  return {
    serialNo: record.serialNo || '',
    date: record.date,
    consecutiveDay: record.consecutiveDay ?? 0,
    fineAmount: record.fineAmount || 0,
    isWarning: !!record.isWarning,
    status: record.status || 'pending',
    penaltyImposedBy: record.penaltyImposedBy || '',
    reason: record.reason || '',
    remark: record.remark || '',
    paymentDate: record.paymentDate || '',
    paymentMode: record.paymentMode || '',
    vertical: record.vertical || '',
  };
}

function isLockedFineRecord(record: any) {
  return record.status === 'paid' || record.status === 'waived' || record.penaltyImposedBy === 'Manual';
}

// GET - Fetch fines for a month (optionally filter by user)
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const monthYear = searchParams.get('monthYear');
    const userId = searchParams.get('userId');

    if (!monthYear) {
      return NextResponse.json({ error: 'monthYear is required' }, { status: 400 });
    }

    const query: any = { monthYear };
    if (userId) {
      query.userId = userId;
    }

    const fines = await Fine.find(query).populate(
      'userId',
      'name odId category team designation workingUnderPartner fieldHistories'
    );

    return NextResponse.json({ success: true, fines });
  } catch (error) {
    console.error('Error fetching fines:', error);
    return NextResponse.json({ error: 'Failed to fetch fines' }, { status: 500 });
  }
}

// POST - Calculate and save fines for all employees for a month
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { monthYear } = body;

    if (!monthYear) {
      return NextResponse.json({ error: 'monthYear is required' }, { status: 400 });
    }

    // Get all attendance records for the month
    const attendanceRecords = await Attendance.find({ monthYear }).populate('userId');
    
    // Get all users with their categories
    const users = await User.find({}).lean();
    const userMap = new Map(users.map(u => [String(u._id), u]));

    // Get global fine counter (count all non-warning fine records across all users)
    const allExistingFines = await Fine.find({}).lean();
    let globalFineCounter = allExistingFines.reduce((sum, f) => 
      sum + (f.fineRecords?.filter((r: any) => !r.isWarning)?.length || 0), 0
    );
    // Get global warning counter
    let globalWarningCounter = allExistingFines.reduce((sum, f) => 
      sum + (f.fineRecords?.filter((r: any) => r.isWarning)?.length || 0), 0
    );

    const existingFinesForMonth = allExistingFines.filter((fine) => fine.monthYear === monthYear);
    const existingByUserId = new Map(
      existingFinesForMonth.map((fine: any) => [String(fine.userId), fine])
    );

    for (const attendance of attendanceRecords) {
      if (!attendance.userId) continue;

      const userId = String(attendance.userId._id || attendance.userId);
      const user = userMap.get(userId);
      if (!user) continue;

      // Determine category - normalize to Staff or Article
      let category: 'Staff' | 'Article' = 'Staff';
      const userCategory = (user.category || '').toLowerCase();
      if (userCategory.includes('article') || userCategory.includes('trainee') || userCategory.includes('intern')) {
        category = 'Article';
      }

      // Get user's schedule (using helper function)
      // No default scheduled in needed anymore

      // Get all dates sorted
      const records = attendance.records instanceof Map 
        ? Object.fromEntries(attendance.records) 
        : attendance.records;
      const dates = Object.keys(records).sort();
      const userInitials = getInitials(user.name || '');

      // Count total late days in the month
      let lateDates: string[] = [];
      for (const dateStr of dates) {
        const rec = records[dateStr];
        const presenceType = rec.typeOfPresence as string;
        if (presenceType === 'Holiday' || presenceType === 'On leave' || presenceType === 'Leave' || isScheduledHoliday(user, dateStr)) {
          continue;
        }
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const scheduledIn = getScheduledInTime(user, dateStr);
        if (isLateArrival(effectiveCheckin, scheduledIn)) {
          lateDates.push(dateStr);
        }
      }

      const existingFine = existingByUserId.get(userId);
      const existingRecords = existingFine?.fineRecords || [];
      const lockedRecords = existingRecords.filter(isLockedFineRecord).map(cloneFineRecord);
      const lockedAutoDates = new Set(
        existingRecords
          .filter((record: any) => (record.status === 'paid' || record.status === 'waived') && record.penaltyImposedBy !== 'Manual')
          .map((record: any) => record.date)
      );
      const pendingAutoByDate = new Map<string, any>();
      for (const record of existingRecords) {
        if (isLockedFineRecord(record)) continue;
        if (!pendingAutoByDate.has(record.date)) {
          pendingAutoByDate.set(record.date, record);
        }
      }

      // Recalc adds/updates pending late fines only. Paid, waived, and manual rows stay.
      const fineRecords: any[] = [...lockedRecords];
      for (let i = 0; i < lateDates.length; i++) {
        const dateStr = lateDates[i];
        const rec = records[dateStr];
        const effectiveCheckin = rec.editedCheckin || rec.checkin;
        const scheduledIn = getScheduledInTime(user, dateStr);
        const vertical = getWorkingUnderPartnerForDate(user, dateStr);
        let isWarning = false;
        let fineAmount = 0;
        let remark = '';
        if (category === 'Staff') {
          if (i < 2) {
            isWarning = true;
            remark = `Warning for ${i + 1} late day(s)`;
          } else if (i >= 2 && i < 7) {
            fineAmount = 50;
            remark = `Fine ₹50 for ${i + 1}th late day`;
          } else {
            fineAmount = 100;
            remark = `Fine ₹100 for ${i + 1}th late day`;
          }
        } else if (category === 'Article') {
          if (i < 2) {
            isWarning = true;
            remark = `Warning for ${i + 1} late day(s)`;
          } else if (i >= 2 && i < 7) {
            fineAmount = 25;
            remark = `Fine ₹25 for ${i + 1}th late day`;
          } else {
            fineAmount = 50;
            remark = `Fine ₹50 for ${i + 1}th late day`;
          }
        }

        if (lockedAutoDates.has(dateStr)) {
          continue;
        }

        const existingPending = pendingAutoByDate.get(dateStr);
        if (existingPending) {
          const kept = cloneFineRecord(existingPending);
          kept.consecutiveDay = 0;
          kept.fineAmount = fineAmount;
          kept.isWarning = isWarning;
          kept.reason = `In Time-${effectiveCheckin} (Scheduled: ${scheduledIn})`;
          kept.remark = remark;
          kept.vertical = vertical;
          fineRecords.push(kept);
          continue;
        }

        let serialNo = '';
        if (isWarning) {
          globalWarningCounter++;
          serialNo = `${userInitials}/W${String(globalWarningCounter).padStart(4, '0')}`;
        } else {
          globalFineCounter++;
          serialNo = `${userInitials}/F${String(globalFineCounter).padStart(4, '0')}`;
        }
        fineRecords.push({
          serialNo,
          date: dateStr,
          consecutiveDay: 0,
          fineAmount,
          isWarning,
          status: 'pending',
          penaltyImposedBy: '',
          reason: `In Time-${effectiveCheckin} (Scheduled: ${scheduledIn})`,
          remark,
          paymentDate: '',
          paymentMode: '',
          vertical,
        });
      }

      fineRecords.sort((a, b) => String(a.date).localeCompare(String(b.date)));

      if (fineRecords.length === 0) {
        if (existingFine?._id) {
          await Fine.deleteOne({ _id: existingFine._id });
        }
        continue;
      }

      const totalFine = fineRecords
        .filter((record) => record.status === 'pending' && !record.isWarning)
        .reduce((sum, record) => sum + record.fineAmount, 0);
      const totalWarnings = fineRecords.filter((record) => record.isWarning).length;

      await Fine.findOneAndUpdate(
        { userId, monthYear },
        {
          userId,
          monthYear,
          category,
          fineRecords,
          totalFine,
          totalWarnings,
        },
        { upsert: true, new: true }
      );
    }

    const fines = await Fine.find({ monthYear }).populate(
      'userId',
      'name odId category team designation workingUnderPartner fieldHistories'
    );

    return NextResponse.json({ 
      success: true, 
      message: `Calculated fines for ${fines.length} employees. Paid, waived, and manual fines were kept.`,
      count: fines.length,
      fines,
    });
  } catch (error) {
    console.error('Error calculating fines:', error);
    return NextResponse.json({ error: 'Failed to calculate fines' }, { status: 500 });
  }
}

// PUT - Update fine record details
export async function PUT(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { fineId, recordDate, status, penaltyImposedBy, remark, paymentDate, paymentMode } = body;

    if (!fineId || !recordDate) {
      return NextResponse.json({ error: 'fineId and recordDate are required' }, { status: 400 });
    }

    const fine = await Fine.findById(fineId);
    if (!fine) {
      return NextResponse.json({ error: 'Fine record not found' }, { status: 404 });
    }

    // Update the specific record
    const recordIndex = fine.fineRecords.findIndex(r => r.date === recordDate);
    if (recordIndex === -1) {
      return NextResponse.json({ error: 'Fine record for date not found' }, { status: 404 });
    }

    // Update all provided fields
    if (status) fine.fineRecords[recordIndex].status = status;
    if (penaltyImposedBy !== undefined) fine.fineRecords[recordIndex].penaltyImposedBy = penaltyImposedBy;
    if (remark !== undefined) fine.fineRecords[recordIndex].remark = remark;
    if (paymentDate !== undefined) fine.fineRecords[recordIndex].paymentDate = paymentDate;
    if (paymentMode !== undefined) fine.fineRecords[recordIndex].paymentMode = paymentMode;

    // Recalculate total (only count pending fines)
    fine.totalFine = fine.fineRecords
      .filter(r => r.status === 'pending' && !r.isWarning)
      .reduce((sum, r) => sum + r.fineAmount, 0);

    await fine.save();

    const updatedFine = await Fine.findById(fineId).populate('userId', 'name odId category team designation workingUnderPartner fieldHistories');

    return NextResponse.json({ success: true, fine: updatedFine });
  } catch (error) {
    console.error('Error updating fine:', error);
    return NextResponse.json({ error: 'Failed to update fine' }, { status: 500 });
  }
}
