import User, { IUser } from '@/models/User';
import Attendance from '@/models/Attendance';
import Holiday from '@/models/Holiday';
import LeaveSnapshot from '@/models/LeaveSnapshot';
import PayrollMonth, { IPayrollLine } from '@/models/PayrollMonth';
import { countSalaryAttendanceDays, type SalaryDayRecord } from '@/lib/salaryAttendanceDays';
import {
  computeSalaryLine,
  monthCalendar,
  parseMoney,
  normalizePayrollExtraFields,
  extraFieldsForStore,
  plainCustomAmounts,
  type PayrollExtraField,
  type PayrollOverrides,
} from '@/lib/salaryCalculation';
import {
  getDesignationForDate,
  getManagedFieldValueForDate,
  getWorkingUnderPartnerForDate,
  lastDayOfMonthYear,
} from '@/lib/userFieldHistory';
import { getEmploymentTypeForDate, getDayExcessSumForPeriod, monthDateStrings } from '@/lib/attendanceSummaryMetrics';
import { scheduledMinutesBetween } from '@/lib/calculateDayExcessHour';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { isArticleEmployee } from '@/lib/isArticleEmployee';
import { filterRecordsByInactiveCutoff, toYmd } from '@/lib/attendanceInactiveFilter';
import {
  fetchDayApprovalsForUsersMonth,
  fetchExcessAllowanceLookup,
  fetchExcessDisplayLookup,
} from '@/lib/excessHourAllowanceDb';
import {
  lookupExcessDisplay,
  type ExcessAllowanceLookup,
  type ExcessDayAllowanceLookup,
  type ExcessDisplayLookup,
} from '@/lib/excessHourAllowance';
import type { AttendanceSummaryView, User as UiUser } from '@/types/ui';

function recordsToObject(records: unknown): Record<string, SalaryDayRecord> {
  const out: Record<string, SalaryDayRecord> = {};
  const put = (key: string, value: unknown) => {
    const r = (value || {}) as SalaryDayRecord & { inTime?: string; outTime?: string };
    out[String(key)] = {
      ...r,
      checkin: r.checkin || r.inTime || '',
      checkout: r.checkout || r.outTime || '',
    };
  };
  if (!records) return out;
  if (records instanceof Map) {
    for (const [k, v] of records.entries()) put(String(k), v);
    return out;
  }
  if (Array.isArray(records)) {
    for (const item of records) {
      if (Array.isArray(item) && item.length >= 2) put(String(item[0]), item[1]);
    }
    return out;
  }
  if (typeof records === 'object') {
    for (const [k, v] of Object.entries(records as Record<string, unknown>)) put(k, v);
  }
  return out;
}

function attendanceUserId(doc: { userId?: unknown }): string {
  const u = doc.userId as { _id?: unknown } | string | undefined;
  if (u && typeof u === 'object' && u._id) return String(u._id);
  return String(u || '');
}

