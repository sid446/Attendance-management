import PartnerExcessHourAllowance from '@/models/PartnerExcessHourAllowance';
import PartnerExcessDayApproval from '@/models/PartnerExcessDayApproval';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import type { AttendanceSummaryView, User as UiUser } from '@/types/ui';
import {
  getExcessDeficitLikeSummary,
  getTotalHourLikeAdminSummary,
  monthDateStrings,
} from '@/lib/attendanceSummaryMetrics';
import {
  applyDayWiseExcessApprovals,
  excessAllowanceKey,
  type ExcessAllowanceLookup,
  type ExcessDisplayLookup,
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
  const totalHour = getTotalHourLikeAdminSummary(item, user, dateList);
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

function recordsToMap(
  records: Record<string, unknown> | Map<string, unknown> | undefined
): Record<string, { excessHour?: number }> {
  if (!records) return {};
  if (records instanceof Map) {
    return Object.fromEntries(records.entries()) as Record<string, { excessHour?: number }>;
  }
  return records as Record<string, { excessHour?: number }>;
}

type LegacyDayApprovalDoc = {
  userId?: unknown;
  date?: string;
  allowedExcessHours?: unknown;
  approved?: unknown;
};

function resolveDayAllowedHours(doc: LegacyDayApprovalDoc): number | null {
  if (doc.allowedExcessHours != null && Number.isFinite(Number(doc.allowedExcessHours))) {
    return Math.max(0, Number(Number(doc.allowedExcessHours).toFixed(2)));
  }
  if (typeof doc.approved === 'boolean') {
    return doc.approved ? null : 0;
  }
  return null;
}

export async function fetchDayApprovalsForUsersMonth(
  userIds: string[],
  monthYear: string
): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};
  const docs = await PartnerExcessDayApproval.find({
    userId: { $in: userIds },
    monthYear,
  })
    .select('userId date allowedExcessHours approved')
    .lean();

  const out: Record<string, number> = {};
  for (const doc of docs) {
    const allowed = resolveDayAllowedHours(doc as LegacyDayApprovalDoc);
    if (allowed == null) continue;
    out[`${String(doc.userId)}:${doc.date}`] = allowed;
  }
  return out;
}

export async function computeDailyExcessBreakdown(
  userId: string,
  monthYear: string,
  dayApprovals?: Record<string, number>
): Promise<ReturnType<typeof applyDayWiseExcessApprovals>> {
  const attendance = await Attendance.findOne({ userId, monthYear }).lean();
  const records = recordsToMap(attendance?.records as Record<string, unknown> | Map<string, unknown>);
  const approvals = dayApprovals ?? (await fetchDayApprovalsForUsersMonth([userId], monthYear));

  const days = monthDateStrings(monthYear)
    .map((date) => {
      const rawExcessHour = Number(records[date]?.excessHour ?? 0);
      if (rawExcessHour === 0) return null;
      const approvalKey = `${userId}:${date}`;
      const hasDecision = Object.prototype.hasOwnProperty.call(approvals, approvalKey);
      return {
        date,
        rawExcessHour,
        allowedExcessHours:
          rawExcessHour > 0
            ? hasDecision
              ? approvals[approvalKey]
              : null
            : null,
      };
    })
    .filter(
      (row): row is { date: string; rawExcessHour: number; allowedExcessHours: number | null } =>
        row != null
    );

  return applyDayWiseExcessApprovals(days);
}

export async function upsertDayExcessApproval(
  userId: string,
  date: string,
  allowedExcessHours: number,
  setByUserId: string
) {
  const monthYear = date.slice(0, 7);
  const hours = Math.max(0, Number(Number(allowedExcessHours).toFixed(2)));
  return PartnerExcessDayApproval.findOneAndUpdate(
    { userId, date },
    { $set: { monthYear, allowedExcessHours: hours, setByUserId }, $unset: { approved: '' } },
    { upsert: true, new: true }
  ).lean();
}

export async function deleteDayExcessApproval(userId: string, date: string) {
  await PartnerExcessDayApproval.deleteOne({ userId, date });
}

export async function fetchExcessDisplayLookup(
  userIds: string[],
  monthYear: string
): Promise<ExcessDisplayLookup> {
  if (userIds.length === 0) return {};
  const approvals = await fetchDayApprovalsForUsersMonth(userIds, monthYear);
  const out: ExcessDisplayLookup = {};

  await Promise.all(
    userIds.map(async (userId) => {
      const hasPartnerDecisions = Object.keys(approvals).some((key) =>
        key.startsWith(`${userId}:`)
      );
      if (!hasPartnerDecisions) return;

      const breakdown = await computeDailyExcessBreakdown(userId, monthYear, approvals);
      out[excessAllowanceKey(userId, monthYear)] = breakdown.displayExcess;
    })
  );

  return out;
}
