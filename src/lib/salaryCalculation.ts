import { isArticleEmployee } from '@/lib/isArticleEmployee';
import type { SalaryAttendanceDays } from '@/lib/salaryAttendanceDays';

export type PayrollGroup = 'fixed' | 'partner' | 'staff' | 'admin' | 'article';

export type PayrollOverrides = {
  overtimeDays?: number | null;
  netWorkingDays?: number | null;
  officeWorkingDays?: number | null;
  dueInTally?: number | null;
  additionInOffDue?: number | null;
  otherExtra?: number | null;
  esiEmployer?: number | null;
  esiEmployee?: number | null;
  tds?: number | null;
  advances?: number | null;
  off?: number | null;
  penalty?: number | null;
  taReimbursement?: number | null;
  lcReimbursement?: number | null;
  laptopAdjustment?: number | null;
  remarks?: string;
  group?: PayrollGroup;
};

export type ArticleshipYear = 'I' | 'II' | 'III' | '';

export type SalaryCalcInput = {
  category?: string;
  designation?: string;
  employmentType?: string;
  joiningDate?: Date | string | null;
  articleshipStartDate?: Date | string | null;
  monthYear: string;
  days: SalaryAttendanceDays;
  leavesBf: number;
  monthlyEarnedRate?: number;
  basicSalary: number;
  laptopAllowance: number;
  suggestedPenalty: number;
  overrides?: PayrollOverrides;
  calendar: { totalDays: number; sundays: number; ohd: number };
};

export type SalaryCalcResult = {
  group: PayrollGroup;
  isNewJoin: boolean;
  isArticle: boolean;
  articleshipYear: ArticleshipYear;
  leavesEarned: number;
  leavesConsumed: number;
  leavesCf: number;
  overtimeDays: number;
  netWorkingDays: number;
  officeWorkingDays: number;
  checking: number;
  basic: number;
  laptop: number;
  payableBasic: number;
  payableLaptop: number;
  payableMonth: number;
  dueInTally: number;
  additionInOffDue: number;
  cashOffDue: number;
  otherExtra: number;
  esiEmployer: number;
  esiEmployee: number;
  tds: number;
  advances: number;
  off: number;
  penalty: number;
  taReimbursement: number;
  lcReimbursement: number;
  laptopAdjustment: number;
  bankPayment: number;
  cashOff: number;
  diff: number;
  netSalary: number;
};

const ARTICLE_STIPEND_I = 5250;
const ARTICLE_STIPEND_II_III = 6250;

export function parseMoney(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value ?? '')
    .replace(/[₹Rs.\s]/gi, '')
    .replace(/,/g, '')
    .trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function roundToTen(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / 10) * 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function toLocalDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function lastDayOfMonthYear(monthYear: string): Date {
  const [y, m] = monthYear.split('-').map(Number);
  return new Date(y, m, 0);
}

export function firstDayOfMonthYear(monthYear: string): Date {
  const [y, m] = monthYear.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

export function isNewJoinInMonth(joiningDate: Date | string | null | undefined, monthYear: string): boolean {
  const join = toLocalDate(joiningDate);
  if (!join) return false;
  const start = firstDayOfMonthYear(monthYear);
  const end = lastDayOfMonthYear(monthYear);
  return join >= start && join <= end;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Articleship year as of month-end.
 * Join-after-15th: if the anniversary falls this month after the 15th,
 * the year change applies from next month.
 */
export function articleshipYearForMonth(
  startDate: Date | string | null | undefined,
  monthYear: string
): ArticleshipYear {
  const start = toLocalDate(startDate);
  if (!start) return '';
  const monthEnd = lastDayOfMonthYear(monthYear);
  let asOf = monthEnd;

  const joinDay = start.getDate();
  const isAnniversaryMonth =
    monthEnd.getMonth() === start.getMonth() && monthEnd.getFullYear() > start.getFullYear();
  if (joinDay > 15 && isAnniversaryMonth) {
    asOf = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), Math.max(1, joinDay - 1));
  }

  const tenure = daysBetween(start, asOf);
  if (tenure > 730) return 'III';
  if (tenure > 365) return 'II';
  if (tenure >= 0) return 'I';
  return '';
}

