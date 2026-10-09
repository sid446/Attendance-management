import Attendance from '@/models/Attendance';
import AttendanceRequest from '@/models/AttendanceRequest';
import User from '@/models/User';
import { calculateSummary } from '@/lib/attendanceSummaryCalculation';
import { applyWfhOspSpentWindow } from '@/lib/deriveRequestInOutFromWorkHours';
import {
  formatPresenceCredit,
  presenceKindForStatus,
  resolvePresenceCredit,
  toAttendanceDateKey,
  type PresenceCreditKind,
} from '@/lib/presenceCredit';
import { loadPresenceCreditRules } from '@/lib/presenceCreditDb';

type DayRecord = {
  typeOfPresence?: string;
  status?: string;
  value?: number;
  editedCheckin?: string;
  editedCheckout?: string;
  checkin?: string;
  checkout?: string;
  totalHour?: number;
  excessHour?: number;
  toObject?: () => DayRecord;
};

function recordEntries(records: unknown): [string, DayRecord][] {
  if (!records) return [];
  if (typeof (records as { entries?: () => Iterable<[string, DayRecord]> }).entries === 'function') {
    return [...(records as { entries: () => Iterable<[string, DayRecord]> }).entries()];
  }
  return Object.entries(records as Record<string, DayRecord>);
}

function writeRecord(records: unknown, date: string, rec: DayRecord) {
  if (records && typeof (records as { set?: (k: string, v: DayRecord) => void }).set === 'function') {
    (records as { set: (k: string, v: DayRecord) => void }).set(date, rec);
  } else if (records && typeof records === 'object') {
    (records as Record<string, DayRecord>)[date] = rec;
  }
}

function plainRecord(rec: DayRecord): DayRecord {
  if (typeof rec.toObject === 'function') return { ...rec.toObject() };
  return { ...rec };
}

/**
 * From `fromDate`, bring saved WFH or OSP days that are above the credit limit
 * down to that limit. A day already within the limit is left as it was.
 */
export async function syncPresenceCreditOntoAttendance(options: {
  fromDate: string;
  kind: PresenceCreditKind;
}): Promise<{ updated: number; lines: string[] }> {
  const fromDate = toAttendanceDateKey(options.fromDate);
  if (!fromDate) return { updated: 0, lines: [] };

  const rules = await loadPresenceCreditRules();
  const fromMonth = fromDate.slice(0, 7);
  const [users, docs] = await Promise.all([
    User.find({}).select('name team employmentType designation category schedules seasonalSchedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth').lean(),
    Attendance.find({ monthYear: { $gte: fromMonth } }),
  ]);
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  let updated = 0;
  const lines: string[] = [];

  for (const doc of docs) {
    const user = usersById.get(String(doc.userId));
    if (!user || !doc.records) continue;
    let dirty = false;

    for (const [date, raw] of recordEntries(doc.records)) {
      if (!date || date < fromDate) continue;
      const rec = plainRecord(raw);
      const type = String(rec.typeOfPresence || rec.status || '');
      if (presenceKindForStatus(type) !== options.kind) continue;

      const resolved = resolvePresenceCredit(rules, user, date, options.kind);
      const stored = Number(rec.value);
      if (!Number.isFinite(stored) || stored <= resolved + 0.001) continue;

      rec.value = resolved;
      applyWfhOspSpentWindow(rec, user, date, { typeOfPresence: type });
      writeRecord(doc.records, date, rec);
      dirty = true;
      updated += 1;

      const creditText = formatPresenceCredit(resolved);
      const name = String((user as { name?: string }).name || doc.userId);
      lines.push(
        `${date} ${name} ${type} ${Number.isFinite(stored) ? stored : '—'} → ${creditText} ${rec.editedCheckin}–${rec.editedCheckout}`
      );

      const requests = await AttendanceRequest.find({
        userId: doc.userId,
        date,
        status: 'Approved',
      }).sort({ updatedAt: -1 });
      const request = requests.find(
        (row) => presenceKindForStatus(String(row.requestedStatus || '')) === options.kind
      );
      if (request) {
        if (String(request.hrValue || '').trim()) request.hrValue = creditText;
        if (String(request.partnerProposedValue || '').trim()) request.partnerProposedValue = creditText;
        if (!String(request.hrValue || '').trim() && !String(request.partnerProposedValue || '').trim()) {
          request.partnerProposedValue = creditText;
        }
        request.startTime = rec.editedCheckin;
        request.endTime = rec.editedCheckout;
        await request.save();
      }
    }

    if (dirty) {
      doc.markModified('records');
      doc.summary = calculateSummary(doc.records as never, user as never) as typeof doc.summary;
      await doc.save();
    }
  }

  return { updated, lines };
}
