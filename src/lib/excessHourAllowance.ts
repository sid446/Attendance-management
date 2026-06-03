/** Composite key for user + month allowance lookup. */
export function excessAllowanceKey(userId: string, monthYear: string): string {
  return `${userId}:${monthYear}`;
}

export type ExcessAllowanceLookup = Record<string, number>;

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

export function enrichExcessFields(
  rawExcess: number,
  userId: string,
  monthYear: string,
  allowanceMap?: ExcessAllowanceLookup | null
): AppliedExcessAllowance {
  const cap = lookupExcessAllowance(allowanceMap ?? null, userId, monthYear);
  return applyExcessHourAllowance(rawExcess, cap);
}
