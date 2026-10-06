import mongoose from 'mongoose';
import User, { IUser } from '@/models/User';
import Attendance from '@/models/Attendance';
import AttendanceRequest from '@/models/AttendanceRequest';
import LeaveTransaction from '@/models/LeaveTransaction';
import { isInternOrArticleEmployee } from '@/lib/isArticleEmployee';

/** Leave earn, use, and Adj/LWP are counted from this month onward. */
const LEAVE_AS_OF_FROM = '2026-01';
const ADJ_LWP_SOURCE = 'adj-lwp';

export interface LeaveBalance {
  balanceAsOfJan26: number;
  earned: number;
  used: number;
  leaveAdjLwp?: number;
  usedAfterJan26?: number;
  remaining: number;
  lastUpdated: Date;
  monthlyEarned: number;
}

/** remaining = B/F + earned − usedAfterJan26 + leaveAdjLwp (floored at 0). */
export function computeLeaveRemaining(parts: {
  balanceAsOfJan26?: number | null;
  earned?: number | null;
  usedAfterJan26?: number | null;
  leaveAdjLwp?: number | null;
}): number {
  const bf = Number(parts.balanceAsOfJan26 || 0);
  const earned = Number(parts.earned || 0);
  const usedAfter = Number(parts.usedAfterJan26 || 0);
  const adj = Number(parts.leaveAdjLwp || 0);
  return Math.max(0, Number((bf + earned - usedAfter + adj).toFixed(3)));
}

export interface LeaveTransaction {
  userId: mongoose.Types.ObjectId;
  date: Date;
  type: 'earned' | 'used';
  amount: number;
  reason: string;
  reference?: string; // Could be attendance record ID or request ID
}

function roundLeave(n: number): number {
  return Number(Number(n || 0).toFixed(3));
}

function txMonth(tx: { monthYear?: string | null; date?: string | null }): string {
  const my = String(tx.monthYear || '');
  if (/^\d{4}-\d{2}$/.test(my)) return my;
  return String(tx.date || '').slice(0, 7);
}

type AsOfLedger = {
  balanceAsOfJan26: number;
  earnedByMonth: Map<string, number>;
  adjByMonth: Map<string, number>;
  /** Used rows not excluded. Compared by date, so only rows dated before D count. */
  used: Array<{ date: string; amount: number }>;
};

async function loadAsOfLedger(
  userId: mongoose.Types.ObjectId | string,
  excludeDates?: Iterable<string>
): Promise<AsOfLedger> {
  const exclude = new Set<string>();
  if (excludeDates) {
    for (const raw of excludeDates) {
      const date = String(raw || '').trim();
      if (date) exclude.add(date);
    }
  }

  const user = await User.findById(userId).select('leaveBalance.balanceAsOfJan26').lean();
  const txs = await LeaveTransaction.find({
    userId,
    type: { $in: ['earned', 'used', 'adjust'] },
  })
    .select('date monthYear type amount source')
    .lean();

  const earnedByMonth = new Map<string, number>();
  const adjByMonth = new Map<string, number>();
  const used: Array<{ date: string; amount: number }> = [];

  for (const tx of txs) {
    const month = txMonth(tx);
    if (!month || month < LEAVE_AS_OF_FROM) continue;
    const amount = Number(tx.amount || 0);
    if (tx.type === 'earned') {
      earnedByMonth.set(month, roundLeave((earnedByMonth.get(month) || 0) + amount));
    } else if (tx.type === 'adjust' && tx.source === ADJ_LWP_SOURCE) {
      adjByMonth.set(month, roundLeave((adjByMonth.get(month) || 0) + amount));
    } else if (tx.type === 'used') {
      const date = String(tx.date || '');
      if (date && exclude.has(date)) continue;
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        used.push({ date, amount });
      } else if (month) {
        used.push({ date: `${month}-01`, amount });
      }
    }
  }

  return {
    balanceAsOfJan26: Number(user?.leaveBalance?.balanceAsOfJan26 || 0),
    earnedByMonth,
    adjByMonth,
    used,
  };
}

