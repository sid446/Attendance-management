/**
 * Reconcile leaveBalance.earned for non-article users after Jan 2026.
 *
 * Recomputes each user's earned as:
 *   base  = (# distinct attendance months >= 2026-01) * monthlyEarned (default 2)
 *   extra = sum of LeaveTransaction { type: 'earned', source: 'outstation-earned' }
 *   earned = base + extra
 * and remaining = balanceAsOfJan26 + earned - usedAfterJan26 + leaveAdjLwp.
 *
 * It also backfills a canonical monthly-base earned ledger row ('monthly-earned')
 * for any attendance month >= 2026-01 that has no existing monthly-base earned tx,
 * so future accrual (creditMonthlyEarnedIfNeeded) stays idempotent.
 *
 * Dry-run by default. Pass --apply to persist changes.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reconcile-leave-earned.ts
 *   npx tsx --env-file=.env.local scripts/reconcile-leave-earned.ts --apply
 *   npx tsx --env-file=.env.local scripts/reconcile-leave-earned.ts --userId=ID --apply
 */
import dbConnect from '../src/lib/mongodb';
import User from '../src/models/User';
import Attendance from '../src/models/Attendance';
import LeaveTransaction from '../src/models/LeaveTransaction';
import { isArticleEmployee } from '../src/lib/isArticleEmployee';
import { MONTHLY_EARNED_SOURCES } from '../src/lib/leaveManagement';

const JAN_2026 = '2026-01';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function round3(n: number): number {
  return Number(n.toFixed(3));
}

async function main() {
  const apply = hasFlag('apply');
  const onlyUserId = readArg('userId');

  await dbConnect();

  const userQuery: Record<string, unknown> = { isActive: true };
  if (onlyUserId) userQuery._id = onlyUserId;

  const users = await User.find(userQuery).select(
    'name employeeCode designation employmentType leaveBalance'
  );

  let changed = 0;
  let backfilled = 0;

  for (const user of users) {
    if (isArticleEmployee(user)) continue;

    const monthlyEarned = user.leaveBalance?.monthlyEarned || 2;
    const balanceAsOfJan26 = user.leaveBalance?.balanceAsOfJan26 || 0;
    const leaveAdjLwp = user.leaveBalance?.leaveAdjLwp || 0;
    const usedAfterJan26 = user.leaveBalance?.usedAfterJan26 || 0;
    const currentEarned = user.leaveBalance?.earned || 0;

    // Distinct attendance months >= 2026-01
    const months: string[] = (
      await Attendance.distinct('monthYear', { userId: user._id })
    ).filter((m: string) => typeof m === 'string' && m >= JAN_2026);

    const base = months.length * monthlyEarned;

    // Extra earned from outstation/client-place fractional deltas
    const extraAgg = await LeaveTransaction.aggregate([
      { $match: { userId: user._id, type: 'earned', source: 'outstation-earned' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const extra = round3(Number(extraAgg[0]?.total || 0));

    const newEarned = round3(base + extra);
    // Balance can never go negative; floor at 0.
    const newRemaining = Math.max(0, round3(balanceAsOfJan26 + newEarned - usedAfterJan26 + leaveAdjLwp));

    // Determine which attendance months lack a monthly-base earned tx (need backfill)
    const monthsWithBaseTx: string[] = await LeaveTransaction.distinct('monthYear', {
      userId: user._id,
      type: 'earned',
      source: { $in: MONTHLY_EARNED_SOURCES },
      monthYear: { $gte: JAN_2026 },
    });
    const withBase = new Set(monthsWithBaseTx);
    const missingMonths = months.filter((m) => !withBase.has(m));

    const earnedChanged = round3(currentEarned) !== newEarned;
    if (!earnedChanged && missingMonths.length === 0) continue;

    console.log(
      `${user.name} (${user.employeeCode || user._id}): earned ${currentEarned} -> ${newEarned} ` +
        `[base=${base} (${months.length}m x ${monthlyEarned}) + extra=${extra}], remaining -> ${newRemaining}` +
        (missingMonths.length ? `, backfill months: ${missingMonths.join(', ')}` : '')
    );

    if (!apply) {
      if (earnedChanged) changed++;
      backfilled += missingMonths.length;
      continue;
    }

    await User.findByIdAndUpdate(user._id, {
      'leaveBalance.earned': newEarned,
      'leaveBalance.remaining': newRemaining,
      'leaveBalance.monthlyEarned': monthlyEarned,
      'leaveBalance.lastUpdated': new Date(),
    });
    if (earnedChanged) changed++;

    for (const m of missingMonths) {
      try {
        await LeaveTransaction.create({
          userId: user._id,
          date: `${m}-01`,
          monthYear: m,
          type: 'earned',
          amount: monthlyEarned,
          source: 'monthly-earned',
          reference: 'reconcile-leave-earned',
        });
        backfilled++;
      } catch (e) {
        console.error(`Failed to backfill monthly-earned tx for ${user._id} ${m}`, e);
      }
    }
  }

  console.log(
    `\n${apply ? 'APPLIED' : 'DRY-RUN'}: ${changed} user(s) with earned changes, ${backfilled} monthly-earned ledger row(s) ${apply ? 'created' : 'to create'}.`
  );
  if (!apply) console.log('Re-run with --apply to persist.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
