import { User } from '@/types/ui';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';

export const fetchUsers = async (): Promise<User[]> => {
  const res = await fetch('/api/users?listOnly=1', hrCredentialsInit());
  const json = await res.json();
  return json.success ? json.data : [];
};

export const fetchAttendance = async (userId: string): Promise<any[]> => {
  // Fetch all attendance records for the user
  const res = await fetch(`/api/attendance?userId=${userId}`);
  const json = await res.json();
  return json.success ? json.data : [];
};