/**
 * Balance still available on `date`:
 * opening 1 Jan 2026 + earned through that month + Adj/LWP through that month
 * − used leave dated before that day.
 * Earn and Adj from later months are ignored. Snapshots are not used.
 * `excludeDates` (and `date` itself) are left out of the used total so a
 * re-check of the day, or of the current batch, does not count those rows.
 */
export async function getRemainingAsOfDate(
  userId: mongoose.Types.ObjectId | string,
  date: string,
  excludeDates?: Iterable<string>
): Promise<number> {
  const exclude = new Set<string>(excludeDates ? Array.from(excludeDates, (d) => String(d)) : []);
  exclude.add(String(date));
  const ledger = await loadAsOfLedger(userId, exclude);
  return balanceOnDate(ledger, date, 0);
}

function balanceOnDate(ledger: AsOfLedger, date: string, extraUsedBefore: number): number {
  const monthYear = String(date).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(monthYear) || monthYear < LEAVE_AS_OF_FROM) {
    return Math.max(0, roundLeave(ledger.balanceAsOfJan26));
  }

  let earned = 0;
  for (const [month, amount] of ledger.earnedByMonth) {
    if (month <= monthYear) earned += amount;
  }
  let adj = 0;
  for (const [month, amount] of ledger.adjByMonth) {
    if (month <= monthYear) adj += amount;
  }
  let used = extraUsedBefore;
  for (const row of ledger.used) {
    if (row.date < date) used += row.amount;
  }
  return Math.max(0, roundLeave(ledger.balanceAsOfJan26 + earned - used + adj));
}

/**
 * Walk dates in order. Each paid day spends one from the balance on that date,
 * so an earlier day in the batch is used before a later one, and a later month's
 * +2 is added only when the walk reaches that month.
 */
async function allocateFullDaysAsOf(
  userId: mongoose.Types.ObjectId | string,
  dates: string[]
): Promise<Array<{ date: string; isPaidLeave: boolean; value: number }>> {
  const unique = Array.from(
    new Set(dates.map((d) => String(d || '').trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))
  ).sort();
  const ledger = await loadAsOfLedger(userId, unique);
  let spentEarlierInBatch = 0;
  const details: Array<{ date: string; isPaidLeave: boolean; value: number }> = [];

  for (const date of unique) {
    const remaining = balanceOnDate(ledger, date, spentEarlierInBatch);
    if (remaining >= 1) {
      details.push({ date, isPaidLeave: true, value: 1 });
      spentEarlierInBatch = roundLeave(spentEarlierInBatch + 1);
    } else {
      details.push({ date, isPaidLeave: false, value: 0 });
    }
  }

  return details;
}

export type LeaveApprovalUpdateResult = {
  /** Requested dates that have a used ledger row after this call. */
  deductedDates: string[];
};

/**
 * Initialize leave balance for a new user
 */
export async function initializeLeaveBalance(userId: mongoose.Types.ObjectId): Promise<void> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Start fresh - balanceAsOfJan26 will be uploaded via Excel
    const initialBalanceAsOfJan26 = 0; // Will be set via Excel upload
    const initialEarned = 0; // Will earn when attendance is uploaded

    await User.findByIdAndUpdate(userId, {
      'leaveBalance.balanceAsOfJan26': initialBalanceAsOfJan26,
      'leaveBalance.earned': initialEarned,
      'leaveBalance.remaining': initialBalanceAsOfJan26 + initialEarned,
      'leaveBalance.lastUpdated': new Date(),
    });
  } catch (error) {
    console.error('Error initializing leave balance:', error);
    throw error;
  }
}

/**
 * Ledger sources that represent the monthly base earn (+monthlyEarned once per month).
 * Used as the idempotency key so a given user+month is only ever credited once for the
 * base accrual, regardless of which code path (upload, approve, bulk, monthly job) runs first.
 * Outstation/client-place extras use a different source ('outstation-earned') and are NOT here.
 */
