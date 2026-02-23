export interface AttendanceRecord {
  schedule: any;
  [x: string]: any;
  schedule: AttendanceRecord | undefined;
  id: string | number;
  name: string;
  date: string;
  inTime: string;
  outTime: string;
  status: 'Present' | 'Absent' | 'On leave' | 'Holiday' | 'HalfDay'|'Leave';
  typeOfPresence?: string;
  value?: number; // Attendance value: 1 for present, 0 for absent, 0.5 for half day
}

export interface AttendanceSummaryView {
  id: string;
  userId: string;
  userName: string;
  odId?: string;
  employeeCode?: string;
  team?: string; // Added optional team field
  designation?: string; // Added optional designation field
  monthYear: string;
  schedules?: ScheduleEntry; // Applicable schedule entry for this summary's month/year
  summary: {
    scheduledHours: string;
    shortHours: string;
    excessHours: string;
    totalHour: number;
    totalLateArrival: number;
    excessHour: number;
    totalHalfDay: number;
    totalPresent: number;
    totalAbsent: number;
    totalLeave: number;
  };
  calcLate?: number; // Calculated on frontend
  recordDetails?: Record<string, {
      [x: string]: string;
      [x: string]: string;
      [x: string]: string;
      [x: string]: string;
      [x: string]: string;
      [x: string]: any;
      [x: string]: string;
      [x: string]: any;
      [x: string]: any;
      updatedByEmail: any;
      updatedBy: any;
      originalInTime: string;
      originalOutTime: string;
      inTime: string;
      outTime: string;
      inTimeEdited: any;
      outTimeEdited: any;
      maxWFH: string;
      actualWFH: string;
      maxOutstation: string;
      actualOutstation: string;
      workingHours: string;
      scheduledTime: string;
      shortHours: string;
      excessHours: string;
      status: any; // Map of date -> details
      checkin: string;
      checkout: string;
      editedCheckin?: string;
      editedCheckout?: string;
      totalHour: number;
      typeOfPresence: string;
      halfDay: boolean;
  }>;
  calcScheduled?: number; // Total scheduled hours for the period
  calcExcessDeficit?: number; // Calculated excess/deficit hours
}

export interface ScheduleTime {
  inTime: string;
  outTime: string;
  isHoliday?: boolean;
  isHalfDay?: boolean;
}


// Allow string index for day names
export type DailySchedule = Record<string, ScheduleTime | undefined>;

// Schedule entry with effective date
export interface ScheduleEntry {
  effectiveFrom: string; // ISO date string for frontend
  daily: DailySchedule;
}

export interface User {
  leaveBalance: any;
  _id: string;
  odId: string;
  name: string;
  email: string;
  attendanceEmail?: string;
  designation?: string;
  team?: string;
  joiningDate: string; // ISO string for frontend

  registrationNo?: string;
  employeeCode?: string;
  paidFrom?: string;
  category?: string;
  employmentType?: string;
  tallyName?: string;
  gender?: string;
  parentName?: string;
  parentOccupation?: string;
  mobileNumber?: string;
  alternateMobileNumber?: string;
  alternateEmail?: string;
  address1?: string;
  address2?: string;
  // New HR / personal & banking fields (frontend as strings/ISO dates)
  emergencyContactNo?: string;
  emergencyContactRelation?: string;
  anniversaryDate?: string;
  bankName?: string;
  branchName?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountType?: string;
  accountHolderName?: string;
  aadhaarNumber?: string;
  panNumber?: string;
  basicSalary?: string; // Basis Salary/Stipend/Fees
  laptopAllowance?: string;
  otherAllowance?: string;
  bonus?: string;
  incentive?: string;
  totalSalaryPerMonth?: string;
  totalSalaryPerAnnum?: string;
  pf?: string;
  esi?: string;
  gratuity?: string;
  totalLeavesDue?: number;
  totalLeavesTaken?: number;
  balanceLeaves?: number;
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

  // Schedule entries with effective dates - NEW STRUCTURE
  schedules?: ScheduleEntry[]; // Array of schedule entries, ordered by effectiveFrom ascending

  // Legacy fields for backward compatibility (will be migrated)
  scheduleInOutTime?: ScheduleTime;
  scheduleInOutTimeSat?: ScheduleTime;
  scheduleInOutTimeMonth?: ScheduleTime;

  isActive: boolean;
}