export function articleStipendForYear(year: ArticleshipYear): number {
  if (year === 'I') return ARTICLE_STIPEND_I;
  if (year === 'II' || year === 'III') return ARTICLE_STIPEND_II_III;
  return 0;
}

export function resolvePayrollGroup(input: {
  category?: string;
  designation?: string;
  employmentType?: string;
  days: SalaryAttendanceDays;
  override?: PayrollGroup;
}): PayrollGroup {
  if (input.override) return input.override;
  const cat = String(input.category || '').toLowerCase();
  const des = String(input.designation || '').toLowerCase();
  const emp = String(input.employmentType || '').toLowerCase();
  const articleLike =
    isArticleEmployee({
      employmentType: input.employmentType,
      designation: input.designation,
      category: input.category,
    }) || cat.includes('intern') || emp.includes('intern') || des.includes('intern');
  if (articleLike) return 'article';
  if (cat.includes('partner')) {
    const worked =
      input.days.pio +
        input.days.osP +
        input.days.wfhWeekday +
        input.days.absent +
        input.days.hd +
        input.days.woPio >
      0;
    return worked ? 'partner' : 'fixed';
  }
  if (
    des.includes('sweeper') ||
    des.includes('peon') ||
    cat.includes('admin') ||
    des.includes('office boy') ||
    des.includes('caretaker')
  ) {
    return 'admin';
  }
  return 'staff';
}

