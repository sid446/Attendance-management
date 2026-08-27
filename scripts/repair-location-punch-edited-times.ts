/**
 * Repair location-punch days where edited* was silently snapped to schedule
 * while actual checkin/checkout still match GPS. Skips HR edits and partner approvals.
 *
 * Usage (same DNS patch as other DB scripts):
 *   npm run fix:location-punch-edited:dry
 *   npm run fix:location-punch-edited
 *   npm run fix:location-punch-edited:dry -- --month=2026-08
 *   npm run fix:location-punch-edited -- --month=2026-08
 */
import * as dotenv from 'dotenv';
import path from 'path';
import dbConnect from '../src/lib/mongodb';
import Attendance from '../src/models/Attendance';
import AttendanceRequest from '../src/models/AttendanceRequest';
import LocationAttendance from '../src/models/LocationAttendance';
import User from '../src/models/User';
import { calculateSummary } from '../src/lib/attendanceSummaryCalculation';
import { calculateTotalHours, normalizeTimeToHHmm, isValidPunchTime } from '../src/lib/attendanceHours';
import { applyDayExcessToRecord } from '../src/lib/calculateDayExcessHour';
import { getScheduledTimes } from '../src/lib/scheduleUtils';
import { LOCATION_PUNCH_SOURCE } from '../src/lib/locationPunchAttendance';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

function norm(t: unknown): string {
  return normalizeTimeToHHmm(String(t || '')) || String(t || '').trim();
}

function stampIsLocationPunchOnly(rec: {
  approvedBy?: unknown;
  updatedBy?: unknown;
}): boolean {
  const by = String(rec.approvedBy || rec.updatedBy || '')
    .trim()
    .toLowerCase();
  if (!by) return true;
  return by === LOCATION_PUNCH_SOURCE.toLowerCase();
}

