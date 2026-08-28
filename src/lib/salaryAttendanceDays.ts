/**
 * Salary-sheet day counts from attendance records.
 * Mirrors Detailed Attendance export / Excel Salary columns I–AL.
 */

export type SalaryDayRecord = {
  typeOfPresence?: string;
  halfDay?: boolean;
  value?: number;
  checkin?: string;
  checkout?: string;
  editedCheckin?: string;
  editedCheckout?: string;
  totalHour?: number;
  excessHour?: number;
  extraEarned?: number;
};

export type SalaryAttendanceDays = {
  pio: number;
  woPio: number;
  osP: number;
  absent: number;
  hd: number;
  weekoffHd: number;
  weekoffs: number;
  sun: number;
  ohd: number;
  wfhWeekoff: number;
  wfhWeekday: number;
  wfhMaxAllowed: number;
  absentWfh: number;
  presentWfhActual: number;
  absentWfhMaxActual: number;
  weekdaysWorking: number;
  leavesTaken: number;
  weekoffWorking: number;
  overtimeSuggested: number;
  presentOrWfhCount: number;
  hasAnyRecord: boolean;
};

const OUTCLIENT = new Set([
  'Present - Outstation (Weekdays)',
  'Present - Outstation (Weekoff)',
  'Present - ClientPlace (Weekoff)',
  'Present - ClientPlace (Weekdays)',
  'Present - outstation',
  'Present - client place',
]);

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function hasValidPunch(t: string | undefined): boolean {
  const s = String(t || '').trim();
  return s !== '' && s !== '00:00';
}

function recValue(rec: SalaryDayRecord, isBothZero: boolean): number {
  if (typeof rec.value === 'number' && Number.isFinite(rec.value)) return rec.value;
  if (isBothZero) return 0;
  if (rec.halfDay) return 0.5;
  return Number(rec.totalHour || 0) > 0 ? 1 : 0;
}

function isPIO(rec: SalaryDayRecord): boolean {
  const t = rec.typeOfPresence;
  if (!t) return false;
  if (rec.halfDay) return false;
  if (t === 'ThumbMachine') {
    const inT = rec.editedCheckin || rec.checkin;
    const outT = rec.editedCheckout || rec.checkout;
    if (!hasValidPunch(inT) && !hasValidPunch(outT)) return false;
  }
  return (
    t === 'ThumbMachine' ||
    t === 'Present - in office' ||
    t === 'Present - in office - weekdays' ||
    t === 'Present'
  );
}

function isWOPIO(rec: SalaryDayRecord): boolean {
  const t = rec.typeOfPresence || '';
  if (!t || rec.halfDay) return false;
  return (
    t === 'Present - in office - weekoff' ||
    t === 'Present - weekoff' ||
    t === 'Weekly Off - Present (WO-Present)'
  );
}

function isOSP(rec: SalaryDayRecord): boolean {
  return OUTCLIENT.has(String(rec.typeOfPresence || ''));
}

function isWFHWeekoff(rec: SalaryDayRecord): boolean {
  const t = rec.typeOfPresence || '';
  return t === 'WFH - weekoff' || t === 'Weekly Off - Work From Home (WO-WFH)';
}

function isWFHWeekday(rec: SalaryDayRecord): boolean {
  const t = rec.typeOfPresence || '';
  return t === 'WFH - weekdays' || t === 'Work From Home (WFH)';
}

