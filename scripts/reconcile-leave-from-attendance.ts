#!/usr/bin/env tsx
/**
 * Reconcile paid/unpaid leave from attendance (backfill / fix historical data).
 *
 * How leave works in production (natural flow):
 * ─────────────────────────────────────────────
 * 1. User.leaveBalance
 *    - balanceAsOfJan26: opening balance (Excel)
 *    - earned: +2 per calendar month with attendance (from 2026-01, non-articles)
 *    - used: leave taken before Jan 2026 (Excel)
 *    - usedAfterJan26: leave consumed from 2026 onward (ledger-driven)
 *    - remaining = balanceAsOfJan26 + earned - used - usedAfterJan26
 *
 * 2. LeaveTransaction (ledger)
 *    - earned | used | adjust
 *    - Sources: monthly-increment, approval (full-day paid leave), attendance-partial (WFH/HD shortfall)
 *
 * 3. LeaveSnapshot — monthly rollup from transactions (+ earned=2 rule in leaveLedger)
 *
 * 4. Attendance records
 *    - Absent / On leave (value 0 = unpaid, 1 = paid)
 *    - Machine ThumbMachine with 00:00–00:00 on working days → treated as absent candidates
 *
 * Upload allocation: absent candidates sorted by date; earliest days consume balance → On leave, rest Absent.
 *
 * This script replays that logic across all stored attendance, then rebuilds transactions,
 * user balances, and snapshots.
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
import Attendance from '../src/models/Attendance';
import Holiday from '../src/models/Holiday';
import User from '../src/models/User';
import LeaveTransaction from '../src/models/LeaveTransaction';
import { createMonthlySnapshots } from '../src/lib/leaveLedger';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const MONTHLY_EARN = 2;
const EARN_FROM_MONTH = '2026-01';
const MACHINE_TYPES = new Set(['ThumbMachine', 'Manual', 'Remote']);

const USED_SOURCES_TO_REPLACE = new Set([
  'approval',
  'attendance-partial',
  'reconcile-script-used',
  'reconcile-script-partial',
]);

const EARNED_SOURCES_TO_REPLACE = new Set([
  'monthly-increment',
  'attendance-create-increment',
  'attendance-create-increment-bulk',
  'reconcile-script-earned',
]);

type DayRecord = {
  checkin?: string;
  checkout?: string;
  editedCheckin?: string;
  editedCheckout?: string;
  typeOfPresence?: string;
  value?: number;
  halfDay?: boolean;
  totalHour?: number;
  excessHour?: number;
  remarks?: string;
};

type AllocResult = {
  date: string;
  paid: boolean;
  value: number;
  reason: string;
};

type PartialResult = {
  date: string;
  amount: number;
};

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

  if (!toMonth) {
    const now = new Date();
    toMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  return { dryRun, apply, verbose, skipAttendance, fromMonth, toMonth, userId };
}

function monthInRange(monthYear: string, from: string, to: string): boolean {
  return monthYear >= from && monthYear <= to;
}

function isArticleUser(user: { employmentType?: string; designation?: string }): boolean {
  const emp = String(user.employmentType || '').toLowerCase();
  const des = String(user.designation || '').toLowerCase();
  return emp.includes('article') || des.includes('article');
}

function recordsMapToObject(records: Map<string, DayRecord> | Record<string, DayRecord>): Record<string, DayRecord> {
  if (records instanceof Map) {
    const out: Record<string, DayRecord> = {};
    records.forEach((v, k) => {
      out[k] = typeof v === 'object' && v !== null ? { ...v } : v;
    });
    return out;
  }
  return { ...(records || {}) };
}

function effectiveInOut(rec: DayRecord): { inTime: string; outTime: string } {
  const inTime = String(rec.editedCheckin ?? rec.checkin ?? '').trim();
  const outTime = String(rec.editedCheckout ?? rec.checkout ?? '').trim();
  return { inTime, outTime };
}

function isNonWorkingDay(
  dateStr: string,
  typeOfPresence: string,
  holidayDates: Set<string>
): boolean {
  const typeLower = String(typeOfPresence || '').toLowerCase();
  return (
    new Date(dateStr).getDay() === 0 ||
    holidayDates.has(dateStr) ||
    typeOfPresence === 'Holiday' ||
    typeOfPresence === 'Sunday' ||
    typeOfPresence === 'Weekoff' ||
    typeLower.includes('holiday') ||
    typeLower.includes('weekoff') ||
    typeLower.includes('week off')
  );
}

/** Same rules as POST /api/attendance bulk upload. */
function isLeaveCandidate(dateStr: string, rec: DayRecord, holidayDates: Set<string>): boolean {
  const type = String(rec.typeOfPresence || '');
  if (type === 'On leave' || type === 'Absent') return true;

  const { inTime, outTime } = effectiveInOut(rec);
  const bothZero = (!inTime || inTime === '00:00') && (!outTime || outTime === '00:00');
  if (bothZero && MACHINE_TYPES.has(type) && !isNonWorkingDay(dateStr, type, holidayDates)) {
    return true;
  }
  return false;
}

