/**
 * Targeted repair: fix stale day excessHour / missing totalHour only.
 *
 * Safety rules — a day is patched ONLY when:
 *   1. It is not a blank placeholder (has type / punches / value / totalHour / stored excess), AND
 *   2. It is in the bug class (punches, CP-P/OS-P/WFH, or leave/absent with stale deficit), AND
 *   3. totalHour is missing while punches exist, OR stored excess differs from live calc.
 *
 * Never writes full-day deficits onto empty future/placeholder days (0 → −9).
 * Does NOT change: typeOfPresence, punches, halfDay, remarks, leave flags, or summary.
 *
 * Usage:
 *   npx cross-env NODE_OPTIONS="--require ./dns-patch.js --dns-result-order=ipv4first" `
 *     tsx --env-file=.env.local scripts/repair-day-excess-hours.ts --dry-run --all --month 2026-08
 *   ... --apply --all --month 2026-08
 */
import dbConnect from '../src/lib/mongodb';
import User from '../src/models/User';
import Attendance from '../src/models/Attendance';
import { calculateDayExcessHour } from '../src/lib/calculateDayExcessHour';
import { calculateTotalHours } from '../src/lib/attendanceHours';
import { getScheduledTimes } from '../src/lib/scheduleUtils';
import {
  isValueBasedPresenceHoursType,
  typeIncludesClientPlace,
} from '../src/lib/resolveDayWorkedHours';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const EXCESS_EPS = 0.01;

function plainRecord(rec: unknown): Record<string, unknown> | null {
  if (!rec || typeof rec !== 'object') return null;
  // Mongoose subdocs / Maps: spread alone drops fields — use toObject / JSON.
  const anyRec = rec as { toObject?: () => Record<string, unknown> };
  if (typeof anyRec.toObject === 'function') {
    return { ...anyRec.toObject() };
  }
  try {
    return JSON.parse(JSON.stringify(rec));
  } catch {
    return { ...(rec as Record<string, unknown>) };
  }
}

function recordsToPlain(records: unknown): Record<string, Record<string, unknown>> {
  if (!records) return {};
  if (records instanceof Map) {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of records.entries()) {
      const p = plainRecord(v);
      if (p) out[String(k)] = p;
    }
    return out;
  }
  const out: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(records as Record<string, unknown>)) {
    const p = plainRecord(v);
    if (p) out[k] = p;
  }
  return out;
}

function hasValidPunch(inTime: string, outTime: string): boolean {
  return Boolean(inTime && outTime && inTime !== '00:00' && outTime !== '00:00');
}

function isBlankPlaceholder(
  rec: Record<string, unknown>,
  inTime: string,
  outTime: string
): boolean {
  const type = String(rec.typeOfPresence || '').trim();
  if (type) return false;
  if (hasValidPunch(inTime, outTime)) return false;
  if (Number(rec.value || 0) > 0) return false;
  if (Number(rec.totalHour || 0) > 0) return false;
  if (Math.abs(Number(rec.excessHour || 0)) > EXCESS_EPS) return false;
  return true;
}

/**
 * Strict scope — only the Sheetal-class bug:
 *   - CP-P / OS-P / WFH (empty edited punches → full-day deficit), or
 *   - real punches with a large stale full-day deficit (≤ −5h)
 *
 * Leave/Absent day deficits are NOT rewritten here (live Summary already
 * recomputes; changing those would alter stored values outside this bug).
 */
