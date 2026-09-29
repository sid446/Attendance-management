/**
 * Repair WFH weekoff in/out times that used Sunday's default 09:00–18:00
 * instead of the employee's weekday (Monday) schedule.
 *
 * Pending / PendingHr: update AttendanceRequest.startTime / endTime only.
 * Approved: also update that day's editedCheckin / editedCheckout when they
 * still match the old request times.
 *
 * Duration (hours entered) is preserved; only the window is shifted.
 *
 * Usage:
 *   npx cross-env NODE_OPTIONS="--require ./dns-patch.js --dns-result-order=ipv4first" `
 *     tsx --env-file=.env.local scripts/repair-wfh-weekoff-intime.ts
 *   ... --apply
 */
import dbConnect from '../src/lib/mongodb';
import Attendance from '../src/models/Attendance';
import AttendanceRequest from '../src/models/AttendanceRequest';
import User from '../src/models/User';
import { calculateSummary } from '../src/lib/attendanceSummaryCalculation';
import { getScheduledTimes } from '../src/lib/scheduleUtils';
import {
  getWorkHoursReferenceSchedule,
  hasWorkingScheduleIn,
  normalizeHhMm,
  shiftTimeRangeToStart,
} from '../src/lib/deriveRequestInOutFromWorkHours';
import { isExtraWorkRequest } from '../src/lib/extraWorkRequest';
import { isInternOrArticleEmployee } from '../src/lib/isArticleEmployee';

function isWfhStatus(status: string): boolean {
  const t = String(status || '').trim().toLowerCase();
  return t.startsWith('wfh') || t.includes('work from home') || t.includes('wo-wfh');
}

function isExplicitWfhWeekoff(status: string): boolean {
  const t = String(status || '').trim().toLowerCase();
  return (
    t.includes('weekoff') ||
    t.includes('week-off') ||
    t.includes('week off') ||
    t.includes('wo-wfh')
  );
}

function shouldRepairWfhRequest(status: string, user: unknown, date: string): boolean {
  if (!isWfhStatus(status)) return false;
  if (isExplicitWfhWeekoff(status)) return true;
  // Interns / articles: also realign weekday WFH that used the 09:00 default.
  if (isInternOrArticleEmployee(user as any)) return true;
  return !hasWorkingScheduleIn(getScheduledTimes(user, date));
}

const SUNDAY_WEEKOFF = {
  inTime: '',
  outTime: '',
  isHoliday: true,
  isHalfDay: false,
};

function sundayLooksLikeWorkingDay(sunday: any): boolean {
  if (!sunday || typeof sunday !== 'object') return false;
  const inTime = String(sunday.inTime || '').trim();
  return !!inTime && inTime !== '00:00' && !sunday.isHoliday;
}

