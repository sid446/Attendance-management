import AttendanceRequestWindowSettings from '@/models/AttendanceRequestWindowSettings';
import User from '@/models/User';
import {
  DEFAULT_REQUEST_WINDOW,
  mergeRequestWindowConfig,
  sanitizeRequestWindowConfig,
  getRequestWindowBounds,
  type RequestWindowConfig,
  type RequestWindowBounds,
} from '@/lib/attendanceRequestWindow';

export async function loadGlobalRequestWindowOverride(): Promise<Partial<RequestWindowConfig>> {
  const doc = await AttendanceRequestWindowSettings.findOne({ scope: 'global' }).lean();
  if (!doc) return {};
  return {
    previousMonthCutoffDay: doc.previousMonthCutoffDay,
    currentMonthPastDays: doc.currentMonthPastDays,
    futureMonthsAhead: doc.futureMonthsAhead,
  };
}

export async function loadTeamRequestWindowOverride(
  partnerName: string
): Promise<Partial<RequestWindowConfig>> {
  const name = String(partnerName || '').trim();
  if (!name) return {};
  const doc = await AttendanceRequestWindowSettings.findOne({
    scope: 'team',
    partnerName: name,
  }).lean();
  if (!doc) return {};
  return {
    previousMonthCutoffDay: doc.previousMonthCutoffDay,
    currentMonthPastDays: doc.currentMonthPastDays,
    futureMonthsAhead: doc.futureMonthsAhead,
  };
}

export async function loadEmployeeRequestWindowOverride(
  userId: string
): Promise<Partial<RequestWindowConfig>> {
  const doc = await AttendanceRequestWindowSettings.findOne({
    scope: 'employee',
    userId,
  }).lean();
  if (!doc) return {};
  return {
    previousMonthCutoffDay: doc.previousMonthCutoffDay,
    currentMonthPastDays: doc.currentMonthPastDays,
    futureMonthsAhead: doc.futureMonthsAhead,
  };
}

export async function getEffectiveRequestWindowForUser(
  userId: string
): Promise<RequestWindowConfig> {
  const user = await User.findById(userId)
    .select('workingUnderPartner')
    .lean();
  if (!user) return sanitizeRequestWindowConfig(DEFAULT_REQUEST_WINDOW);

  const [globalOverride, teamOverride, employeeOverride] = await Promise.all([
    loadGlobalRequestWindowOverride(),
    loadTeamRequestWindowOverride(String(user.workingUnderPartner || '')),
    loadEmployeeRequestWindowOverride(userId),
  ]);

  return sanitizeRequestWindowConfig(
    mergeRequestWindowConfig(
      DEFAULT_REQUEST_WINDOW,
      globalOverride,
      teamOverride,
      employeeOverride
    )
  );
}

export async function getEffectiveRequestWindowBoundsForUser(
  userId: string,
  now?: Date
): Promise<RequestWindowBounds> {
  const config = await getEffectiveRequestWindowForUser(userId);
  return getRequestWindowBounds(config, now);
}

export interface RequestWindowSettingsPayload {
  global: RequestWindowConfig;
  teamOverrides: Array<{
    partnerName: string;
    previousMonthCutoffDay?: number;
    currentMonthPastDays?: number;
    futureMonthsAhead?: number;
  }>;
  employeeOverrides: Array<{
    userId: string;
    userName?: string;
    previousMonthCutoffDay?: number;
    currentMonthPastDays?: number;
    futureMonthsAhead?: number;
  }>;
}

