/**
 * Replays paid/unpaid leave from stored attendance and rebuilds the derived data.
 *
 * How leave works in production (natural flow):
 * ─────────────────────────────────────────────
 * 1. User.leaveBalance
 *    - balanceAsOfJan26: opening balance (Excel)
 *    - earned: +2 per calendar month with attendance (from 2026-01, non-articles)
 *    - used: leave taken before Jan 2026 (Excel)
 *    - usedAfterJan26: leave consumed from 2026 onward (ledger-driven)
 *    - remaining = balanceAsOfJan26 + earned - used - usedAfterJan26
 *
 * 2. LeaveTransaction (ledger): earned | used | adjust
 *
 * 3. LeaveSnapshot — monthly rollup from transactions
 *
 * 4. Attendance records: Absent / On leave (value 0 = unpaid, 1 = paid)
 *
 * Upload allocation: absent candidates sorted by date; earliest days consume balance
 * → On leave, rest Absent. This module replays that same allocation across all stored
 * attendance, then rebuilds transactions, user balances, and snapshots.
 */

import mongoose from 'mongoose';
import Attendance from '@/models/Attendance';
import AttendanceRequest from '@/models/AttendanceRequest';
import Holiday from '@/models/Holiday';
import User from '@/models/User';
import LeaveTransaction from '@/models/LeaveTransaction';
import { createMonthlySnapshots } from '@/lib/leaveLedger';
import { MONTHLY_EARNED_SOURCES } from '@/lib/leaveManagement';

export const MONTHLY_EARN = 2;
export const EARN_FROM_MONTH = '2026-01';

const MACHINE_TYPES = new Set(['ThumbMachine', 'Manual', 'Remote']);

const USED_SOURCES_TO_REPLACE = [
  'approval',
  'attendance-partial',
  'reconcile-script-used',
  'reconcile-script-partial',
];

/**
 * Every source that represents the monthly base accrual, so a replay rebuilds all of it.
 * Missing one here leaves the old row in place next to the freshly inserted one and the
 * month gets credited twice.
 */
const EARNED_SOURCES_TO_REPLACE = Array.from(
  new Set([...MONTHLY_EARNED_SOURCES, 'monthly-increment', 'reconcile-script-earned'])
);

/** Cap on the sample of day-level changes returned to callers (keeps API payloads small). */
const MAX_SAMPLE_CHANGES = 200;

type DayRecord = {
  checkin?: string;
  checkout?: string;
  editedCheckin?: string;
  editedCheckout?: string;
  typeOfPresence?: string;
  value?: number;
  halfDay?: boolean;
  totalHour?: number;
  excessHour?: number;
  remarks?: string;
};

type AllocResult = {
  date: string;
  paid: boolean;
  value: number;
  reason: string;
  /** Preserved from an approved employee request rather than reallocated. */
  locked?: boolean;
  /** Status to keep for a locked day, instead of deriving it from `paid`. */
  keepType?: string;
};

/** The status a day should end up with once the replay is applied. */
function targetTypeFor(alloc: AllocResult): string {
  if (alloc.locked && alloc.keepType) return alloc.keepType;
  return alloc.paid ? 'On leave' : 'Absent';
}

type PartialResult = {
  date: string;
  amount: number;
};

export interface LeaveReconcileOptions {
  /** Inclusive first month (YYYY-MM). Defaults to 2026-01. */
  fromMonth?: string;
  /** Inclusive last month (YYYY-MM). Defaults to the current month. */
  toMonth?: string;
  /** Limit the replay to these users. Defaults to every active user. */
  userIds?: string[];
  /** When true (default) nothing is written; the result describes what would change. */
  dryRun?: boolean;
  /** Skip rewriting Attendance day records; balances and ledger still rebuild. */
  skipAttendance?: boolean;
  /** How many day-level changes to return. Defaults to 200 to keep API payloads small. */
  sampleChangeLimit?: number;
  /**
   * userId → opening balance to use instead of the stored `balanceAsOfJan26`. Lets a
   * dry run preview the effect of balances that have not been saved yet.
   */
  openingBalanceOverrides?: Record<string, number>;
}

export interface LeaveReconcileDayChange {
  userId: string;
  userName: string;
  date: string;
  fromType: string;
  fromValue: number;
  toType: string;
  toValue: number;
  reason: string;
}

export interface LeaveReconcileUserResult {
  userId: string;
  userName: string;
  isArticle: boolean;
  monthsWithAttendance: number;
  balanceAsOfJan26: number;
  usedBeforeJan26: number;
  earned: number;
  startingBalance: number;
  usedAfterJan26: number;
  remaining: number;
  leaveCandidates: number;
  paidDays: number;
  unpaidDays: number;
  partialDays: number;
  /** Days left untouched because an approved employee request set them. */
  lockedDays: number;
  attendanceDayChanges: number;
}