export const MONTHLY_EARNED_SOURCES = [
  'monthly-earned',
  'monthly-increment',
  'attendance-create-increment',
  'attendance-create-increment-bulk',
  'reconcile-script-earned',
];

/**
 * Credit the monthly base earned leave (default 2) for a single user+month, exactly once.
 *
 * Idempotency is enforced via the LeaveTransaction ledger: if a monthly-base earned
 * transaction already exists for this user+month, this is a no-op. This is the single
 * source of truth for monthly accrual and replaces the ad-hoc `earned += 2` blocks that
 * previously lived in the upload/approve/bulk routes and the monthly job.
 *
 * No-ops for pre-2026 months, inactive users, articles, and interns.
 */
export async function creditMonthlyEarnedIfNeeded(
  userId: mongoose.Types.ObjectId | string,
  monthYear: string,
  reference?: string
): Promise<{ credited: boolean; amount: number }> {
  try {
    if (!monthYear || monthYear < '2026-01') return { credited: false, amount: 0 };

    const user = await User.findById(userId);
    if (!user || !user.isActive) return { credited: false, amount: 0 };
    if (isInternOrArticleEmployee(user)) return { credited: false, amount: 0 };

    // Idempotency: skip if a monthly-base earned tx already exists for this user+month.
    const existing = await LeaveTransaction.findOne({
      userId: user._id,
      monthYear,
      type: 'earned',
      source: { $in: MONTHLY_EARNED_SOURCES },
    }).lean();
    if (existing) return { credited: false, amount: 0 };

    const monthlyEarned = user.leaveBalance?.monthlyEarned || 2;
    const currentEarned = user.leaveBalance?.earned || 0;
    const currentBalanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
    const currentUsedAfterJan26 = user.leaveBalance?.usedAfterJan26 || 0;
    const leaveAdjLwp = user.leaveBalance?.leaveAdjLwp || 0;

    const newEarned = Number((currentEarned + monthlyEarned).toFixed(3));
    // Balance can never go negative; floor at 0.
    const newRemaining = computeLeaveRemaining({
      balanceAsOfJan26: currentBalanceAsOfJan26,
      earned: newEarned,
      usedAfterJan26: currentUsedAfterJan26,
      leaveAdjLwp,
    });

    await User.findByIdAndUpdate(user._id, {
      'leaveBalance.earned': newEarned,
      'leaveBalance.remaining': newRemaining,
      'leaveBalance.lastUpdated': new Date(),
      'leaveBalance.monthlyEarned': monthlyEarned,
    });

    try {
      await LeaveTransaction.create({
        userId: user._id,
        date: new Date().toISOString().split('T')[0],
        monthYear,
        type: 'earned',
        amount: monthlyEarned,
        source: 'monthly-earned',
        reference,
      });
    } catch (e) {
      console.error('Failed to write monthly-earned LeaveTransaction for user', String(user._id), e);
    }

    return { credited: true, amount: monthlyEarned };
  } catch (error) {
    console.error('Error crediting monthly earned leave for user', String(userId), monthYear, error);
    return { credited: false, amount: 0 };
  }
}

/**
 * Credit monthly earn for each distinct month, then reload the user so remaining
 * includes the current month's +2 before paid/unpaid leave is decided.
 */
async function creditMonthsAndReloadUser(
  userId: mongoose.Types.ObjectId | string,
  monthYears: Iterable<string>
): Promise<any | null> {
  const seen = new Set<string>();
  for (const raw of monthYears) {
    const monthYear = String(raw || '').slice(0, 7);
    if (!monthYear || monthYear < '2026-01' || seen.has(monthYear)) continue;
    seen.add(monthYear);
    await creditMonthlyEarnedIfNeeded(userId, monthYear);
  }
  return User.findById(userId);
}

/**
 * Increment monthly earned leave for all active users who have attendance for the month.
 * Delegates to creditMonthlyEarnedIfNeeded, which is idempotent per user+month.
 * @param monthYear Optional month-year string (YYYY-MM) to increment for a specific month
 */
