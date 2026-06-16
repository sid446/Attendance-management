import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Fine from '@/models/Fine';
import Attendance  from '@/models/Attendance';
import User from '@/models/User';
import { getWorkingUnderPartnerForDate } from '@/lib/userFieldHistory';

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
  if (!checkin || checkin === '00:00') return false;
  return checkin > scheduledIn;
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

    const results: any[] = [];

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

      // Apply new fine rules
      const fineRecords: any[] = [];
      let warningCount = 0;
      let fineCount = 0;
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
        let serialNo = '';
        if (isWarning) {
          globalWarningCounter++;
          serialNo = `${userInitials}/W${String(globalWarningCounter).padStart(4, '0')}`;
          warningCount++;
        } else {
          globalFineCounter++;
          serialNo = `${userInitials}/F${String(globalFineCounter).padStart(4, '0')}`;
          fineCount++;
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

      // Calculate totals
      const totalFine = fineRecords.reduce((sum, r) => sum + r.fineAmount, 0);
      const totalWarnings = fineRecords.filter(r => r.isWarning).length;

      // Upsert fine record
      const fine = await Fine.findOneAndUpdate(
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
      ).populate('userId', 'name odId category team designation workingUnderPartner fieldHistories');

      results.push(fine);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Calculated fines for ${results.length} employees`,
      count: results.length,
      fines: results 
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