export interface LeaveReconcileResult {
  dryRun: boolean;
  fromMonth: string;
  toMonth: string;
  usersProcessed: number;
  usersSkippedNoAttendance: number;
  attendanceDocsUpdated: number;
  recordsUpdated: number;
  transactionsDeleted: number;
  transactionsCreated: number;
  monthsRebuilt: string[];
  users: LeaveReconcileUserResult[];
  sampleChanges: LeaveReconcileDayChange[];
}

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthInRange(monthYear: string, from: string, to: string): boolean {
  return monthYear >= from && monthYear <= to;
}

function isArticleUser(user: { employmentType?: string; designation?: string }): boolean {
  const emp = String(user.employmentType || '').toLowerCase();
  const des = String(user.designation || '').toLowerCase();
  return emp.includes('article') || des.includes('article');
}

function recordsMapToObject(
  records: Map<string, DayRecord> | Record<string, DayRecord>
): Record<string, DayRecord> {
  if (records instanceof Map) {
    const out: Record<string, DayRecord> = {};
    records.forEach((v, k) => {
      out[k] = typeof v === 'object' && v !== null ? { ...v } : v;
    });
    return out;
  }
  return { ...(records || {}) };
}

function effectiveInOut(rec: DayRecord): { inTime: string; outTime: string } {
  const inTime = String(rec.editedCheckin ?? rec.checkin ?? '').trim();
  const outTime = String(rec.editedCheckout ?? rec.checkout ?? '').trim();
  return { inTime, outTime };
}

function isNonWorkingDay(
  dateStr: string,
  typeOfPresence: string,
  holidayDates: Set<string>
): boolean {
  const typeLower = String(typeOfPresence || '').toLowerCase();
  return (
    new Date(dateStr).getDay() === 0 ||
    holidayDates.has(dateStr) ||
    typeOfPresence === 'Holiday' ||
    typeOfPresence === 'Sunday' ||
    typeOfPresence === 'Weekoff' ||
    typeLower.includes('holiday') ||
    typeLower.includes('weekoff') ||
    typeLower.includes('week off')
  );
}

/** Same rules as POST /api/attendance bulk upload. */
function isLeaveCandidate(dateStr: string, rec: DayRecord, holidayDates: Set<string>): boolean {
  const type = String(rec.typeOfPresence || '');
  if (type === 'On leave' || type === 'Absent') return true;

  const { inTime, outTime } = effectiveInOut(rec);
  const bothZero = (!inTime || inTime === '00:00') && (!outTime || outTime === '00:00');
  if (bothZero && MACHINE_TYPES.has(type) && !isNonWorkingDay(dateStr, type, holidayDates)) {
    return true;
  }
  return false;
}

function getPartialShortfall(dateStr: string, rec: DayRecord): number {
  const day = new Date(dateStr).getDay();
  if (day < 1 || day > 5) return 0;

  const type = String(rec.typeOfPresence || '');
  const eligible =
    type === 'WFH - weekdays' ||
    type === 'Half Day - weekdays' ||
    type === 'Half Day (HD)';

  if (!eligible) return 0;

  const raw = Number(rec.value);
  if (!Number.isFinite(raw)) return 0;
  const normalized = Math.min(1, Math.max(0, raw));
  return Math.round((1 - normalized) * 100) / 100;
}

function isApprovedOnLeaveRequest(requestedStatus: string | undefined): boolean {
  const s = String(requestedStatus || '').toLowerCase();
  return s.includes('leave') && !s.includes('absent');
}

