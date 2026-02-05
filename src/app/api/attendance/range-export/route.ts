import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { userIds, monthYear, startDate, endDate } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'userIds array is required' },
        { status: 400 }
      );
    }

    if (!monthYear && (!startDate || !endDate)) {
      return NextResponse.json(
        { success: false, error: 'Either monthYear or startDate and endDate are required' },
        { status: 400 }
      );
    }

    let start: Date, end: Date, monthYears: string[];
    if (monthYear) {
      const [year, month] = monthYear.split('-').map(Number);
      start = new Date(year, month - 1, 1);
      end = new Date(year, month, 0);
      monthYears = [monthYear];
    } else {
      start = new Date(startDate);
      end = new Date(endDate);
      // Calculate monthYears in the range
      monthYears = [];
      const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      for (let d = new Date(startMonth); d <= endMonth; d.setMonth(d.getMonth() + 1)) {
        monthYears.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
    }

    // Fetch attendance records for all selected users for the months
    const attendanceRecords = await Attendance.find({
      userId: { $in: userIds },
      monthYear: { $in: monthYears }
    })
    .populate('userId', 'name employeeId odId employeeCode email department team designation workingUnderPartner scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth')
    .sort({ 'userId.name': 1 });

    // Group records by user and date
    const userRecordsMap = new Map();
    for (const record of attendanceRecords) {
      const userId = record.userId._id.toString();
      if (!userRecordsMap.has(userId)) {
        userRecordsMap.set(userId, { user: record.userId, records: new Map() });
      }
      // Add all records from this month that are in the date range
      for (const [dateStr, dayRecord] of record.records) {
        const recordDate = new Date(dateStr);
        if (recordDate >= start && recordDate <= end) {
          userRecordsMap.get(userId).records.set(dateStr, dayRecord);
        }
      }
    }

    // Transform the data for export
    const exportData: any[] = [];

    for (const { user, records } of userRecordsMap.values()) {
      // Loop from start to end for all days in the period
      for (let currentDate = new Date(start); currentDate <= end; currentDate.setDate(currentDate.getDate() + 1)) {
        const d = new Date(currentDate); // Create a fresh date object to avoid mutation issues
        const dateStr = d.toISOString().split('T')[0];
        const dayRecord = records.get(dateStr);

        // Include ALL dates in the range, even without attendance records

        let status = 'Absent';
        let inTime = '';
        let outTime = '';
        let totalHours = 0;
        let typeOfPresence = '';
        let remarks = '';
        let isLate = false;
        let isHalfDay = false;

        // Check if it's Sunday and set typeOfPresence to 'SUN'
        if (d.getDay() === 0) { // 0 = Sunday
          typeOfPresence = 'SUN';
        }

        // Check if it's a holiday or Sunday
        const isHoliday = typeOfPresence === 'Holiday' || typeOfPresence === 'Official Holiday Duty (OHD)' || typeOfPresence === 'SUN';
        if (isHoliday) {
          status = typeOfPresence === 'SUN' ? 'Sun' : 'Holiday';
        }

        if (dayRecord) {
          inTime = dayRecord.editedCheckin || dayRecord.checkin || '';
          outTime = dayRecord.editedCheckout || dayRecord.checkout || '';
          totalHours = dayRecord.totalHour || 0;
          typeOfPresence = dayRecord.typeOfPresence || '';
          remarks = dayRecord.remarks || '';
          isHalfDay = dayRecord.halfDay || false;

          // Get original times for export
          let originalInTime = dayRecord.checkin || '';
          let originalOutTime = dayRecord.checkout || '';
          let editedInTime = dayRecord.editedCheckin || '';
          let editedOutTime = dayRecord.editedCheckout || '';

          // Determine if times were edited
          let inTimeEdited = editedInTime !== '' && editedInTime !== originalInTime;
          let outTimeEdited = editedOutTime !== '' && editedOutTime !== originalOutTime;

          // Get scheduled times
          const scheduledTimes = getScheduledTimesForDate(user, d);
          let scheduledInTime = scheduledTimes.inTime;
          let scheduledOutTime = scheduledTimes.outTime;

          // Determine status based on user's requirements
          const machineTypes = ['ThumbMachine', 'PIO', 'Thumb machine - not working'];
          const isMachineType = machineTypes.includes(typeOfPresence);

          if (isMachineType) {
            // For machine types: if 00:00 times then Absent, otherwise Present
            if (inTime === '00:00' && outTime === '00:00') {
              status = 'Absent';
            } else {
              status = 'Present';
            }
          } else {
            // For other types, use the type of presence as status
            status = typeOfPresence || 'Absent';
          }

          // Check if late (only for Present status)
          if (status === 'Present') {
            if (scheduledInTime && inTime && inTime !== '00:00') {
              const scheduledMins = timeToMinutes(scheduledInTime);
              const actualMins = timeToMinutes(inTime);
              isLate = actualMins > scheduledMins;
            }
          }

          // Calculate WFH and Outstation values
          let maxWfh = 0.75;
          let actualWfh = 0;
          let maxOutstation = 1.2;
          let actualOutstation = 0;
          let scheduledHours = calculateScheduledHours(user, d);

          // Check if it's WFH type
          if (typeOfPresence === 'WFH-weekdays' || typeOfPresence === 'WFH-weekoff') {
            actualWfh = totalHours || 0; // Use the actual hours worked for WFH
          }

          // Check if it's Outstation type
          if (typeOfPresence === 'Present- outstation') {
            actualOutstation = totalHours || 0; // Use the actual hours worked for Outstation
          }

          // Check if this is Sunday, Holiday, or On Leave - zero out all metrics
          const isHolidayOrSunday = typeOfPresence === 'Holiday' || typeOfPresence === 'Official Holiday Duty (OHD)' || typeOfPresence === 'SUN';
          const isOnLeave = typeOfPresence === 'Leave' || typeOfPresence === 'On leave';

          if (isHolidayOrSunday || isOnLeave) {
            // Zero out all metrics for Sundays, holidays, and leave days
            totalHours = 0;
            scheduledHours = 0;
            actualWfh = 0;
            actualOutstation = 0;
            isLate = false;
            isHalfDay = false;
            inTime = '';
            outTime = '';
            originalInTime = '';
            originalOutTime = '';
            editedInTime = '';
            editedOutTime = '';
            inTimeEdited = false;
            outTimeEdited = false;
            scheduledInTime = '';
            scheduledOutTime = '';
            remarks = (isHolidayOrSunday || isOnLeave) ? typeOfPresence : remarks;
          }

          exportData.push({
            'Employee Name': user.name,
            'Designation': user.designation || '',
            'Day': getDayName(d),
            'Date': dateStr,
            'Present / Absent': status,
            'Actual InTime Original Data': originalInTime,
            'Actual OutTime Original Data': originalOutTime,
            'Actual InTime Editable Data': editedInTime,
            'True/False In Time': inTimeEdited ? 'True' : 'False',
            'True/False Out Time': outTimeEdited ? 'True' : 'False',
            'Scheduled In Time': scheduledInTime,
            'Scheduled Out Time': scheduledOutTime,
            'MAX - WFH': maxWfh,
            'Actual WFH': actualWfh,
            'MAX - Outstation': maxOutstation,
            'Actual Outstation': actualOutstation,
            'Working Hrs': formatHoursMinutes(totalHours),
            'Scheduled Hrs': formatHoursMinutes(scheduledHours),
            'Excess/Short Hrs': formatHoursMinutes(totalHours - scheduledHours),
            'Type of Presence': typeOfPresence,
            'Late Arrival': isLate ? 'Yes' : 'No',
            'Half Day': isHalfDay ? 'Yes' : 'No',
            'Remarks': remarks
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    console.error('Error fetching range attendance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch attendance records' },
      { status: 500 }
    );
  }
}

function getScheduledTimesForDate(user: any, date: Date): { inTime: string; outTime: string } {
  const dow = date.getDay();

  let schedule = user.scheduleInOutTime; // Default regular

  // Check for day-specific schedules first
  if (dow === 6 && user.scheduleInOutTimeSat) {
    schedule = user.scheduleInOutTimeSat;
  }

  // Monthly schedule should only override if no day-specific schedule exists
  if (user.scheduleInOutTimeMonth && !((dow === 6 && user.scheduleInOutTimeSat))) {
    schedule = user.scheduleInOutTimeMonth;
  }

  if (dow === 0) return { inTime: '', outTime: '' }; // Sunday

  if (!schedule || !schedule.inTime || !schedule.outTime) {
    return { inTime: '09:00', outTime: '18:00' }; // Default schedule
  }

  return { inTime: schedule.inTime, outTime: schedule.outTime };
}

function calculateScheduledHours(user: any, date: Date): number {
  const dow = date.getDay();

  let schedule = user.scheduleInOutTime; // Default regular

  // Check for day-specific schedules first
  if (dow === 6 && user.scheduleInOutTimeSat) {
    schedule = user.scheduleInOutTimeSat;
  }

  // Monthly schedule should only override if no day-specific schedule exists
  if (user.scheduleInOutTimeMonth && !((dow === 6 && user.scheduleInOutTimeSat))) {
    schedule = user.scheduleInOutTimeMonth;
  }

  if (dow === 0) return 0; // Sunday

  if (!schedule || !schedule.inTime || !schedule.outTime) return 8; // Default 8 hours

  const inMins = timeToMinutes(schedule.inTime);
  const outMins = timeToMinutes(schedule.outTime);

  return (outMins - inMins) / 60;
}

function formatHoursMinutes(hours: number): string {
  const absHours = Math.abs(hours);
  if (absHours === 0) return '0';
  const totalMinutes = Math.round(absHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const sign = hours < 0 ? '-' : '';
  if (h === 0) {
    return `${sign}${m}m`;
  }
  return `${sign}${h}h ${m}m`;
}

function timeToMinutes(timeStr: string): number {
  if (!timeStr || timeStr === '00:00') return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function getDayName(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}