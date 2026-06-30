import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Holiday from '@/models/Holiday';
import Attendance, { type IDailyRecord } from '@/models/Attendance';
import User, { IUser } from '@/models/User';
import { reapplyExtraWorkEntriesToRecord } from '@/lib/extraWorkRequest';
import { calculateSummary } from '@/lib/attendanceSummaryCalculation';

// GET /api/holidays - Get all holidays, optionally filtered by year
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    let query: any = {};
    if (year) {
      query.year = parseInt(year);
    }
    if (activeOnly) {
      query.isActive = true;
    }

    const holidays = await Holiday.find(query).sort({ date: 1 });

    return NextResponse.json({
      success: true,
      data: holidays,
    });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch holidays',
      },
      { status: 500 }
    );
  }
}

// POST /api/holidays - Create a new holiday
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { date, name, type, description, year } = body;

    // Validate required fields
    if (!date || !name || !year) {
      return NextResponse.json(
        {
          success: false,
          error: 'Date, name, and year are required',
        },
        { status: 400 }
      );
    }

    // Check if holiday already exists for this date
    const existingHoliday = await Holiday.findOne({ date });
    if (existingHoliday) {
      return NextResponse.json(
        {
          success: false,
          error: 'Holiday already exists for this date',
        },
        { status: 400 }
      );
    }

    const holiday = new Holiday({
      date,
      name,
      type: type || 'national',
      description: description || '',
      year: parseInt(year),
      isActive: true,
    });

    const savedHoliday = await holiday.save();

    // Update existing attendance records for this holiday date
    await updateAttendanceForDate(date, 'Holiday', name);

    return NextResponse.json({
      success: true,
      data: savedHoliday,
    });
  } catch (error) {
    console.error('Error creating holiday:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create holiday',
      },
      { status: 500 }
    );
  }
}

// PUT /api/holidays/[id] - Update a holiday
export async function PUT(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Holiday ID is required',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { date, name, type, description, year, isActive } = body;

    // Get the current holiday before update
    const currentHoliday = await Holiday.findById(id);
    if (!currentHoliday) {
      return NextResponse.json(
        {
          success: false,
          error: 'Holiday not found',
        },
        { status: 404 }
      );
    }

    const oldDate = currentHoliday.date;
    const oldIsActive = currentHoliday.isActive;

    const updateData: any = {};
    if (date !== undefined) updateData.date = date;
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (description !== undefined) updateData.description = description;
    if (year !== undefined) updateData.year = parseInt(year);
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedHoliday = await Holiday.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedHoliday) {
      return NextResponse.json(
        {
          success: false,
          error: 'Holiday not found',
        },
        { status: 404 }
      );
    }

    // Update attendance records based on changes
    const newDate = updatedHoliday.date;
    const newIsActive = updatedHoliday.isActive;
    const newName = updatedHoliday.name;

    // If date changed, revert old date and set new date
    if (oldDate !== newDate) {
      // Revert old date
      await updateAttendanceForDate(oldDate, null, null);
      // Set new date as holiday
      await updateAttendanceForDate(newDate, 'Holiday', newName);
    } else if (oldIsActive && !newIsActive) {
      // Holiday deactivated, revert records
      await updateAttendanceForDate(newDate, null, null);
    } else if (!oldIsActive && newIsActive) {
      // Holiday activated, set records
      await updateAttendanceForDate(newDate, 'Holiday', newName);
    } else if (oldIsActive && newIsActive && name !== currentHoliday.name) {
      // Name changed, update remarks
      await updateAttendanceForDate(newDate, 'Holiday', newName);
    }

    return NextResponse.json({
      success: true,
      data: updatedHoliday,
    });
  } catch (error) {
    console.error('Error updating holiday:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update holiday',
      },
      { status: 500 }
    );
  }
}

// DELETE /api/holidays/[id] - Delete a holiday
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Holiday ID is required',
        },
        { status: 400 }
      );
    }

    const deletedHoliday = await Holiday.findByIdAndDelete(id);

    if (!deletedHoliday) {
      return NextResponse.json(
        {
          success: false,
          error: 'Holiday not found',
        },
        { status: 404 }
      );
    }

    // Revert attendance records for this date
    await updateAttendanceForDate(deletedHoliday.date, null, null);

    return NextResponse.json({
      success: true,
      data: deletedHoliday,
    });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete holiday',
      },
      { status: 500 }
    );
  }
}

