#!/usr/bin/env tsx
/**
 * Reconcile paid/unpaid leave from attendance (backfill / fix historical data).
 *
 * The replay logic lives in src/lib/leaveReconciliation.ts so that this script and the
 * "Upload leaves B/F" action in Leave Management behave identically.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reconcile-leave-from-attendance.ts
 *   npx tsx --env-file=.env.local scripts/reconcile-leave-from-attendance.ts --apply
 *   npx tsx --env-file=.env.local scripts/reconcile-leave-from-attendance.ts --apply --from=2026-01 --to=2026-05
 *   npx tsx --env-file=.env.local scripts/reconcile-leave-from-attendance.ts --dry-run --user-id=<mongoId>
 */

import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import {
  reconcileLeaveFromAttendance,
  currentMonthKey,
  EARN_FROM_MONTH,
} from '../src/lib/leaveReconciliation';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

function parseArgs() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const dryRun = !apply;
  const verbose = argv.includes('--verbose');
  const skipAttendance = argv.includes('--skip-attendance');

  let fromMonth = EARN_FROM_MONTH;
  let toMonth = '';
  let userId = '';

  for (const arg of argv) {
    if (arg.startsWith('--from=')) fromMonth = arg.split('=')[1];
    if (arg.startsWith('--to=')) toMonth = arg.split('=')[1];
    if (arg.startsWith('--user-id=')) userId = arg.split('=')[1];
  }

  if (!toMonth) toMonth = currentMonthKey();

  return { dryRun, verbose, skipAttendance, fromMonth, toMonth, userId };
}

async function main() {
  const opts = parseArgs();
  console.log('\n=== Leave reconciliation from attendance ===');
  console.log('Mode:', opts.dryRun ? 'DRY RUN (pass --apply to write)' : 'APPLY');
  console.log('Month range:', opts.fromMonth, '→', opts.toMonth);
  if (opts.userId) console.log('User filter:', opts.userId);
  console.log('Skip attendance record updates:', opts.skipAttendance);
  console.log('');

  await dbConnect();

  const result = await reconcileLeaveFromAttendance({
    fromMonth: opts.fromMonth,
    toMonth: opts.toMonth,
    userIds: opts.userId ? [opts.userId] : undefined,
    dryRun: opts.dryRun,
    skipAttendance: opts.skipAttendance,
    sampleChangeLimit: Number.MAX_SAFE_INTEGER,
  });

  const changesByUser = new Map<string, typeof result.sampleChanges>();
  for (const change of result.sampleChanges) {
    if (!changesByUser.has(change.userId)) changesByUser.set(change.userId, []);
    changesByUser.get(change.userId)!.push(change);
  }

  for (const u of result.users) {
    if (!opts.verbose && u.attendanceDayChanges === 0 && u.usedAfterJan26 === 0) continue;

    console.log(`\n— ${u.userName} (${u.userId})`);
    console.log(
      `  months=${u.monthsWithAttendance} earned=${u.earned} startBal=${u.startingBalance.toFixed(2)}` +
        ` → usedAfter=${u.usedAfterJan26.toFixed(2)} remaining=${u.remaining.toFixed(2)}` +
        (u.isArticle ? ' [article]' : '')
    );
    console.log(
      `  leave candidates=${u.leaveCandidates} paid=${u.paidDays}` +
        ` unpaid=${u.unpaidDays} partialDays=${u.partialDays}` +
        ` keptFromRequests=${u.lockedDays}`
    );

    if (opts.verbose) {
      for (const c of changesByUser.get(u.userId) || []) {
        console.log(
          `    ${c.date}: ${c.fromType}(${c.fromValue}) → ${c.toType}(${c.toValue}) [${c.reason}]`
        );
      }
    }
  }

  if (result.monthsRebuilt.length > 0) {
    console.log('\nRebuilt LeaveSnapshot for months:', result.monthsRebuilt.join(', '));
  }

  console.log('\n=== Summary ===');
  console.log('Users processed:', result.usersProcessed);
  console.log('Attendance docs updated:', result.attendanceDocsUpdated);
  console.log('Day records updated:', result.recordsUpdated);
  if (!opts.dryRun) {
    console.log('Transactions deleted:', result.transactionsDeleted);
    console.log('Transactions created:', result.transactionsCreated);
    console.log('Snapshots rebuilt for', result.monthsRebuilt.length, 'month(s)');
  } else {
    console.log('(Dry run — no writes. Use --apply to persist.)');
  }
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
