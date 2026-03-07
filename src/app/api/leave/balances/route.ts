import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Attendance from '@/models/Attendance';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    // Fetch all users with their leave balance information
    const users = await User.find({ isActive: true })
      .select('name employeeCode team workingUnderPartner leaveBalance joiningDate employmentType')
      .sort({ name: 1 });

    // Fetch all attendance records from Jan 2026 onwards to calculate usedAfterJan26
    const attendanceRecords = await Attendance.find({
      monthYear: { $gte: '2026-01' }
    }).lean();

    // Create a map of userId to leave count after Jan 2026
    const userLeaveCountAfterJan26 = new Map<string, number>();

    for (const attendance of attendanceRecords) {
      const userId = attendance.userId.toString();
      const records = attendance.records;
      
      if (records && typeof records === 'object') {
        // Handle both Map and plain object
        const recordEntries = records instanceof Map 
          ? Array.from(records.entries()) 
          : Object.entries(records);
        
        for (const [dateKey, record] of recordEntries) {
          // Check if the date is on or after 1st Jan 2026
          let recordDateStr: string;
          if (dateKey.includes('-')) {
            // Full date format: "2026-01-15"
            recordDateStr = dateKey;
          } else {
            // Day-only format: "15" - combine with monthYear
            const [year, month] = attendance.monthYear.split('-');
            recordDateStr = `${year}-${month}-${dateKey.padStart(2, '0')}`;
          }
          
          // Only count if date is >= 2026-01-01
          if (recordDateStr >= '2026-01-01') {
            const typedRecord = record as { typeOfPresence?: string; value?: number };
            if (typedRecord.typeOfPresence === 'On leave') {
              const currentCount = userLeaveCountAfterJan26.get(userId) || 0;
              // value is typically 1 for full leave, 0.5 for half day
              const leaveValue = typedRecord.value !== undefined ? (1 - typedRecord.value) : 1;
              userLeaveCountAfterJan26.set(userId, currentCount + (leaveValue > 0 ? leaveValue : 1));
            }
          }
        }
      }
    }

    // Transform the data to include user information with leave balances
    const leaveBalances = users.map(user => {
      const usedAfterJan26 = userLeaveCountAfterJan26.get(user._id.toString()) || 0;
      const balanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
      const earned = user.leaveBalance?.earned || 0;
      const used = user.leaveBalance?.used || 0;
      
      // Calculate remaining balance
      // For articles: balanceAsOfJan26 - used - usedAfterJan26
      // For non-articles: balanceAsOfJan26 + earned - used - usedAfterJan26
      const isArticle = user.employmentType?.toLowerCase() === 'article';
      const remaining = isArticle 
        ? balanceAsOfJan26 - used - usedAfterJan26
        : balanceAsOfJan26 + earned - used - usedAfterJan26;
      
      return {
        userId: user._id.toString(),
        userName: user.name,
        employeeCode: user.employeeCode,
        team: user.workingUnderPartner || user.team,
        employmentType: user.employmentType,
        balanceAsOfJan26: balanceAsOfJan26,
        earned: earned,
        used: used, // Leaves before 1st Jan 2026 (from Excel)
        usedAfterJan26: usedAfterJan26, // Leaves on or after 1st Jan 2026 (from attendance)
        remaining: remaining, // Calculated balance
        lastUpdated: user.leaveBalance?.lastUpdated || user.joiningDate || new Date(),
        monthlyEarned: user.leaveBalance?.monthlyEarned || 2,
      };
    });

    return NextResponse.json({
      success: true,
      data: leaveBalances,
    });
  } catch (error) {
    console.error('Error fetching leave balances:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leave balances' },
      { status: 500 }
    );
  }
}