function isHrOrPersonStamp(rec: {
  approvedBy?: unknown;
  updatedBy?: unknown;
  approvedByEmail?: unknown;
  updatedByEmail?: unknown;
  remarks?: unknown;
}): boolean {
  const remarks = String(rec.remarks || '');
  if (/updated by hr/i.test(remarks)) return true;

  const by = String(rec.approvedBy || rec.updatedBy || '')
    .trim()
    .toLowerCase();
  if (!by) return false;
  if (by === LOCATION_PUNCH_SOURCE.toLowerCase()) return false;
  if (by === 'thumbmachine' || by === 'thumb machine') return false;
  // HR or any named person / partner
  return true;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const monthFilter = process.argv.find((a) => a.startsWith('--month='))?.slice(8);

  console.log('\n=== Repair location-punch edited times (schedule snap) ===');
  console.log('Mode:', apply ? 'APPLY' : 'DRY RUN');
  if (monthFilter) console.log('Month filter:', monthFilter);

  await dbConnect();

  const punchQuery: Record<string, unknown> = { status: 'complete' };
  if (monthFilter) {
    punchQuery.date = { $regex: `^${monthFilter}` };
  }

  const punches = await LocationAttendance.find(punchQuery).lean();
  console.log(`Complete location punches scanned: ${punches.length}`);

  const userCache = new Map<string, any>();
  const attendanceCache = new Map<string, any>();
  const approvedRequestKeys = new Set<string>();

  // Prefetch Approved requests for candidate user+dates (batch)
  const userDates = punches
    .map((p) => ({
      userId: String(p.userId),
      date: String(p.date || '').slice(0, 10),
    }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date));

  const uniqueUserIds = [...new Set(userDates.map((x) => x.userId))];
  if (uniqueUserIds.length > 0) {
    const approved = await AttendanceRequest.find({
      userId: { $in: uniqueUserIds },
      status: 'Approved',
    })
      .select({ userId: 1, date: 1 })
      .lean();
    for (const req of approved) {
      approvedRequestKeys.add(`${String(req.userId)}|${String(req.date).slice(0, 10)}`);
    }
  }

  let fixed = 0;
  let skipped = 0;
  const sample: string[] = [];
  const dirtyAttendanceKeys = new Set<string>();

  for (const punch of punches) {
    const userId = String(punch.userId);
    const date = String(punch.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped += 1;
      continue;
    }

    const gpsIn = norm(punch.inPunch?.time);
    const gpsOut = norm(punch.outPunch?.time);
    if (!isValidPunchTime(gpsIn) || !isValidPunchTime(gpsOut)) {
      skipped += 1;
      continue;
    }

    const monthYear = date.slice(0, 7);
    const attKey = `${userId}|${monthYear}`;
    let attendance = attendanceCache.get(attKey);
    if (!attendance) {
      attendance = await Attendance.findOne({ userId, monthYear });
      if (attendance) attendanceCache.set(attKey, attendance);
    }
    if (!attendance) {
      skipped += 1;
      continue;
    }

    const raw = attendance.records.get(date);
    if (!raw) {
      skipped += 1;
      continue;
    }
    const rec =
      typeof (raw as { toObject?: () => object }).toObject === 'function'
        ? (raw as { toObject: () => Record<string, unknown> }).toObject()
        : { ...(raw as Record<string, unknown>) };

    if (!/location verified/i.test(String(rec.remarks || ''))) {
      skipped += 1;
      continue;
    }

    if (isHrOrPersonStamp(rec) || !stampIsLocationPunchOnly(rec)) {
      skipped += 1;
      continue;
    }

    if (approvedRequestKeys.has(`${userId}|${date}`)) {
      skipped += 1;
      continue;
    }

    const actualIn = norm(rec.checkin);
    const actualOut = norm(rec.checkout);
    if (actualIn !== gpsIn || actualOut !== gpsOut) {
      skipped += 1;
      continue;
    }

    const editedIn = norm(rec.editedCheckin);
    const editedOut = norm(rec.editedCheckout);
    if (editedIn === gpsIn && editedOut === gpsOut) {
      skipped += 1;
      continue;
    }

    let user = userCache.get(userId);
    if (user === undefined) {
      user = await User.findById(userId);
      userCache.set(userId, user || null);
    }
    if (!user) {
      skipped += 1;
      continue;
    }

    const sch = getScheduledTimes(user, date);
    const schIn = norm(sch.inTime);
    const schOut = norm(sch.outTime);
    if (!isValidPunchTime(schIn) || !isValidPunchTime(schOut)) {
      skipped += 1;
      continue;
    }

    // Only true schedule-snap corruption (not a custom intentional edit)
    if (editedIn !== schIn || editedOut !== schOut) {
      skipped += 1;
      continue;
    }

    const workedHours = calculateTotalHours(gpsIn, gpsOut);
    const next: Record<string, unknown> = {
      ...rec,
      editedCheckin: gpsIn,
      editedCheckout: gpsOut,
      totalHour: workedHours,
    };
    applyDayExcessToRecord(next as any, user, date, schIn, schOut);

    fixed += 1;
    if (sample.length < 40) {
      const name = String(user.name || user.email || userId);
      sample.push(
        `${date} ${name}: edited ${editedIn}-${editedOut} (schedule) → ${gpsIn}-${gpsOut} (GPS)`
      );
    }

    if (apply) {
      attendance.records.set(date, next as any);
      attendance.markModified('records');
      dirtyAttendanceKeys.add(attKey);
    }
  }

  if (apply) {
    for (const attKey of dirtyAttendanceKeys) {
      const attendance = attendanceCache.get(attKey);
      if (!attendance) continue;
      const userId = attKey.split('|')[0];
      let user = userCache.get(userId);
      if (user === undefined) {
        user = await User.findById(userId);
        userCache.set(userId, user || null);
      }
      attendance.summary = calculateSummary(attendance.records, user || undefined);
      await attendance.save();
    }
  }

  console.log(`\nWould fix / fixed: ${fixed}`);
  console.log(`Skipped: ${skipped}`);
  for (const line of sample) console.log(' ', line);
  if (fixed > sample.length) console.log(`  … and ${fixed - sample.length} more`);
  if (!apply) console.log('\nNo writes. Re-run with --apply to update.');
  else console.log('\nDatabase updated.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