function overrideNum(v: number | null | undefined, fallback: number): number {
  if (v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function computeSalaryLine(input: SalaryCalcInput): SalaryCalcResult {
  const o = input.overrides || {};
  const days = input.days;
  const isArticle = isArticleEmployee({
    employmentType: input.employmentType,
    designation: input.designation,
    category: input.category,
  }) || String(input.category || '').toLowerCase().includes('intern');

  const group = resolvePayrollGroup({
    category: input.category,
    designation: input.designation,
    employmentType: input.employmentType,
    days,
    override: o.group,
  });

  const isNewJoin = isNewJoinInMonth(input.joiningDate, input.monthYear);
  const articleshipYear = isArticle
    ? articleshipYearForMonth(input.articleshipStartDate || input.joiningDate, input.monthYear)
    : '';

  const officeWorkingDays = overrideNum(
    o.officeWorkingDays,
    Math.max(0, input.calendar.totalDays - input.calendar.sundays - input.calendar.ohd)
  );

  let leavesEarned = 0;
  if (isArticle) {
    if (days.weekdaysWorking > 0) {
      leavesEarned = Math.round(((days.pio + days.wfhWeekday) / 6) * 10) / 10;
    }
  } else if (!isNewJoin && days.presentOrWfhCount > 0) {
    leavesEarned = input.monthlyEarnedRate ?? 2;
  }

  let leavesConsumed = 0;
  if (!isArticle) {
    if (days.weekdaysWorking < 10) {
      leavesConsumed = 0;
    } else {
      leavesConsumed = Math.min(days.leavesTaken, Number(input.leavesBf || 0) + leavesEarned);
    }
  }
  const leavesCf = round3(Number(input.leavesBf || 0) + leavesEarned - leavesConsumed);

  const overtimeDays = isArticle ? 0 : overrideNum(o.overtimeDays, days.overtimeSuggested);

  let netWorkingDays: number;
  if (o.netWorkingDays != null && Number.isFinite(Number(o.netWorkingDays))) {
    netWorkingDays = Number(o.netWorkingDays);
  } else if (isArticle) {
    netWorkingDays = round3(days.weekdaysWorking + days.weekoffWorking);
  } else {
    netWorkingDays = round3(days.weekdaysWorking + leavesConsumed + days.weekoffWorking + overtimeDays);
  }

  const checking = round3(
    days.weekdaysWorking + days.leavesTaken + input.calendar.ohd + input.calendar.sundays - input.calendar.totalDays
  );

  let basic = parseMoney(input.basicSalary);
  if (isArticle) {
    basic = articleStipendForYear(articleshipYear);
  }
  const laptop = parseMoney(input.laptopAllowance);

  const payableBasic =
    officeWorkingDays > 0 ? roundToTen((basic * netWorkingDays) / officeWorkingDays) : 0;
  const payableLaptop =
    officeWorkingDays > 0 ? roundToTen((laptop * netWorkingDays) / officeWorkingDays) : 0;
  const payableMonth = payableBasic + payableLaptop;

  const dueInTally = overrideNum(o.dueInTally, payableMonth);
  const additionInOffDue = overrideNum(o.additionInOffDue, 0);
  const cashOffDue = payableMonth - dueInTally + additionInOffDue;

  const otherExtra = overrideNum(o.otherExtra, 0);
  const esiEmployer = overrideNum(o.esiEmployer, 0);
  const esiEmployee = overrideNum(o.esiEmployee, 0);
  const tds = overrideNum(o.tds, 0);
  const advances = overrideNum(o.advances, 0);
  const off = overrideNum(o.off, 0);
  const penalty = overrideNum(o.penalty, input.suggestedPenalty || 0);
  const taReimbursement = overrideNum(o.taReimbursement, 0);
  const lcReimbursement = overrideNum(o.lcReimbursement, 0);
  const laptopAdjustment = overrideNum(o.laptopAdjustment, 0);

  const extrasForBank = otherExtra + esiEmployer + esiEmployee + tds + advances + penalty;
  const bankPayment = dueInTally + extrasForBank;
  const cashOff = cashOffDue + off;
  const diff = bankPayment + cashOff - payableMonth - extrasForBank - off;

  const income = payableBasic + payableLaptop + taReimbursement + lcReimbursement;
  const deductions = penalty + advances + laptopAdjustment;
  const netSalary = income - deductions;

  return {
    group,
    isNewJoin,
    isArticle,
    articleshipYear,
    leavesEarned: round3(leavesEarned),
    leavesConsumed: round3(leavesConsumed),
    leavesCf,
    overtimeDays: round3(overtimeDays),
    netWorkingDays: round3(netWorkingDays),
    officeWorkingDays: round3(officeWorkingDays),
    checking,
    basic,
    laptop,
    payableBasic,
    payableLaptop,
    payableMonth,
    dueInTally,
    additionInOffDue,
    cashOffDue,
    otherExtra,
    esiEmployer,
    esiEmployee,
    tds,
    advances,
    off,
    penalty,
    taReimbursement,
    lcReimbursement,
    laptopAdjustment,
    bankPayment,
    cashOff,
    diff: round3(diff),
    netSalary,
  };
}

export function monthCalendar(monthYear: string, holidayDates: string[]): {
  totalDays: number;
  sundays: number;
  ohd: number;
} {
  const end = lastDayOfMonthYear(monthYear);
  const totalDays = end.getDate();
  let sundays = 0;
  for (let d = 1; d <= totalDays; d++) {
    const dt = new Date(end.getFullYear(), end.getMonth(), d);
    if (dt.getDay() === 0) sundays += 1;
  }
  const prefix = `${monthYear}-`;
  let ohd = 0;
  for (const h of holidayDates) {
    if (!h.startsWith(prefix)) continue;
    const [y, m, day] = h.split('-').map(Number);
    const dt = new Date(y, m - 1, day);
    if (dt.getDay() !== 0) ohd += 1;
  }
  return { totalDays, sundays, ohd };
}

export function formatMonthLabel(monthYear: string): string {
  const [year, month] = monthYear.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(d.getTime())) return monthYear;
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function inr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(n || 0));
}
