import { IUser } from '@/models/User';
import { calculateTotalHours, isSinglePunch } from '@/lib/attendanceHours';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { reapplyExtraWorkEntriesToRecord } from '@/lib/extraWorkRequest';
import { isArticleEmployee } from '@/lib/isArticleEmployee';
import {
  calculateDayExcessHour,
  isNonWorkingDayRecord,
} from '@/lib/calculateDayExcessHour';

export type AttendanceRecordForSummary = {
  checkin: string;
  checkout: string;
  editedCheckin?: string;
  editedCheckout?: string;
  totalHour: number;
  excessHour: number;
  typeOfPresence: string;
  halfDay: boolean;
  value?: number;
  remarks?: string;
};

export function shouldExcludeFromSummaryHours(
  typeOfPresence: string,
  dateStr: string
): boolean {
  const day = new Date(dateStr).getDay();
  if (day === 0) return true;

  const excluded = new Set<string>([
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

export function calculateSummary(
  records: Map<string, AttendanceRecordForSummary>,
  user?: IUser | null
) {
  let totalHour = 0;
  let totalLateArrival = 0;
  let excessHour = 0;
  let totalScheduledHour = 0;
  let totalHalfDay = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLeave = 0;

  records.forEach((record, dateStr) => {
    let scheduledInTime = '';
    let scheduledOutTime = '';
    if (user) {
      const schedule = getScheduledTimes(user, dateStr);
      scheduledInTime = schedule.inTime;
      scheduledOutTime = schedule.outTime;
    }

    const inTime = String(record.editedCheckin ?? record.checkin ?? '').trim();
    const outTime = String(record.editedCheckout ?? record.checkout ?? '').trim();

    let dayScheduledHours = 0;
    if (
      scheduledInTime &&
      scheduledOutTime &&
      scheduledInTime !== '00:00' &&
      scheduledOutTime !== '00:00'
    ) {
      const [schInH, schInM] = scheduledInTime.split(':').map(Number);
      const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
      const schInMin = schInH * 60 + schInM;
      const schOutMin = schOutH * 60 + schOutM;
      const scheduledMinutes =
        schOutMin - schInMin >= 0
          ? schOutMin - schInMin
          : 24 * 60 + schOutMin - schInMin;
      dayScheduledHours = Number((scheduledMinutes / 60).toFixed(2));
    }

    const isNonWorking = isNonWorkingDayRecord(record.typeOfPresence, dateStr);

    record.totalHour = calculateTotalHours(inTime, outTime, {
      scheduledIn: scheduledInTime,
      scheduledOut: scheduledOutTime,
    });
    record.excessHour = isNonWorking
      ? 0
      : calculateDayExcessHour(
          user,
          dateStr,
          record,
          scheduledInTime,
          scheduledOutTime
        );
    reapplyExtraWorkEntriesToRecord(record);

    const includeInHoursSummary = !shouldExcludeFromSummaryHours(
      record.typeOfPresence,
      dateStr
    );
    if (includeInHoursSummary) {
      totalHour += record.totalHour;
      totalScheduledHour += dayScheduledHours;
    }

    if (isNonWorking) {
      record.halfDay = false;
    }

    const employmentType = String(user?.employmentType || 'fulltime').toLowerCase();
    const designation = user?.designation?.toLowerCase();
    const isPartner =
      user &&
      (user.category === 'Partner' ||
        (user.designation && user.designation.toLowerCase().includes('partner')));
    const isHalftime =
      employmentType === 'halftime' ||
      employmentType.includes('half') ||
      isPartner;

    let calculatedHalfDay = record.halfDay || false;

    if (isHalftime) {
      calculatedHalfDay = false;
    } else if (!record.halfDay && !isNonWorking) {
      if (isSinglePunch(inTime, outTime)) {
        calculatedHalfDay = true;
      } else if (
        (inTime === '00:00' && outTime === '00:00') ||
        (record.editedCheckin === '' && record.editedCheckout === '')
      ) {
        calculatedHalfDay = false;
      } else {
        const isArticle = isArticleEmployee(user);
        const isAfter1PM = inTime ? inTime >= '13:00' : false;
        if (employmentType === 'fulltime' && !isArticle) {
          calculatedHalfDay = record.totalHour < 6;
        } else if (isArticle) {
          calculatedHalfDay = isAfter1PM || record.totalHour < 3.5;
        }
      }
    }

    record.halfDay = calculatedHalfDay;
    if (calculatedHalfDay) {
      totalHalfDay++;
    }

    const userEmpType = String(user?.employmentType || '').toLowerCase();
    if (
      inTime &&
      scheduledInTime &&
      inTime > scheduledInTime &&
      !(userEmpType === 'halftime' || userEmpType.includes('half'))
    ) {
      totalLateArrival++;
    }

    const t = String(record.typeOfPresence || '').toLowerCase();
    if (t === 'leave' || t === 'on leave') {
      totalLeave++;
    } else if (t === 'holiday' || t === 'sunday' || t.includes('weekoff')) {
      // Holidays/Weekoffs don't count as present/absent for the 1.0/0.5 metrics
    } else if (t === 'absent') {
      totalAbsent++;
    } else if (record.totalHour > 0 || (record.value && record.value > 0)) {
      totalPresent++;
    } else {
      totalAbsent++;
    }
  });

  excessHour = Number((totalHour - totalScheduledHour).toFixed(2));

  return {
    totalHour,
    totalLateArrival,
    excessHour,
    totalHalfDay,
    totalPresent,
    totalAbsent,
    totalLeave,
  };
}