export async function incrementMonthlyLeave(monthYear?: string): Promise<void> {
  try {
    const now = new Date();
    const targetMonth = monthYear || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Import Attendance model here to avoid circular imports
    const Attendance = (await import('@/models/Attendance')).default;

    // Find all users who have attendance records for this month
    const usersWithAttendance = await Attendance.distinct('userId', { monthYear: targetMonth });
    console.log(`Found ${usersWithAttendance.length} users with attendance for ${targetMonth}`);

    let creditedCount = 0;
    for (const userId of usersWithAttendance) {
      const res = await creditMonthlyEarnedIfNeeded(userId as mongoose.Types.ObjectId, targetMonth);
      if (res.credited) creditedCount++;
    }

    console.log(`Monthly leave credited for ${creditedCount}/${usersWithAttendance.length} users for month ${targetMonth}`);
  } catch (error) {
    console.error('Error incrementing monthly leave:', error);
    throw error;
  }
}

/**
 * Calculate leave usage for multiple days
 */
export async function calculateLeaveUsageForMultipleDays(
  userId: mongoose.Types.ObjectId,
  dates: string[],
  requestedStatus: string
): Promise<{ leaveDetails: Array<{ date: string; isPaidLeave: boolean; value: number }> }> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if this is a leave request
    const isLeaveRequest = requestedStatus.toLowerCase().includes('leave') ||
                          requestedStatus.toLowerCase().includes('absent') ||
                          requestedStatus === 'On leave';

    if (!isLeaveRequest) {
      // Not a leave request, all dates get full value
      const leaveDetails = dates.map(date => ({
        date,
        isPaidLeave: false,
        value: 1
      }));
      return { leaveDetails };
    }

    // Articles and interns have no paid leave.
    const isArticle = isInternOrArticleEmployee(user);
    if (isArticle) {
      // Articles always get value 0 for leave (no paid leave)
      const leaveDetails = dates.map(date => ({
        date,
        isPaidLeave: false,
        value: 0
      }));
      return { leaveDetails };
    }

    // Credit each involved month's +2 before allocation so leave in that month
    // can use that month's earn, and not a later month's.
    await creditMonthsAndReloadUser(
      userId,
      dates.map((d) => String(d).slice(0, 7))
    );

    const leaveDetails = await allocateFullDaysAsOf(userId, dates);
    return { leaveDetails };
  } catch (error) {
    console.error('Error calculating leave usage for multiple days:', error);
    // Return all as unpaid leave on error
    const leaveDetails = dates.map(date => ({
      date,
      isPaidLeave: false,
      value: 0
    }));
    return { leaveDetails };
  }
}

/**
 * Calculate leave usage for a specific attendance record
 */
export async function calculateLeaveUsage(
  userId: mongoose.Types.ObjectId,
  date: string,
  requestedStatus: string
): Promise<{ isPaidLeave: boolean; value: number }> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const monthYear = String(date || '').slice(0, 7);

    // Check if this is a leave request
    const isLeaveRequest = requestedStatus.toLowerCase().includes('leave') ||
                          requestedStatus.toLowerCase().includes('absent') ||
                          requestedStatus === 'On leave';

    if (!isLeaveRequest) {
      return { isPaidLeave: false, value: 1 }; // Not a leave, full attendance value
    }

    // Articles and interns have no paid leave.
    const isArticle = isInternOrArticleEmployee(user);
    if (isArticle) {
      // Articles always get value 0 for leave (no paid leave)
      return { isPaidLeave: false, value: 0 };
    }

    await creditMonthsAndReloadUser(userId, [monthYear]);
    const remainingLeave = await getRemainingAsOfDate(userId, date, [date]);

    // Paid only when at least one day was still left on this date.
    if (remainingLeave >= 1) {
      // Has enough leave balance for paid leave
      return { isPaidLeave: true, value: 1 };
    } else {
      // No leave balance remaining, unpaid leave
      return { isPaidLeave: false, value: 0 };
    }
  } catch (error) {
    console.error('Error calculating leave usage:', error);
    return { isPaidLeave: false, value: 0 };
  }
}