function isHolidayLikeType(typeOfPresence: string): boolean {
  const t = String(typeOfPresence || '').toLowerCase();
  return t === 'holiday' || t === 'sun' || t === 'sunday' || t === 'official holiday duty (ohd)' || t.includes('weekoff');
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function countSalaryAttendanceDays(
  records: Record<string, SalaryDayRecord | undefined> | null | undefined,
  holidayDates: Set<string>,
  options?: {
    employmentType?: string;
    weekdayHours?: number;
    periodExcessHours?: number;
    isArticle?: boolean;
  }
): SalaryAttendanceDays {
  const empty: SalaryAttendanceDays = {
    pio: 0,
    woPio: 0,
    osP: 0,
    absent: 0,
    hd: 0,
    weekoffHd: 0,
    weekoffs: 0,
    sun: 0,
    ohd: 0,
    wfhWeekoff: 0,
    wfhWeekday: 0,
    wfhMaxAllowed: 0,
    absentWfh: 0,
    presentWfhActual: 0,
    absentWfhMaxActual: 0,
    weekdaysWorking: 0,
    leavesTaken: 0,
    weekoffWorking: 0,
    overtimeSuggested: 0,
    presentOrWfhCount: 0,
    hasAnyRecord: false,
  };

  const recs = records || {};
  const keys = Object.keys(recs);
  if (keys.length === 0) return empty;

  empty.hasAnyRecord = true;
  const empType = String(options?.employmentType || '').toLowerCase();
  const isHalftime = empType === 'halftime' || empType.includes('half');
  const weekdayHours = options?.weekdayHours && options.weekdayHours > 0 ? options.weekdayHours : 8;

  let pio = 0;
  let woPio = 0;
  let osP = 0;
  let absent = 0;
  let hd = 0;
  let weekoffHd = 0;
  let weekoffs = 0;
  let sun = 0;
  let ohd = 0;
  let wfhWeekoff = 0;
  let wfhWeekdayCount = 0;
  let presentWfhActual = 0;
  let wfhWeekoffActual = 0;
  let presentOrWfhCount = 0;
  let thumbExcessHours = 0;

  for (const dateStr of keys) {
    const rec = recs[dateStr];
    if (!rec) continue;

    const d = parseLocalDate(dateStr);
    const isSunday = d.getDay() === 0;
    const isHoliday = holidayDates.has(dateStr) || rec.typeOfPresence === 'Holiday';
    const inT = rec.editedCheckin || rec.checkin;
    const outT = rec.editedCheckout || rec.checkout;
    const isBothZero = !hasValidPunch(inT) && !hasValidPunch(outT);
    const value = recValue(rec, isBothZero);
    const t = rec.typeOfPresence || '';
    const typeLower = t.toLowerCase();

    if (isPIO(rec) && !isHoliday && !isSunday) {
      pio += 1;
    } else if (isHalftime && rec.halfDay && !isHoliday && !isSunday && !isBothZero && !OUTCLIENT.has(t)) {
      pio += typeof rec.value === 'number' ? rec.value : 0.5;
    }

    if (isWOPIO(rec) || (isPIO(rec) && (isSunday || isHoliday))) {
      woPio += 1;
    }

    if (isOSP(rec)) {
      osP += rec.halfDay ? 0.5 : 1;
    }

    const isClientOrRemote =
      OUTCLIENT.has(t) ||
      typeLower.includes('client place') ||
      typeLower.includes('clientplace') ||
      typeLower.includes('outstation') ||
      typeLower.includes('wfh') ||
      typeLower.includes('work from home') ||
      typeLower.includes('onsite presence');

    let isAbsentRecord = false;
    const isExplicitAbsent = t === 'Absent';
    const isLeaveMarked = t === 'Leave' || t === 'On leave';
    if (!isSunday && !isHoliday && (isExplicitAbsent || isLeaveMarked)) {
      absent += 1;
      isAbsentRecord = true;
    } else if (
      !isSunday &&
      !isHoliday &&
      !isClientOrRemote &&
      Number(rec.totalHour || 0) === 0 &&
      t !== 'Holiday' &&
      !typeLower.includes('weekoff') &&
      isBothZero
    ) {
      absent += 1;
      isAbsentRecord = true;
    }

    if (t === 'Half Day - weekoff') {
      if (!isAbsentRecord) weekoffHd += 1;
    } else if (rec.halfDay && !isAbsentRecord) {
      if (isSunday || isHoliday) {
        weekoffHd += 1;
      } else if (!OUTCLIENT.has(t) && !isHalftime) {
        hd += 1;
      }
    }

    const isWeekoffType = typeLower.includes('weekoff');
    if ((isSunday || isHoliday || isWeekoffType) && value > 0) {
      weekoffs += value;
    }
    if (isSunday && value > 0) sun += value;
    if (holidayDates.has(dateStr) && value > 0) ohd += value;

    if (isWFHWeekoff(rec)) {
      wfhWeekoff += 1;
      wfhWeekoffActual += value;
    }
    if (isWFHWeekday(rec)) {
      wfhWeekdayCount += 1;
      presentWfhActual += value;
    }

    if (isPIO(rec) || isOSP(rec) || isWFHWeekday(rec) || t === 'Present') {
      presentOrWfhCount += 1;
    }

    if (
      !isAbsentRecord &&
      typeLower.includes('thumbmachine') &&
      typeof rec.excessHour === 'number'
    ) {
      thumbExcessHours += rec.excessHour;
    }
  }

  const wfhMaxAllowed = round3(wfhWeekdayCount * 0.75);
  const absentWfh = round3(wfhWeekdayCount * 0.25);
  const presentWfh = round3(presentWfhActual);
  const absentWfhMaxActual = round3(Math.max(0, wfhMaxAllowed - presentWfh));
  const weekdaysWorking = round3(pio + osP + hd / 2 + presentWfh);
  const leavesTaken = round3(absent + (wfhWeekdayCount - presentWfh) + hd / 2);
  const weekoffWorking = round3(woPio + weekoffHd / 2 + wfhWeekoffActual);

  const thumbOvertimeDays = weekdayHours > 0 ? thumbExcessHours / weekdayHours : 0;
  const periodExcess = Math.max(0, Number(options?.periodExcessHours || 0));
  const blocks = !options?.isArticle && periodExcess >= 6 ? Math.floor(periodExcess / 6) : 0;
  const overtimeSuggested = options?.isArticle
    ? 0
    : round3(Math.max(0, thumbOvertimeDays) + blocks);

  return {
    pio: round3(pio),
    woPio: round3(woPio),
    osP: round3(osP),
    absent: round3(absent),
    hd: round3(hd),
    weekoffHd: round3(weekoffHd),
    weekoffs: round3(weekoffs),
    sun: round3(sun),
    ohd: round3(ohd),
    wfhWeekoff: round3(wfhWeekoff),
    wfhWeekday: round3(wfhWeekdayCount),
    wfhMaxAllowed,
    absentWfh,
    presentWfhActual: presentWfh,
    absentWfhMaxActual,
    weekdaysWorking,
    leavesTaken,
    weekoffWorking,
    overtimeSuggested,
    presentOrWfhCount,
    hasAnyRecord: true,
  };
}

export function isHolidayLikePresence(typeOfPresence: string): boolean {
  return isHolidayLikeType(typeOfPresence);
}
