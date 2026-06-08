/** Composite key for user + month allowance lookup. */
export function excessAllowanceKey(userId: string, monthYear: string): string {
  return `${userId}:${monthYear}`;
}

export type ExcessAllowanceLookup = Record<string, number>;

/** Resolved display excess after day-wise partner approvals (userId:monthYear → hours). */
export type ExcessDisplayLookup = Record<string, number>;

/** Partner-set allowed hours per day (userId:YYYY-MM-DD → hours). */
export type ExcessDayAllowanceLookup = Record<string, number>;

export function excessDayAllowanceKey(userId: string, date: string): string {
  return `${userId}:${date}`;
}

export function lookupExcessDisplay(
  map: ExcessDisplayLookup | null | undefined,
  userId: string,
  monthYear: string
): number | null {
  if (!map) return null;
  const val = map[excessAllowanceKey(userId, monthYear)];
  return val != null && Number.isFinite(val) ? Number(Number(val).toFixed(2)) : null;
}

export interface DailyExcessApprovalRow {
  date: string;
  rawExcessHour: number;
  /** null = partner has not set allowance (positive excess counts in full) */
  allowedExcessHours: number | null;
  countsAs: number;
  typeOfPresence?: string;
  missedEntry?: boolean;
}

/**
 * Untouched positive excess counts in full. Partner-set allowance caps that day (0 … raw).
 * Deficit (negative) always counts.
 */
export function applyDayWiseExcessApprovals(
  days: Array<{
    date: string;
    rawExcessHour: number;
    allowedExcessHours: number | null;
    typeOfPresence?: string;
    missedEntry?: boolean;
  }>
): { displayExcess: number; rawExcess: number; rows: DailyExcessApprovalRow[] } {
  let raw = 0;
  let display = 0;
  const rows: DailyExcessApprovalRow[] = [];

  for (const day of days) {
    const rawDay = Number(Number(day.rawExcessHour).toFixed(2));
    raw += rawDay;

    let countsAs = rawDay;
    if (rawDay > 0 && day.allowedExcessHours != null) {
      const allowed = Math.max(0, Number(Number(day.allowedExcessHours).toFixed(2)));
      countsAs = Number(Math.min(rawDay, allowed).toFixed(2));
    }

    display += countsAs;
    rows.push({
      date: day.date,
      rawExcessHour: rawDay,
      allowedExcessHours: rawDay > 0 ? day.allowedExcessHours : null,
      countsAs,
      typeOfPresence: day.typeOfPresence,
      missedEntry: day.missedEntry,
    });
  }

  return {
    rawExcess: Number(raw.toFixed(2)),
    displayExcess: Number(display.toFixed(2)),
    rows,
  };
}

export function lookupExcessAllowance(
  map: ExcessAllowanceLookup | null | undefined,
  userId: string,
  monthYear: string
): number | null {
  if (!map) return null;
  const cap = map[excessAllowanceKey(userId, monthYear)];
  return cap != null && Number.isFinite(cap) ? cap : null;
}

export interface AppliedExcessAllowance {
  displayExcess: number;
  rawExcess: number;
  allowedExcessCap: number | null;
}

/**
 * Partner-approved cap on positive excess only.
 * Deficit (negative) is unchanged. No cap → full raw value.
 */
export function applyExcessHourAllowance(
  rawExcess: number,
  allowedCap: number | null | undefined
): AppliedExcessAllowance {
  const raw = Number(Number(rawExcess).toFixed(2));
  const cap =
    allowedCap != null && Number.isFinite(Number(allowedCap))
      ? Number(Number(allowedCap).toFixed(2))
      : null;

  if (cap === null) {
    return { displayExcess: raw, rawExcess: raw, allowedExcessCap: null };
  }

  if (raw <= 0) {
    return { displayExcess: raw, rawExcess: raw, allowedExcessCap: cap };
  }

  return {
    displayExcess: Number(Math.min(raw, Math.max(0, cap)).toFixed(2)),
    rawExcess: raw,
    allowedExcessCap: cap,
  };
}

/**
 * Apply partner day allowance to a single day's raw excess.
 * Untouched days (no map entry) keep full raw excess; deficits always count in full.
 */
export function applyDayAllowanceToRawExcess(
  rawExcessHour: number,
  userId: string,
  date: string,
  dayAllowanceMap?: ExcessDayAllowanceLookup | null
): number {
  const raw = Number(Number(rawExcessHour).toFixed(2));
  if (raw <= 0) return raw;
  if (!dayAllowanceMap) return raw;
  const key = excessDayAllowanceKey(userId, date);
  if (!Object.prototype.hasOwnProperty.call(dayAllowanceMap, key)) return raw;
  const allowed = Math.max(0, Number(Number(dayAllowanceMap[key]).toFixed(2)));
  return Number(Math.min(raw, allowed).toFixed(2));
}

/**
 * Resolve excess for summaries/reports: day-wise partner total → monthly cap → raw.
 */
export function resolveDisplayExcess(
  rawExcess: number,
  userId: string,
  monthYear: string,
  allowanceMap?: ExcessAllowanceLookup | null,
  displayMap?: ExcessDisplayLookup | null
): number {
  const fromDays = lookupExcessDisplay(displayMap ?? null, userId, monthYear);
  if (fromDays != null) return fromDays;
  const cap = lookupExcessAllowance(allowanceMap ?? null, userId, monthYear);
  return applyExcessHourAllowance(rawExcess, cap).displayExcess;
}

export function enrichExcessFields(
  rawExcess: number,
  userId: string,
  monthYear: string,
  allowanceMap?: ExcessAllowanceLookup | null,
  displayMap?: ExcessDisplayLookup | null
): AppliedExcessAllowance {
  const raw = Number(Number(rawExcess).toFixed(2));
  const displayExcess = resolveDisplayExcess(raw, userId, monthYear, allowanceMap, displayMap);
  const cap = lookupExcessAllowance(allowanceMap ?? null, userId, monthYear);
  return {
    displayExcess,
    rawExcess: raw,
    allowedExcessCap: cap,
  };
}
