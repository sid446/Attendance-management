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
