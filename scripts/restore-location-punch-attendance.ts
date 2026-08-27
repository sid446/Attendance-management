/**
 * Restore client-place presence on days that were location-punched
 * but later overwritten to ThumbMachine.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/restore-location-punch-attendance.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/restore-location-punch-attendance.ts --apply
 */
import * as dotenv from 'dotenv';
import path from 'path';
import dbConnect from '../src/lib/mongodb';
import Attendance from '../src/models/Attendance';
import LocationAttendance from '../src/models/LocationAttendance';
import ClientPlace from '../src/models/ClientPlace';
import User from '../src/models/User';
import { calculateSummary } from '../src/lib/attendanceSummaryCalculation';
import { applyAttendanceEditSource } from '../src/lib/daywiseAttendanceSource';
import { calculateTotalHours } from '../src/lib/attendanceHours';
import {
  LOCATION_PUNCH_REMARK_PREFIX,
  LOCATION_PUNCH_SOURCE,
  isLocationPunchAttendanceRecord,
} from '../src/lib/locationPunchAttendance';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  const apply = process.argv.includes('--apply');
  console.log('\n=== Restore location-punch attendance ===');
  console.log('Mode:', apply ? 'APPLY' : 'DRY RUN');

  await dbConnect();
  void User;
  void ClientPlace;

  const punches = await LocationAttendance.find({ status: 'complete' })
    .populate('clientPlaceId', 'name')
    .lean();
  console.log(`Complete location punches: ${punches.length}`);

  let changed = 0;
  const sample: string[] = [];

  for (const punch of punches) {
    const userId = String(punch.userId);
    const date = String(punch.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const monthYear = date.slice(0, 7);
    const placeName =
      punch.clientPlaceId && typeof punch.clientPlaceId === 'object' && 'name' in punch.clientPlaceId
        ? String((punch.clientPlaceId as { name?: string }).name || 'client place')
        : 'client place';

    const attendance = await Attendance.findOne({ userId, monthYear });
    if (!attendance) continue;

    const existing = attendance.records.get(date);
    if (isLocationPunchAttendanceRecord(existing) && String(existing?.typeOfPresence || '').toLowerCase().includes('client')) {
      continue;
    }

    const inTime =
      punch.inPunch?.time || (existing as { checkin?: string } | undefined)?.checkin || '';
    const outTime =
      punch.outPunch?.time || (existing as { checkout?: string } | undefined)?.checkout || '';
    const workedHours = calculateTotalHours(inTime, outTime);

    const rec: Record<string, unknown> = {
      ...(existing && typeof (existing as { toObject?: () => object }).toObject === 'function'
        ? (existing as { toObject: () => object }).toObject()
        : { ...(existing || {}) }),
      checkin: inTime,
      checkout: outTime,
      editedCheckin: inTime,
      editedCheckout: outTime,
      totalHour: workedHours,
      excessHour: 0,
      typeOfPresence: 'Present - client place',
      value: 1,
      halfDay: false,
      remarks: `${LOCATION_PUNCH_REMARK_PREFIX} ${placeName}`,
    };
    applyAttendanceEditSource(rec, { approvedBy: LOCATION_PUNCH_SOURCE });

    changed += 1;
    if (sample.length < 25) {
      sample.push(
        `${date} ${userId} ${(existing as { typeOfPresence?: string } | undefined)?.typeOfPresence || '∅'} → Present - client place (${placeName})`
      );
    }

    if (apply) {
      attendance.records.set(date, rec as any);
      attendance.markModified('records');
      const user = await User.findById(userId);
      attendance.summary = calculateSummary(attendance.records, user);
      await attendance.save();
    }
  }

  console.log(`Days to restore: ${changed}`);
  for (const line of sample) console.log(' ', line);
  if (!apply) console.log('\nNo writes. Re-run with --apply to update.');
  else console.log('\nDatabase updated.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
