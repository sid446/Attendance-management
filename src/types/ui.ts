export interface AttendanceRecord {
  id: string | number;
  name: string;
  date: string;
  inTime: string;
  outTime: string;
  status: 'Present' | 'Absent' | 'Leave' | 'Holiday' | 'HalfDay';
  typeOfPresence?: string;
}

export interface AttendanceSummaryView {
  id: string;
  userId: string;
  userName: string;
  odId?: string;
  team?: string; // Added optional team field
  monthYear: string;
  schedules?: {
    regular?: ScheduleTime;
    saturday?: ScheduleTime;
    monthly?: ScheduleTime;
  };
  summary: {
    totalHour: number;
    totalLateArrival: number;
    excessHour: number;
    totalHalfDay: number;
    totalPresent: number;
    totalAbsent: number;
    totalLeave: number;
  };
  calcLate?: number; // Calculated on frontend
  recordDetails?: Record<string, { // Map of date -> details
      checkin: string;
      checkout: string;
      totalHour: number;
      typeOfPresence: string;
      halfDay: boolean;
  }>;
}

export interface ScheduleTime {
  inTime: string;
  outTime: string;
}

export interface User {
  _id: string;
  odId: string;
  name: string;
  email: string;
  designation?: string;
  team?: string;
  joiningDate: string; // ISO string for frontend

  registrationNo?: string;
  employeeCode?: string;
  paidFrom?: string;
  category?: string;
  tallyName?: string;
  gender?: string;
  parentName?: string;
  parentOccupation?: string;
  mobileNumber?: string;
  alternateMobileNumber?: string;
  alternateEmail?: string;
  address1?: string;
  address2?: string;
  articleshipStartDate?: string;
  transferCase?: string;
  firstYearArticleship?: string;
  secondYearArticleship?: string;
  thirdYearArticleship?: string;
  filledScholarship?: string;
  qualificationLevel?: string;
  nextAttemptDueDate?: string;
  registeredUnderPartner?: string;
  workingUnderPartner?: string;
  workingTiming?: string;

  // Flexible additional info fields (e.g. PAN, Aadhaar, etc.)
  extraInfo?: {
    label: string;
    value: string;
  }[];

  scheduleInOutTime: ScheduleTime;
  scheduleInOutTimeSat: ScheduleTime;
  scheduleInOutTimeMonth: ScheduleTime;
  isActive: boolean;
}