function shouldConsiderRepair(
  rec: Record<string, unknown>,
  inTime: string,
  outTime: string
): boolean {
  const type = String(rec.typeOfPresence || '');
  const prevEx = Number(rec.excessHour ?? 0);

  if (isValueBasedPresenceHoursType(type) || typeIncludesClientPlace(type)) {
    return true;
  }

  // Empty-edited style stale deficit on a punched day (non–value-based)
  if (hasValidPunch(inTime, outTime) && prevEx <= -5) {
    return true;
  }

  return false;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
  const allUsers = process.argv.includes('--all');
  const name = arg('--name');
  const monthYear = arg('--month') || '2026-08';
  const verbose = process.argv.includes('--verbose');

  if (!allUsers && !name) {
    console.error('Pass --all or --name "..."');
    process.exit(1);
  }

  await dbConnect();

  // Full user docs needed for schedule / article rules
  const users = allUsers
    ? await User.find({})
    : await User.find({ name: new RegExp(name!, 'i') });

  console.log(
    JSON.stringify({
      mode: dryRun ? 'dry-run' : 'APPLY',
      monthYear,
      userCount: users.length,
      scope: allUsers ? 'all users' : `name~/${name}/i`,
    })
  );

  let docsTouched = 0;
  let daysPatched = 0;
  let totalHourFills = 0;
  let excessFixes = 0;
  let skippedBlank = 0;
  let skippedOutOfScope = 0;
  const sample: unknown[] = [];
  const perUser: unknown[] = [];

  for (const user of users) {
    const att = await Attendance.findOne({ userId: user._id, monthYear });
    if (!att) continue;

    const rawRecords = recordsToPlain(att.records);
    let changed = 0;
    let oldDayExcessSum = 0;
    let newDayExcessSum = 0;

    for (const date of Object.keys(rawRecords).sort()) {
      const rec = rawRecords[date];
      if (!rec) continue;

      const type = String(rec.typeOfPresence || '');
      const inTime = String(rec.editedCheckin || rec.checkin || '').trim();
      const outTime = String(rec.editedCheckout || rec.checkout || '').trim();
      const prevEx = Number(rec.excessHour ?? 0);
      const prevTh = Number(rec.totalHour ?? 0);

      if (isBlankPlaceholder(rec, inTime, outTime)) {
        skippedBlank += 1;
        oldDayExcessSum += prevEx;
        newDayExcessSum += prevEx;
        continue;
      }

      if (!shouldConsiderRepair(rec, inTime, outTime)) {
        skippedOutOfScope += 1;
        oldDayExcessSum += prevEx;
        newDayExcessSum += prevEx;
        continue;
      }

      const schedule = getScheduledTimes(user, date);
      const punchHours = calculateTotalHours(inTime, outTime, {
        scheduledIn: schedule.inTime,
        scheduledOut: schedule.outTime,
      });

      oldDayExcessSum += prevEx;

      const working = { ...rec };
      let filledTotal = false;

      if (punchHours > 0 && prevTh <= 0) {
        working.totalHour = punchHours;
        filledTotal = true;
      }

      const nextEx = calculateDayExcessHour(
        user,
        date,
        working as any,
        schedule.inTime || '',
        schedule.outTime || ''
      );

      const excessDiffers = Math.abs(prevEx - nextEx) > EXCESS_EPS;

      if (!filledTotal && !excessDiffers) {
        newDayExcessSum += prevEx;
        continue;
      }

      if (filledTotal) {
        rec.totalHour = punchHours;
        totalHourFills += 1;
      }
      if (excessDiffers) {
        rec.excessHour = nextEx;
        excessFixes += 1;
        newDayExcessSum += nextEx;
      } else {
        newDayExcessSum += prevEx;
      }

      rawRecords[date] = rec;
      changed += 1;
      daysPatched += 1;

      const row = {
        name: String(user.name),
        date,
        type: type || '(no type)',
        ...(filledTotal ? { totalHour: `${prevTh} -> ${punchHours}` } : {}),
        excessHour: `${prevEx} -> ${excessDiffers ? nextEx : prevEx}`,
      };
      if (verbose || sample.length < 60) sample.push(row);
    }

    if (changed === 0) continue;

    docsTouched += 1;
    perUser.push({
      name: String(user.name),
      days: changed,
      oldDayExcessSum: Number(oldDayExcessSum.toFixed(2)),
      newDayExcessSum: Number(newDayExcessSum.toFixed(2)),
      delta: Number((newDayExcessSum - oldDayExcessSum).toFixed(2)),
    });

    if (!dryRun) {
      att.records = rawRecords as any;
      att.markModified('records');
      // Day fields only — do not run calculateSummary (avoids halfDay / summary churn).
      await att.save();
    }
  }

  console.log(
    JSON.stringify(
      {
        docsTouched,
        daysPatched,
        totalHourFills,
        excessFixes,
        skippedBlank,
        skippedOutOfScope,
        usersWithPatches: perUser.length,
        perUser,
        sample,
      },
      null,
      2
    )
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
