import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import LeaveTransaction from '@/models/LeaveTransaction';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    // Fetch all users with their leave balance information
    const users = await User.find({ isActive: true })
      .select('name employeeCode team workingUnderPartner leaveBalance joiningDate employmentType')
      .sort({ name: 1 });

    // Sum used leave from transaction ledger from 31-Dec-2025 onward.
    const usedTxAgg = await LeaveTransaction.aggregate([
      {
        $match: {
          type: 'used',
          date: { $gte: '2025-12-31' },
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
      const remaining = user.leaveBalance?.remaining ?? 0;
      
      return {
        userId: user._id.toString(),
        userName: user.name,
        employeeCode: user.employeeCode,
        team: user.workingUnderPartner || user.team,
        employmentType: user.employmentType,
        balanceAsOfJan26: balanceAsOfJan26,
        earned: earned,
        used: used, // Leaves before 1st Jan 2026 (from Excel)
        usedAfterJan26: usedAfterJan26, // Sum of used leave from 31-Dec-2025 onward (transaction ledger)
        remaining: remaining, // Source of truth from employee.leaveBalance.remaining
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