/**
 * Update leave balance when leave is approved
 * Uses usedAfterJan26 for leaves taken on or after Jan 26, 2026
 */
export async function updateLeaveBalanceOnApproval(
  userId: mongoose.Types.ObjectId,
  dateOrDetails: string | Array<{ date: string; isPaidLeave: boolean; value: number }>,
  isPaidLeave?: boolean
): Promise<LeaveApprovalUpdateResult> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Handle single date (backward compatibility)
    if (typeof dateOrDetails === 'string') {
        if (!isPaidLeave) {
          return { deductedDates: [] };
        }

        // Approving the same day twice must not deduct twice.
        const alreadyDeducted = await LeaveTransaction.findOne({
          userId,
          date: dateOrDetails,
          type: 'used',
        }).lean();
        if (alreadyDeducted) {
          return { deductedDates: [dateOrDetails] };
        }

        const currentUsedAfterJan26 = user.leaveBalance?.usedAfterJan26 || 0;
        const currentBalanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
        const currentEarned = user.leaveBalance?.earned || 0;
        const leaveAdjLwp = user.leaveBalance?.leaveAdjLwp || 0;
        const monthYear = (dateOrDetails && dateOrDetails.length >= 7) ? dateOrDetails.slice(0,7) : undefined;
        const remainingOnDate = await getRemainingAsOfDate(userId, dateOrDetails, [dateOrDetails]);

        // Only deduct if at least 1 full day was left on this date.
        if (remainingOnDate < 1) {
          console.log(`[LEAVE DEBUG] Not enough remaining leave for user ${userId} on ${dateOrDetails}. Remaining=${remainingOnDate}. Skipping paid deduction.`);
          return { deductedDates: [] };
        }

        const newUsedAfterJan26 = currentUsedAfterJan26 + 1;
        const safeRemaining = computeLeaveRemaining({
          balanceAsOfJan26: currentBalanceAsOfJan26,
          earned: currentEarned,
          usedAfterJan26: newUsedAfterJan26,
          leaveAdjLwp,
        });

        await User.findByIdAndUpdate(userId, {
          'leaveBalance.usedAfterJan26': newUsedAfterJan26,
          'leaveBalance.remaining': safeRemaining,
        });

        // record ledger transaction for this paid leave
        try {
          await LeaveTransaction.create({
            userId,
            date: dateOrDetails,
            monthYear,
            type: 'used',
            amount: 1,
            source: 'approval'
          });
        } catch (e) {
          console.error('Failed to write LeaveTransaction for used leave (single)', e);
        }

        // Attempt to create/update snapshot for this month (best-effort)
        try {
          if (monthYear) {
            const ledger = await import('@/lib/leaveLedger');
            await ledger.createMonthlySnapshots(monthYear);
          }
        } catch (e) {
          console.error('Failed to create monthly snapshot after approval (single):', e);
        }

        return { deductedDates: [dateOrDetails] };
    }

    // Handle multiple dates
    const leaveDetails = dateOrDetails as Array<{ date: string; isPaidLeave: boolean; value: number }>;
    const requestedPaidLeaves = leaveDetails.filter(detail => detail.isPaidLeave);

    if (requestedPaidLeaves.length === 0) {
      return { deductedDates: [] };
    }

    // Days already deducted (by an earlier approval or a reconcile) must be skipped,
    // otherwise re-approving a range double-counts those days.
    const existingUsed = await LeaveTransaction.find({
      userId,
      type: 'used',
      date: { $in: requestedPaidLeaves.map(p => p.date) },
    })
      .select('date')
      .lean();
    const alreadyDeductedDates = new Set(existingUsed.map(t => String(t.date)));
    const paidLeaves = requestedPaidLeaves.filter(p => !alreadyDeductedDates.has(p.date));
    const alreadyDeductedList = requestedPaidLeaves
      .map((p) => p.date)
      .filter((date) => alreadyDeductedDates.has(date));

    if (paidLeaves.length === 0) {
      return { deductedDates: alreadyDeductedList };
    }

    const currentUsedAfterJan26 = user.leaveBalance?.usedAfterJan26 || 0;
    const currentBalanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
    const currentEarned = user.leaveBalance?.earned || 0;
    const leaveAdjLwp = user.leaveBalance?.leaveAdjLwp || 0;

    // Spend earlier dates first, using only the balance available on each date.
    const allocation = await allocateFullDaysAsOf(
      userId,
      paidLeaves.map((p) => p.date)
    );
    const allowedDateSet = new Set(
      allocation.filter((d) => d.isPaidLeave).map((d) => d.date)
    );
    const paidCount = allowedDateSet.size;

    if (paidCount <= 0) {
      console.log(`[LEAVE DEBUG] No sufficient remaining leave for user ${userId}. paidLeaves requested=${paidLeaves.length}`);
      return { deductedDates: alreadyDeductedList };
    }

    const newUsedAfterJan26 = currentUsedAfterJan26 + paidCount;
    const safeRemaining = computeLeaveRemaining({
      balanceAsOfJan26: currentBalanceAsOfJan26,
      earned: currentEarned,
      usedAfterJan26: newUsedAfterJan26,
      leaveAdjLwp,
    });
    await User.findByIdAndUpdate(userId, {
      'leaveBalance.usedAfterJan26': newUsedAfterJan26,
      'leaveBalance.remaining': safeRemaining,
    });

    try {
      // create ledger transactions only for dates allowed by month-wise effective remaining
      const toRecord = paidLeaves.filter(d => allowedDateSet.has(d.date));
      const txs = toRecord.map(d => ({
        userId,
        date: d.date,
        monthYear: (d.date && d.date.length >= 7) ? d.date.slice(0,7) : undefined,
        type: 'used',
        amount: d.value || 1,
        source: 'approval'
      }));
      if (txs.length > 0) await LeaveTransaction.insertMany(txs);
    } catch (e) {
      console.error('Failed to write LeaveTransaction entries for multi-day approval', e);
    }

    // After recording transactions for multi-day approval, attempt to build snapshots for affected months
    try {
      const months = Array.from(new Set((paidLeaves || []).map(d => (d.date && d.date.length >= 7) ? d.date.slice(0,7) : undefined).filter(Boolean)));
      if (months.length > 0) {
        const ledger = await import('@/lib/leaveLedger');
        for (const m of months) {
          try {
            await ledger.createMonthlySnapshots(m);
          } catch (e) {
            console.error('Failed to create monthly snapshot after approval (multi):', m, e);
          }
        }
      }
    } catch (e) {
      console.error('Failed to trigger snapshots after multi-day approval:', e);
    }

    return { deductedDates: [...alreadyDeductedList, ...allowedDateSet] };
  } catch (error) {
    console.error('Error updating leave balance on approval:', error);
    throw error;
  }
}

