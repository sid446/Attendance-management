export type EmployeeAttendanceRequest = {
  _id: string;
  date: string;
  requestedStatus: string;
  originalStatus?: string;
  reason?: string;
  startTime?: string;
  endTime?: string;
  status: 'Pending' | 'PendingHr' | 'Approved' | 'Rejected';
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};
