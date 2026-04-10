import { IUser } from '@/models/User';

export const MANAGED_EFFECTIVE_FIELDS = [
  'registeredUnderPartner',
  'workingUnderPartner',
  'basicSalary',
  'laptopAllowance',
  'totalSalaryPerMonth',
  'totalSalaryPerAnnum',
] as const;

export type ManagedEffectiveField = typeof MANAGED_EFFECTIVE_FIELDS[number];

type SourceType = 'manual-update' | 'excel-upload' | 'basic-master-upload' | 'system';

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getAnchorEffectiveFrom(user: Partial<IUser>, changedAt: Date): Date {
  const schedules = Array.isArray((user as any).schedules) ? (user as any).schedules : [];

  if (schedules.length > 0) {
    const dateCandidates = schedules
      .map((s: any) => new Date(s?.effectiveFrom))
      .filter((d: Date) => !Number.isNaN(d.getTime()) && d.getTime() <= changedAt.getTime())
      .sort((a: Date, b: Date) => b.getTime() - a.getTime());

    if (dateCandidates.length > 0) {
      return dateCandidates[0];
    }
  }

  const joiningDate = (user as any).joiningDate ? new Date((user as any).joiningDate) : null;
  if (joiningDate && !Number.isNaN(joiningDate.getTime())) {
    return joiningDate;
  }

  return changedAt;
}

function getPreviousDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d;
}

export function applyManagedEffectiveHistories(
  user: any,
  incoming: Partial<Record<ManagedEffectiveField, unknown>>,
  options?: {
    changedAt?: Date;
    source?: SourceType;
    baselineEffectiveFrom?: Date;
    fieldChangedAt?: Partial<Record<ManagedEffectiveField, Date>>;
  }
): void {
  const changedAt = options?.changedAt || new Date();
  const source = options?.source || 'system';
  const baselineEffectiveFrom = options?.baselineEffectiveFrom;
  const fieldChangedAt = options?.fieldChangedAt || {};

  if (!user.fieldHistories) {
    user.fieldHistories = {};
  }

  for (const field of MANAGED_EFFECTIVE_FIELDS) {
    const hasIncoming = Object.prototype.hasOwnProperty.call(incoming, field);
    if (!hasIncoming) continue;

    const fieldChangeAt = fieldChangedAt[field] || changedAt;

    const nextValue = normalizeValue(incoming[field]);
    const currentValue = normalizeValue(user[field]);

    if (!Array.isArray(user.fieldHistories[field])) {
      user.fieldHistories[field] = [];
    }

    const history = user.fieldHistories[field] as Array<any>;

    // Seed baseline history if missing and there is an existing value.
    if (history.length === 0 && currentValue) {
      history.push({
        value: currentValue,
        effectiveFrom: baselineEffectiveFrom || getAnchorEffectiveFrom(user, fieldChangeAt),
        effectiveTo: null,
        source: 'system',
      });
    }

    if (nextValue === currentValue) {
      continue;
    }

    const currentActive = [...history]
      .reverse()
      .find((h) => h && h.value !== undefined && (h.effectiveTo === null || h.effectiveTo === undefined));

    if (currentActive) {
      currentActive.effectiveTo = getPreviousDay(fieldChangeAt);
    }

    history.push({
      value: nextValue,
      effectiveFrom: fieldChangeAt,
      effectiveTo: null,
      source,
    });

    user[field] = nextValue;
  }
}

export function seedManagedEffectiveHistories(
  user: any,
  options?: { effectiveFrom?: Date; source?: SourceType }
): number {
  const effectiveFrom = options?.effectiveFrom || new Date();
  const source = options?.source || 'system';

  if (!user.fieldHistories) {
    user.fieldHistories = {};
  }

  let seededCount = 0;

  for (const field of MANAGED_EFFECTIVE_FIELDS) {
    const currentValue = normalizeValue(user[field]);
    if (!currentValue) continue;

    if (!Array.isArray(user.fieldHistories[field])) {
      user.fieldHistories[field] = [];
    }

    const history = user.fieldHistories[field] as Array<any>;
    if (history.length > 0) continue;

    history.push({
      value: currentValue,
      effectiveFrom,
      effectiveTo: null,
      source,
    });
    seededCount++;
  }

  return seededCount;
}
