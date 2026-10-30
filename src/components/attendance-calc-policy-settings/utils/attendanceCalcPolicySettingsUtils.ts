import { type EdgeCountStyle } from '@/lib/attendanceCalcPolicy';

export function formatPolicyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function edgeNeedsGrace(style: EdgeCountStyle): boolean {
  return style === 'all-if-over' || style === 'only-beyond';
}