/** First Monday of the payroll month, as YYYY-MM-DD. */
function firstMondayOfMonth(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Monday in–out length from the same schedule source Summary uses. */
function weekdayHoursFromUser(user: IUser | null | undefined, monthYear: string): number {
  try {
    const monday = firstMondayOfMonth(monthYear);
    const sch = getScheduledTimes(user, monday);
    if (sch?.inTime && sch?.outTime && sch.inTime !== '00:00' && sch.outTime !== '00:00') {
      const hours = scheduledMinutesBetween(sch.inTime, sch.outTime) / 60;
      if (hours > 0) return hours;
    }
  } catch {
    // fall through
  }
  return 8;
}

function storedDailyExcess(records: Record<string, SalaryDayRecord>): number {
  let sum = 0;
  for (const rec of Object.values(records)) {
    const ex = Number(rec?.excessHour || 0);
    if (Number.isFinite(ex)) sum += ex;
  }
  return Number(sum.toFixed(2));
}

function summaryViewFromRecords(
  uid: string,
  name: string,
  monthYear: string,
  records: Record<string, SalaryDayRecord>
): AttendanceSummaryView {
  return {
    id: uid,
    userId: uid,
    userName: name,
    monthYear,
    recordDetails: records as AttendanceSummaryView['recordDetails'],
    summary: {
      scheduledHours: '',
      shortHours: '',
      excessHours: '',
      totalHour: 0,
      totalLateArrival: 0,
      excessHour: 0,
      totalHalfDay: 0,
      totalPresent: 0,
      totalAbsent: 0,
      totalLeave: 0,
    },
  };
}

/** Same month excess hours as Attendance Summary. Uses live day excess; falls back to stored figures. */
function summaryExcessHours(
  user: IUser,
  uid: string,
  monthYear: string,
  records: Record<string, SalaryDayRecord>,
  holidaySet: Set<string>,
  maps: {
    dayMap: ExcessDayAllowanceLookup;
    displayMap: ExcessDisplayLookup;
    allowanceMap: ExcessAllowanceLookup;
  },
  storedMonthExcess: number
): number {
  const item = summaryViewFromRecords(uid, String(user.name || ''), monthYear, records);
  const dateList = monthDateStrings(monthYear);
  const uiUser = user as unknown as UiUser;
  const live = getDayExcessSumForPeriod(item, uiUser, dateList, {
    holidayDates: holidaySet,
    dayAllowanceMap: maps.dayMap,
  });
  const fromDays = lookupExcessDisplay(maps.displayMap, uid, monthYear);
  if (live !== 0) return live;
  if (fromDays != null && fromDays !== 0) return fromDays;
  if (storedMonthExcess !== 0) return storedMonthExcess;
  return storedDailyExcess(records);
}

function userShouldAppear(
  user: IUser,
  monthYear: string,
  hasAttendance: boolean
): boolean {
  if (user.isActive !== false) return true;
  const cut = toYmd(user.inactiveAsOf);
  if (!cut) return hasAttendance;
  const monthStart = `${monthYear}-01`;
  const monthEnd = toYmd(lastDayOfMonthYear(monthYear));
  if (cut > monthEnd) return true;
  if (cut <= monthStart && !hasAttendance) return false;
  return hasAttendance || cut > monthStart;
}

export async function generatePayrollMonth(monthYear: string, generatedBy: string) {
  if (!/^\d{4}-\d{2}$/.test(monthYear)) {
    throw new Error('monthYear must be YYYY-MM');
  }

  const periodEnd = lastDayOfMonthYear(monthYear);

  const [users, attendanceDocs, holidays, snapshots, existing] = await Promise.all([
    User.find({}).lean(),
    Attendance.find({ monthYear }).lean(),
    Holiday.find({ isActive: true }).select('date').lean(),
    LeaveSnapshot.find({ monthYear }).lean(),
    PayrollMonth.findOne({ monthYear }),
  ]);

  if (existing?.status === 'finalized') {
    throw new Error('This month is finalized. Re-open it before regenerating.');
  }

  const holidayDates = holidays.map((h) => String(h.date));
  const holidaySet = new Set(holidayDates);
  const calendar = monthCalendar(monthYear, holidayDates);

  const attByUser = new Map<string, Record<string, SalaryDayRecord>>();
  const attMonthExcess = new Map<string, number>();
  for (const doc of attendanceDocs) {
    const uid = attendanceUserId(doc);
    attByUser.set(uid, recordsToObject(doc.records));
    attMonthExcess.set(uid, Number((doc as { summary?: { excessHour?: number } }).summary?.excessHour || 0));
  }

  const snapByUser = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    snapByUser.set(String(s.userId), s);
  }

  const prevOverrides = new Map<string, PayrollOverrides>();
  const prevSent = new Map<string, { payslipSentAt?: Date | null; payslipSentTo?: string }>();
  const extraFields = normalizePayrollExtraFields(existing?.extraFields);
  if (existing) {
    for (const line of existing.lines || []) {
      const id = String(line.userId);
      prevOverrides.set(id, plainPayrollOverrides(line.overrides));
      prevSent.set(id, { payslipSentAt: line.payslipSentAt, payslipSentTo: line.payslipSentTo });
    }
  }

  const userIds = users.map((u) => String((u as { _id?: unknown })._id || ''));
  const [displayMap, dayMap, allowanceMap] = await Promise.all([
    fetchExcessDisplayLookup(userIds, monthYear),
    fetchDayApprovalsForUsersMonth(userIds, monthYear),
    fetchExcessAllowanceLookup(userIds.map((userId) => ({ userId, monthYear }))),
  ]);
  const excessMaps = { dayMap, displayMap, allowanceMap };

  const lines: IPayrollLine[] = [];

  for (const raw of users) {
    const user = raw as unknown as IUser;
    const uid = String(user._id);
    const rawRecords = attByUser.get(uid) || {};
    const records = filterRecordsByInactiveCutoff(rawRecords, user.inactiveAsOf);
    const hasAttendance = Object.keys(records).length > 0;
    if (!userShouldAppear(user, monthYear, hasAttendance)) continue;

    const designation = getDesignationForDate(user, periodEnd) || String(user.designation || '');
    const employmentType =
      getEmploymentTypeForDate(user as never, periodEnd) || String(user.employmentType || '');
    const isArticle = isArticleEmployee({
      employmentType,
      designation,
      category: user.category,
    });
    const weekdayHours = weekdayHoursFromUser(user, monthYear);
    const rawExcess = isArticle
      ? 0
      : summaryExcessHours(
          user,
          uid,
          monthYear,
          records,
          holidaySet,
          excessMaps,
          attMonthExcess.get(uid) || 0
        );
    const excessHours = Number(Math.max(0, rawExcess).toFixed(2));
    const days = countSalaryAttendanceDays(records, holidaySet, {
      employmentType,
      weekdayHours,
      periodExcessHours: excessHours,
      isArticle,
    });

    const snap = snapByUser.get(uid);
    const leavesBf = snap
      ? Number(snap.balanceAsOfMonth || 0)
      : Math.max(
          0,
          Number(user.leaveBalance?.remaining || 0) - Number(user.leaveBalance?.monthlyEarned || 2)
        );

    const basicSalary = parseMoney(
      getManagedFieldValueForDate(user, 'basicSalary', periodEnd) || user.basicSalary
    );
    const laptopAllowance = parseMoney(
      getManagedFieldValueForDate(user, 'laptopAllowance', periodEnd) || user.laptopAllowance
    );
    const overrides = prevOverrides.get(uid) || {};

    const calc = computeSalaryLine({
      category: String(user.category || ''),
      designation,
      employmentType,
      joiningDate: user.joiningDate,
      articleshipStartDate: user.articleshipStartDate || user.joiningDate,
      monthYear,
      days,
      leavesBf,
      monthlyEarnedRate: Number(user.leaveBalance?.monthlyEarned || 2),
      basicSalary,
      laptopAllowance,
      overrides,
      extraFields,
      calendar,
    });

    const sent = prevSent.get(uid) || {};

    lines.push({
      userId: user._id,
      odId: String(user.odId || ''),
      employeeCode: String(user.employeeCode || user.odId || ''),
      name: String(user.name || ''),
      email: String(user.email || ''),
      attendanceEmail: String(user.attendanceEmail || ''),
      category: String(user.category || ''),
      designation,
      team: String(user.team || ''),
      paidFrom: String(user.paidFrom || ''),
      tallyName: String(user.tallyName || ''),
      verticalHead: getWorkingUnderPartnerForDate(user, periodEnd),
      employmentType,
      joiningDate: user.joiningDate || null,
      articleshipStartDate: user.articleshipStartDate || user.joiningDate || null,
      bankName: String(user.bankName || ''),
      branchName: String(user.branchName || ''),
      accountNumber: String(user.accountNumber || ''),
      ifscCode: String(user.ifscCode || ''),
      accountHolderName: String(user.accountHolderName || ''),
      mobileNumber: String(user.mobileNumber || ''),
      esiNumber: String(user.esi || ''),
      otherAllowance: parseMoney(user.otherAllowance),
      group: calc.group,
      isNewJoin: calc.isNewJoin,
      isArticle: calc.isArticle,
      articleshipYear: calc.articleshipYear,
      pio: days.pio,
      woPio: days.woPio,
      osP: days.osP,
      absent: days.absent,
      hd: days.hd,
      weekoffHd: days.weekoffHd,
      weekoffs: days.weekoffs,
      sun: days.sun,
      ohd: days.ohd,
      wfhWeekoff: days.wfhWeekoff,
      wfhWeekday: days.wfhWeekday,
      wfhMaxAllowed: days.wfhMaxAllowed,
      absentWfh: days.absentWfh,
      presentWfhActual: days.presentWfhActual,
      absentWfhMaxActual: days.absentWfhMaxActual,
      weekdaysWorking: days.weekdaysWorking,
      leavesTaken: days.leavesTaken,
      leavesBf,
      leavesEarned: calc.leavesEarned,
      leavesConsumed: calc.leavesConsumed,
      leavesCf: calc.leavesCf,
      weekoffWorking: days.weekoffWorking,
      overtimeSuggested: days.overtimeSuggested,
      overtimeDays: calc.overtimeDays,
      excessHours,
      weekdayHours,
      netWorkingDays: calc.netWorkingDays,
      officeWorkingDays: calc.officeWorkingDays,
      checking: calc.checking,
      basic: calc.basic,
      laptop: calc.laptop,
      payableBasic: calc.payableBasic,
      payableLaptop: calc.payableLaptop,
      payableMonth: calc.payableMonth,
      dueInTally: calc.dueInTally,
      additionInOffDue: calc.additionInOffDue,
      cashOffDue: calc.cashOffDue,
      otherExtra: calc.otherExtra,
      esiEmployer: calc.esiEmployer,
      esiEmployee: calc.esiEmployee,
      tds: calc.tds,
      advances: calc.advances,
      off: calc.off,
      taReimbursement: calc.taReimbursement,
      lcReimbursement: calc.lcReimbursement,
      laptopAdjustment: calc.laptopAdjustment,
      customEarnings: calc.customEarnings,
      customDeductions: calc.customDeductions,
      bankPayment: calc.bankPayment,
      cashOff: calc.cashOff,
      diff: calc.diff,
      netSalary: calc.netSalary,
      overrides,
      payslipSentAt: sent.payslipSentAt || null,
      payslipSentTo: sent.payslipSentTo || '',
    } as IPayrollLine);
  }

  const groupOrder: Record<string, number> = {
    fixed: 0,
    partner: 1,
    staff: 2,
    admin: 3,
    article: 4,
  };
  lines.sort((a, b) => {
    const g = (groupOrder[a.group] ?? 9) - (groupOrder[b.group] ?? 9);
    if (g !== 0) return g;
    return String(a.name).localeCompare(String(b.name));
  });

  const payload = {
    monthYear,
    status: 'draft' as const,
    calendar,
    lines,
    extraFields: extraFieldsForStore(extraFields),
    generatedAt: new Date(),
    generatedBy,
  };

  const doc = await PayrollMonth.findOneAndUpdate(
    { monthYear },
    { $set: payload },
    { upsert: true, new: true }
  );
  return doc;
}

