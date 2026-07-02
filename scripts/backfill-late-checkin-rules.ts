/**
 * Backfill existing attendance for late check-in rules:
 *   - 1:00 PM – 2:59 PM → half day
 *   - 3:00 PM or later → absent
 * Half-time employees are exempt. Only day rows matching these rules are changed.
 *
 * Usage:
 *   npm run backfill:late-checkin-rules:dry
 *   npm run backfill:late-checkin-rules
 */
import * as dotenv from 'dotenv';
import path from 'path';
import dbConnect from '../src/lib/mongodb';
import Attendance from '../src/models/Attendance';
import User from '../src/models/User';
import { calculateSummary } from '../src/lib/attendanceSummaryCalculation';
import {
  applyLateCheckinAbsentRule,
  applyLateCheckinHalfDayRule,
  getEffectiveCheckinTime,
} from '../src/lib/lateCheckinAbsentRule';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const dryRun = process.argv.includes('--dry-run');

type DayRecord = Record<string, unknown>;

function cloneRecord(rec: DayRecord | { toObject?: () => DayRecord }): DayRecord {
  if (rec && typeof (rec as { toObject?: () => DayRecord }).toObject === 'function') {
    return (rec as { toObject: () => DayRecord }).toObject();
  }
  return { ...(rec as DayRecord) };
}

function recordsToMap(records: Map<string, DayRecord> | Record<string, DayRecord>): Map<string, DayRecord> {
  if (records instanceof Map) {
    return new Map(
      Array.from(records.entries()).map(([date, rec]) => [date, cloneRecord(rec as DayRecord)])
    );
  }
  return new Map(
    Object.entries(records).map(([date, rec]) => [date, cloneRecord(rec as DayRecord)])
  );
}

function snapshotRecord(rec: DayRecord): string {
  return JSON.stringify({
    typeOfPresence: rec.typeOfPresence,
    halfDay: rec.halfDay,
    value: rec.value,
    totalHour: rec.totalHour,
    excessHour: rec.excessHour,
    remarks: rec.remarks,
  });
}

function applyLateCheckinRulesToRecord(
  record: DayRecord,
  user: Parameters<typeof applyLateCheckinAbsentRule>[1],
  dateStr: string
): 'absent' | 'halfday' | false {
  if (applyLateCheckinAbsentRule(record, user, dateStr)) return 'absent';
  if (applyLateCheckinHalfDayRule(record, user, dateStr)) return 'halfday';
  return false;
}

async function main() {
  console.log(dryRun ? 'DRY RUN — no database writes' : 'Applying late check-in rules to existing attendance…');
  await dbConnect();

  const users = await User.find({}).select(
    'name employmentType designation category schedules seasonalSchedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth employmentTypeHistory'
  );
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const docs = await Attendance.find({});
  let docsUpdated = 0;
  let daysUpdated = 0;
  let halfDayApplied = 0;
  let absentApplied = 0;
  let eligibleDays = 0;

  for (const doc of docs) {
    const user = userMap.get(String(doc.userId));
    if (!user || !doc.records) continue;

    const workingMap = recordsToMap(doc.records as Map<string, DayRecord> | Record<string, DayRecord>);
    let docChanged = false;

    for (const [dateStr, rec] of workingMap) {
      const inTime = getEffectiveCheckinTime(rec as Parameters<typeof getEffectiveCheckinTime>[0]);
      if (inTime >= '13:00') eligibleDays++;

      const before = snapshotRecord(rec);
      const result = applyLateCheckinRulesToRecord(rec, user, dateStr);
      if (!result || before === snapshotRecord(rec)) continue;

      docChanged = true;
      daysUpdated++;
      if (result === 'absent') {
        absentApplied++;
        console.log(
          `  [absent] ${user.name} ${dateStr} in=${inTime} → Absent`
        );
      } else {
        halfDayApplied++;
        console.log(
          `  [halfday] ${user.name} ${dateStr} in=${inTime} → Half Day`
        );
      }
    }

    if (!docChanged) continue;

    docsUpdated++;
    const summary = calculateSummary(workingMap as Parameters<typeof calculateSummary>[0], user);

    if (!dryRun) {
      if (doc.records instanceof Map) {
        doc.records.clear();
        for (const [date, rec] of workingMap) {
          doc.records.set(date, rec);
        }
      } else {
        doc.records = Object.fromEntries(workingMap);
      }
      doc.summary = summary;
      doc.markModified('records');
      doc.markModified('summary');
      await doc.save();
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Attendance months scanned: ${docs.length}`);
  console.log(`Day rows with in-time ≥ 1:00 PM: ${eligibleDays}`);
  console.log(`Months ${dryRun ? 'that would be ' : ''}updated: ${docsUpdated}`);
  console.log(`Day records ${dryRun ? 'that would be ' : ''}updated: ${daysUpdated}`);
  console.log(`  → half day (1:00–2:59 PM): ${halfDayApplied}`);
  console.log(`  → absent (≥ 3:00 PM): ${absentApplied}`);
  if (dryRun) {
    console.log('\nRe-run without --dry-run to apply changes.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
