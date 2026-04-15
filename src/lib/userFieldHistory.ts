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

export function normalizeManagedFieldValue(value: unknown): string {
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
    /** Values before this update. Required when `user[field]` was already overwritten (e.g. after Object.assign). */
    priorValues?: Partial<Record<ManagedEffectiveField, string>>;
  }
): void {
  const changedAt = options?.changedAt || new Date();
  const source = options?.source || 'system';
  const baselineEffectiveFrom = options?.baselineEffectiveFrom;
  const fieldChangedAt = options?.fieldChangedAt || {};
  const priorValues = options?.priorValues;

  if (!user.fieldHistories) {
    user.fieldHistories = {};
  }

  for (const field of MANAGED_EFFECTIVE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(incoming, field)) continue;

    const fieldChangeAt = fieldChangedAt[field] || changedAt;

    const nextValue = normalizeManagedFieldValue(incoming[field]);
    const priorValue =
      priorValues && Object.prototype.hasOwnProperty.call(priorValues, field)
        ? normalizeManagedFieldValue((priorValues as Record<string, unknown>)[field])
        : normalizeManagedFieldValue(user[field]);

    if (!Array.isArray(user.fieldHistories[field])) {
      user.fieldHistories[field] = [];
    }

    const history = user.fieldHistories[field] as Array<any>;

    if (nextValue === priorValue) {
      if (history.length === 0 && nextValue) {
        history.push({
          value: nextValue,
          effectiveFrom: baselineEffectiveFrom || getAnchorEffectiveFrom(user, fieldChangeAt),
          effectiveTo: null,
          source: 'system',
        });
      }
      continue;
    }

    const currentActive = [...history]
      .reverse()
      .find((h) => h && h.value !== undefined && (h.effectiveTo === null || h.effectiveTo === undefined));

    if (currentActive) {
      currentActive.effectiveTo = getPreviousDay(fieldChangeAt);
    } else if (priorValue) {
      history.push({
        value: priorValue,
        effectiveFrom: baselineEffectiveFrom || getAnchorEffectiveFrom(user, fieldChangeAt),
        effectiveTo: getPreviousDay(fieldChangeAt),
        source: 'system',
      });
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
    const currentValue = normalizeManagedFieldValue(user[field]);
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
