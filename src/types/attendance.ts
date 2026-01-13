// Daily record type
export interface DailyRecord {
  checkin: string;
  checkout: string;
  totalHour: number;
  excessHour: number;
  typeOfPresence: 'ThumbMachine' | 'Manual' | 'Remote' | 'Leave' | 'Holiday' | 'Absent' | 'Official Holiday Duty (OHD)' | 'Weekly Off - Present (WO-Present)' | 'Half Day (HD)' | 'Work From Home (WFH)' | 'Weekly Off - Work From Home (WO-WFH)' | 'Onsite Presence (OS-P)' | 'Week Off';
  halfDay: boolean;
  remarks?: string;
}

// Monthly summary type
export interface Summary {
  totalHour: number;
  totalLateArrival: number;
  excessHour: number;
  totalHalfDay: number;
  totalPresent: number;
  totalAbsent: number;
  totalLeave: number;
}

// Attendance record type
export interface AttendanceRecord {
  status: "present" | "absent" | "late";
  date: string | number | Date;
  studentId: string;
  studentName: string;
  _id: string;
  userId: string;
  monthYear: string;
  records: Record<string, DailyRecord>;  // Key: "YYYY-MM-DD"
  summary: Summary;
  createdAt: string;
  updatedAt: string;
}

// Schedule time type
export interface ScheduleTime {
  inTime: string;
  outTime: string;
}

// User type
export interface User {
  _id: string;
  odId: string;
  name: string;
  email: string;
  joiningDate: string;

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

  scheduleInOutTime: ScheduleTime;
  scheduleInOutTimeSat: ScheduleTime;
  scheduleInOutTimeMonth: ScheduleTime;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
