import PresenceCreditRule, { type IPresenceCreditRule } from '@/models/PresenceCreditRule';
import User from '@/models/User';
import {
  type PresenceCreditRuleLike,
  type PresenceCreditEmployee,
  presenceKindForStatus,
  resolvePresenceCredit,
  toAttendanceDateKey,
} from '@/lib/presenceCredit';

export function presenceRuleToLike(doc: IPresenceCreditRule | Record<string, unknown>): PresenceCreditRuleLike {
  const row = doc as {
    _id?: unknown;
    kind?: PresenceCreditRuleLike['kind'];
    scope?: PresenceCreditRuleLike['scope'];
    credit?: number;
    effectiveFrom?: string;
    team?: string;
    userIds?: string[];
  };
  return {
    _id: row._id != null ? String(row._id) : undefined,
    kind: row.kind === 'osp' ? 'osp' : 'wfh',
    scope: row.scope || 'everyone',
    credit: Number(row.credit),
    effectiveFrom: toAttendanceDateKey(String(row.effectiveFrom || '')),
    team: String(row.team || ''),
    userIds: Array.isArray(row.userIds) ? row.userIds.map((id) => String(id)) : [],
  };
}

export async function loadPresenceCreditRules(): Promise<PresenceCreditRuleLike[]> {
  const docs = await PresenceCreditRule.find({}).sort({ effectiveFrom: -1, createdAt: -1 }).lean();
  return docs.map((doc) => presenceRuleToLike(doc as IPresenceCreditRule));
}

export async function createPresenceCreditRule(
  rule: Omit<PresenceCreditRuleLike, '_id'>,
  updatedBy?: string
): Promise<PresenceCreditRuleLike> {
  const doc = await PresenceCreditRule.create({
    ...rule,
    updatedBy: updatedBy || undefined,
  });
  return presenceRuleToLike(doc);
}

export async function deletePresenceCreditRule(id: string): Promise<boolean> {
  if (!id) return false;
  const result = await PresenceCreditRule.findByIdAndDelete(id);
  return !!result;
}

export type PresenceCreditDirectoryPerson = {
  _id: string;
  name: string;
  team?: string;
  employeeCode?: string;
  odId?: string;
};

export async function loadPresenceCreditDirectory(): Promise<{
  teams: string[];
  people: PresenceCreditDirectoryPerson[];
}> {
  const users = await User.find({})
    .select('name team employeeCode odId')
    .sort({ name: 1 })
    .lean();

  const teams = new Set<string>();
  const people: PresenceCreditDirectoryPerson[] = [];
  for (const user of users) {
    const team = String((user as { team?: unknown }).team || '').trim();
    if (team) teams.add(team);
    people.push({
      _id: String(user._id),
      name: String((user as { name?: unknown }).name || 'Unnamed'),
      team: team || undefined,
      employeeCode: String((user as { employeeCode?: unknown }).employeeCode || '') || undefined,
      odId: String((user as { odId?: unknown }).odId || '') || undefined,
    });
  }

  return {
    teams: Array.from(teams).sort((a, b) => a.localeCompare(b)),
    people,
  };
}

export function creditForEmployeeDate(
  rules: PresenceCreditRuleLike[],
  employee: PresenceCreditEmployee | null | undefined,
  date: string | Date,
  requestedStatus: string
): number | undefined {
  const kind = presenceKindForStatus(requestedStatus);
  if (!kind) return undefined;
  return resolvePresenceCredit(rules, employee, date, kind);
}