/**
 * Reconcile partial leave deductions for attendance records (idempotent).
 * Example: value 0.8 on eligible weekday status deducts 0.2 leave.
 */
export async function reconcilePartialLeaveFromAttendance(
  userId: mongoose.Types.ObjectId,
  entries: Array<{ date: string; amount: number }>
): Promise<void> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

    const userForBalance =
      (await creditMonthsAndReloadUser(
        userId,
        entries.map((e) => String(e?.date || '').slice(0, 7))
      )) || user;

    const balanceAsOfJan26 = userForBalance.leaveBalance?.balanceAsOfJan26 || 0;
    const currentEarned = userForBalance.leaveBalance?.earned || 0;
    const leaveAdjLwp = userForBalance.leaveBalance?.leaveAdjLwp || 0;
    let currentUsedAfterJan26 = round2(userForBalance.leaveBalance?.usedAfterJan26 || 0);

    const affectedMonths = new Set<string>();
    const computeRemaining = () =>
      round2(
        computeLeaveRemaining({
          balanceAsOfJan26,
          earned: currentEarned,
          usedAfterJan26: currentUsedAfterJan26,
          leaveAdjLwp,
        })
      );

    const orderedEntries = [...entries].sort((a, b) =>
      String(a?.date || '').localeCompare(String(b?.date || ''))
    );
    const partialDates = orderedEntries
      .map((e) => String(e?.date || '').trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const asOfLedger = await loadAsOfLedger(userId, partialDates);
    let usedEarlierInBatch = 0;

    for (const entry of orderedEntries) {
      const date = String(entry?.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        continue;
      }

      const monthYear = date.slice(0, 7);
      const desiredAmount = round2(clamp01(Number(entry?.amount || 0)));
      const reference = `attendance-partial:${date}`;

      const existingTx = await LeaveTransaction.findOne({
        userId,
        source: 'attendance-partial',
        reference,
        type: 'used',
      });

      const existingAmount = round2(Number(existingTx?.amount || 0));
      const requestedDelta = round2(desiredAmount - existingAmount);
      let appliedDelta = 0;

      if (requestedDelta > 0) {
        const remaining = balanceOnDate(asOfLedger, date, usedEarlierInBatch);
        appliedDelta = round2(Math.min(requestedDelta, remaining));
      } else if (requestedDelta < 0) {
        const reversible = Math.min(Math.abs(requestedDelta), existingAmount, currentUsedAfterJan26);
        appliedDelta = round2(-reversible);
      }

      const newAmount = round2(existingAmount + appliedDelta);

      if (newAmount <= 0) {
        if (existingTx) {
          await LeaveTransaction.deleteOne({ _id: existingTx._id });
          affectedMonths.add(monthYear);
        }
      } else if (existingTx) {
        existingTx.amount = newAmount;
        existingTx.monthYear = monthYear;
        existingTx.date = date;
        await existingTx.save();
        if (Math.abs(appliedDelta) > 0) {
          affectedMonths.add(monthYear);
        }
      } else {
        await LeaveTransaction.create({
          userId,
          date,
          monthYear,
          type: 'used',
          amount: newAmount,
          source: 'attendance-partial',
          reference,
        });
        if (newAmount > 0) {
          affectedMonths.add(monthYear);
        }
      }

      if (Math.abs(appliedDelta) > 0) {
        currentUsedAfterJan26 = round2(currentUsedAfterJan26 + appliedDelta);
      }
      usedEarlierInBatch = roundLeave(usedEarlierInBatch + newAmount);
    }

    const safeRemaining = computeRemaining();
    await User.findByIdAndUpdate(userId, {
      'leaveBalance.usedAfterJan26': currentUsedAfterJan26,
      'leaveBalance.remaining': safeRemaining,
    });

    if (affectedMonths.size > 0) {
      try {
        const ledger = await import('@/lib/leaveLedger');
        for (const monthYear of affectedMonths) {
          try {
            await ledger.createMonthlySnapshots(monthYear);
          } catch (e) {
            console.error('Failed to create monthly snapshot after partial leave reconciliation:', monthYear, e);
          }
        }
      } catch (e) {
        console.error('Failed to trigger snapshot reconciliation for partial leave:', e);
      }
    }
  } catch (error) {
    console.error('Error reconciling partial leave from attendance:', error);
    throw error;
  }
}

