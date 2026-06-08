'use client';

import { useEffect, useState } from 'react';
import type {
  ExcessAllowanceLookup,
  ExcessDayAllowanceLookup,
  ExcessDisplayLookup,
} from '@/lib/excessHourAllowance';

export interface ExcessAllowanceMaps {
  excessAllowanceMap: ExcessAllowanceLookup;
  excessDisplayMap: ExcessDisplayLookup;
  excessDayAllowanceMap: ExcessDayAllowanceLookup;
}

const EMPTY_MAPS: ExcessAllowanceMaps = {
  excessAllowanceMap: {},
  excessDisplayMap: {},
  excessDayAllowanceMap: {},
};

function pairsFromUserMonths(userIds: string[], monthYear: string): string[] {
  return userIds
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .map((userId) => `${userId}:${monthYear}`);
}

function pairsFromSegments(segments: string[]): string[] {
  return segments
    .map((segment) => {
      const [userId, monthYear] = segment.split(':');
      return { userId: String(userId || '').trim(), monthYear: String(monthYear || '').trim() };
    })
    .filter((p) => p.userId && p.monthYear)
    .map((p) => `${p.userId}:${p.monthYear}`);
}

/**
 * Loads partner monthly caps, day-wise display totals, and per-day allowances.
 * Pass either userIds + monthYear, or pre-built userId:monthYear pair strings.
 */
export function useExcessAllowanceMaps(options: {
  userIds?: string[];
  monthYear?: string;
  pairs?: string[];
  enabled?: boolean;
}): ExcessAllowanceMaps {
  const { userIds = [], monthYear = '', pairs: pairSegments, enabled = true } = options;

  const [maps, setMaps] = useState<ExcessAllowanceMaps>(EMPTY_MAPS);

  useEffect(() => {
    if (!enabled) {
      setMaps(EMPTY_MAPS);
      return;
    }

    const pairs = pairSegments?.length
      ? pairsFromSegments(pairSegments)
      : pairsFromUserMonths(userIds, monthYear);

    if (pairs.length === 0) {
      setMaps(EMPTY_MAPS);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/excess-hour-allowance?pairs=${encodeURIComponent(pairs.join(','))}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (cancelled) return;

        setMaps({
          excessAllowanceMap:
            json.success && json.data && typeof json.data === 'object'
              ? (json.data as ExcessAllowanceLookup)
              : {},
          excessDisplayMap:
            json.success && json.displayExcess && typeof json.displayExcess === 'object'
              ? (json.displayExcess as ExcessDisplayLookup)
              : {},
          excessDayAllowanceMap:
            json.success && json.dayAllowances && typeof json.dayAllowances === 'object'
              ? (json.dayAllowances as ExcessDayAllowanceLookup)
              : {},
        });
      } catch {
        if (!cancelled) setMaps(EMPTY_MAPS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, monthYear, pairSegments?.join('|'), userIds.join('|')]);

  return maps;
}
