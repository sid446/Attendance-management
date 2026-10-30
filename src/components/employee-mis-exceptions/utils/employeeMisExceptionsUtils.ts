import type { EarlyInLateOutHit } from '@/lib/employeeMisExceptions';

export function formatEarlyInLateOutReason(reason: EarlyInLateOutHit['reason']): string {
  switch (reason) {
    case 'early-in':
      return 'In ≤ 8 AM';
    case 'late-out':
      return 'Out ≥ 8 PM';
    case 'both':
      return 'In ≤ 8 AM and out ≥ 8 PM';
  }
}

export function formatEarlyInLateOutDetail(hit: EarlyInLateOutHit): string {
  const parts = [hit.date, formatEarlyInLateOutReason(hit.reason)];
  if (hit.inTime) parts.push(`in ${hit.inTime}`);
  if (hit.outTime) parts.push(`out ${hit.outTime}`);
  return parts.join(' · ');
}