function getPartialShortfall(dateStr: string, rec: DayRecord): number {
  const day = new Date(dateStr).getDay();
  if (day < 1 || day > 5) return 0;

  const type = String(rec.typeOfPresence || '');
  const eligible =
    type === 'WFH - weekdays' ||
    type === 'Half Day - weekdays' ||
    type === 'Half Day (HD)';

  if (!eligible) return 0;

  const raw = Number(rec.value);
  if (!Number.isFinite(raw)) return 0;
  const normalized = Math.min(1, Math.max(0, raw));
  return Math.round((1 - normalized) * 100) / 100;
}

function allocateLeaveDays(
  dates: string[],
  startingBalance: number,
  isArticle: boolean
): { allocations: AllocResult[]; endingBalance: number } {
  const sorted = [...dates].sort();
  let running = startingBalance;
  const allocations: AllocResult[] = [];

  for (const date of sorted) {
    if (isArticle) {
      allocations.push({ date, paid: false, value: 0, reason: 'article-no-paid-leave' });
      continue;
    }
    if (running >= 1) {
      running -= 1;
      allocations.push({ date, paid: true, value: 1, reason: 'balance-available' });
    } else {
      allocations.push({ date, paid: false, value: 0, reason: 'insufficient-balance' });
    }
  }

  return { allocations, endingBalance: running };
}

function allocatePartialDays(
  entries: Array<{ date: string; amount: number }>,
  startingBalance: number
): { results: PartialResult[]; endingBalance: number } {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let running = Math.max(0, startingBalance);
  const results: PartialResult[] = [];

  for (const { date, amount } of sorted) {
    const desired = Math.round(Math.max(0, amount) * 100) / 100;
    if (desired <= 0) {
      results.push({ date, amount: 0 });
      continue;
    }
    const applied = Math.round(Math.min(desired, running) * 100) / 100;
    running = Math.round((running - applied) * 100) / 100;
    results.push({ date, amount: applied });
  }

  return { results, endingBalance: running };
}

