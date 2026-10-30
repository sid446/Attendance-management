import type { EarlyInLateOutHit, MisExceptionType } from '@/lib/employeeMisExceptions';
import type { FILTER_ALL } from './constants';

export type MisRow = {
  userId: string;
  odId: string;
  name: string;
  email: string;
  designation: string;
  workingUnderPartner: string;
  registeredUnderPartner: string;
  attendanceEmail: string;
  exceptions: MisExceptionType[];
  missingBiometricDates?: string[];
  earlyInLateOutHits?: EarlyInLateOutHit[];
};

export type MisCounts = Record<MisExceptionType, number>;

export type MisLabels = Record<MisExceptionType, string>;

export type FilterValue = typeof FILTER_ALL | MisExceptionType;
