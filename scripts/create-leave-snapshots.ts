#!/usr/bin/env tsx

import dbConnect from '../src/lib/mongodb';
import leaveLedger from '../src/lib/leaveLedger';

async function run(month?: string) {
  console.log('📦 Starting leave snapshot job for', month || 'current month');
  try {
    await dbConnect();
    const res = await leaveLedger.createMonthlySnapshots(month);
    console.log('✅ Snapshot job completed:', res);
    process.exit(0);
  } catch (err) {
    console.error('❌ Snapshot job failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  const monthArg = process.argv[2] || process.env.SNAPSHOT_MONTH;
  run(monthArg);
}

export { run };
