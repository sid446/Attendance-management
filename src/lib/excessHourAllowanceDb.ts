import PartnerExcessHourAllowance from '@/models/PartnerExcessHourAllowance';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import type { AttendanceSummaryView, User as UiUser } from '@/types/ui';
import {
  getExcessDeficitLikeSummary,
  getTotalHourLikeAdminSummary,
  monthDateStrings,
} from '@/lib/attendanceSummaryMetrics';
import {
  excessAllowanceKey,
  type ExcessAllowanceLookup,
} from '@/lib/excessHourAllowance';

export interface ExcessAllowancePair {
  userId: string;
  monthYear: string;
}

function attendanceDocToSummaryView(
  doc: {
    _id?: unknown;
    userId: { _id?: unknown; name?: string; odId?: string; employeeCode?: string; team?: string; designation?: string };
    monthYear: string;
    records?: Record<string, unknown> | Map<string, unknown>;
    summary?: Record<string, unknown>;
  },
  user: UiUser
): AttendanceSummaryView {
  const recordsObj =
    doc.records instanceof Map
      ? Object.fromEntries(doc.records.entries())
      : doc.records || {};

  return {
    id: String(doc._id || ''),
    userId: String(doc.userId?._id || ''),
    userName: String(doc.userId?.name || user.name || ''),
    odId: String(doc.userId?.odId || user.odId || ''),
    employeeCode: String(doc.userId?.employeeCode || user.employeeCode || ''),
    team: String(doc.userId?.team || user.team || ''),
    designation: String(doc.userId?.designation || user.designation || ''),
    monthYear: doc.monthYear,
    summary: {
      scheduledHours: '',
      shortHours: '',
      excessHours: '',
      totalHour: Number((doc.summary as { totalHour?: number })?.totalHour ?? 0),
      totalLateArrival: Number((doc.summary as { totalLateArrival?: number })?.totalLateArrival ?? 0),
      excessHour: Number((doc.summary as { excessHour?: number })?.excessHour ?? 0),
      totalHalfDay: Number((doc.summary as { totalHalfDay?: number })?.totalHalfDay ?? 0),
      totalPresent: Number((doc.summary as { totalPresent?: number })?.totalPresent ?? 0),
      totalAbsent: Number((doc.summary as { totalAbsent?: number })?.totalAbsent ?? 0),
      totalLeave: Number((doc.summary as { totalLeave?: number })?.totalLeave ?? 0),
    },
    recordDetails: recordsObj as AttendanceSummaryView['recordDetails'],
  };
}

export async function computeRawExcessForUserMonth(
  userId: string,
  monthYear: string
): Promise<number> {
  const [user, attendance] = await Promise.all([
    User.findById(userId).lean(),
    Attendance.findOne({ userId, monthYear }).lean(),
  ]);

  if (!user || !attendance) return 0;

  const item = attendanceDocToSummaryView(
    attendance as Parameters<typeof attendanceDocToSummaryView>[0],
    user as UiUser
  );
  const dateList = monthDateStrings(monthYear);
  const totalHour = getTotalHourLikeAdminSummary(item);
  return getExcessDeficitLikeSummary(item, user as UiUser, dateList, totalHour);
}

export async function fetchExcessAllowanceLookup(
  pairs: ExcessAllowancePair[]
): Promise<ExcessAllowanceLookup> {
  const unique = new Map<string, ExcessAllowancePair>();
  for (const p of pairs) {
    const userId = String(p.userId || '').trim();
    const monthYear = String(p.monthYear || '').trim();
    if (!userId || !monthYear) continue;
    unique.set(excessAllowanceKey(userId, monthYear), { userId, monthYear });
  }

  if (unique.size === 0) return {};

  const orClauses = Array.from(unique.values()).map((p) => ({
    userId: p.userId,
    monthYear: p.monthYear,
  }));

  const docs = await PartnerExcessHourAllowance.find({ $or: orClauses })
    .select('userId monthYear allowedExcessHours')
    .lean();

  const out: ExcessAllowanceLookup = {};
  for (const doc of docs) {
    out[excessAllowanceKey(String(doc.userId), doc.monthYear)] = Number(
      doc.allowedExcessHours
    );
  }
  return out;
}

export async function upsertExcessAllowance(
  userId: string,
  monthYear: string,
  allowedExcessHours: number,
  setByUserId: string
) {
  const hours = Number(allowedExcessHours);
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error('allowedExcessHours must be a non-negative number');
  }

  return PartnerExcessHourAllowance.findOneAndUpdate(
    { userId, monthYear },
    { $set: { allowedExcessHours: hours, setByUserId } },
    { upsert: true, new: true }
  ).lean();
}

export async function deleteExcessAllowance(userId: string, monthYear: string) {
  await PartnerExcessHourAllowance.deleteOne({ userId, monthYear });
}

export async function fetchAllowancesForTeamMonth(
  userIds: string[],
  monthYear: string
): Promise<ExcessAllowanceLookup> {
  if (userIds.length === 0) return {};
  const docs = await PartnerExcessHourAllowance.find({
    userId: { $in: userIds },
    monthYear,
  })
    .select('userId monthYear allowedExcessHours')
    .lean();

  const out: ExcessAllowanceLookup = {};
  for (const doc of docs) {
    out[excessAllowanceKey(String(doc.userId), doc.monthYear)] = Number(
      doc.allowedExcessHours
    );
  }
  return out;
}
