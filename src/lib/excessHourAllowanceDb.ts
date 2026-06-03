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

type AttendanceLeanForSummary = {
  _id?: unknown;
  userId?: unknown;
  monthYear: string;
  records?: Record<string, unknown> | Map<string, unknown>;
  summary?: {
    totalHour?: number;
    totalLateArrival?: number;
    excessHour?: number;
    totalHalfDay?: number;
    totalPresent?: number;
    totalAbsent?: number;
    totalLeave?: number;
  };
};

function populatedUserFromDoc(userId: unknown, fallback: UiUser) {
  if (userId && typeof userId === 'object' && '_id' in userId) {
    const u = userId as {
      _id?: unknown;
      name?: string;
      odId?: string;
      employeeCode?: string;
      team?: string;
      designation?: string;
    };
    return {
      _id: u._id ?? fallback._id,
      name: u.name ?? fallback.name,
      odId: u.odId ?? fallback.odId,
      employeeCode: u.employeeCode ?? fallback.employeeCode,
      team: u.team ?? fallback.team,
      designation: u.designation ?? fallback.designation,
    };
  }
  return {
    _id: userId ?? fallback._id,
    name: fallback.name,
    odId: fallback.odId,
    employeeCode: fallback.employeeCode,
    team: fallback.team,
    designation: fallback.designation,
  };
}

function attendanceDocToSummaryView(
  doc: AttendanceLeanForSummary,
  user: UiUser
): AttendanceSummaryView {
  const recordsObj =
    doc.records instanceof Map
      ? Object.fromEntries(doc.records.entries())
      : doc.records || {};

  const populated = populatedUserFromDoc(doc.userId, user);
  const summary = doc.summary ?? {};

  return {
    id: String(doc._id || ''),
    userId: String(populated._id || ''),
    userName: String(populated.name || user.name || ''),
    odId: String(populated.odId || user.odId || ''),
    employeeCode: String(populated.employeeCode || user.employeeCode || ''),
    team: String(populated.team || user.team || ''),
    designation: String(populated.designation || user.designation || ''),
    monthYear: doc.monthYear,
    summary: {
      scheduledHours: '',
      shortHours: '',
      excessHours: '',
      totalHour: Number(summary.totalHour ?? 0),
      totalLateArrival: Number(summary.totalLateArrival ?? 0),
      excessHour: Number(summary.excessHour ?? 0),
      totalHalfDay: Number(summary.totalHalfDay ?? 0),
      totalPresent: Number(summary.totalPresent ?? 0),
      totalAbsent: Number(summary.totalAbsent ?? 0),
      totalLeave: Number(summary.totalLeave ?? 0),
    },
    recordDetails: recordsObj as AttendanceSummaryView['recordDetails'],
  };
}

function leanUserToUiUser(raw: Record<string, unknown>): UiUser {
  return {
    ...raw,
    _id: String(raw._id ?? ''),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    odId: String(raw.odId ?? ''),
  } as UiUser;
}

export async function computeRawExcessForUserMonth(
  userId: string,
  monthYear: string
): Promise<number> {
  const [userDoc, attendance] = await Promise.all([
    User.findById(userId).lean(),
    Attendance.findOne({ userId, monthYear }).lean(),
  ]);

  if (!userDoc || !attendance) return 0;

  const user = leanUserToUiUser(userDoc as unknown as Record<string, unknown>);
  const item = attendanceDocToSummaryView(attendance, user);
  const dateList = monthDateStrings(monthYear);
  const totalHour = getTotalHourLikeAdminSummary(item);
  return getExcessDeficitLikeSummary(item, user, dateList, totalHour);
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
