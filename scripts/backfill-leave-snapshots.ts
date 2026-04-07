#!/usr/bin/env tsx
import 'dotenv/config';
import dbConnect from '@/lib/mongodb';
import { createMonthlySnapshots } from '@/lib/leaveLedger';

async function run() {
  await dbConnect();
  // Start from Jan 2026
  const start = new Date(2026, 0, 1);
  const now = new Date();
  const months: string[] = [];
  let cur = new Date(start);
  while (cur <= now) {
    const m = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    months.push(m);
    cur.setMonth(cur.getMonth() + 1);
  }

  for (const m of months) {
    console.log('Creating snapshots for', m);
    try {
      const res = await createMonthlySnapshots(m);
      console.log('Snapshot result', res);
    } catch (e) {
      console.error('Failed for month', m, e);
    }
  }

  console.log('Backfill completed');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