/**
 * Get leave balance for a user
 */
export async function getLeaveBalance(userId: mongoose.Types.ObjectId): Promise<LeaveBalance | null> {
  try {
    const user = await User.findById(userId).select('leaveBalance');
    return user?.leaveBalance || null;
  } catch (error) {
    console.error('Error getting leave balance:', error);
    return null;
  }
}

/**
 * Reset leave balance (for testing or admin purposes)
 */
export async function resetLeaveBalance(userId: mongoose.Types.ObjectId): Promise<void> {
  try {
    await User.findByIdAndUpdate(userId, {
      'leaveBalance.earned': 0,
      'leaveBalance.used': 0,
      'leaveBalance.leaveAdjLwp': 0,
      'leaveBalance.remaining': 0,
      'leaveBalance.lastUpdated': new Date(),
    });
  } catch (error) {
    console.error('Error resetting leave balance:', error);
    throw error;
  }
}

/**
 * Get leave summary for a user in a specific month
 */
export async function getMonthlyLeaveSummary(
  userId: mongoose.Types.ObjectId,
  monthYear: string
): Promise<{
  earned: number;
  used: number;
  remaining: number;
  leaveRequests: Array<{
    date: string;
    status: string;
    isPaidLeave: boolean;
    value: number;
  }>;
}> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get attendance record for the month
    const attendance = await Attendance.findOne({ userId, monthYear });

    // Get leave requests for the month
    const leaveRequests = await AttendanceRequest.find({
      userId,
      monthYear,
      status: 'Approved',
      requestedStatus: { $regex: /leave|absent/i }
    });

    const leaveSummary = leaveRequests.map(request => {
      const record = attendance?.records?.get(request.date);
      const isPaidLeave = (record?.value || 0) > 0;

      return {
        date: request.date,
        status: request.requestedStatus,
        isPaidLeave,
        value: record?.value || 0,
      };
    });

    return {
      earned: user.leaveBalance?.earned || 0,
      used: user.leaveBalance?.used || 0,
      remaining: user.leaveBalance?.remaining || 0,
      leaveRequests: leaveSummary,
    };
  } catch (error) {
    console.error('Error getting monthly leave summary:', error);
    return {
      earned: 0,
      used: 0,
      remaining: 0,
      leaveRequests: [],
    };
  }
}

