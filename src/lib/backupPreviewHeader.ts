/** Sent only by the backup view popup. Reads from a copy database. Writes stay blocked. */
export const BACKUP_PREVIEW_HEADER = 'x-backup-preview';

export const PREVIEW_DB_NAME = /^(asija_copy_\d{8}|asija_prerestore_\d{8}T\d{6})$/;

export const BACKUP_PREVIEW_SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'employee', label: 'Month view' },
  { id: 'leave', label: 'Leave' },
  { id: 'salaryPayroll', label: 'Salary' },
  { id: 'employees', label: 'Employees' },
  { id: 'fines', label: 'Fines' },
  { id: 'holidays', label: 'Holidays' },
  { id: 'requests', label: 'Requests' },
] as const;
