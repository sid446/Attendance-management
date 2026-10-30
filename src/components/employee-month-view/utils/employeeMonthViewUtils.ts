import { Clock, CheckCircle, XCircle, AlertTriangle, CalendarOff, Briefcase, Calendar, Home, Building2, Plane, Sun } from 'lucide-react';
import { AttendanceRecord } from '@/types/ui';
import { isValidPunchTime } from '@/lib/attendanceHours';
import { isHrModifiedAttendanceRecord } from '@/lib/attendanceRequestDayDisplay';
import { isExtraWorkRequest, normalizeExtraWorkSlotsFromRequest } from '@/lib/extraWorkRequest';
import type { ApprovedRequest, ExtraWorkTimeLine, CellStyleResult } from '../types';

export function hasDayActivityUpdates(
  request: ApprovedRequest | null | undefined,
  record: AttendanceRecord | null | undefined
): boolean {
  return !!(request || isHrModifiedAttendanceRecord(record));
}

export function getDayUpdatesButtonLabel(
  request: ApprovedRequest | null | undefined,
  record: AttendanceRecord | null | undefined
): string {
  const hrDirectEdit = isHrModifiedAttendanceRecord(record);
  if (request && hrDirectEdit) return 'Details';
  if (request?.status === 'Pending') return 'Pending';
  if (request?.status === 'PendingHr') return 'HR review';
  if (request?.status === 'Rejected') return 'Rejected';
  if (request?.status === 'Invalidated') return 'Invalidated';
  if (request?.status === 'Approved') return 'Approved';
  if (hrDirectEdit) return 'HR edit';
  return 'Details';
}

