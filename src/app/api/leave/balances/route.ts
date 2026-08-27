import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import LeaveTransaction from '@/models/LeaveTransaction';
import { getWorkingUnderPartnerForDate, lastDayOfMonthYear } from '@/lib/userFieldHistory';
import { computeLeaveRemaining } from '@/lib/leaveManagement';

export const dynamic = 'force-dynamic';

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

    // lean() so nested fields like leaveAdjLwp are returned even if a stale
    // in-memory Mongoose model was compiled before the schema path existed.
    const users = await User.find({ isActive: true })
      .select('name employeeCode team workingUnderPartner fieldHistories leaveBalance joiningDate employmentType')
      .sort({ name: 1 })
      .lean();

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
      const usedAfterJan26 = usedAfterJan26Map.get(String(user._id)) || 0;
      const balanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
      const ledgerEarned = earnedFromLedgerMap.get(String(user._id));
      const liveEarned = user.leaveBalance?.earned || 0;
      const earned =
        ledgerEarned !== undefined
          ? ledgerEarned
          : useLiveEarnedFallback
            ? liveEarned
            : 0;
      // Read adj from lean doc; treat missing as 0 (do not fall back to legacy `used`).
      const leaveAdjLwp = Number(
        (user.leaveBalance as { leaveAdjLwp?: number } | undefined)?.leaveAdjLwp ?? 0
      );
      const remaining = computeLeaveRemaining({
        balanceAsOfJan26,
        earned,
        usedAfterJan26,
        leaveAdjLwp,
      });

      return {
        userId: String(user._id),
        userName: user.name,
        employeeCode: user.employeeCode,
        team: getWorkingUnderPartnerForDate(user as any, lastDayOfMonthYear(monthYear)),
        employmentType: user.employmentType,
        balanceAsOfJan26: balanceAsOfJan26,
        earned: earned,
        leaveAdjLwp,
        usedAfterJan26: usedAfterJan26,
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
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error fetching leave balances:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leave balances' },
      { status: 500 }
    );
  }
}
