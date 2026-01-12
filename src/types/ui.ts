export interface AttendanceRecord {
  id: string | number;
  name: string;
  date: string;
  inTime: string;
  outTime: string;
  status: 'Present' | 'Absent';
}

export interface AttendanceSummaryView {
  id: string;
  userId: string;
  userName: string;
  monthYear: string;
  summary: {
    totalHour: number;
    totalLateArrival: number;
    excessHour: number;
    totalHalfDay: number;
    totalPresent: number;
    totalAbsent: number;
    totalLeave: number;
  };
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
  scheduleInOutTime: ScheduleTime;
  scheduleInOutTimeSat: ScheduleTime;
  scheduleInOutTimeMonth: ScheduleTime;
  isActive: boolean;
}
