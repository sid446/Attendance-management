#!/usr/bin/env tsx
/**
 * Move live User.leaveBalance.leaveAdjLwp scalars onto a Jan 2026 adj-lwp
 * ledger row when the employee has no adj-lwp transactions yet, then rebuild
 * monthly snapshots from Jan 2026 through the current month.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/migrate-leave-adj-lwp.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import {
  ADJ_FROM_MONTH,
  migrateLeaveAdjLwpScalarsToLedger,
  rebuildSnapshotsFromMonth,
  currentLeaveMonthYear,
} from '../src/lib/leaveAdjLwp';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  console.log('\n=== Migrate Leave Adj/LWP scalars to monthly ledger ===');
  await dbConnect();

  const { migrated } = await migrateLeaveAdjLwpScalarsToLedger();
  console.log(`Wrote ${migrated} adj-lwp transaction(s) for ${ADJ_FROM_MONTH}.`);

  const toMonth = currentLeaveMonthYear();
  console.log(`Rebuilding snapshots ${ADJ_FROM_MONTH} → ${toMonth}…`);
  const months = await rebuildSnapshotsFromMonth(ADJ_FROM_MONTH, toMonth);
  console.log(`Rebuilt ${months.length} month(s): ${months.join(', ')}`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