function allocateLeaveDays(
  candidates: Array<{
    date: string;
    locked: boolean;
    currentType: string;
    currentValue: number;
    requestedStatus?: string;
  }>,
  startingBalance: number,
  isArticle: boolean
): { allocations: AllocResult[]; endingBalance: number } {
  const sorted = [...candidates].sort((a, b) => a.date.localeCompare(b.date));
  let running = startingBalance;
  const allocations: AllocResult[] = [];

  for (const c of sorted) {
    // A day that went through an approved employee request is a decision already made.
    // Never flip an approved "On leave" request to Absent — restore On leave even if a
    // previous reconcile wrongly marked it Absent. Articles keep the status but value 0.
    if (c.locked) {
      const approvedOnLeave = isApprovedOnLeaveRequest(c.requestedStatus);
      const keepType = approvedOnLeave
        ? 'On leave'
        : c.currentType || String(c.requestedStatus || 'Absent');
      const value = isArticle ? 0 : approvedOnLeave ? 1 : Number(c.currentValue || 0);
      const paid = value > 0;
      if (paid) running -= value;
      allocations.push({
        date: c.date,
        paid,
        value,
        reason: isArticle
          ? 'employee-request-approved-article-unpaid'
          : approvedOnLeave
            ? 'employee-request-approved-on-leave'
            : 'employee-request-approved',
        locked: true,
        keepType,
      });
      continue;
    }

    if (isArticle) {
      allocations.push({ date: c.date, paid: false, value: 0, reason: 'article-no-paid-leave' });
      continue;
    }
    if (running >= 1) {
      running -= 1;
      allocations.push({ date: c.date, paid: true, value: 1, reason: 'balance-available' });
    } else {
      allocations.push({ date: c.date, paid: false, value: 0, reason: 'insufficient-balance' });
    }
  }

  return { allocations, endingBalance: running };
}

function allocatePartialDays(
  entries: Array<{ date: string; amount: number }>,
  startingBalance: number
): { results: PartialResult[]; endingBalance: number } {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let running = Math.max(0, startingBalance);
  const results: PartialResult[] = [];

  for (const { date, amount } of sorted) {
    const desired = Math.round(Math.max(0, amount) * 100) / 100;
    if (desired <= 0) {
      results.push({ date, amount: 0 });
      continue;
    }
    const applied = Math.round(Math.min(desired, running) * 100) / 100;
    running = Math.round((running - applied) * 100) / 100;
    results.push({ date, amount: applied });
  }

  return { results, endingBalance: running };
}

function recalcLeaveSummary(records: Record<string, DayRecord>) {
  let totalLeave = 0;
  let totalAbsent = 0;
  for (const rec of Object.values(records)) {
    const type = String(rec.typeOfPresence || '');
    if (type === 'On leave' || type === 'Leave') totalLeave++;
    if (type === 'Absent') totalAbsent++;
  }
  return { totalLeave, totalAbsent };
}

/**
 * Replays leave allocation from attendance for the given months and users.
 * Caller is responsible for the DB connection.
 */