function recalcLeaveSummary(records: Record<string, DayRecord>) {
  let totalLeave = 0;
  let totalAbsent = 0;
  for (const rec of Object.values(records)) {
    const type = String(rec.typeOfPresence || '');
    if (type === 'On leave' || type === 'Leave') totalLeave++;
    if (type === 'Absent') totalAbsent++;
  }
  return { totalLeave, totalAbsent };
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

  const holidays = await Holiday.find({ isActive: true }).select('date').lean();
  const holidayDates = new Set(holidays.map((h) => String(h.date)));

  const userQuery: Record<string, unknown> = { isActive: { $ne: false } };
  if (opts.userId) userQuery._id = new mongoose.Types.ObjectId(opts.userId);

  const users = await User.find(userQuery)
    .select('_id name employmentType designation leaveBalance')
    .lean();

  const attendanceQuery: Record<string, unknown> = {
    monthYear: { $gte: opts.fromMonth, $lte: opts.toMonth },
  };
  if (opts.userId) attendanceQuery.userId = new mongoose.Types.ObjectId(opts.userId);

  const attendanceDocs = await Attendance.find(attendanceQuery).lean();

  const attendanceByUser = new Map<string, typeof attendanceDocs>();
  for (const doc of attendanceDocs) {
    const uid = String(doc.userId);
    if (!attendanceByUser.has(uid)) attendanceByUser.set(uid, []);
    attendanceByUser.get(uid)!.push(doc);
  }

  let usersProcessed = 0;
  let attendanceDocsUpdated = 0;
  let recordsUpdated = 0;
  let txsDeleted = 0;
  let txsCreated = 0;
  const affectedMonths = new Set<string>();

  for (const user of users) {
    const uid = String(user._id);
    const docs = attendanceByUser.get(uid) || [];
    if (docs.length === 0) continue;

    const isArticle = isArticleUser(user);
    const balanceAsOfJan26 = Number(user.leaveBalance?.balanceAsOfJan26 || 0);
    const usedBeforeJan26 = Number(user.leaveBalance?.used || 0);

    const monthsWithAttendance = new Set<string>();
    const leaveCandidates: Array<{ date: string; monthYear: string; rec: DayRecord }> = [];
    const partialCandidates: Array<{ date: string; monthYear: string; amount: number; rec: DayRecord }> = [];

    for (const doc of docs) {
      const monthYear = String(doc.monthYear);
      if (!monthInRange(monthYear, opts.fromMonth, opts.toMonth)) continue;
      monthsWithAttendance.add(monthYear);
      affectedMonths.add(monthYear);

      const records = recordsMapToObject(doc.records as Map<string, DayRecord>);
      for (const [dateStr, rec] of Object.entries(records)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
        if (!monthInRange(dateStr.slice(0, 7), opts.fromMonth, opts.toMonth)) continue;

        if (isLeaveCandidate(dateStr, rec, holidayDates)) {
          leaveCandidates.push({ date: dateStr, monthYear, rec });
        }

        const partial = getPartialShortfall(dateStr, rec);
        if (partial > 0) {
          partialCandidates.push({ date: dateStr, monthYear, amount: partial, rec });
        }
      }
    }

    const earnedTotal = isArticle ? 0 : monthsWithAttendance.size * MONTHLY_EARN;
    const startingBalance = balanceAsOfJan26 + earnedTotal - usedBeforeJan26;

    const leaveDates = leaveCandidates.map((c) => c.date);
    const { allocations, endingBalance: afterFullDays } = allocateLeaveDays(
      leaveDates,
      startingBalance,
      isArticle
    );
    const allocByDate = new Map(allocations.map((a) => [a.date, a]));

    const partialEntries = partialCandidates.map((p) => ({ date: p.date, amount: p.amount }));
    const { results: partialResults } = allocatePartialDays(partialEntries, afterFullDays);
    const partialByDate = new Map(partialResults.map((p) => [p.date, p.amount]));

    const fullDayUsed = allocations.filter((a) => a.paid).reduce((s, a) => s + a.value, 0);
    const partialUsed = partialResults.reduce((s, p) => s + p.amount, 0);
    const totalUsedAfter = Math.round((fullDayUsed + partialUsed) * 1000) / 1000;

    const newRemaining = Math.max(
      0,
      Math.round((balanceAsOfJan26 + earnedTotal - usedBeforeJan26 - totalUsedAfter) * 1000) / 1000
    );

    let userRecordChanges = 0;
    for (const { date, monthYear, rec } of leaveCandidates) {
      const alloc = allocByDate.get(date);
      if (!alloc) continue;
      const wantType = alloc.paid ? 'On leave' : 'Absent';
      const wantValue = alloc.value;
      const curType = String(rec.typeOfPresence || '');
      const curValue = Number(rec.value ?? -1);
      if (curType !== wantType || curValue !== wantValue) userRecordChanges++;
    }

    if (opts.verbose || userRecordChanges > 0 || totalUsedAfter > 0) {
      console.log(`\n— ${user.name} (${uid})`);
      console.log(
        `  months=${monthsWithAttendance.size} earned=${earnedTotal} startBal=${startingBalance.toFixed(2)}` +
          ` → usedAfter=${totalUsedAfter.toFixed(2)} remaining=${newRemaining.toFixed(2)}` +
          (isArticle ? ' [article]' : '')
      );
      console.log(
        `  leave candidates=${leaveDates.length} paid=${allocations.filter((a) => a.paid).length}` +
          ` unpaid=${allocations.filter((a) => !a.paid).length} partialDays=${partialResults.filter((p) => p.amount > 0).length}`
      );
      if (opts.verbose && userRecordChanges > 0) {
        for (const a of allocations) {
          const before = leaveCandidates.find((c) => c.date === a.date)?.rec;
          const bt = before ? String(before.typeOfPresence) : '?';
          const bv = before ? Number(before.value ?? 0) : 0;
          const at = a.paid ? 'On leave' : 'Absent';
          if (bt !== at || bv !== a.value) {
            console.log(`    ${a.date}: ${bt}(${bv}) → ${at}(${a.value}) [${a.reason}]`);
          }
        }
      }
    }

    if (opts.dryRun) {
      usersProcessed++;
      recordsUpdated += userRecordChanges;
      continue;
    }

    // ——— Apply: attendance records ———
    if (!opts.skipAttendance) {
      for (const doc of docs) {
        const attendance = await Attendance.findById(doc._id);
        if (!attendance) continue;

        let docChanged = false;
        const records = attendance.records;

        for (const { date, rec } of leaveCandidates) {
          const existing = records.get(date);
          if (!existing) continue;
          const alloc = allocByDate.get(date);
          if (!alloc) continue;

          const wantType = alloc.paid ? 'On leave' : 'Absent';
          if (existing.typeOfPresence !== wantType || Number(existing.value) !== alloc.value) {
            existing.typeOfPresence = wantType as typeof existing.typeOfPresence;
            existing.value = alloc.value;
            existing.halfDay = false;
            records.set(date, existing);
            docChanged = true;
            recordsUpdated++;
          }
        }

        if (docChanged) {
          const plain = recordsMapToObject(records);
          const { totalLeave, totalAbsent } = recalcLeaveSummary(plain);
          attendance.summary.totalLeave = totalLeave;
          attendance.summary.totalAbsent = totalAbsent;
          await attendance.save();
          attendanceDocsUpdated++;
        }
      }
    }

    // ——— Apply: replace ledger rows for this user in range ———
    const delUsed = await LeaveTransaction.deleteMany({
      userId: user._id,
      type: 'used',
      source: { $in: Array.from(USED_SOURCES_TO_REPLACE) },
      monthYear: { $gte: opts.fromMonth, $lte: opts.toMonth },
    });
    txsDeleted += delUsed.deletedCount || 0;

    const delEarned = await LeaveTransaction.deleteMany({
      userId: user._id,
      type: 'earned',
      source: { $in: Array.from(EARNED_SOURCES_TO_REPLACE) },
      monthYear: { $gte: opts.fromMonth, $lte: opts.toMonth },
    });
    txsDeleted += delEarned.deletedCount || 0;

    const newTxs: Array<{
      userId: mongoose.Types.ObjectId;
      date: string;
      monthYear: string;
      type: 'earned' | 'used';
      amount: number;
      source: string;
      reference?: string;
    }> = [];

    if (!isArticle) {
      for (const monthYear of monthsWithAttendance) {
        newTxs.push({
          userId: user._id as mongoose.Types.ObjectId,
          date: `${monthYear}-01`,
          monthYear,
          type: 'earned',
          amount: MONTHLY_EARN,
          source: 'reconcile-script-earned',
          reference: `month:${monthYear}`,
        });
      }

      for (const a of allocations) {
        if (!a.paid || a.value <= 0) continue;
        newTxs.push({
          userId: user._id as mongoose.Types.ObjectId,
          date: a.date,
          monthYear: a.date.slice(0, 7),
          type: 'used',
          amount: a.value,
          source: 'reconcile-script-used',
          reference: `full-day:${a.date}`,
        });
      }

      for (const p of partialResults) {
        if (p.amount <= 0) continue;
        newTxs.push({
          userId: user._id as mongoose.Types.ObjectId,
          date: p.date,
          monthYear: p.date.slice(0, 7),
          type: 'used',
          amount: p.amount,
          source: 'attendance-partial',
          reference: `attendance-partial:${p.date}`,
        });
      }
    }

    if (newTxs.length > 0) {
      await LeaveTransaction.insertMany(newTxs);
      txsCreated += newTxs.length;
    }

    await User.findByIdAndUpdate(user._id, {
      'leaveBalance.earned': earnedTotal,
      'leaveBalance.usedAfterJan26': Math.round(totalUsedAfter * 1000) / 1000,
      'leaveBalance.remaining': newRemaining,
      'leaveBalance.lastUpdated': new Date(),
      'leaveBalance.monthlyEarned': MONTHLY_EARN,
    });

    usersProcessed++;
  }

  if (!opts.dryRun) {
    const months = Array.from(affectedMonths).sort();
    console.log('\nRebuilding LeaveSnapshot for months:', months.join(', '));
    for (const m of months) {
      try {
        const res = await createMonthlySnapshots(m);
        console.log(`  ${m}: ${res.count} snapshot(s)`);
      } catch (e) {
        console.error(`  ${m}: snapshot failed`, e);
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log('Users processed:', usersProcessed);
  console.log('Attendance docs updated:', attendanceDocsUpdated);
  console.log('Day records updated:', recordsUpdated);
  if (!opts.dryRun) {
    console.log('Transactions deleted:', txsDeleted);
    console.log('Transactions created:', txsCreated);
    console.log('Snapshots rebuilt for', affectedMonths.size, 'month(s)');
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
