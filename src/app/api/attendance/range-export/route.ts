import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { userIds, monthYear } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'userIds array is required' },
        { status: 400 }
      );
    }

    if (!monthYear) {
      return NextResponse.json(
        { success: false, error: 'monthYear is required' },
        { status: 400 }
      );
    }

    // Fetch attendance records for all selected users for the month
    const attendanceRecords = await Attendance.find({
      userId: { $in: userIds },
      monthYear: monthYear
    })
    .populate('userId', 'name employeeId odId employeeCode email department team designation workingUnderPartner scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth')
    .sort({ 'userId.name': 1 });

    // Transform the data for export
    const exportData: any[] = [];

    for (const record of attendanceRecords) {
      const user = record.userId as any;
      const records = record.records as Map<string, any>;

      // Get all days in the month
      const [year, month] = monthYear.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();

      // Create entries for each day
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayRecord = records.get(dateStr);

        let status = 'Absent';
        let inTime = '';
        let outTime = '';
        let totalHours = 0;
        let typeOfPresence = '';
        let remarks = '';
        let isLate = false;
        let isHalfDay = false;

        if (dayRecord) {
          inTime = dayRecord.checkin || '';
          outTime = dayRecord.checkout || '';
          totalHours = dayRecord.totalHour || 0;
          typeOfPresence = dayRecord.typeOfPresence || '';
          remarks = dayRecord.remarks || '';
          isHalfDay = dayRecord.halfDay || false;

          // Determine status
          if (typeOfPresence === 'Leave') {
            status = 'Leave';
          } else if (typeOfPresence === 'Holiday' || typeOfPresence === 'Week Off') {
            status = typeOfPresence;
          } else if (isHalfDay || typeOfPresence === 'Half Day (HD)') {
            status = 'Half Day';
          } else if (inTime && outTime && (inTime !== '00:00' || outTime !== '00:00')) {
            status = 'Present';

            // Check if late
            const dateObj = new Date(year, month - 1, day);
            const dow = dateObj.getDay();

            let scheduledInTime = user.scheduleInOutTime?.inTime; // Default regular

            if (dow === 6 && user.scheduleInOutTimeSat?.inTime) {
              scheduledInTime = user.scheduleInOutTimeSat.inTime;
            }

            if (scheduledInTime && inTime) {
              const scheduledMins = timeToMinutes(scheduledInTime);
              const actualMins = timeToMinutes(inTime);
              isLate = actualMins > scheduledMins;
            }
          } else {
            status = 'Absent';
          }
        }

        exportData.push({
          'Employee Name': user.name,
          'Employee ID': user.employeeCode || user.employeeId || user.odId || '',
          'Team': user.workingUnderPartner || user.team || '',
          'Designation': user.designation || '',
          'Date': dateStr,
          'Day': new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'long' }),
          'Status': status,
          'In Time': inTime,
          'Out Time': outTime,
          'Total Hours': totalHours.toFixed(2),
          'Type of Presence': typeOfPresence,
          'Late Arrival': isLate ? 'Yes' : 'No',
          'Half Day': isHalfDay ? 'Yes' : 'No',
          'Remarks': remarks,
          'Scheduled Hours': calculateScheduledHours(user, new Date(year, month - 1, day)),
          'Excess/Deficit Hours': status === 'Present' ? (totalHours - calculateScheduledHours(user, new Date(year, month - 1, day))).toFixed(2) : '0.00'
        });
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

function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function calculateScheduledHours(user: any, date: Date): number {
  const dow = date.getDay();

  let schedule = user.scheduleInOutTime; // Default regular

  if (dow === 6 && user.scheduleInOutTimeSat) {
    schedule = user.scheduleInOutTimeSat;
  }

  if (dow === 0) return 0; // Sunday

  if (!schedule || !schedule.inTime || !schedule.outTime) return 8; // Default 8 hours

  const inMins = timeToMinutes(schedule.inTime);
  const outMins = timeToMinutes(schedule.outTime);

  return (outMins - inMins) / 60;
}