export function payrollLinePlain(line: IPayrollLine): IPayrollLine {
  const asDoc = line as IPayrollLine & { toObject?: (opts?: { depopulate?: boolean }) => IPayrollLine };
  if (typeof asDoc.toObject === 'function') {
    return asDoc.toObject({ depopulate: true });
  }
  return { ...line };
}

export function plainPayrollOverrides(raw: unknown): PayrollOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const asDoc = raw as PayrollOverrides & { toObject?: () => PayrollOverrides; penalty?: unknown };
  const obj = typeof asDoc.toObject === 'function' ? asDoc.toObject() : { ...asDoc };
  const { penalty: _removed, ...kept } = obj as PayrollOverrides & { penalty?: unknown };
  kept.customAmounts = plainCustomAmounts(kept.customAmounts);
  return kept;
}

export function mergePayrollOverrides(existing: PayrollOverrides, patch: PayrollOverrides): PayrollOverrides {
  const merged: PayrollOverrides = { ...existing, ...patch };
  delete (merged as { penalty?: unknown }).penalty;
  merged.customAmounts = {
    ...plainCustomAmounts(existing.customAmounts),
    ...plainCustomAmounts(patch.customAmounts),
  };
  return merged;
}

export function recomputeLineFromOverrides(
  line: IPayrollLine,
  overrides: PayrollOverrides,
  calendar: { totalDays: number; sundays: number; ohd: number },
  monthYear: string,
  extraFields: PayrollExtraField[] = []
): IPayrollLine {
  const base = payrollLinePlain(line);
  const days = {
    pio: base.pio,
    woPio: base.woPio,
    osP: base.osP,
    absent: base.absent,
    hd: base.hd,
    weekoffHd: base.weekoffHd,
    weekoffs: base.weekoffs,
    sun: base.sun,
    ohd: base.ohd,
    wfhWeekoff: base.wfhWeekoff,
    wfhWeekday: base.wfhWeekday,
    wfhMaxAllowed: base.wfhMaxAllowed,
    absentWfh: base.absentWfh,
    presentWfhActual: base.presentWfhActual,
    absentWfhMaxActual: base.absentWfhMaxActual,
    weekdaysWorking: base.weekdaysWorking,
    leavesTaken: base.leavesTaken,
    weekoffWorking: base.weekoffWorking,
    overtimeSuggested: base.overtimeSuggested,
    presentOrWfhCount: base.pio + base.wfhWeekday,
    hasAnyRecord: true,
  };
  const calc = computeSalaryLine({
    category: base.category,
    designation: base.designation,
    employmentType: base.employmentType,
    joiningDate: base.joiningDate,
    articleshipStartDate: base.articleshipStartDate,
    monthYear,
    days,
    leavesBf: base.leavesBf,
    basicSalary: base.isArticle ? 0 : base.basic,
    laptopAllowance: base.laptop,
    overrides,
    extraFields,
    calendar,
  });
  return {
    ...base,
    ...calc,
    userId: base.userId,
    overrides,
  };
}

export function applyPayrollLineOverrides(
  current: IPayrollLine,
  overrides: PayrollOverrides,
  calendar: { totalDays: number; sundays: number; ohd: number },
  monthYear: string,
  extraFields: PayrollExtraField[] = []
): void {
  const keptUserId = current.userId;
  const next = recomputeLineFromOverrides(current, overrides, calendar, monthYear, extraFields);
  Object.assign(current, next);
  current.userId = keptUserId;
  current.overrides = overrides;
}
