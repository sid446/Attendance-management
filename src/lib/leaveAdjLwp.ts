import mongoose from 'mongoose';
import User from '@/models/User';
import LeaveTransaction from '@/models/LeaveTransaction';
import { computeLeaveRemaining } from '@/lib/leaveManagement';
import { createMonthlySnapshots } from '@/lib/leaveLedger';

export const ADJ_LWP_SOURCE = 'adj-lwp';
export const ADJ_FROM_MONTH = '2026-01';

export function roundAdj(n: number): number {
  return Number(Number(n || 0).toFixed(3));
}

export function currentLeaveMonthYear(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function prevMonthYear(monthYear: string): string {
  const [y, mon] = monthYear.split('-').map(Number);
  const date = new Date(y, mon - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function nextMonthYear(monthYear: string): string {
  const [y, mon] = monthYear.split('-').map(Number);
  const date = new Date(y, mon - 1, 1);
  date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function addAdjThroughMonth(
  running: number,
  lastInclusiveMonth: string,
  targetMonth: string,
  adjByMonth: Record<string, number> | undefined
): { running: number; lastInclusiveMonth: string } {
  if (!targetMonth || targetMonth < ADJ_FROM_MONTH) {
    return { running, lastInclusiveMonth };
  }
  let month =
    !lastInclusiveMonth || lastInclusiveMonth < ADJ_FROM_MONTH
      ? ADJ_FROM_MONTH
      : nextMonthYear(lastInclusiveMonth);
  while (month && month <= targetMonth) {
    running = roundAdj(running + Number(adjByMonth?.[month] || 0));
    lastInclusiveMonth = month;
    if (month === targetMonth) break;
    month = nextMonthYear(month);
  }
  return { running, lastInclusiveMonth };
}

export function monthsFromTo(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  if (!fromMonth || !toMonth || fromMonth > toMonth) return out;
  let y = Number(fromMonth.slice(0, 4));
  let m = Number(fromMonth.slice(5, 7));
  const endY = Number(toMonth.slice(0, 4));
  const endM = Number(toMonth.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export async function rebuildSnapshotsFromMonth(fromMonth: string, toMonth?: string): Promise<string[]> {
  const end = toMonth && toMonth >= fromMonth ? toMonth : currentLeaveMonthYear();
  const start = fromMonth < ADJ_FROM_MONTH ? ADJ_FROM_MONTH : fromMonth;
  const months = monthsFromTo(start, end);
  for (const monthYear of months) {
    await createMonthlySnapshots(monthYear);
  }
  return months;
}

type AdjRow = { userId: string; monthYear: string; amount: number };

async function loadAdjRows(match: Record<string, unknown>): Promise<AdjRow[]> {
  const rows = await LeaveTransaction.aggregate([
    {
      $match: {
        type: 'adjust',
        source: ADJ_LWP_SOURCE,
        ...match,
      },
    },
    {
      $group: {
        _id: { userId: '$userId', monthYear: '$monthYear' },
        amount: { $sum: '$amount' },
      },
    },
  ]);
  return rows.map((r) => ({
    userId: String(r._id.userId),
    monthYear: String(r._id.monthYear || ''),
    amount: roundAdj(r.amount),
  }));
}

export async function getAdjLwpByUserThroughMonth(monthYear: string): Promise<
  Map<string, { thisMonth: number; tillMonth: number }>
> {
  const target = monthYear >= ADJ_FROM_MONTH ? monthYear : ADJ_FROM_MONTH;
  const rows = await loadAdjRows({ monthYear: { $gte: ADJ_FROM_MONTH, $lte: target } });
  const out = new Map<string, { thisMonth: number; tillMonth: number }>();
  for (const row of rows) {
    const cur = out.get(row.userId) || { thisMonth: 0, tillMonth: 0 };
    cur.tillMonth = roundAdj(cur.tillMonth + row.amount);
    if (row.monthYear === target) cur.thisMonth = roundAdj(cur.thisMonth + row.amount);
    out.set(row.userId, cur);
  }
  return out;
}

export async function getAdjLwpDeltasByUser(userIds?: string[]): Promise<Map<string, Record<string, number>>> {
  const match: Record<string, unknown> = { monthYear: { $gte: ADJ_FROM_MONTH } };
  if (userIds && userIds.length > 0) {
    const oids = userIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (oids.length > 0) match.userId = { $in: oids };
  }
  const rows = await loadAdjRows(match);
  const out = new Map<string, Record<string, number>>();
  for (const row of rows) {
    if (!row.monthYear) continue;
    const byMonth = out.get(row.userId) || {};
    byMonth[row.monthYear] = roundAdj((byMonth[row.monthYear] || 0) + row.amount);
    out.set(row.userId, byMonth);
  }
  return out;
}

export function adjAsOfFromDeltas(deltas: Record<string, number> | undefined, monthYear: string): number {
  if (!deltas) return 0;
  let sum = 0;
  for (const [my, amount] of Object.entries(deltas)) {
    if (my >= ADJ_FROM_MONTH && my <= monthYear) sum += Number(amount || 0);
  }
  return roundAdj(sum);
}

export function adjThisMonthFromDeltas(deltas: Record<string, number> | undefined, monthYear: string): number {
  return roundAdj(Number(deltas?.[monthYear] || 0));
}

export async function getAdjAsOf(userId: mongoose.Types.ObjectId | string, monthYear: string): Promise<number> {
  const target = monthYear >= ADJ_FROM_MONTH ? monthYear : ADJ_FROM_MONTH;
  const rows = await LeaveTransaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        type: 'adjust',
        source: ADJ_LWP_SOURCE,
        monthYear: { $gte: ADJ_FROM_MONTH, $lte: target },
      },
    },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]);
  return roundAdj(rows[0]?.amount || 0);
}

/**
 * Set that month's Adj/LWP change (delta). Later months' own deltas stay;
 * the running till-month total shifts by the difference.
 */
export async function setAdjThisMonth(
  userId: mongoose.Types.ObjectId | string,
  monthYear: string,
  thisMonthAmount: number
): Promise<{ thisMonth: number; tillMonth: number }> {
  const target = monthYear >= ADJ_FROM_MONTH ? monthYear : ADJ_FROM_MONTH;
  const uid = new mongoose.Types.ObjectId(String(userId));
  const thisMonth = roundAdj(thisMonthAmount);

  await LeaveTransaction.deleteMany({
    userId: uid,
    type: 'adjust',
    source: ADJ_LWP_SOURCE,
    monthYear: target,
  });

  if (thisMonth !== 0) {
    await LeaveTransaction.create({
      userId: uid,
      date: `${target}-01`,
      monthYear: target,
      type: 'adjust',
      amount: thisMonth,
      source: ADJ_LWP_SOURCE,
      reference: `adj-lwp:${target}`,
    });
  }

  const tillMonth = await getAdjAsOf(uid, target);
  return { thisMonth, tillMonth };
}

/**
 * Set Adj/LWP as-of `monthYear` to `asOf` by writing that month's delta so
 * sum(Jan..monthYear) === asOf. Later months' deltas are left unchanged.
 */
export async function setAdjAsOf(
  userId: mongoose.Types.ObjectId | string,
  monthYear: string,
  asOf: number
): Promise<{ thisMonth: number; tillMonth: number }> {
  const target = monthYear >= ADJ_FROM_MONTH ? monthYear : ADJ_FROM_MONTH;
  const uid = new mongoose.Types.ObjectId(String(userId));
  const prevMonth = prevMonthYear(target);
  const prevAsOf = prevMonth >= ADJ_FROM_MONTH ? await getAdjAsOf(uid, prevMonth) : 0;
  return setAdjThisMonth(uid, target, roundAdj(asOf) - prevAsOf);
}

export async function syncUserLeaveAdjLwpFromLedger(
  userId: mongoose.Types.ObjectId | string
): Promise<{ leaveAdjLwp: number; remaining: number }> {
  const uid = new mongoose.Types.ObjectId(String(userId));
  const nowMonth = currentLeaveMonthYear();
  const leaveAdjLwp = await getAdjAsOf(uid, nowMonth);
  const user = await User.collection.findOne({ _id: uid }, { projection: { leaveBalance: 1 } });
  if (!user) {
    throw new Error('Employee not found');
  }
  const lb = (user.leaveBalance || {}) as Record<string, unknown>;
  const remaining = computeLeaveRemaining({
    balanceAsOfJan26: Number(lb.balanceAsOfJan26 || 0),
    earned: Number(lb.earned || 0),
    usedAfterJan26: Number(lb.usedAfterJan26 || 0),
    leaveAdjLwp,
  });
  await User.collection.updateOne(
    { _id: uid },
    {
      $set: {
        'leaveBalance.leaveAdjLwp': leaveAdjLwp,
        'leaveBalance.remaining': remaining,
        'leaveBalance.lastUpdated': new Date(),
      },
    }
  );
  return { leaveAdjLwp, remaining };
}

/** Move legacy overall scalar onto a Jan 2026 adj-lwp row when no ledger rows exist yet. */
export async function migrateLeaveAdjLwpScalarsToLedger(): Promise<{ migrated: number }> {
  const users = await User.collection
    .find(
      { 'leaveBalance.leaveAdjLwp': { $exists: true, $ne: 0 } },
      { projection: { leaveBalance: 1 } }
    )
    .toArray();

  let migrated = 0;
  for (const user of users) {
    const uid = user._id as mongoose.Types.ObjectId;
    const scalar = roundAdj(Number((user.leaveBalance as { leaveAdjLwp?: number } | undefined)?.leaveAdjLwp || 0));
    if (scalar === 0) continue;
    const existing = await LeaveTransaction.findOne({
      userId: uid,
      type: 'adjust',
      source: ADJ_LWP_SOURCE,
    }).lean();
    if (existing) continue;
    await LeaveTransaction.create({
      userId: uid,
      date: `${ADJ_FROM_MONTH}-01`,
      monthYear: ADJ_FROM_MONTH,
      type: 'adjust',
      amount: scalar,
      source: ADJ_LWP_SOURCE,
      reference: 'adj-lwp:migrate-scalar',
    });
    migrated += 1;
  }
  return { migrated };
}
