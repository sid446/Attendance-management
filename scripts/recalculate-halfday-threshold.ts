/**
 * Recalculate attendance halfDay / excess / summary after the Saturday
 * short-schedule half-day threshold fix.
 *
 * Usage:
 *   npm run fix:halfday-threshold:dry
 *   npm run fix:halfday-threshold
 *   npm run fix:halfday-threshold:dry -- --month=2026-08
 *   npm run fix:halfday-threshold -- --user=Divyanshi
 */
import * as dotenv from 'dotenv';
import path from 'path';
import dbConnect from '../src/lib/mongodb';
import Attendance from '../src/models/Attendance';
import User from '../src/models/User';
import { calculateSummary } from '../src/lib/attendanceSummaryCalculation';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  const apply = process.argv.includes('--apply');
  const monthFilter = process.argv.find((a) => a.startsWith('--month='))?.slice(8);
  const userFilter = process.argv.find((a) => a.startsWith('--user='))?.slice(7);

  console.log('\n=== Recalculate halfDay / summary (schedule-aware threshold) ===');
  console.log('Mode:', apply ? 'APPLY' : 'DRY RUN');
  if (monthFilter) console.log('Month:', monthFilter);
  if (userFilter) console.log('User filter:', userFilter);

  await dbConnect();

  let userIds: string[] | null = null;
  if (userFilter) {
    const users = await User.find({
      name: { $regex: userFilter, $options: 'i' },
    })
      .select({ _id: 1, name: 1 })
      .lean();
    userIds = users.map((u) => String(u._id));
    console.log(
      'Matched users:',
      users.map((u) => u.name).join(', ') || '(none)'
    );
    if (userIds.length === 0) {
      process.exit(0);
    }
  }

  const query: Record<string, unknown> = {};
  if (monthFilter) query.monthYear = monthFilter;
  if (userIds) query.userId = { $in: userIds };

  const docs = await Attendance.find(query);
  console.log(`Attendance docs: ${docs.length}`);

  const userCache = new Map<string, any>();
  let docsChanged = 0;
  let daysHalfCleared = 0;
  let daysHalfSet = 0;
  const sample: string[] = [];

  for (const attendance of docs) {
    const userId = String(attendance.userId);
    let user = userCache.get(userId);
    if (user === undefined) {
      user = await User.findById(userId);
      userCache.set(userId, user || null);
    }
    if (!user) continue;

    const before = new Map<string, boolean>();
    attendance.records.forEach((rec: any, date: string) => {
      before.set(date, !!rec.halfDay);
    });

    attendance.summary = calculateSummary(attendance.records as any, user);

    let changed = false;
    attendance.records.forEach((rec: any, date: string) => {
      const prev = before.get(date);
      const next = !!rec.halfDay;
      if (prev !== next) {
        changed = true;
        if (prev && !next) daysHalfCleared += 1;
        if (!prev && next) daysHalfSet += 1;
        if (sample.length < 40) {
          const dow = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
            weekday: 'short',
          });
          sample.push(
            `${user.name} ${date} (${dow}): halfDay ${prev} → ${next} | ${rec.typeOfPresence} ${rec.totalHour}h excess=${rec.excessHour}`
          );
        }
      }
    });

    if (changed) {
      docsChanged += 1;
      if (apply) {
        attendance.markModified('records');
        attendance.markModified('summary');
        await attendance.save();
      }
    }
  }

  console.log(`\nDocs with halfDay changes: ${docsChanged}`);
  console.log(`Days halfDay cleared: ${daysHalfCleared}`);
  console.log(`Days halfDay newly set: ${daysHalfSet}`);
  for (const line of sample) console.log(' ', line);
  if (!apply) console.log('\nNo writes. Re-run with --apply to update.');
  else console.log('\nDatabase updated.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
