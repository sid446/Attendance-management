import User, { IUser } from '@/models/User';
import Attendance from '@/models/Attendance';
import Holiday from '@/models/Holiday';
import LeaveSnapshot from '@/models/LeaveSnapshot';
import Fine from '@/models/Fine';
import PayrollMonth, { IPayrollLine } from '@/models/PayrollMonth';
import { countSalaryAttendanceDays, type SalaryDayRecord } from '@/lib/salaryAttendanceDays';
import {
  computeSalaryLine,
  monthCalendar,
  parseMoney,
  type PayrollOverrides,
} from '@/lib/salaryCalculation';
import {
  getDesignationForDate,
  getManagedFieldValueForDate,
  getWorkingUnderPartnerForDate,
  lastDayOfMonthYear,
} from '@/lib/userFieldHistory';
import { getEmploymentTypeForDate } from '@/lib/attendanceSummaryMetrics';
import { isArticleEmployee } from '@/lib/isArticleEmployee';
import { filterRecordsByInactiveCutoff, toYmd } from '@/lib/attendanceInactiveFilter';

function recordsToObject(records: unknown): Record<string, SalaryDayRecord> {
  const out: Record<string, SalaryDayRecord> = {};
  if (!records) return out;
  if (records instanceof Map) {
    for (const [k, v] of records.entries()) {
      out[String(k)] = (v || {}) as SalaryDayRecord;
    }
    return out;
  }
  if (typeof records === 'object') {
    for (const [k, v] of Object.entries(records as Record<string, unknown>)) {
      out[k] = (v || {}) as SalaryDayRecord;
    }
  }
  return out;
}

function weekdayHoursFromUser(user: IUser | null | undefined, asOf: Date): number {
  try {
    const schedules = user?.schedules;
    if (schedules && Array.isArray(schedules) && schedules.length > 0) {
      const applicable = schedules
        .filter((s) => s?.effectiveFrom && new Date(s.effectiveFrom) <= asOf)
        .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
      const monday = applicable[0]?.daily?.monday;
      if (monday?.inTime && monday?.outTime) {
        const [inH, inM] = monday.inTime.split(':').map(Number);
        const [outH, outM] = monday.outTime.split(':').map(Number);
        const calc = outH + outM / 60 - (inH + inM / 60);
        if (calc > 0) return calc;
      }
    }
  } catch {
    // fall through
  }
  return 8;
}

function periodExcessHours(records: Record<string, SalaryDayRecord>): number {
  let sum = 0;
  for (const rec of Object.values(records)) {
    const ex = Number(rec?.excessHour || 0);
    if (Number.isFinite(ex)) sum += ex;
  }
  return sum;
}

function suggestedPenaltyFromFine(fine: {
  fineRecords?: Array<{ isWarning?: boolean; status?: string; paymentMode?: string; fineAmount?: number }>;
  totalFine?: number;
} | null): number {
  if (!fine) return 0;
  const records = fine.fineRecords || [];
  const salaryDeduction = records.filter(
    (r) =>
      !r.isWarning &&
      r.status === 'pending' &&
      (r.paymentMode === 'salary_deduction' || !r.paymentMode)
  );
  if (salaryDeduction.length > 0) {
    return salaryDeduction.reduce((s, r) => s + Number(r.fineAmount || 0), 0);
  }
  return Number(fine.totalFine || 0);
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

  const [users, attendanceDocs, holidays, snapshots, fines, existing] = await Promise.all([
    User.find({}).lean(),
    Attendance.find({ monthYear }).lean(),
    Holiday.find({ isActive: true }).select('date').lean(),
    LeaveSnapshot.find({ monthYear }).lean(),
    Fine.find({ monthYear }).lean(),
    PayrollMonth.findOne({ monthYear }),
  ]);

  if (existing?.status === 'finalized') {
    throw new Error('This month is finalized. Re-open it before regenerating.');
  }

  const holidayDates = holidays.map((h) => String(h.date));
  const holidaySet = new Set(holidayDates);
  const calendar = monthCalendar(monthYear, holidayDates);

  const attByUser = new Map<string, Record<string, SalaryDayRecord>>();
  for (const doc of attendanceDocs) {
    const uid = String(doc.userId);
    attByUser.set(uid, recordsToObject(doc.records));
  }

  const snapByUser = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    snapByUser.set(String(s.userId), s);
  }

  const fineByUser = new Map<string, (typeof fines)[number]>();
  for (const f of fines) {
    fineByUser.set(String(f.userId), f);
  }

  const prevOverrides = new Map<string, PayrollOverrides>();
  const prevSent = new Map<string, { payslipSentAt?: Date | null; payslipSentTo?: string }>();
  if (existing) {
    for (const line of existing.lines || []) {
      const id = String(line.userId);
      prevOverrides.set(id, (line.overrides || {}) as PayrollOverrides);
      prevSent.set(id, { payslipSentAt: line.payslipSentAt, payslipSentTo: line.payslipSentTo });
    }
  }

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
    const days = countSalaryAttendanceDays(records, holidaySet, {
      employmentType,
      weekdayHours: weekdayHoursFromUser(user, periodEnd),
      periodExcessHours: periodExcessHours(records),
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
    const suggestedPenalty = suggestedPenaltyFromFine(fineByUser.get(uid) || null);
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
      suggestedPenalty,
      overrides,
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
      penalty: calc.penalty,
      suggestedPenalty,
      taReimbursement: calc.taReimbursement,
      lcReimbursement: calc.lcReimbursement,
      laptopAdjustment: calc.laptopAdjustment,
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

export function recomputeLineFromOverrides(
  line: IPayrollLine,
  overrides: PayrollOverrides,
  calendar: { totalDays: number; sundays: number; ohd: number },
  monthYear: string
): IPayrollLine {
  const days = {
    pio: line.pio,
    woPio: line.woPio,
    osP: line.osP,
    absent: line.absent,
    hd: line.hd,
    weekoffHd: line.weekoffHd,
    weekoffs: line.weekoffs,
    sun: line.sun,
    ohd: line.ohd,
    wfhWeekoff: line.wfhWeekoff,
    wfhWeekday: line.wfhWeekday,
    wfhMaxAllowed: line.wfhMaxAllowed,
    absentWfh: line.absentWfh,
    presentWfhActual: line.presentWfhActual,
    absentWfhMaxActual: line.absentWfhMaxActual,
    weekdaysWorking: line.weekdaysWorking,
    leavesTaken: line.leavesTaken,
    weekoffWorking: line.weekoffWorking,
    overtimeSuggested: line.overtimeSuggested,
    presentOrWfhCount: line.pio + line.wfhWeekday,
    hasAnyRecord: true,
  };
  const calc = computeSalaryLine({
    category: line.category,
    designation: line.designation,
    employmentType: line.employmentType,
    joiningDate: line.joiningDate,
    articleshipStartDate: line.articleshipStartDate,
    monthYear,
    days,
    leavesBf: line.leavesBf,
    basicSalary: line.isArticle ? 0 : line.basic,
    laptopAllowance: line.laptop,
    suggestedPenalty: line.suggestedPenalty,
    overrides,
    calendar,
  });
  return {
    ...line,
    ...calc,
    overrides,
  };
}
