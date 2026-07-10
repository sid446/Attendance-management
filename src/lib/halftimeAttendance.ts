import { isValidPunchTime } from '@/lib/attendanceHours';
import {
  getEmploymentTypeForDate,
  isHalftimeEmploymentType,
} from '@/lib/attendanceSummaryMetrics';
import type { IUser } from '@/models/User';

const LATE_CHECKIN_HALFDAY_REMARK =
  'Marked half day: check-in between 1:00 PM and 2:59 PM';

export type HalftimeDayRecord = {
  checkin?: string;
  checkout?: string;
  editedCheckin?: string;
  editedCheckout?: string;
  typeOfPresence?: string;
  halfDay?: boolean;
  value?: number;
  remarks?: string;
};

function isPartnerUser(user: IUser | null | undefined): boolean {
  if (!user) return false;
  return (
    user.category === 'Partner' ||
    !!(user.designation && user.designation.toLowerCase().includes('partner'))
  );
}

/** History-aware halftime check (matches calendar / summary rules). */
export function isHalftimeEmployeeForDate(
  user: IUser | null | undefined,
  dateStr: string
): boolean {
  if (!user) return false;
  if (isPartnerUser(user)) return true;
  const empType = getEmploymentTypeForDate(
    user as unknown as Parameters<typeof getEmploymentTypeForDate>[0],
    new Date(`${dateStr}T12:00:00`)
  );
  return isHalftimeEmploymentType(empType);
}

function stripHalfDayRemark(remarks: string): string {
  return remarks
    .split(' | ')
    .filter((part) => part && part !== LATE_CHECKIN_HALFDAY_REMARK)
    .join(' | ');
}

/**
 * Halftime employees are full present when they have any punch; never half-day.
 * Returns true when the record was changed.
 */
export function normalizeHalftimeDayRecord(
  record: HalftimeDayRecord,
  user: IUser | null | undefined,
  dateStr: string
): boolean {
  if (!isHalftimeEmployeeForDate(user, dateStr)) return false;

  const inTime = String(record.editedCheckin ?? record.checkin ?? '').trim();
  const outTime = String(record.editedCheckout ?? record.checkout ?? '').trim();
  const hasIn = isValidPunchTime(inTime);
  const hasOut = isValidPunchTime(outTime);
  const type = String(record.typeOfPresence || '');
  const typeLower = type.toLowerCase();
  const isHolidayLike =
    type === 'Holiday' ||
    type === 'Sunday' ||
    type === 'Weekoff' ||
    typeLower.includes('weekoff') ||
    typeLower.includes('week off');
  const isLeave = type === 'Leave' || type === 'On leave' || typeLower.includes('on leave');

  let changed = false;

  if (!hasIn && !hasOut) {
    if (
      !isHolidayLike &&
      !isLeave &&
      !type.includes('Present') &&
      type !== 'Absent'
    ) {
      if (record.typeOfPresence !== 'Absent') {
        record.typeOfPresence = 'Absent';
        changed = true;
      }
      if (record.value !== 0) {
        record.value = 0;
        changed = true;
      }
      if (record.halfDay) {
        record.halfDay = false;
        changed = true;
      }
    }
    return changed;
  }

  if (record.value !== 1) {
    record.value = 1;
    changed = true;
  }
  if (record.halfDay) {
    record.halfDay = false;
    changed = true;
  }
  if (
    !type ||
    typeLower.includes('half day') ||
    type === 'Absent' ||
    type === 'ThumbMachine'
  ) {
    if (record.typeOfPresence !== 'Present') {
      record.typeOfPresence = 'Present';
      changed = true;
    }
  }

  const remarks = String(record.remarks || '');
  if (remarks.includes(LATE_CHECKIN_HALFDAY_REMARK)) {
    const cleaned = stripHalfDayRemark(remarks);
    if (cleaned !== remarks) {
      record.remarks = cleaned;
      changed = true;
    }
  }

  return changed;
}
