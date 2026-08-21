import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import LeaveTransaction from '@/models/LeaveTransaction';
import { getWorkingUnderPartnerForDate, lastDayOfMonthYear } from '@/lib/userFieldHistory';

function ymdFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localTodayYmd(): string {
  return ymdFromDate(new Date());
}

function currentMonthYear(): string {
  return localTodayYmd().slice(0, 7);
}

/** Last calendar day of month as YYYY-MM-DD (local). */
function monthEndYmd(monthYear: string): string {
  return ymdFromDate(lastDayOfMonthYear(monthYear));
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const monthYearParam = (searchParams.get('monthYear') || '').trim();
    const todayYmd = localTodayYmd();
    const thisMonth = currentMonthYear();

    const monthYear =
      monthYearParam && /^\d{4}-\d{2}$/.test(monthYearParam) ? monthYearParam : thisMonth;

    // Cap "as of" at today for the current month so mid-month views stay accurate.
    const asOfDate =
      monthYear >= thisMonth
        ? todayYmd
        : monthEndYmd(monthYear);

    // Fetch all users with their leave balance information
    const users = await User.find({ isActive: true })
      .select('name employeeCode team workingUnderPartner fieldHistories leaveBalance joiningDate employmentType')
      .sort({ name: 1 });

    // Used leave on/after 1 Jan 2026, through asOfDate for the selected month.
    const usedTxAgg = await LeaveTransaction.aggregate([
      {
        $match: {
          type: 'used',
          $or: [
            { monthYear: { $gte: '2026-01', $lte: monthYear } },
            { date: { $gte: '2026-01-01', $lte: asOfDate } },
          ],
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

    // Earned through selected month (ledger). For the live/current month, fall back to
    // user.leaveBalance.earned when ledger is empty so older data still displays.
    const earnedTxAgg = await LeaveTransaction.aggregate([
      {
        $match: {
          type: 'earned',
          $or: [
            { monthYear: { $lte: monthYear } },
            { date: { $lte: asOfDate } },
          ],
        },
      },
      {
        $group: {
          _id: '$userId',
          totalEarned: { $sum: '$amount' },
        },
      },
    ]);

    const earnedFromLedgerMap = new Map<string, number>();
    for (const row of earnedTxAgg) {
      earnedFromLedgerMap.set(String(row._id), Number(row.totalEarned || 0));
    }

    const useLiveEarnedFallback = monthYear >= thisMonth;

    // Transform the data to include user information with leave balances
    const leaveBalances = users.map((user) => {
      const usedAfterJan26 = usedAfterJan26Map.get(user._id.toString()) || 0;
      const balanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
      const ledgerEarned = earnedFromLedgerMap.get(user._id.toString());
      const liveEarned = user.leaveBalance?.earned || 0;
      const earned =
        ledgerEarned !== undefined
          ? ledgerEarned
          : useLiveEarnedFallback
            ? liveEarned
            : 0;
      const used = user.leaveBalance?.used || 0;
      // Compute remaining from its components so the row is internally consistent
      // (balanceAsOfJan26 + earned - used - usedAfterJan26). Balance can never
      // go negative; floor at 0.
      const remaining = Math.max(
        0,
        Number((balanceAsOfJan26 + earned - used - usedAfterJan26).toFixed(3))
      );

      return {
        userId: user._id.toString(),
        userName: user.name,
        employeeCode: user.employeeCode,
        team: getWorkingUnderPartnerForDate(user, lastDayOfMonthYear(monthYear)),
        employmentType: user.employmentType,
        balanceAsOfJan26: balanceAsOfJan26,
        earned: earned,
        used: used, // Leaves before 1st Jan 2026 (from Excel)
        usedAfterJan26: usedAfterJan26, // Sum of used leave on/after 1 Jan 2026 through asOfDate
        remaining: remaining,
        lastUpdated: user.leaveBalance?.lastUpdated || user.joiningDate || new Date(),
        monthlyEarned: user.leaveBalance?.monthlyEarned || 2,
        monthYear,
        asOfDate,
      };
    });

    return NextResponse.json({
      success: true,
      data: leaveBalances,
      monthYear,
      asOfDate,
    });
  } catch (error) {
    console.error('Error fetching leave balances:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leave balances' },
      { status: 500 }
    );
  }
}
