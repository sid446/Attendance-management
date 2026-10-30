export interface Holiday {
  _id: string;
  date: string;
  name: string;
  type: 'national' | 'regional' | 'company' | 'optional';
  description?: string;
  year: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HolidayManagementProps {
  currentYear?: number;
}
