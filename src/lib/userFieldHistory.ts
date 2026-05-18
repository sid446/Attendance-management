import { IUser } from '@/models/User';

/** Baseline effective-from for existing DB values before dated history was introduced. */
export const LEGACY_BASELINE_EFFECTIVE_FROM = new Date('2025-12-12T00:00:00.000Z');

export const MANAGED_EFFECTIVE_FIELDS = [
  'designation',
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

/** Local calendar midnight — avoids timezone drift when comparing effective dates. */
export function startOfCalendarDay(input: Date | string): Date {
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(d.getTime())) return new Date(NaN);
  d.setHours(0, 0, 0, 0);
  return d;
}

type FieldHistoryEntry = {
  value?: string;
  effectiveFrom?: string | Date;
  effectiveTo?: string | Date | null;
  source?: string;
};

type UserWithFieldHistories = {
  fieldHistories?: Partial<Record<ManagedEffectiveField, FieldHistoryEntry[]>>;
} & Partial<Record<ManagedEffectiveField, unknown>>;

/**
 * Value of a managed field (e.g. workingUnderPartner) that was active on `date`.
 * Inclusive on effectiveFrom and effectiveTo (e.g. old partner still applies on their last day).
 */
export function getManagedFieldValueForDate(
  user: UserWithFieldHistories | null | undefined,
  field: ManagedEffectiveField,
  date: Date | string
): string {
  if (!user) return '';
  const day = startOfCalendarDay(date);
  if (Number.isNaN(day.getTime())) {
    return normalizeManagedFieldValue(user[field]);
  }

  const history = user.fieldHistories?.[field];
  if (Array.isArray(history) && history.length > 0) {
    const matches = history.filter((entry) => {
      if (!entry?.value) return false;
      const from = startOfCalendarDay(new Date(entry.effectiveFrom as string | Date));
      if (Number.isNaN(from.getTime()) || day < from) return false;
      if (entry.effectiveTo != null && entry.effectiveTo !== '') {
        const to = startOfCalendarDay(new Date(entry.effectiveTo as string | Date));
        if (!Number.isNaN(to.getTime()) && day > to) return false;
      }
      return true;
    });

    if (matches.length > 0) {
      matches.sort(
        (a, b) =>
          new Date(b.effectiveFrom as string | Date).getTime() -
          new Date(a.effectiveFrom as string | Date).getTime()
      );
      return normalizeManagedFieldValue(matches[0].value);
    }
  }

  return normalizeManagedFieldValue(user[field]);
}

export function getWorkingUnderPartnerForDate(
  user: UserWithFieldHistories | null | undefined,
  date: Date | string
): string {
  const fromHistory = getManagedFieldValueForDate(user, 'workingUnderPartner', date);
  if (fromHistory) return fromHistory;
  return normalizeManagedFieldValue((user as { team?: unknown })?.team);
}

/** Last calendar day of `YYYY-MM`. */
export function lastDayOfMonthYear(monthYear: string): Date {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m) return startOfCalendarDay(new Date());
  return startOfCalendarDay(new Date(y, m, 0));
}

export type SummaryPeriodContext = {
  filterType: 'month' | 'week' | 'range';
  selectedYear: number;
  selectedMonth: number;
  currentWeekStart?: string;
  rangeEnd?: string;
  monthYear?: string;
};

/** End date of the summary/report period (partner shown as of this day). */
export function getSummaryPeriodEndDate(ctx: SummaryPeriodContext): Date {
  if (ctx.filterType === 'range' && ctx.rangeEnd) {
    return startOfCalendarDay(ctx.rangeEnd);
  }

  if (ctx.filterType === 'week' && ctx.currentWeekStart) {
    const start = startOfCalendarDay(ctx.currentWeekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const lastDayOfMonth = startOfCalendarDay(new Date(ctx.selectedYear, ctx.selectedMonth, 0));
    return end > lastDayOfMonth ? lastDayOfMonth : startOfCalendarDay(end);
  }

  if (ctx.monthYear) {
    return lastDayOfMonthYear(ctx.monthYear);
  }

  return startOfCalendarDay(new Date(ctx.selectedYear, ctx.selectedMonth, 0));
}

export function getWorkingUnderPartnerForSummary(
  user: UserWithFieldHistories | null | undefined,
  ctx: SummaryPeriodContext
): string {
  const periodEnd = getSummaryPeriodEndDate(ctx);
  return getWorkingUnderPartnerForDate(user, periodEnd);
}

export function getDesignationForDate(
  user: UserWithFieldHistories | null | undefined,
  date: Date | string
): string {
  return getManagedFieldValueForDate(user, 'designation', date);
}

export function getDesignationForSummary(
  user: UserWithFieldHistories | null | undefined,
  ctx: SummaryPeriodContext
): string {
  return getDesignationForDate(user, getSummaryPeriodEndDate(ctx));
}

/** Seed a single open-ended history segment when the field has a value but no history yet. */
export function seedFieldHistoryIfMissing(
  user: {
    fieldHistories?: Record<string, FieldHistoryEntry[]>;
  } & Partial<Record<ManagedEffectiveField, unknown>>,
  field: ManagedEffectiveField,
  effectiveFrom: Date = LEGACY_BASELINE_EFFECTIVE_FROM
): boolean {
  const value = normalizeManagedFieldValue(user[field]);
  if (!value) return false;

  if (!user.fieldHistories) {
    user.fieldHistories = {};
  }

  const history = user.fieldHistories[field];
  if (Array.isArray(history) && history.length > 0) {
    return false;
  }

  user.fieldHistories[field] = [
    {
      value,
      effectiveFrom,
      effectiveTo: null,
      source: 'system',
    },
  ];
  return true;
}

export const LEGACY_SEED_FIELDS: ManagedEffectiveField[] = ['designation', 'workingUnderPartner'];

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
