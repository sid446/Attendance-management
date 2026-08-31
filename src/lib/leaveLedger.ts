import LeaveTransaction from '@/models/LeaveTransaction';
import LeaveSnapshot from '@/models/LeaveSnapshot';
import User from '@/models/User';

/**
 * Add a leave transaction to the ledger
 */
export async function addTransaction(tx: {
  userId: any;
  date: string;
  monthYear?: string;
  type: 'earned' | 'used' | 'adjust';
  amount: number;
  source?: string;
  reference?: string;
}) {
  return LeaveTransaction.create(tx);
}

/**
 * Aggregate transactions for a target month and also compute cumulative sums up to that month
 */
export async function aggregateMonth(targetMonth: string) {
  // targetMonth format YYYY-MM
  // Aggregate month totals by user
  const monthMatch = { $or: [ { monthYear: targetMonth }, { date: { $regex: `^${targetMonth}` } } ] };

  const monthAgg = await LeaveTransaction.aggregate([
    { $match: monthMatch },
    {
      $group: {
        _id: { userId: '$userId', type: '$type' },
        total: { $sum: '$amount' }
      }
    }
  ]);

  // Pivot into per-user map
  const perUser: Record<string, { earned: number; used: number; adjust: number }> = {};
  for (const row of monthAgg) {
    const userId = String(row._id.userId);
    perUser[userId] = perUser[userId] || { earned: 0, used: 0, adjust: 0 };
    if (row._id.type === 'earned') perUser[userId].earned += row.total;
    else if (row._id.type === 'used') perUser[userId].used += row.total;
    else if (row._id.type === 'adjust') perUser[userId].adjust += row.total;
  }

  // Now compute cumulative sums up to and including targetMonth
  const cumulativeMatch = { $or: [ { monthYear: { $lte: targetMonth } }, { date: { $regex: `^${targetMonth}` } } ] };
  const cumAgg = await LeaveTransaction.aggregate([
    { $match: cumulativeMatch },
    {
      $group: {
        _id: { userId: '$userId', type: '$type' },
        total: { $sum: '$amount' }
      }
    }
  ]);

  const cumPerUser: Record<string, { earned: number; used: number; adjust: number }> = {};
  for (const row of cumAgg) {
    const userId = String(row._id.userId);
    cumPerUser[userId] = cumPerUser[userId] || { earned: 0, used: 0, adjust: 0 };
    if (row._id.type === 'earned') cumPerUser[userId].earned += row.total;
    else if (row._id.type === 'used') cumPerUser[userId].used += row.total;
    else if (row._id.type === 'adjust') cumPerUser[userId].adjust += row.total;
  }

  return { perUser, cumPerUser };
}

/**
 * Create or update LeaveSnapshot documents for the given month
 */
export async function createMonthlySnapshots(monthYear?: string) {
  const now = new Date();
  const target = monthYear || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { perUser, cumPerUser } = await aggregateMonth(target);
  const userIds = Object.keys({ ...perUser, ...cumPerUser });

  // helper to get previous month string
  function prevMonth(m: string) {
    const [y, mon] = m.split('-').map(Number);
    const date = new Date(y, mon - 1, 1);
    date.setMonth(date.getMonth() - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  const prev = prevMonth(target);

  for (const uid of userIds) {
    const monthVals = perUser[uid] || { earned: 0, used: 0, adjust: 0 };
    const cumVals = cumPerUser[uid] || { earned: 0, used: 0, adjust: 0 };

    // Fetch user to read balanceAsOfJan26 as a fallback and employment info
    const user = await User.findById(uid).select('leaveBalance employmentType designation');
    const balanceAsOfJan26 = user?.leaveBalance?.balanceAsOfJan26 || 0;
    const leaveAdjLwp = Number(user?.leaveBalance?.leaveAdjLwp || 0);
    // Adj/LWP is a live scalar (not always a dated ledger row). Include it in the
    // Jan-2026 opening so month-start B/F matches remaining = B/F + earned − used + adj.
    const openingBaseline = balanceAsOfJan26 + leaveAdjLwp;

    // Try to read previous snapshot for canonical carry-forward
    let balanceAsOfMonth = openingBaseline;
    try {
      const prevSnap = await LeaveSnapshot.findOne({ userId: uid, monthYear: prev });
      if (prevSnap) {
        balanceAsOfMonth = prevSnap.remainingAfter;
      } else {
        balanceAsOfMonth = openingBaseline;
      }
    } catch (e) {
      balanceAsOfMonth = openingBaseline;
    }

    let earnedThisMonth = monthVals.earned || 0;
    const usedThisMonth = monthVals.used || 0;
    const adjustmentsThisMonth = monthVals.adjust || 0;

    // Treat 'article' employment/designation as articleship: they do not get paid leave
    const employmentTypeLower = (user?.employmentType || '').toString().toLowerCase();
    const designationLower = (user?.designation || '').toString().toLowerCase();
    const isArticle = employmentTypeLower.includes('article') || designationLower.includes('article');
    // Check for an existing snapshot for this month so we can decide whether to apply
    // the earned=2 business rule to existing documents as well (but never overwrite
    // non-zero earned values).
    const existingSnap = await LeaveSnapshot.findOne({ userId: uid, monthYear: target }).lean();
    const noEarnedTx = (monthVals.earned || 0) === 0;
    const shouldApplyEarned2 = target >= '2026-01' && !isArticle && noEarnedTx;
    if (shouldApplyEarned2) {
      if (!existingSnap) {
        // For new snapshots, set earned on insert (handled below via $setOnInsert)
        earnedThisMonth = 2;
      } else if (!existingSnap.earnedThisMonth || existingSnap.earnedThisMonth === 0) {
        // Existing snapshot has earned missing or zero — update to 2
        earnedThisMonth = 2;
      }
    }

    // If this snapshot already exists and there are no earned transactions for this month,
    // preserve previously stored earned value to keep remainingAfter consistent.
    if (existingSnap && (monthVals.earned || 0) === 0 && (existingSnap.earnedThisMonth || 0) > 0) {
      earnedThisMonth = existingSnap.earnedThisMonth;
    }

    const remainingAfter = Math.max(0, balanceAsOfMonth + earnedThisMonth + adjustmentsThisMonth - usedThisMonth);

    // Build update document for upsert. Use $setOnInsert for fields we only want on creation.
    const updateDoc: any = {
      $set: {
        userId: uid,
        monthYear: target,
        usedThisMonth,
        adjustmentsThisMonth,
        cumulativeEarned: cumVals.earned || 0,
        cumulativeUsed: cumVals.used || 0,
        cumulativeAdjust: cumVals.adjust || 0,
        balanceAsOfMonth,
        remainingAfter
      },
      $setOnInsert: {
        createdAt: new Date()
      }
    };

    // If snapshot is new, set earnedThisMonth on insert. If snapshot exists but had
    // zero earned and we decided to apply earned=2, set it now (but do not overwrite
    // non-zero earned values).
    if (!existingSnap) {
      updateDoc.$setOnInsert.earnedThisMonth = earnedThisMonth;
    } else if (existingSnap && shouldApplyEarned2 && (!existingSnap.earnedThisMonth || existingSnap.earnedThisMonth === 0)) {
      updateDoc.$set.earnedThisMonth = earnedThisMonth;
    }

    await LeaveSnapshot.findOneAndUpdate(
      { userId: uid, monthYear: target },
      updateDoc,
      { upsert: true, new: true }
    );
  }

  return { month: target, count: userIds.length };
}

export default {
  addTransaction,
  aggregateMonth,
  createMonthlySnapshots
};
