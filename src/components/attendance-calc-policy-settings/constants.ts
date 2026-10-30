import { type DurationGraceStyle, type EdgeCountStyle, type ExcessMethod, type PolicyVersionStatus, type ShortfallStyle } from '@/lib/attendanceCalcPolicy';

export const STATUS_LABEL: Record<PolicyVersionStatus, string> = {
  'in-use': 'In use',
  scheduled: 'Scheduled',
  earlier: 'Earlier',
};

export const STATUS_CLASS: Record<PolicyVersionStatus, string> = {
  'in-use': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  scheduled: 'bg-blue-50 text-blue-800 border-blue-200',
  earlier: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const EDGE_OPTIONS: { value: EdgeCountStyle; label: string }[] = [
  { value: 'all', label: 'Every minute counts' },
  { value: 'all-if-over', label: 'Only when over the grace, then all of those minutes' },
  { value: 'only-beyond', label: 'Only the minutes past the grace' },
  { value: 'none', label: 'Does not count' },
];

export const SHORTFALL_OPTIONS: { value: ShortfallStyle; label: string }[] = [
  { value: 'full', label: 'The whole shortfall' },
  { value: 'only-beyond', label: 'Only the minutes past the grace' },
  { value: 'none', label: 'Does not count' },
];

export const METHOD_OPTIONS: { value: ExcessMethod; label: string }[] = [
  { value: 'edges', label: 'Early arrival and late leaving, separately' },
  { value: 'duration', label: 'Worked time minus scheduled time' },
];

export const GRACE_STYLE_OPTIONS: { value: DurationGraceStyle; label: string }[] = [
  { value: 'full-if-over', label: 'Within the grace is zero. A larger difference counts in full' },
  { value: 'only-beyond', label: 'Only the minutes past the grace' },
];

export const SHARE_OPTIONS = [
  { value: '0', label: 'None of the scheduled hours' },
  { value: '0.5', label: 'Half of that day’s scheduled hours' },
  { value: '0.75', label: 'Three quarters of that day’s scheduled hours' },
  { value: '1', label: 'The full scheduled hours' },
];
