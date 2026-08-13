/**
 * Mark missing Sundays / company holidays on existing attendance months.
 * Does not overwrite days the employee actually worked (punches, WFH, OS, extra work).
 * Weekday presence types on rest days are remapped to weekoff variants.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/fix-missing-holiday-sunday-records.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/fix-missing-holiday-sunday-records.ts --apply
 *   npx tsx --env-file=.env.local scripts/fix-missing-holiday-sunday-records.ts --apply --from=2026-01 --to=2026-08
 */
import * as dotenv from 'dotenv';
import path from 'path';
import dbConnect from '../src/lib/mongodb';
import Attendance from '../src/models/Attendance';
import User from '../src/models/User';
import { calculateSummary } from '../src/lib/attendanceSummaryCalculation';
import {
  loadActiveHolidayNameByDate,
  repairHolidayAndSundayRecords,
} from '../src/lib/fillHolidaySundayAttendance';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply;
  const fromMonth = readArg('from');
  const toMonth = readArg('to');
  const userId = readArg('user-id') || readArg('userId');

  console.log('\n=== Fix missing holiday / Sunday attendance ===');
  console.log('Mode:', dryRun ? 'DRY RUN (pass --apply to write)' : 'APPLY');
  if (fromMonth || toMonth) console.log('Month range:', fromMonth || '(start)', '→', toMonth || '(end)');
  if (userId) console.log('User filter:', userId);
  console.log('');

  await dbConnect();
  void User;

  const holidayNameByDate = await loadActiveHolidayNameByDate();
  console.log(`Active holidays: ${holidayNameByDate.size}`);

  const query: Record<string, unknown> = {};
  if (userId) query.userId = userId;
  if (fromMonth || toMonth) {
    query.monthYear = {};
    if (fromMonth) (query.monthYear as Record<string, string>).$gte = fromMonth;
    if (toMonth) (query.monthYear as Record<string, string>).$lte = toMonth;
  }

  const docs = await Attendance.find(query).populate(
    'userId',
    'name joiningDate inactiveAsOf isActive'
  );
  console.log(`Attendance months: ${docs.length}`);

  let docsChanged = 0;
  let added = 0;
  let converted = 0;
  let remapped = 0;
  const sample: string[] = [];

  for (const doc of docs) {
    const user = doc.userId;
    const result = repairHolidayAndSundayRecords(doc, holidayNameByDate, { user });
    if (result.changed === 0) continue;

    docsChanged += 1;
    added += result.added;
    converted += result.converted;
    remapped += result.remapped;

    if (sample.length < 40) {
      const name = (user as { name?: string })?.name || String(doc.userId);
      for (const change of result.changes.slice(0, 3)) {
        sample.push(
          `${doc.monthYear} ${name} ${change.date} ${change.action}: ${change.fromType || '∅'} → ${change.toType} (${change.reason})`
        );
      }
    }

    if (!dryRun) {
      doc.markModified('records');
      doc.summary = calculateSummary(doc.records, user);
      await doc.save();
    }
  }

  console.log('\n--- Result ---');
  console.log(`Months with changes: ${docsChanged}`);
  console.log(`Added missing Holiday rows: ${added}`);
  console.log(`Converted unmarked/Absent rest days: ${converted}`);
  console.log(`Remapped worked weekday→weekoff: ${remapped}`);
  if (sample.length) {
    console.log('\nSample:');
    for (const line of sample) console.log(' ', line);
  }
  if (dryRun) {
    console.log('\nNo writes. Re-run with --apply to update the database.');
  } else {
    console.log('\nDatabase updated.');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
