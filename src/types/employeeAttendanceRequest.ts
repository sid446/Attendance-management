export type EmployeeAttendanceRequest = {
  _id: string;
  date: string;
  requestedStatus: string;
  requestType?: 'correction' | 'extra_work';
  originalStatus?: string;
  reason?: string;
  startTime?: string;
  endTime?: string;
  extraWorkSlots?: { startTime: string; endTime: string; reason: string }[];
  status: 'Pending' | 'PendingHr' | 'Approved' | 'Rejected';
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};
