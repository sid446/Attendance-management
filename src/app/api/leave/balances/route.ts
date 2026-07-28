import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import LeaveTransaction from '@/models/LeaveTransaction';
import { getWorkingUnderPartnerForDate } from '@/lib/userFieldHistory';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    // Fetch all users with their leave balance information
    const users = await User.find({ isActive: true })
      .select('name employeeCode team workingUnderPartner fieldHistories leaveBalance joiningDate employmentType')
      .sort({ name: 1 });

    // Sum used leave from transaction ledger on/after 1 Jan 2026 (matches UI label
    // "Used (after 1 Jan)" / "Leave on/after 1 Jan 2026").
    const usedTxAgg = await LeaveTransaction.aggregate([
      {
        $match: {
          type: 'used',
          date: { $gte: '2026-01-01' },
        },
      },
      {
        $group: {
          _id: '$userId',
          totalUsedAfterJan26: { $sum: '$amount' },
        },
      },
    ]);

    const usedAfterJan26Map = new Map<string, number>();
    for (const row of usedTxAgg) {
      usedAfterJan26Map.set(String(row._id), Number(row.totalUsedAfterJan26 || 0));
    }

    // Transform the data to include user information with leave balances
    const leaveBalances = users.map(user => {
      const usedAfterJan26 = usedAfterJan26Map.get(user._id.toString()) || 0;
      const balanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
      const earned = user.leaveBalance?.earned || 0;
      const used = user.leaveBalance?.used || 0;
      // Compute remaining from its components so the row is internally consistent
      // (balanceAsOfJan26 + earned - used - usedAfterJan26). This keeps the displayed
      // usedAfterJan26 (ledger-derived) and remaining in agreement. Balance can never
      // go negative; floor at 0.
      const remaining = Math.max(0, Number((balanceAsOfJan26 + earned - used - usedAfterJan26).toFixed(3)));

      return {
        userId: user._id.toString(),
        userName: user.name,
        employeeCode: user.employeeCode,
        team: getWorkingUnderPartnerForDate(user, new Date()),
        employmentType: user.employmentType,
        balanceAsOfJan26: balanceAsOfJan26,
        earned: earned,
        used: used, // Leaves before 1st Jan 2026 (from Excel)
        usedAfterJan26: usedAfterJan26, // Sum of used leave on/after 1 Jan 2026 (transaction ledger)
        remaining: remaining, // Derived: balanceAsOfJan26 + earned - used - usedAfterJan26
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