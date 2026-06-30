import { isSinglePunch } from '@/lib/attendanceHours';
import {
  ArticleEmployeeLike,
  calculateArticleDayExcessMinutes,
  isArticleEmployee,
} from '@/lib/isArticleEmployee';

export type DayExcessRecordLike = {
  checkin?: string;
  checkout?: string;
  editedCheckin?: string;
  editedCheckout?: string;
  totalHour?: number;
  typeOfPresence?: string;
};

function effectiveInOut(record: DayExcessRecordLike) {
  return {
    inTime: String(record.editedCheckin ?? record.checkin ?? '').trim(),
    outTime: String(record.editedCheckout ?? record.checkout ?? '').trim(),
  };
}

function scheduledMinutesBetween(scheduledInTime: string, scheduledOutTime: string): number {
  const [schInH, schInM] = scheduledInTime.split(':').map(Number);
  const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
  const schInMin = schInH * 60 + schInM;
  const schOutMin = schOutH * 60 + schOutM;
  return schOutMin - schInMin >= 0
    ? schOutMin - schInMin
    : 24 * 60 + schOutMin - schInMin;
}

function actualMinutesBetween(inTime: string, outTime: string): number {
  const [actInH, actInM] = inTime.split(':').map(Number);
  const [actOutH, actOutM] = outTime.split(':').map(Number);
  const actInMin = actInH * 60 + actInM;
  const actOutMin = actOutH * 60 + actOutM;
  return actOutMin - actInMin >= 0
    ? actOutMin - actInMin
    : 24 * 60 + actOutMin - actInMin;
}

export function isNonWorkingDayRecord(
  typeOfPresence: string,
  dateStr: string
): boolean {
  const isSundayDate = new Date(dateStr).getDay() === 0;
  return (
    typeOfPresence === 'Holiday' ||
    typeOfPresence === 'Sunday' ||
    typeOfPresence === 'Weekoff' ||
    typeOfPresence === 'Weekoff - special allowance' ||
    isSundayDate
  );
}

function isPresentForExcess(
  record: DayExcessRecordLike,
  inTime: string,
  outTime: string
): boolean {
  return (
    record.typeOfPresence === 'Present - outstation' ||
    record.typeOfPresence === 'WFH - weekdays' ||
    record.typeOfPresence === 'WFH - weekoff' ||
    (inTime !== '00:00' && outTime !== '00:00' && !!inTime && !!outTime)
  );
}

/** Per-day excess hours from schedule vs punch times (article rules when applicable). */
export function calculateDayExcessHour(
  user: ArticleEmployeeLike,
  dateStr: string,
  record: DayExcessRecordLike,
  scheduledInTime: string,
  scheduledOutTime: string
): number {
  const typeOfPresence = String(record.typeOfPresence || '');
  if (isNonWorkingDayRecord(typeOfPresence, dateStr)) {
    return 0;
  }

  const { inTime, outTime } = effectiveInOut(record);
  const hasSchedule =
    scheduledInTime &&
    scheduledOutTime &&
    scheduledInTime !== '00:00' &&
    scheduledOutTime !== '00:00';

  if (!hasSchedule) {
    return 0;
  }

  const scheduledMinutes = scheduledMinutesBetween(scheduledInTime, scheduledOutTime);
  const dayScheduledHours = Number((scheduledMinutes / 60).toFixed(2));

  if (!isPresentForExcess(record, inTime, outTime)) {
    return -dayScheduledHours;
  }

  if (!inTime || !outTime || inTime === '00:00' || outTime === '00:00') {
    return 0;
  }

  const actualMinutes = actualMinutesBetween(inTime, outTime);
  let dayExcess = 0;

  if (actualMinutes < scheduledMinutes) {
    dayExcess = -(scheduledMinutes - actualMinutes) / 60;
  } else if (actualMinutes > scheduledMinutes) {
    if (isArticleEmployee(user)) {
      const excessMinutes = calculateArticleDayExcessMinutes(
        scheduledInTime,
        scheduledOutTime,
        inTime,
        outTime
      );
      dayExcess = excessMinutes > 0 ? excessMinutes / 60 : 0;
    } else {
      dayExcess = (actualMinutes - scheduledMinutes) / 60;
    }
  }

  if (isSinglePunch(inTime, outTime) && dayScheduledHours > 0) {
    dayExcess = Number(
      ((record.totalHour ?? 0) - dayScheduledHours).toFixed(2)
    );
  }

  return Number(dayExcess.toFixed(2));
}

export function applyDayExcessToRecord(
  record: DayExcessRecordLike & { excessHour?: number },
  user: ArticleEmployeeLike,
  dateStr: string,
  scheduledInTime: string,
  scheduledOutTime: string
): void {
  record.excessHour = calculateDayExcessHour(
    user,
    dateStr,
    record,
    scheduledInTime,
    scheduledOutTime
  );
}