function timesEqual(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeHhMm(a);
  const nb = normalizeHhMm(b);
  if (!na || !nb) return false;
  return na === nb;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const monthFilter = process.argv.find((a) => a.startsWith('--month='))?.slice(8);

  console.log('\n=== Repair WFH weekoff in-time (Monday schedule) ===');
  console.log('Mode:', apply ? 'APPLY' : 'DRY RUN');
  if (monthFilter) console.log('Month filter:', monthFilter);

  await dbConnect();

  const query: Record<string, unknown> = {
    status: { $in: ['Pending', 'PendingHr', 'Approved'] },
    requestedStatus: { $regex: /wfh|work from home|wo-wfh/i },
  };
  if (monthFilter) query.monthYear = monthFilter;

  const internUsers = await User.find({
    $or: [
      { category: /intern/i },
      { designation: /intern/i },
      { employmentType: /intern/i },
    ],
  });
  let internSundayFixed = 0;
  console.log(`Intern profiles scanned: ${internUsers.length}`);
  for (const intern of internUsers) {
    const schedules = Array.isArray(intern.schedules) ? intern.schedules : [];
    if (schedules.length === 0) continue;
    const latest = schedules
      .slice()
      .sort(
        (a: any, b: any) =>
          new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
      )[0];
    if (!sundayLooksLikeWorkingDay(latest?.daily?.sunday)) continue;

    internSundayFixed += 1;
    const name = String(intern.name || intern._id);
    console.log(
      `  intern Sunday schedule ${name}: ${latest.daily.sunday.inTime}–${latest.daily.sunday.outTime} working → weekoff`
    );
    if (apply) {
      latest.daily.sunday = { ...SUNDAY_WEEKOFF };
      intern.markModified('schedules');
      await intern.save();
    }
  }

  const requests = await AttendanceRequest.find(query);
  console.log(`WFH requests scanned: ${requests.length}`);

  const userCache = new Map<string, any>();
  const attendanceCache = new Map<string, any>();
  const dirtyAttendanceKeys = new Set<string>();

  let fixed = 0;
  let skipped = 0;
  const sample: string[] = [];

  for (const req of requests) {
    if (isExtraWorkRequest(req)) {
      skipped += 1;
      continue;
    }

    const date = String(req.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped += 1;
      continue;
    }

    const userId = String(req.userId);
    let user = userCache.get(userId);
    if (user === undefined) {
      user = await User.findById(userId);
      userCache.set(userId, user || null);
    }
    if (!user) {
      skipped += 1;
      continue;
    }

    if (!shouldRepairWfhRequest(String(req.requestedStatus || ''), user, date)) {
      skipped += 1;
      continue;
    }

    const reference = getWorkHoursReferenceSchedule(user, date);
    const expectedStart = normalizeHhMm(reference.inTime);
    if (!expectedStart) {
      skipped += 1;
      continue;
    }

    const oldStart = String(req.startTime || '');
    const oldEnd = String(req.endTime || '');
    const currentStart = normalizeHhMm(oldStart);
    // Sunday-default bug: derived in-time became 09:00 while weekday in-time is not 09:00.
    // Interns / articles: same 09:00 rule, including weekday WFH.
    if (currentStart !== '09:00' || currentStart === expectedStart) {
      skipped += 1;
      continue;
    }

    const shifted = shiftTimeRangeToStart(oldStart, oldEnd, expectedStart);
    const newStart = shifted.startTime;
    const newEnd = shifted.endTime ?? oldEnd;

    const name = String(user.name || user.email || userId);
    const line = `${date} ${name} [${req.status}] ${String(req.requestedStatus)} ${oldStart || '—'}–${oldEnd || '—'} → ${newStart}–${newEnd || '—'}`;
    if (sample.length < 50) sample.push(line);

    if (apply) {
      req.startTime = newStart;
      if (shifted.endTime) req.endTime = shifted.endTime;
      await req.save();
    }

    if (req.status === 'Approved') {
      const monthYear = date.slice(0, 7);
      const attKey = `${userId}|${monthYear}`;
      let attendance = attendanceCache.get(attKey);
      if (attendance === undefined) {
        attendance = await Attendance.findOne({ userId: req.userId, monthYear });
        attendanceCache.set(attKey, attendance || null);
      }

      if (attendance?.records) {
        const rec =
          typeof attendance.records.get === 'function'
            ? attendance.records.get(date)
            : attendance.records[date];
        if (rec) {
          const plain =
            rec && typeof rec.toObject === 'function' ? rec.toObject() : { ...rec };
          const editedIn = String(plain.editedCheckin || '');
          const editedOut = String(plain.editedCheckout || '');
          const inMatchesOld = !normalizeHhMm(editedIn) || timesEqual(editedIn, oldStart);
          const outMatchesOld = !normalizeHhMm(editedOut) || timesEqual(editedOut, oldEnd);

          if (inMatchesOld || outMatchesOld) {
            if (inMatchesOld) plain.editedCheckin = newStart;
            if (outMatchesOld && shifted.endTime) plain.editedCheckout = shifted.endTime;
            if (apply) {
              if (typeof attendance.records.set === 'function') {
                attendance.records.set(date, plain);
              } else {
                attendance.records[date] = plain;
              }
              attendance.markModified('records');
              dirtyAttendanceKeys.add(attKey);
            }
          }
        }
      }
    }

    fixed += 1;
  }

  if (apply) {
    for (const attKey of dirtyAttendanceKeys) {
      const attendance = attendanceCache.get(attKey);
      if (!attendance) continue;
      const userId = attKey.split('|')[0];
      const user = userCache.get(userId);
      attendance.summary = calculateSummary(attendance.records, user || undefined);
      await attendance.save();
    }
  }

  console.log(`\nIntern Sunday schedules fixed: ${internSundayFixed}`);
  console.log(`Would fix / fixed WFH requests: ${fixed}`);
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
