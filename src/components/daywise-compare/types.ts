import type { User } from '@/types/ui';
import type { DaywiseRowDiff } from '@/lib/daywiseSheetCompare';

export type Props = {
  allUsers?: User[];
  holidays?: { date: string; name: string }[];
};

export type KindFilter = 'all' | DaywiseRowDiff['kind'];

export type EmployeeGroup = {
  key: string;
  name: string;
  code: string;
  diffs: DaywiseRowDiff[];
  mismatch: number;
  missing: number;
  extra: number;
  total: number;
};
