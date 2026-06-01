/**
 * Backfill totalHour / excessHour / halfDay / summary for records where
 * only one machine punch (in or out) was stored and hours were previously 0.
 *
 * Usage:
 *   npm run fix:partial-punch-hours:dry   # preview counts only
 *   npm run fix:partial-punch-hours       # apply to database
 */
import * as dotenv from 'dotenv';
import path from 'path';
import dbConnect from '../src/lib/mongodb';
import Attendance from '../src/models/Attendance';
import User from '../src/models/User';
import {
  calculateTotalHours,
  isSinglePunch,
  isValidPunchTime,
} from '../src/lib/attendanceHours';
import { getScheduledTimes } from '../src/lib/scheduleUtils';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const MACHINE_TYPES = new Set(['ThumbMachine', 'Manual', 'Remote']);
const dryRun = process.argv.includes('--dry-run');

function normalizeTimeToHHmm(raw: string | null | undefined): string {
  if (!raw) return '';
  const str = String(raw).trim();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function shouldExcludeFromHoursSummary(typeOfPresence: string, dateStr: string): boolean {
  if (new Date(dateStr).getDay() === 0) return true;
  const excluded = new Set([
    'Holiday',
    'Sunday',
    'Weekoff',
    'Absent',
    'On leave',
    'Leave',
    'WFH - weekdays',
    'WFH - weekoff',
    'Work From Home (WFH)',
    'Weekly Off - Work From Home (WO-WFH)',
    'Onsite Presence (OS-P)',
    'Present - ClientPlace (Weekdays)',
    'Present - ClientPlace (Weekoff)',
    'Present - client place',
    'Present - outstation',
    'Present - Outstation (Weekdays)',
    'Present - Outstation (Weekoff)',
    'Present - in office - weekoff',
    'Present - weekoff',
    'Weekly Off - Present (WO-Present)',
    'Half Day - weekoff',
    'Weekoff - special allowance',
  ]);
  return excluded.has(typeOfPresence);
}

function recalcSummary(
  records: Map<string, any> | Record<string, any>,
  user: any
) {
  const summary = {
    totalHour: 0,
    totalLateArrival: 0,
    excessHour: 0,
    totalHalfDay: 0,
    totalPresent: 0,
    totalAbsent: 0,
    totalLeave: 0,
  };
  let totalScheduledHour = 0;

  const entries =
    records instanceof Map
      ? Array.from(records.entries())
      : Object.entries(records);

  for (const [dateStr, record] of entries) {
    const inTime = normalizeTimeToHHmm(record.editedCheckin || record.checkin);
    const outTime = normalizeTimeToHHmm(record.editedCheckout || record.checkout);
    const schedule = getScheduledTimes(user, dateStr);
    const scheduledIn = schedule.inTime;
    const scheduledOut = schedule.outTime;

    let dayScheduledHours = 0;
    if (
      scheduledIn &&
      scheduledOut &&
      scheduledIn !== '00:00' &&
      scheduledOut !== '00:00'
    ) {
      dayScheduledHours = calculateTotalHours(scheduledIn, scheduledOut);
    }

    if (record.halfDay) summary.totalHalfDay++;
    if (inTime && scheduledIn && inTime > scheduledIn) summary.totalLateArrival++;

    const includeInHours = !shouldExcludeFromHoursSummary(
      String(record.typeOfPresence || ''),
      dateStr
    );
    if (includeInHours) {
      summary.totalHour += Number(record.totalHour || 0);
      totalScheduledHour += dayScheduledHours;
    }

    switch (record.typeOfPresence) {
      case 'ThumbMachine':
      case 'Manual':
      case 'Remote':
      case 'Weekly Off - Present (WO-Present)':
      case 'Half Day (HD)':
      case 'Work From Home (WFH)':
      case 'Weekly Off - Work From Home (WO-WFH)':
      case 'Onsite Presence (OS-P)':
        if (Number(record.totalHour || 0) > 0) summary.totalPresent++;
        else summary.totalAbsent++;
        break;
      case 'On leave':
      case 'Leave':
        summary.totalLeave++;
        break;
      case 'Holiday':
      case 'Sunday':
      case 'Weekoff':
      case 'Weekoff - special allowance':
        break;
      default:
        if (String(record.typeOfPresence || '').toLowerCase().includes('present')) {
          if (Number(record.totalHour || 0) > 0 || Number(record.value || 0) > 0) {
            summary.totalPresent++;
          } else {
            summary.totalAbsent++;
          }
        } else if (record.typeOfPresence === 'Absent') {
          summary.totalAbsent++;
        }
        break;
    }
  }

  summary.excessHour = Number((summary.totalHour - totalScheduledHour).toFixed(2));
  return summary;
}

function fixRecord(record: any, dateStr: string, user: any): boolean {
  const prevTotal = Number(record.totalHour ?? 0);
  const prevHalf = Boolean(record.halfDay);
  const prevExcess = Number(record.excessHour ?? 0);
  const prevValue = Number(record.value ?? 0);

  const inTime = normalizeTimeToHHmm(record.editedCheckin || record.checkin);
  const outTime = normalizeTimeToHHmm(record.editedCheckout || record.checkout);
  const schedule = getScheduledTimes(user, dateStr);
  const scheduledIn = schedule.inTime;
  const scheduledOut = schedule.outTime;

  const newTotal = calculateTotalHours(inTime, outTime, {
    scheduledIn,
    scheduledOut,
  });

  let dayScheduledHours = 0;
  if (
    scheduledIn &&
    scheduledOut &&
    scheduledIn !== '00:00' &&
    scheduledOut !== '00:00'
  ) {
    dayScheduledHours = calculateTotalHours(scheduledIn, scheduledOut);
  }

  let dayExcess = 0;
  if (record.typeOfPresence === 'Holiday') {
    dayExcess = 0;
  } else if (!isValidPunchTime(inTime) && !isValidPunchTime(outTime)) {
    dayExcess = dayScheduledHours > 0 ? -dayScheduledHours : 0;
  } else if (isSinglePunch(inTime, outTime)) {
    dayExcess = dayScheduledHours > 0 ? -dayScheduledHours : 0;
  } else {
    dayExcess = Number((newTotal - dayScheduledHours).toFixed(2));
  }

  record.totalHour = newTotal;
  record.excessHour = dayExcess;

  const isSunday = new Date(dateStr).getDay() === 0;
  const type = String(record.typeOfPresence || '');
  const hasIn = isValidPunchTime(inTime);
  const hasOut = isValidPunchTime(outTime);
  const singlePunch = isSinglePunch(inTime, outTime);
  const isMachine = MACHINE_TYPES.has(type);

  if (type === 'Holiday' || isSunday) {
    record.halfDay = false;
  } else {
    const employmentType = String(user.employmentType || 'fulltime').toLowerCase();
    const designation = String(user.designation || '').toLowerCase();
    const isArticle = employmentType === 'article' || designation === 'article';
    const isHalftime =
      employmentType === 'halftime' ||
      employmentType.includes('half') ||
      user.category === 'Partner' ||
      designation.includes('partner');
    const isAfter1PM = inTime ? inTime >= '13:00' : false;

    if (!hasIn && !hasOut) {
      record.halfDay = false;
    } else if (isHalftime) {
      record.halfDay = false;
    } else if (isMachine && singlePunch) {
      record.halfDay = true;
    } else if (!hasIn && hasOut) {
      record.halfDay = true;
    } else if (employmentType === 'fulltime' && !isArticle) {
      record.halfDay = newTotal > 0 && newTotal < 6;
    } else if (isArticle) {
      record.halfDay = isAfter1PM || newTotal < 3.5;
    } else {
      const required = dayScheduledHours * 0.6;
      record.halfDay =
        dayScheduledHours > 0 ? newTotal < required : false;
    }
  }

  if (isMachine && singlePunch && type !== 'Absent') {
    record.value = 0.5;
  } else if (isMachine && newTotal > 0 && !record.halfDay) {
    record.value = 1;
  } else if (isMachine && newTotal === 0 && !hasIn && !hasOut) {
    record.value = 0;
  }

  return (
    prevTotal !== newTotal ||
    prevHalf !== Boolean(record.halfDay) ||
    prevExcess !== dayExcess ||
    prevValue !== Number(record.value ?? 0)
  );
}

async function main() {
  console.log(dryRun ? 'DRY RUN — no writes' : 'Applying fixes to database…');
  await dbConnect();

  const users = await User.find({}).select(
    'name employmentType designation category schedules seasonalSchedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth employmentTypeHistory'
  );
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const docs = await Attendance.find({});
  let docsUpdated = 0;
  let recordsFixed = 0;
  let partialPunchFixed = 0;

  for (const doc of docs) {
    const user = userMap.get(String(doc.userId));
    if (!user || !doc.records) continue;

    let docChanged = false;
    const entries =
      doc.records instanceof Map
        ? Array.from(doc.records.entries())
        : Object.entries(doc.records as Record<string, any>);

    for (const [dateStr, record] of entries) {
      const inTime = normalizeTimeToHHmm(record.editedCheckin || record.checkin);
      const outTime = normalizeTimeToHHmm(record.editedCheckout || record.checkout);
      const wasPartial =
        MACHINE_TYPES.has(String(record.typeOfPresence || '')) &&
        isValidPunchTime(inTime) !== isValidPunchTime(outTime) &&
        Number(record.totalHour ?? 0) === 0;

      if (fixRecord(record, dateStr, user)) {
        docChanged = true;
        recordsFixed++;
        if (wasPartial && Number(record.totalHour ?? 0) > 0) {
          partialPunchFixed++;
        }
      }
    }

    if (docChanged) {
      const recordsMap =
        doc.records instanceof Map
          ? doc.records
          : new Map(Object.entries(doc.records as Record<string, any>));
      doc.summary = recalcSummary(recordsMap, user) as any;
      docsUpdated++;
      if (!dryRun) {
        doc.markModified('records');
        doc.markModified('summary');
        await doc.save();
      }
    }
  }

  console.log('\n--- Fix partial punch hours ---');
  console.log(`Attendance documents scanned: ${docs.length}`);
  console.log(`Documents ${dryRun ? 'that would be ' : ''}updated: ${docsUpdated}`);
  console.log(`Daily records recalculated: ${recordsFixed}`);
  console.log(`Partial-punch rows hours restored (was 0): ${partialPunchFixed}`);
  if (dryRun) {
    console.log('\nRe-run without --dry-run to apply changes.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