export function formatDayActivityDate(dateStr: string): string {
  const iso = String(dateStr || '').split('T')[0];
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso || dateStr;
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatPunchTimeRange(rec: AttendanceRecord | null | undefined): string {
  if (!rec) return '--:-- → --:--';
  const inRaw = String(rec.editedCheckin || rec.checkin || rec.inTime || '').trim();
  const outRaw = String(rec.editedCheckout || rec.checkout || rec.outTime || '').trim();
  const inTime = isValidPunchTime(inRaw) ? inRaw : '';
  const outTime = isValidPunchTime(outRaw) ? outRaw : '';
  return `${inTime || '--:--'} → ${outTime || '--:--'}`;
}

export function resolveExtraWorkTimeLines(
  storedRec: AttendanceRecord | null | undefined,
  approvedReq: ApprovedRequest | null | undefined
): ExtraWorkTimeLine[] {
  const fromRecord = storedRec?.extraWorkEntries;
  if (Array.isArray(fromRecord) && fromRecord.length > 0) {
    return fromRecord.map((entry) => ({
      startTime: String(entry.startTime || '').trim(),
      endTime: String(entry.endTime || '').trim(),
    }));
  }

  if (
    approvedReq &&
    isExtraWorkRequest(approvedReq) &&
    (approvedReq.status === 'Pending' || approvedReq.status === 'PendingHr')
  ) {
    return normalizeExtraWorkSlotsFromRequest(approvedReq).map((slot) => ({
      startTime: slot.startTime,
      endTime: slot.endTime,
      pending: true,
    }));
  }

  return [];
}

/** Distinct calendar cell colours by `status`, `typeOfPresence`, and `halfDay`. */
export function resolveAttendanceCellStyle(input: {
  status: any;
  type?: string;
  rec: AttendanceRecord;
  isLate: boolean;
  isHalftime?: boolean;
}): CellStyleResult {
  const { status, type = '', rec, isLate, isHalftime = false } = input;
  const t = type.toLowerCase();
  const s = String(status ?? '').toLowerCase();
  const hay = `${s} ${t}`;

  if (status === 'Leave' || status === 'On leave') {
    let borderClass = 'border-sky-200';
    let bgClass = 'bg-sky-50';
    let badgeClass = 'border-sky-300 bg-sky-100 text-sky-900';
    let statusLabel: string;
    if (rec.value !== undefined && rec.value > 0) {
      statusLabel = 'On leave';
    } else {
      statusLabel = 'Unpaid Leave';
      borderClass = 'border-rose-200';
      bgClass = 'bg-rose-50';
      badgeClass = 'border-rose-300 bg-rose-100 text-rose-900';
    }
    return { borderClass, bgClass, badgeClass, Icon: CalendarOff, statusLabel };
  }

  if (status === 'Holiday' || status === 'Week Off') {
    return {
      borderClass: 'border-cyan-200',
      bgClass: 'bg-cyan-50',
      badgeClass: 'border-cyan-300 bg-cyan-100 text-cyan-900',
      Icon: Briefcase,
    };
  }

  if (status === 'Absent') {
    return {
      borderClass: 'border-rose-200',
      bgClass: 'bg-rose-50',
      badgeClass: 'border-rose-300 bg-rose-100 text-rose-900',
      Icon: XCircle,
    };
  }

  if (status === 'Missed Entry') {
    return {
      borderClass: 'border-red-400',
      bgClass: 'bg-red-200',
      badgeClass: 'border-red-500 bg-red-300 text-red-950',
      Icon: XCircle,
    };
  }

  const isHalfDay =
    !isHalftime &&
    (status === 'HalfDay' ||
      status === 'Half Day (HD)' ||
      t.includes('half day') ||
      (rec.halfDay &&
        status !== 'Leave' &&
        status !== 'On leave' &&
        status !== 'Holiday' &&
        status !== 'Week Off' &&
        status !== 'Absent' &&
        !t.includes('holiday')));

  if (isHalfDay) {
    return {
      borderClass: 'border-orange-200',
      bgClass: 'bg-orange-50',
      badgeClass: 'border-orange-300 bg-orange-100 text-orange-900',
      Icon: AlertTriangle,
    };
  }

  const isPresentLike =
    status === 'Present' ||
    hay.includes('present -') ||
    hay.includes('present-') ||
    t === 'thumbmachine' ||
    t === 'manual' ||
    t === 'remote' ||
    hay.includes('thumb machine');

  if (isPresentLike) {
    if (t === 'thumbmachine' || t === 'manual' || t === 'remote' || hay.includes('thumb machine')) {
      return {
        borderClass: 'border-border',
        bgClass: 'bg-background',
        badgeClass: 'border-border bg-surface text-foreground',
        Icon: Clock,
      };
    }
    if (t.includes('client') || hay.includes('clientplace')) {
      return {
        borderClass: 'border-teal-200',
        bgClass: 'bg-teal-50',
        badgeClass: 'border-teal-300 bg-teal-100 text-teal-900',
        Icon: Building2,
      };
    }
    if (t.includes('outstation') || hay.includes('out station')) {
      return {
        borderClass: 'border-sky-200',
        bgClass: 'bg-sky-50',
        badgeClass: 'border-sky-300 bg-sky-100 text-sky-900',
        Icon: Plane,
      };
    }
    if (t.includes('wfh') || hay.includes('work from home') || (hay.includes('weekly off') && hay.includes('wfh')) || hay.includes('wo-wfh')) {
      return {
        borderClass: 'border-violet-200',
        bgClass: 'bg-violet-50',
        badgeClass: 'border-violet-300 bg-violet-100 text-violet-900',
        Icon: Home,
      };
    }
    if (t.includes('ohd') || hay.includes('official holiday duty')) {
      return {
        borderClass: 'border-yellow-200',
        bgClass: 'bg-yellow-50',
        badgeClass: 'border-yellow-300 bg-yellow-100 text-yellow-900',
        Icon: Sun,
      };
    }
    if ((t.includes('weekoff') || t.includes('week off')) && (t.includes('present') || status === 'Present')) {
      return {
        borderClass: 'border-lime-200',
        bgClass: 'bg-lime-50',
        badgeClass: 'border-lime-300 bg-lime-100 text-lime-900',
        Icon: Calendar,
      };
    }

    const showLate = isLate;
    return {
      borderClass: showLate ? 'border-amber-200' : 'border-emerald-200',
      bgClass: showLate ? 'bg-amber-50' : 'bg-emerald-50',
      badgeClass: showLate
        ? 'border-amber-300 bg-amber-100 text-amber-900'
        : 'border-emerald-300 bg-emerald-100 text-emerald-900',
      Icon: CheckCircle,
    };
  }

  if (typeof status === 'string') {
    if (hay.includes('wfh') || hay.includes('work from home') || hay.includes('wo-wfh')) {
      return {
        borderClass: 'border-violet-200',
        bgClass: 'bg-violet-50',
        badgeClass: 'border-violet-300 bg-violet-100 text-violet-900',
        Icon: Home,
      };
    }
    if (hay.includes('ohd') || hay.includes('official holiday duty')) {
      return {
        borderClass: 'border-yellow-200',
        bgClass: 'bg-yellow-50',
        badgeClass: 'border-yellow-300 bg-yellow-100 text-yellow-900',
        Icon: Sun,
      };
    }
    if (hay.includes('client') || hay.includes('clientplace')) {
      return {
        borderClass: 'border-teal-200',
        bgClass: 'bg-teal-50',
        badgeClass: 'border-teal-300 bg-teal-100 text-teal-900',
        Icon: Building2,
      };
    }
    if (hay.includes('outstation')) {
      return {
        borderClass: 'border-sky-200',
        bgClass: 'bg-sky-50',
        badgeClass: 'border-sky-300 bg-sky-100 text-sky-900',
        Icon: Plane,
      };
    }
    if (hay.includes('half day')) {
      return {
        borderClass: 'border-orange-200',
        bgClass: 'bg-orange-50',
        badgeClass: 'border-orange-300 bg-orange-100 text-orange-900',
        Icon: AlertTriangle,
      };
    }
  }

  return {
    borderClass: 'border-indigo-200',
    bgClass: 'bg-indigo-50',
    badgeClass: 'border-indigo-300 bg-indigo-100 text-indigo-900',
    Icon: Briefcase,
  };
}
