export interface OpenRequestFields {
  requestRaised?: boolean;
  requestStatus?: 'Pending' | 'PendingHr';
  requestedStatus?: string;
}

export interface InvalidRecord extends OpenRequestFields {
  date: string;
  checkin: string;
  checkout: string;
  issue: 'missing-checkin' | 'missing-checkout';
  monthYear: string;
  notificationCount?: number;
  lastNotifiedAt?: string;
}

export interface EmployeeWithInvalidRecords {
  userId: string;
  name: string;
  email: string;
  designation: string;
  workingUnderPartner: string;
  attendanceEmail: string;
  invalidRecords: InvalidRecord[];
  notificationCount?: number;
  lastNotifiedAt?: string;
}

export interface MissingDayRecord extends OpenRequestFields {
  date: string;
  notificationCount?: number;
  lastNotifiedAt?: string;
}

export interface MissingMonthEmployee {
  userId: string;
  odId: string;
  name: string;
  email: string;
  designation: string;
  workingUnderPartner: string;
  attendanceEmail: string;
  wholeMonthMissing: boolean;
  missingDays: MissingDayRecord[];
  notificationCount?: number;
  lastNotifiedAt?: string;
}

export interface InvalidAttendanceSectionProps {
  onRefresh?: () => void;
}