export async function reconcileLeaveFromAttendance(
  options: LeaveReconcileOptions = {}
): Promise<LeaveReconcileResult> {
  const fromMonth = options.fromMonth || EARN_FROM_MONTH;
  const toMonth = options.toMonth || currentMonthKey();
  const dryRun = options.dryRun !== false;
  const skipAttendance = options.skipAttendance === true;
  const sampleChangeLimit = options.sampleChangeLimit ?? MAX_SAMPLE_CHANGES;

  const objectIds = (options.userIds || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const hasUserFilter = objectIds.length > 0;

  const holidays = await Holiday.find({ isActive: true }).select('date').lean();
  const holidayDates = new Set(holidays.map((h) => String(h.date)));

  // An explicit user list wins over the active-only default, so an upload can still
  // fix someone who has since been deactivated.
  const userQuery: Record<string, unknown> = hasUserFilter
    ? { _id: { $in: objectIds } }
    : { isActive: { $ne: false } };

  const users = await User.find(userQuery)
    .select('_id name employmentType designation leaveBalance')
    .lean();

  const attendanceQuery: Record<string, unknown> = {
    monthYear: { $gte: fromMonth, $lte: toMonth },
  };
  if (hasUserFilter) attendanceQuery.userId = { $in: objectIds };

  const attendanceDocs = await Attendance.find(attendanceQuery).lean();

  // Days an employee asked for and someone approved are not ours to reallocate.
  // `hr_direct` requests are HR calendar edits, not employee requests; legacy rows have
  // no requestSource and were all employee-raised.
  const requestQuery: Record<string, unknown> = {
    status: 'Approved',
    monthYear: { $gte: fromMonth, $lte: toMonth },
    requestSource: { $ne: 'hr_direct' },
  };
  if (hasUserFilter) requestQuery.userId = { $in: objectIds };

  const approvedRequests = await AttendanceRequest.find(requestQuery)
    .select('userId date requestedStatus')
    .lean();
  const approvedRequestByKey = new Map(
    approvedRequests.map((r) => [
      `${String(r.userId)}|${String(r.date)}`,
      String(r.requestedStatus || ''),
    ])
  );

  const attendanceByUser = new Map<string, typeof attendanceDocs>();
  for (const doc of attendanceDocs) {
    const uid = String(doc.userId);
    if (!attendanceByUser.has(uid)) attendanceByUser.set(uid, []);
    attendanceByUser.get(uid)!.push(doc);
  }

  const result: LeaveReconcileResult = {
    dryRun,
    fromMonth,
    toMonth,
    usersProcessed: 0,
    usersSkippedNoAttendance: 0,
    attendanceDocsUpdated: 0,
    recordsUpdated: 0,
    transactionsDeleted: 0,
    transactionsCreated: 0,
    monthsRebuilt: [],
    users: [],
    sampleChanges: [],
  };

  const affectedMonths = new Set<string>();

  for (const user of users) {
    const uid = String(user._id);
    const docs = attendanceByUser.get(uid) || [];
    if (docs.length === 0) {
      result.usersSkippedNoAttendance++;
      continue;
    }

    const isArticle = isArticleUser(user);
    const override = options.openingBalanceOverrides?.[uid];
    const balanceAsOfJan26 = Number(
      override !== undefined ? override : user.leaveBalance?.balanceAsOfJan26 || 0
    );
    const usedBeforeJan26 = Number(user.leaveBalance?.used || 0);

    const monthsWithAttendance = new Set<string>();
    const leaveCandidates: Array<{ date: string; monthYear: string; rec: DayRecord }> = [];
    const partialCandidates: Array<{ date: string; monthYear: string; amount: number }> = [];

    for (const doc of docs) {
      const monthYear = String(doc.monthYear);
      if (!monthInRange(monthYear, fromMonth, toMonth)) continue;
      monthsWithAttendance.add(monthYear);
      affectedMonths.add(monthYear);

      const records = recordsMapToObject(doc.records as unknown as Map<string, DayRecord>);
      for (const [dateStr, rec] of Object.entries(records)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
        if (!monthInRange(dateStr.slice(0, 7), fromMonth, toMonth)) continue;

        if (isLeaveCandidate(dateStr, rec, holidayDates)) {
          leaveCandidates.push({ date: dateStr, monthYear, rec });
        }

        const partial = getPartialShortfall(dateStr, rec);
        if (partial > 0) {
          partialCandidates.push({ date: dateStr, monthYear, amount: partial });
        }
      }
    }

    const earnedTotal = isArticle ? 0 : monthsWithAttendance.size * MONTHLY_EARN;
    const startingBalance = balanceAsOfJan26 + earnedTotal - usedBeforeJan26;

    const leaveDates = leaveCandidates.map((c) => c.date);
    const { allocations, endingBalance: afterFullDays } = allocateLeaveDays(
      leaveCandidates.map((c) => {
        const key = `${uid}|${c.date}`;
        const requestedStatus = approvedRequestByKey.get(key);
        return {
          date: c.date,
          locked: requestedStatus !== undefined,
          currentType: String(c.rec.typeOfPresence || ''),
          currentValue: Number(c.rec.value ?? 0),
          requestedStatus,
        };
      }),
      startingBalance,
      isArticle
    );
    const allocByDate = new Map(allocations.map((a) => [a.date, a]));

    const partialEntries = partialCandidates.map((p) => ({ date: p.date, amount: p.amount }));
    const { results: partialResults } = allocatePartialDays(partialEntries, afterFullDays);

    const fullDayUsed = allocations.filter((a) => a.paid).reduce((s, a) => s + a.value, 0);
    const partialUsed = partialResults.reduce((s, p) => s + p.amount, 0);
    const totalUsedAfter = Math.round((fullDayUsed + partialUsed) * 1000) / 1000;

    const newRemaining = Math.max(
      0,
      Math.round((balanceAsOfJan26 + earnedTotal - usedBeforeJan26 - totalUsedAfter) * 1000) / 1000
    );

    let userRecordChanges = 0;
    for (const { date, rec } of leaveCandidates) {
      const alloc = allocByDate.get(date);
      if (!alloc) continue;
      const wantType = targetTypeFor(alloc);
      const curType = String(rec.typeOfPresence || '');
      const curValue = Number(rec.value ?? -1);
      if (curType !== wantType || curValue !== alloc.value) {
        userRecordChanges++;
        if (result.sampleChanges.length < sampleChangeLimit) {
          result.sampleChanges.push({
            userId: uid,
            userName: String(user.name || ''),
            date,
            fromType: curType,
            fromValue: Number(rec.value ?? 0),
            toType: wantType,
            toValue: alloc.value,
            reason: alloc.reason,
          });
        }
      }
    }

    result.users.push({
      userId: uid,
      userName: String(user.name || ''),
      isArticle,
      monthsWithAttendance: monthsWithAttendance.size,
      balanceAsOfJan26,
      usedBeforeJan26,
      earned: earnedTotal,
      startingBalance,
      usedAfterJan26: totalUsedAfter,
      remaining: newRemaining,
      leaveCandidates: leaveDates.length,
      paidDays: allocations.filter((a) => a.paid).length,
      unpaidDays: allocations.filter((a) => !a.paid).length,
      partialDays: partialResults.filter((p) => p.amount > 0).length,
      lockedDays: allocations.filter((a) => a.locked).length,
      attendanceDayChanges: userRecordChanges,
    });

    result.usersProcessed++;

    if (dryRun) {
      result.recordsUpdated += userRecordChanges;
      continue;
    }

    // ——— Apply: attendance records ———
    if (!skipAttendance) {
      for (const doc of docs) {
        const attendance = await Attendance.findById(doc._id);
        if (!attendance) continue;

        let docChanged = false;
        const records = attendance.records;

        for (const { date } of leaveCandidates) {
          const existing = records.get(date);
          if (!existing) continue;
          const alloc = allocByDate.get(date);
          if (!alloc) continue;

          const wantType = targetTypeFor(alloc);
          if (existing.typeOfPresence !== wantType || Number(existing.value) !== alloc.value) {
            existing.typeOfPresence = wantType as typeof existing.typeOfPresence;
            existing.value = alloc.value;
            existing.halfDay = false;
            records.set(date, existing);
            docChanged = true;
            result.recordsUpdated++;
          }
        }

        if (docChanged) {
          const plain = recordsMapToObject(records as unknown as Map<string, DayRecord>);
          const { totalLeave, totalAbsent } = recalcLeaveSummary(plain);
          attendance.summary.totalLeave = totalLeave;
          attendance.summary.totalAbsent = totalAbsent;
          await attendance.save();
          result.attendanceDocsUpdated++;
        }
      }
    }

    // ——— Apply: replace ledger rows for this user in range ———
    const delUsed = await LeaveTransaction.deleteMany({
      userId: user._id,
      type: 'used',
      source: { $in: USED_SOURCES_TO_REPLACE },
      monthYear: { $gte: fromMonth, $lte: toMonth },
    });
    result.transactionsDeleted += delUsed.deletedCount || 0;

    const delEarned = await LeaveTransaction.deleteMany({
      userId: user._id,
      type: 'earned',
      source: { $in: EARNED_SOURCES_TO_REPLACE },
      monthYear: { $gte: fromMonth, $lte: toMonth },
    });
    result.transactionsDeleted += delEarned.deletedCount || 0;

    const newTxs: Array<{
      userId: mongoose.Types.ObjectId;
      date: string;
      monthYear: string;
      type: 'earned' | 'used';
      amount: number;
      source: string;
      reference?: string;
    }> = [];

    if (!isArticle) {
      for (const monthYear of monthsWithAttendance) {
        newTxs.push({
          userId: user._id as mongoose.Types.ObjectId,
          date: `${monthYear}-01`,
          monthYear,
          type: 'earned',
          amount: MONTHLY_EARN,
          source: 'reconcile-script-earned',
          reference: `month:${monthYear}`,
        });
      }

      for (const a of allocations) {
        if (!a.paid || a.value <= 0) continue;
        newTxs.push({
          userId: user._id as mongoose.Types.ObjectId,
          date: a.date,
          monthYear: a.date.slice(0, 7),
          type: 'used',
          amount: a.value,
          source: 'reconcile-script-used',
          reference: `full-day:${a.date}`,
        });
      }

      for (const p of partialResults) {
        if (p.amount <= 0) continue;
        newTxs.push({
          userId: user._id as mongoose.Types.ObjectId,
          date: p.date,
          monthYear: p.date.slice(0, 7),
          type: 'used',
          amount: p.amount,
          source: 'attendance-partial',
          reference: `attendance-partial:${p.date}`,
        });
      }
    }

    if (newTxs.length > 0) {
      await LeaveTransaction.insertMany(newTxs);
      result.transactionsCreated += newTxs.length;
    }

    await User.findByIdAndUpdate(user._id, {
      'leaveBalance.earned': earnedTotal,
      'leaveBalance.usedAfterJan26': Math.round(totalUsedAfter * 1000) / 1000,
      'leaveBalance.remaining': newRemaining,
      'leaveBalance.lastUpdated': new Date(),
      'leaveBalance.monthlyEarned': MONTHLY_EARN,
    });
  }

  if (!dryRun) {
    const months = Array.from(affectedMonths).sort();
    for (const m of months) {
      await createMonthlySnapshots(m);
      result.monthsRebuilt.push(m);
    }
  }

  return result;
}
