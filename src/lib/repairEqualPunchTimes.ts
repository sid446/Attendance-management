import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { calculateSummary } from '@/lib/attendanceSummaryCalculation';
import { isValidPunchTime, normalizeTimeToHHmm } from '@/lib/attendanceHours';

/** Late single punch in the In column is treated as exit-only (same as upload remap). */
export const EXIT_ONLY_IN_THRESHOLD = '16:00';

const LATE_CHECKIN_ABSENT_REMARK = 'Marked absent: check-in at or after 3:00 PM';
const LATE_CHECKIN_HALFDAY_REMARK =
  'Marked half day: check-in between 1:00 PM and 2:59 PM';

type DayRecordLike = {
  checkin?: string;
  checkout?: string;
  editedCheckin?: string;
  editedCheckout?: string;
  totalHour?: number;
  excessHour?: number;
  halfDay?: boolean;
  value?: number;
  remarks?: string;
  typeOfPresence?: string;
  [key: string]: unknown;
};

function effectivePunch(raw: string | null | undefined): string {
  const n = normalizeTimeToHHmm(raw);
  return n || '00:00';
}

function stripRemark(remarks: string, needle: string): string {
  return remarks
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && !part.includes(needle))
    .join(' | ');
}

/**
 * If in and out are the same real punch, clear one side using the 16:00 rule:
 * - time >= 16:00 → exit-only (in = 00:00, out kept)
 * - time < 16:00 → entry-only (in kept, out = 00:00)
 * Also undoes a false late-check-in Absent applied to equal or exit-only punches.
 * Returns true when the record was changed.
 */
export function repairEqualPunchDayRecord(record: DayRecordLike): boolean {
  const type = String(record.typeOfPresence || '');
  if (type === 'Holiday' || type === 'On leave' || type === 'Leave') {
    return false;
  }

  let checkin = effectivePunch(record.editedCheckin || record.checkin);
  let checkout = effectivePunch(record.editedCheckout || record.checkout);
  let changed = false;

  // Case A: equal real punches → apply 16:00 rule
  if (isValidPunchTime(checkin) && isValidPunchTime(checkout) && checkin === checkout) {
    const exitOnly = checkin >= EXIT_ONLY_IN_THRESHOLD;
    checkin = exitOnly ? '00:00' : checkin;
    checkout = exitOnly ? checkout : '00:00';
    record.checkin = checkin;
    record.checkout = checkout;
    record.editedCheckin = checkin;
    record.editedCheckout = checkout;
    record.totalHour = 0;
    record.excessHour = 0;
    record.halfDay = true;
    record.value = 0.5;

    let remarks = String(record.remarks || '').trim();
    const remarkExtra = exitOnly
      ? 'Exit-only punch detected (repaired equal in/out)'
      : 'No check-out time (repaired equal in/out)';
    if (!remarks.includes('repaired equal in/out')) {
      remarks = remarks ? `${remarks} | ${remarkExtra}` : remarkExtra;
    }
    record.remarks = remarks;
    changed = true;
  }

  // Case B: exit-only (missing in, late out) still wrongly marked Absent by 3pm rule
  const isExitOnlyShape =
    (!isValidPunchTime(checkin) || checkin === '00:00') &&
    isValidPunchTime(checkout) &&
    checkout >= EXIT_ONLY_IN_THRESHOLD;
  let remarks = String(record.remarks || '').trim();
  const hadFalseLateAbsent =
    type === 'Absent' && remarks.includes(LATE_CHECKIN_ABSENT_REMARK);

  if (changed || (isExitOnlyShape && hadFalseLateAbsent)) {
    if (hadFalseLateAbsent || (changed && type === 'Absent')) {
      record.typeOfPresence = 'ThumbMachine';
      changed = true;
    }
    if (hadFalseLateAbsent) {
      remarks = stripRemark(remarks, LATE_CHECKIN_ABSENT_REMARK);
      changed = true;
    }
    if (remarks.includes(LATE_CHECKIN_HALFDAY_REMARK) && (changed || isExitOnlyShape)) {
      remarks = stripRemark(remarks, LATE_CHECKIN_HALFDAY_REMARK);
      changed = true;
    }
    if (isExitOnlyShape) {
      record.halfDay = true;
      if (Number(record.value) === 0 && record.typeOfPresence !== 'Absent') {
        record.value = 0.5;
      }
      record.totalHour = 0;
    }
    record.remarks = remarks;
  }

  return changed;
}

function recordsAsIterable(
  records: Map<string, DayRecordLike> | Record<string, DayRecordLike> | undefined
): Array<[string, DayRecordLike]> {
  if (!records) return [];
  if (typeof (records as Map<string, DayRecordLike>).entries === 'function') {
    try {
      return Array.from((records as Map<string, DayRecordLike>).entries());
    } catch {
      /* fall through */
    }
  }
  return Object.entries(records as Record<string, DayRecordLike>);
}

/**
 * Scan attendance docs for a month and rewrite equal in/out punches in place.
 */
export async function repairEqualPunchesForMonth(
  monthYear: string,
  options?: { userId?: string }
): Promise<{
  daysFixed: number;
  docsUpdated: number;
}> {
  if (!/^\d{4}-\d{2}$/.test(monthYear)) {
    return { daysFixed: 0, docsUpdated: 0 };
  }

  const filter: { monthYear: string; userId?: string } = { monthYear };
  if (options?.userId) filter.userId = options.userId;

  const docs = await Attendance.find(filter);
  let daysFixed = 0;
  let docsUpdated = 0;

  for (const doc of docs) {
    let changed = false;
    const entries = recordsAsIterable(
      doc.records as Map<string, DayRecordLike> | Record<string, DayRecordLike>
    );

    for (const [date, rec] of entries) {
      if (!rec) continue;
      const plain: DayRecordLike =
        typeof (rec as { toObject?: () => DayRecordLike }).toObject === 'function'
          ? { ...(rec as { toObject: () => DayRecordLike }).toObject() }
          : { ...(rec as DayRecordLike) };
      if (!repairEqualPunchDayRecord(plain)) continue;
      daysFixed += 1;
      changed = true;
      const records = doc.records as unknown;
      if (records && typeof (records as Map<string, unknown>).set === 'function') {
        (records as Map<string, unknown>).set(date, plain);
      } else if (records && typeof records === 'object') {
        (records as Record<string, unknown>)[date] = plain;
      }
    }

    if (!changed) continue;

    const user = await User.findById(doc.userId);
    doc.summary = calculateSummary(doc.records as never, user);
    doc.markModified('records');
    doc.markModified('summary');
    await doc.save();
    docsUpdated += 1;
  }

  return { daysFixed, docsUpdated };
}