// Helper functions for attendance calculation
function getScheduledTimes(user: IUser | null | undefined, dateStr: string): { inTime: string; outTime: string; isHoliday: boolean; isHalfDay: boolean } {
  if (!user) return { inTime: '09:00', outTime: '18:00', isHoliday: false, isHalfDay: false };

  const date = new Date(dateStr);
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const month = date.getMonth() + 1; // 1-12

  // Try new schedule entries structure
  if (user.schedules && Array.isArray(user.schedules)) {
    // Find the schedule entry applicable for this date (effectiveFrom <= date, take latest)
    const applicableEntry = user.schedules
      .filter(entry => entry.effectiveFrom <= date)
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
    
    if (applicableEntry && applicableEntry.daily) {
      const daily = applicableEntry.daily;
      let daySchedule: any = null;

      switch (dayOfWeek) {
        case 0: daySchedule = daily.sunday; break;
        case 1: daySchedule = daily.monday; break;
        case 2: daySchedule = daily.tuesday; break;
        case 3: daySchedule = daily.wednesday; break;
        case 4: daySchedule = daily.thursday; break;
        case 5: daySchedule = daily.friday; break;
        case 6: daySchedule = daily.saturday; break;
      }

      if (daySchedule) {
        return {
          inTime: daySchedule.inTime || '09:00',
          outTime: daySchedule.outTime || '18:00',
          isHoliday: daySchedule.isHoliday || false,
          isHalfDay: daySchedule.isHalfDay || false,
        };
      }
    }
  }

  // Fallback to legacy schedules
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

  return { inTime, outTime, isHoliday, isHalfDay };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

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

function hasValidPunch(checkin?: string, checkout?: string): boolean {
  const inT = (checkin || '').trim();
  const outT = (checkout || '').trim();
  return (!!inT && inT !== '00:00') || (!!outT && outT !== '00:00');
}

function isAbsentType(type?: string): boolean {
  const t = (type || '').trim();
  return t === 'Absent' || t === 'absent';
}

function isLeaveType(type?: string): boolean {
  const t = (type || '').trim();
  return t === 'On leave' || t === 'Leave';
}

async function updateAttendanceForDate(date: string, typeOfPresence: string | null, remarks: string | null) {
  const monthYear = date.substring(0, 7);
  const attendances = await Attendance.find({ monthYear }).populate('userId');

  for (const attendance of attendances) {
    const record = attendance.records.get(date);
    if (!record) continue;

    if (typeOfPresence === 'Holiday') {
      if (record.typeOfPresence !== 'Holiday') {
        record.previousTypeOfPresence = record.typeOfPresence;
      }
      record.typeOfPresence = 'Holiday';
      record.value = 0;
      record.totalHour = 0;
      record.excessHour = 0;
      record.halfDay = false;
      record.remarks = remarks || '';
    } else {
      const prevType = record.previousTypeOfPresence;
      const checkin = record.editedCheckin || record.checkin;
      const checkout = record.editedCheckout || record.checkout;

      if (hasValidPunch(checkin, checkout)) {
        const restoreType: IDailyRecord['typeOfPresence'] =
          prevType && prevType !== 'Holiday' && !isAbsentType(prevType)
            ? (prevType as IDailyRecord['typeOfPresence'])
            : 'ThumbMachine';
        record.typeOfPresence = restoreType;
        record.totalHour = calculateTotalHours(checkin, checkout);
        reapplyExtraWorkEntriesToRecord(record);
        record.value = record.totalHour > 0 ? 1 : 0;
        record.remarks = '';
        record.previousTypeOfPresence = undefined;
      } else if (isAbsentType(prevType) || isAbsentType(record.typeOfPresence)) {
        record.typeOfPresence = 'Absent';
        record.value = 0;
        record.totalHour = 0;
        record.excessHour = 0;
        record.halfDay = false;
        record.remarks = '';
        record.previousTypeOfPresence = undefined;
      } else if (isLeaveType(prevType)) {
        record.typeOfPresence = prevType as IDailyRecord['typeOfPresence'];
        record.value = 1;
        record.totalHour = 0;
        record.excessHour = 0;
        record.halfDay = false;
        record.remarks = '';
        record.previousTypeOfPresence = undefined;
      } else {
        attendance.records.delete(date);
        attendance.markModified('records');
      }
    }

    attendance.summary = calculateSummary(
      attendance.records,
      attendance.userId as unknown as IUser
    );
    await attendance.save();
  }
}