export async function loadAllRequestWindowSettings(): Promise<RequestWindowSettingsPayload> {
  const docs = await AttendanceRequestWindowSettings.find().lean();
  const globalDoc = docs.find((d) => d.scope === 'global');
  const global = sanitizeRequestWindowConfig(
    globalDoc
      ? {
          previousMonthCutoffDay: globalDoc.previousMonthCutoffDay,
          currentMonthPastDays: globalDoc.currentMonthPastDays,
          futureMonthsAhead: globalDoc.futureMonthsAhead,
        }
      : DEFAULT_REQUEST_WINDOW
  );

  const teamOverrides = docs
    .filter((d) => d.scope === 'team' && d.partnerName)
    .map((d) => ({
      partnerName: String(d.partnerName),
      previousMonthCutoffDay: d.previousMonthCutoffDay,
      currentMonthPastDays: d.currentMonthPastDays,
      futureMonthsAhead: d.futureMonthsAhead,
    }))
    .sort((a, b) => a.partnerName.localeCompare(b.partnerName));

  const employeeDocs = docs.filter((d) => d.scope === 'employee' && d.userId);
  const employeeIds = employeeDocs.map((d) => String(d.userId));
  const users =
    employeeIds.length > 0
      ? await User.find({ _id: { $in: employeeIds } })
          .select('name odId employeeCode')
          .lean()
      : [];
  const userNameById = new Map(users.map((u) => [String(u._id), String(u.name || '')]));

  const employeeOverrides = employeeDocs
    .map((d) => ({
      userId: String(d.userId),
      userName: userNameById.get(String(d.userId)) || '',
      previousMonthCutoffDay: d.previousMonthCutoffDay,
      currentMonthPastDays: d.currentMonthPastDays,
      futureMonthsAhead: d.futureMonthsAhead,
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName));

  return { global, teamOverrides, employeeOverrides };
}

async function upsertScopeDoc(
  filter: Record<string, unknown>,
  scope: 'global' | 'team' | 'employee',
  fields: Partial<RequestWindowConfig>,
  updatedBy: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const hasAnyField =
    fields.previousMonthCutoffDay !== undefined ||
    fields.currentMonthPastDays !== undefined ||
    fields.futureMonthsAhead !== undefined;

  if (!hasAnyField) {
    await AttendanceRequestWindowSettings.deleteOne(filter);
    return;
  }

  await AttendanceRequestWindowSettings.findOneAndUpdate(
    filter,
    {
      $set: {
        scope,
        ...extra,
        ...fields,
        updatedBy,
      },
    },
    { upsert: true, new: true }
  );
}

export async function saveAllRequestWindowSettings(
  payload: RequestWindowSettingsPayload,
  updatedBy: string
): Promise<RequestWindowSettingsPayload> {
  const global = sanitizeRequestWindowConfig(payload.global);

  await upsertScopeDoc({ scope: 'global' }, 'global', global, updatedBy);

  const teamNames = new Set(
    (payload.teamOverrides || [])
      .map((t) => String(t.partnerName || '').trim())
      .filter(Boolean)
  );

  const existingTeams = await AttendanceRequestWindowSettings.find({ scope: 'team' })
    .select('partnerName')
    .lean();
  for (const row of existingTeams) {
    const name = String(row.partnerName || '').trim();
    if (name && !teamNames.has(name)) {
      await AttendanceRequestWindowSettings.deleteOne({ scope: 'team', partnerName: name });
    }
  }

  for (const team of payload.teamOverrides || []) {
    const partnerName = String(team.partnerName || '').trim();
    if (!partnerName) continue;
    await upsertScopeDoc(
      { scope: 'team', partnerName },
      'team',
      {
        previousMonthCutoffDay: team.previousMonthCutoffDay,
        currentMonthPastDays: team.currentMonthPastDays,
        futureMonthsAhead: team.futureMonthsAhead,
      },
      updatedBy,
      { partnerName }
    );
  }

  const employeeIds = new Set(
    (payload.employeeOverrides || [])
      .map((e) => String(e.userId || '').trim())
      .filter(Boolean)
  );

  const existingEmployees = await AttendanceRequestWindowSettings.find({ scope: 'employee' })
    .select('userId')
    .lean();
  for (const row of existingEmployees) {
    const id = String(row.userId || '');
    if (id && !employeeIds.has(id)) {
      await AttendanceRequestWindowSettings.deleteOne({ scope: 'employee', userId: row.userId });
    }
  }

  for (const emp of payload.employeeOverrides || []) {
    const userId = String(emp.userId || '').trim();
    if (!userId) continue;
    await upsertScopeDoc(
      { scope: 'employee', userId },
      'employee',
      {
        previousMonthCutoffDay: emp.previousMonthCutoffDay,
        currentMonthPastDays: emp.currentMonthPastDays,
        futureMonthsAhead: emp.futureMonthsAhead,
      },
      updatedBy,
      { userId }
    );
  }

  return loadAllRequestWindowSettings();
}
