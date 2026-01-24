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
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayRecord = records.get(dateStr);

        if (!dayRecord) continue; // Only export days with attendance records

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
          if (typeOfPresence === 'On leave') {
            status = 'On leave';
          } else if (typeOfPresence === 'Holiday') {
            status = typeOfPresence;
          } else if (isHalfDay || typeOfPresence === 'Half Day (HD)') {
            status = 'Half Day';
          } else if (inTime && outTime && (inTime !== '00:00' || outTime !== '00:00')) {
            status = 'Present';

            // Check if late
            const dateObj = d;
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
          'Day': d.toLocaleDateString('en-US', { weekday: 'long' }),
          'Status': status,
          'In Time': inTime,
          'Out Time': outTime,
          'Total Hours': totalHours.toFixed(2),
          'Type of Presence': typeOfPresence,
          'Late Arrival': isLate ? 'Yes' : 'No',
          'Half Day': isHalfDay ? 'Yes' : 'No',
          'Remarks': remarks,
          'Scheduled Hours': calculateScheduledHours(user, d),
          'Excess/Deficit Hours': status === 'Present' ? (totalHours - calculateScheduledHours(user, d)).toFixed(2) : '0.00'
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

  // Prefer monthly if available
  if (user.scheduleInOutTimeMonth) {
    schedule = user.scheduleInOutTimeMonth;
  }

  if (dow === 0) return 0; // Sunday

  if (!schedule || !schedule.inTime || !schedule.outTime) return 8; // Default 8 hours

  const inMins = timeToMinutes(schedule.inTime);
  const outMins = timeToMinutes(schedule.outTime);

  return (outMins - inMins) / 60;
}