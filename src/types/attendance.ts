// Daily record type
export interface DailyRecord {
  checkin: string;
  checkout: string;
  totalHour: number;
  excessHour: number;
  typeOfPresence: 'ThumbMachine' | 'Manual' | 'Remote' | 'Leave' | 'Holiday';
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
