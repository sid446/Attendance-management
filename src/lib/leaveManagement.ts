import mongoose from 'mongoose';
import User, { IUser } from '@/models/User';
import Attendance from '@/models/Attendance';
import AttendanceRequest from '@/models/AttendanceRequest';
import LeaveTransaction from '@/models/LeaveTransaction';
import LeaveSnapshot from '@/models/LeaveSnapshot';

export interface LeaveBalance {
  balanceAsOfJan26: number;
  earned: number;
  used: number;
  remaining: number;
  lastUpdated: Date;
  monthlyEarned: number;
}

export interface LeaveTransaction {
  userId: mongoose.Types.ObjectId;
  date: Date;
  type: 'earned' | 'used';
  amount: number;
  reason: string;
  reference?: string; // Could be attendance record ID or request ID
}

function getCurrentUserRemaining(user: any): number {
  return (
    (user?.leaveBalance?.balanceAsOfJan26 || 0) +
    (user?.leaveBalance?.earned || 0) -
    (user?.leaveBalance?.used || 0) -
    (user?.leaveBalance?.usedAfterJan26 || 0)
  );
}

async function getEffectiveRemainingForMonth(
  userId: mongoose.Types.ObjectId,
  user: any,
  monthYear: string
): Promise<number> {
  const currentRemaining = getCurrentUserRemaining(user);

  // For pre-2026 months, keep existing behavior.
  if (!monthYear || monthYear < '2026-01') {
    return currentRemaining;
  }

  try {
    const snap = await LeaveSnapshot.findOne({ userId, monthYear })
      .select('balanceAsOfMonth earnedThisMonth adjustmentsThisMonth usedThisMonth remainingAfter')
      .lean();

    if (!snap) {
      return currentRemaining;
    }

    const snapComputed =
      Number(snap.balanceAsOfMonth || 0) +
      Number(snap.earnedThisMonth || 0) +
      Number(snap.adjustmentsThisMonth || 0) -
      Number(snap.usedThisMonth || 0);

    const snapRemainingAfter = Number(snap.remainingAfter || 0);

    // Use the larger value so missing monthly credit in user.leaveBalance
    // does not incorrectly force paid leaves to unpaid.
    return Math.max(currentRemaining, snapComputed, snapRemainingAfter);
  } catch (e) {
    return currentRemaining;
  }
}

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
 * Increment monthly earned leave for all active users
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

    for (const userId of usersWithAttendance) {
      // Get the user
      const user = await User.findById(userId);
      if (!user || !user.isActive) continue;

      // Skip leave balance increment for articles
      const designationLower = (user.designation || '').toLowerCase();
      const employmentTypeLower = (user.employmentType || '').toLowerCase();
      const isArticle = employmentTypeLower.includes('article') || designationLower.includes('article');
      if (isArticle) continue;

      const monthlyEarned = user.leaveBalance?.monthlyEarned || 2;

      // Check if leave was already incremented for this month
      // Skip only if user has earned leave AND it was updated this month
      const lastUpdated = user.leaveBalance?.lastUpdated;
      const currentEarned = user.leaveBalance?.earned || 0;
      if (lastUpdated && currentEarned > 0) {
        const lastUpdatedMonth = `${lastUpdated.getFullYear()}-${String(lastUpdated.getMonth() + 1).padStart(2, '0')}`;
        if (lastUpdatedMonth === targetMonth) {
          continue; // Already incremented for this month
        }
      }

      // Increment earned leave
      const newEarned = currentEarned + monthlyEarned;
      const currentBalanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
      const currentUsed = user.leaveBalance?.used || 0;
      const currentUsedAfterJan26 = user.leaveBalance?.usedAfterJan26 || 0;
      const newRemaining = currentBalanceAsOfJan26 + newEarned - currentUsed - currentUsedAfterJan26; // Can be negative

      await User.findByIdAndUpdate(user._id, {
        'leaveBalance.earned': newEarned,
        'leaveBalance.remaining': newRemaining,
        'leaveBalance.lastUpdated': now,
      });

      try {
        // Record ledger transaction for earned increment (phase 1: write ledger alongside existing balances)
        await LeaveTransaction.create({
          userId: user._id,
          date: now.toISOString().split('T')[0],
          monthYear: targetMonth,
          type: 'earned',
          amount: monthlyEarned,
          source: 'monthly-increment'
        });
      } catch (e) {
        console.error('Failed to write monthly earned LeaveTransaction for user', String(user._id), e);
      }
    }

    console.log(`Monthly leave incremented for ${usersWithAttendance.length} users for month ${targetMonth}`);
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

    // Check if user is an article - articles have no paid leave concept
    const isArticle = user.employmentType?.toLowerCase() === 'article';
    if (isArticle) {
      // Articles always get value 0 for leave (no paid leave)
      const leaveDetails = dates.map(date => ({
        date,
        isPaidLeave: false,
        value: 0
      }));
      return { leaveDetails };
    }

    // For other employees, calculate how many can be paid vs unpaid based on balance.
    // Use month-aware effective remaining (snapshot-aware) so monthly earned credit is considered.
    const leaveDetails = [];
    const remainingByMonth = new Map<string, number>();

    for (const date of dates) {
      const monthYear = String(date).slice(0, 7);
      if (!remainingByMonth.has(monthYear)) {
        const effective = await getEffectiveRemainingForMonth(userId, user, monthYear);
        remainingByMonth.set(monthYear, effective);
      }

      let remainingBalance = remainingByMonth.get(monthYear) || 0;

      if (remainingBalance >= 1) {
        // Has enough balance for paid leave
        leaveDetails.push({
          date,
          isPaidLeave: true,
          value: 1
        });
        remainingBalance -= 1;
        remainingByMonth.set(monthYear, remainingBalance);
      } else {
        // No balance remaining, unpaid leave
        leaveDetails.push({
          date,
          isPaidLeave: false,
          value: 0
        });
      }
    }

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
    const remainingLeave = await getEffectiveRemainingForMonth(userId, user, monthYear);

    // Check if this is a leave request
    const isLeaveRequest = requestedStatus.toLowerCase().includes('leave') ||
                          requestedStatus.toLowerCase().includes('absent') ||
                          requestedStatus === 'On leave';

    if (!isLeaveRequest) {
      return { isPaidLeave: false, value: 1 }; // Not a leave, full attendance value
    }

    // Check if user is an article - articles have no paid leave concept
    const isArticle = user.employmentType?.toLowerCase() === 'article';
    if (isArticle) {
      // Articles always get value 0 for leave (no paid leave)
      return { isPaidLeave: false, value: 0 };
    }

    // For other employees, determine if it's paid or unpaid based on balance
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
): Promise<void> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Handle single date (backward compatibility)
    if (typeof dateOrDetails === 'string') {
        if (!isPaidLeave) {
          return; // No balance update needed for unpaid leave
        }

        const currentUsedAfterJan26 = user.leaveBalance?.usedAfterJan26 || 0;
        const currentBalanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
        const currentEarned = user.leaveBalance?.earned || 0;
        const currentUsed = user.leaveBalance?.used || 0;
        const monthYear = (dateOrDetails && dateOrDetails.length >= 7) ? dateOrDetails.slice(0,7) : undefined;
        const effectiveRemainingForMonth = await getEffectiveRemainingForMonth(
          userId,
          user,
          monthYear || ''
        );

        // Only deduct if there's at least 1 full day remaining. Do not make remaining negative.
        if (effectiveRemainingForMonth < 1) {
          // Not enough balance for a paid leave; treat as unpaid — no update
          console.log(`[LEAVE DEBUG] Not enough remaining leave for user ${userId} on ${dateOrDetails}. Remaining=${effectiveRemainingForMonth}. Skipping paid deduction.`);
          return;
        }

        const newUsedAfterJan26 = currentUsedAfterJan26 + 1;
        const calculatedRemaining = currentBalanceAsOfJan26 + currentEarned - currentUsed - newUsedAfterJan26;
        const safeRemaining = Math.max(0, calculatedRemaining);

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

        return;
    }

    // Handle multiple dates
    const leaveDetails = dateOrDetails as Array<{ date: string; isPaidLeave: boolean; value: number }>;
    const paidLeaves = leaveDetails.filter(detail => detail.isPaidLeave);

    if (paidLeaves.length === 0) {
      return; // No paid leaves to update
    }

    const currentUsedAfterJan26 = user.leaveBalance?.usedAfterJan26 || 0;
    const currentBalanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
    const currentEarned = user.leaveBalance?.earned || 0;
    const currentUsed = user.leaveBalance?.used || 0;

    // Determine paid capacity month-wise using snapshot-aware effective remaining.
    const paidByMonth = new Map<string, Array<{ date: string; isPaidLeave: boolean; value: number }>>();
    for (const p of paidLeaves) {
      const monthYear = (p.date && p.date.length >= 7) ? p.date.slice(0, 7) : '';
      if (!monthYear) continue;
      if (!paidByMonth.has(monthYear)) paidByMonth.set(monthYear, []);
      paidByMonth.get(monthYear)?.push(p);
    }

    const allowedDateSet = new Set<string>();
    let paidCount = 0;
    for (const [monthYear, monthPaidLeaves] of paidByMonth.entries()) {
      const effectiveRemainingForMonth = await getEffectiveRemainingForMonth(userId, user, monthYear);
      const maxPaidLeavesPossible = Math.floor(Math.max(0, effectiveRemainingForMonth));
      const allowedCount = Math.min(monthPaidLeaves.length, maxPaidLeavesPossible);
      paidCount += allowedCount;
      for (let i = 0; i < allowedCount; i++) {
        allowedDateSet.add(monthPaidLeaves[i].date);
      }
    }

    if (paidCount <= 0) {
      console.log(`[LEAVE DEBUG] No sufficient remaining leave for user ${userId}. paidLeaves requested=${paidLeaves.length}`);
      return; // Nothing to deduct
    }

    const newUsedAfterJan26 = currentUsedAfterJan26 + paidCount;
    const calculatedRemaining = currentBalanceAsOfJan26 + currentEarned - currentUsed - newUsedAfterJan26;
    const safeRemaining = Math.max(0, calculatedRemaining);
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

    const balanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
    const currentEarned = user.leaveBalance?.earned || 0;
    const currentUsed = user.leaveBalance?.used || 0;
    let currentUsedAfterJan26 = round2(user.leaveBalance?.usedAfterJan26 || 0);

    const affectedMonths = new Set<string>();
    const computeRemaining = () => round2(balanceAsOfJan26 + currentEarned - currentUsed - currentUsedAfterJan26);

    for (const entry of entries) {
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
        const remaining = Math.max(0, computeRemaining());
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
    }

    const safeRemaining = Math.max(0, round2(balanceAsOfJan26 + currentEarned - currentUsed - currentUsedAfterJan26));
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