/**
 * Remove paid leave transactions for a specific date (reversal when attendance corrected)
 * - Deletes 'used' LeaveTransaction entries for the given date
 * - Adjusts user's usedAfterJan26 and remaining balance safely (no negatives)
 * - Rebuilds monthly snapshots for affected month
 */
export async function removePaidLeaveForDate(
  userId: mongoose.Types.ObjectId,
  date: string
): Promise<void> {
  try {
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(date))) {
      // nothing to do for non-date references
      return;
    }

    const user = await User.findById(userId);
    if (!user) return;

    const monthYear = date.slice(0, 7);

    // Find all 'used' transactions for this user/date
    const txs = await LeaveTransaction.find({ userId, date, type: 'used' });
    if (!txs || txs.length === 0) return;

    const totalAmount = txs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    if (totalAmount <= 0) {
      // Nothing to adjust
      await LeaveTransaction.deleteMany({ _id: { $in: txs.map(t => t._id) } });
      try {
        const ledger = await import('@/lib/leaveLedger');
        await ledger.createMonthlySnapshots(monthYear);
      } catch (e) {
        console.error('Failed to rebuild snapshots after deleting zero-amount txs:', e);
      }
      return;
    }

    // Delete the transactions
    await LeaveTransaction.deleteMany({ _id: { $in: txs.map(t => t._id) } });

    // Adjust user's usedAfterJan26 (safely clamp to >= 0)
    const prevUsedAfter = Number(user.leaveBalance?.usedAfterJan26 || 0);
    const newUsedAfter = Math.max(0, Number((prevUsedAfter - totalAmount).toFixed(3)));

    const balanceAsOfJan26 = Number(user.leaveBalance?.balanceAsOfJan26 || 0);
    const currentEarned = Number(user.leaveBalance?.earned || 0);
    const leaveAdjLwp = Number(user.leaveBalance?.leaveAdjLwp || 0);
    const newRemaining = computeLeaveRemaining({
      balanceAsOfJan26,
      earned: currentEarned,
      usedAfterJan26: newUsedAfter,
      leaveAdjLwp,
    });

    await User.findByIdAndUpdate(userId, {
      'leaveBalance.usedAfterJan26': newUsedAfter,
      'leaveBalance.remaining': newRemaining,
      'leaveBalance.lastUpdated': new Date(),
    });

    // Rebuild snapshot for this month (callers that need later months replay leave after).
    try {
      const ledger = await import('@/lib/leaveLedger');
      await ledger.createMonthlySnapshots(monthYear);
    } catch (e) {
      console.error('Failed to rebuild monthly snapshot after removing paid leave for date', date, e);
    }
  } catch (error) {
    console.error('Error removing paid leave transactions for date:', date, error);
    throw error;
  }
}