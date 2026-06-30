/**
 * Recalculate per-day excessHour, halfDay, and monthly summary for all article
 * employees using prefixed designation support (e.g. "CA Article").
 *
 * Usage:
 *   npm run fix:article-excess:dry   # preview counts only
 *   npm run fix:article-excess       # apply to database
 */
import * as dotenv from 'dotenv';
import path from 'path';
import dbConnect from '../src/lib/mongodb';
import Attendance from '../src/models/Attendance';
import User from '../src/models/User';
import { isArticleEmployee } from '../src/lib/isArticleEmployee';
import { calculateSummary } from '../src/lib/attendanceSummaryCalculation';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const dryRun = process.argv.includes('--dry-run');

function recordsToMap(
  records: Map<string, any> | Record<string, any>
): Map<string, any> {
  if (records instanceof Map) {
    return records;
  }
  return new Map(Object.entries(records));
}

function snapshotRecord(record: any) {
  return {
    excessHour: Number(record.excessHour ?? 0),
    totalHour: Number(record.totalHour ?? 0),
    halfDay: Boolean(record.halfDay),
  };
}

function snapshotSummary(summary: any) {
  return {
    totalHour: Number(summary?.totalHour ?? 0),
    excessHour: Number(summary?.excessHour ?? 0),
    totalHalfDay: Number(summary?.totalHalfDay ?? 0),
    totalPresent: Number(summary?.totalPresent ?? 0),
    totalAbsent: Number(summary?.totalAbsent ?? 0),
    totalLeave: Number(summary?.totalLeave ?? 0),
    totalLateArrival: Number(summary?.totalLateArrival ?? 0),
  };
}

function summariesEqual(a: ReturnType<typeof snapshotSummary>, b: ReturnType<typeof snapshotSummary>) {
  return (
    a.totalHour === b.totalHour &&
    a.excessHour === b.excessHour &&
    a.totalHalfDay === b.totalHalfDay &&
    a.totalPresent === b.totalPresent &&
    a.totalAbsent === b.totalAbsent &&
    a.totalLeave === b.totalLeave &&
    a.totalLateArrival === b.totalLateArrival
  );
}

async function main() {
  console.log(
    dryRun
      ? 'DRY RUN — no writes (article excess recalculation)'
      : 'Applying article excess recalculation to database…'
  );
  await dbConnect();

  const articleUsers = await User.find({
    $or: [
      { employmentType: { $regex: /article/i } },
      { designation: { $regex: /article/i } },
      { category: { $regex: /article/i } },
    ],
  }).select(
    'name employmentType designation category schedules seasonalSchedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth employmentTypeHistory'
  );

  const articleUserIds = articleUsers
    .filter((u) => isArticleEmployee(u))
    .map((u) => u._id);
  const userMap = new Map(articleUsers.map((u) => [String(u._id), u]));

  console.log(`Article employees found: ${articleUserIds.length}`);

  const docs = await Attendance.find({ userId: { $in: articleUserIds } });
  let docsUpdated = 0;
  let daysChanged = 0;
  let excessDaysChanged = 0;

  for (const doc of docs) {
    const user = userMap.get(String(doc.userId));
    if (!user || !doc.records) continue;

    const recordsMap = recordsToMap(doc.records);
    const beforeByDate = new Map<string, ReturnType<typeof snapshotRecord>>();
    for (const [dateStr, record] of recordsMap.entries()) {
      beforeByDate.set(dateStr, snapshotRecord(record));
    }
    const beforeSummary = snapshotSummary(doc.summary);

    const newSummary = calculateSummary(recordsMap, user);

    let docChanged = false;
    for (const [dateStr, record] of recordsMap.entries()) {
      const before = beforeByDate.get(dateStr);
      const after = snapshotRecord(record);
      if (
        before &&
        (before.excessHour !== after.excessHour ||
          before.totalHour !== after.totalHour ||
          before.halfDay !== after.halfDay)
      ) {
        daysChanged++;
        if (before.excessHour !== after.excessHour) {
          excessDaysChanged++;
        }
        docChanged = true;
      }
    }

    if (!summariesEqual(beforeSummary, snapshotSummary(newSummary))) {
      docChanged = true;
    }

    if (docChanged) {
      docsUpdated++;
      doc.summary = newSummary as any;
      if (!dryRun) {
        doc.markModified('records');
        doc.markModified('summary');
        await doc.save();
      }
    }
  }

  console.log('\n--- Article excess recalculation ---');
  console.log(`Attendance documents scanned: ${docs.length}`);
  console.log(`Documents ${dryRun ? 'that would be ' : ''}updated: ${docsUpdated}`);
  console.log(`Daily records changed: ${daysChanged}`);
  console.log(`Daily excessHour values changed: ${excessDaysChanged}`);
  if (dryRun) {
    console.log('\nRe-run without --dry-run to apply changes.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
