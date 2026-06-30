import type {
  AttendanceRequest,
  DateRangeGroup,
  RequestDisplayRow,
  RequestSortOption,
} from '../types';
import { requestDateToTime } from './requestSortingCore';

export { requestDateToTime, compareRequestsByDateDesc } from './requestSortingCore';

export function sortRangeGroupsByDate(rangeGroups: DateRangeGroup[]): DateRangeGroup[] {
  return [...rangeGroups].sort((a, b) => requestDateToTime(b.startDate) - requestDateToTime(a.startDate));
}

export function sortIndividualRequestsByDate(requests: AttendanceRequest[]): AttendanceRequest[] {
  return [...requests].sort((a, b) => requestDateToTime(b.date) - requestDateToTime(a.date));
}

const STATUS_SORT_ORDER: Record<string, number> = {
  Pending: 0,
  PendingHr: 1,
  Approved: 2,
  Rejected: 3,
};

function rowSortMeta(row: RequestDisplayRow) {
  if (row.type === 'range') {
    const item = row.item;
    return {
      date: requestDateToTime(item.startDate),
      employee: String(item.userName || '').toLowerCase(),
      status: STATUS_SORT_ORDER[item.status] ?? 99,
      type: String(item.requestedStatus || '').toLowerCase(),
      submitted: requestDateToTime(item.createdAt),
    };
  }
  const item = row.item;
  return {
    date: requestDateToTime(item.date),
    employee: String(item.userName || '').toLowerCase(),
    status: STATUS_SORT_ORDER[item.status] ?? 99,
    type: String(item.requestedStatus || '').toLowerCase(),
    submitted: requestDateToTime(item.createdAt),
  };
}

function compareRows(a: RequestDisplayRow, b: RequestDisplayRow, sortBy: RequestSortOption): number {
  const metaA = rowSortMeta(a);
  const metaB = rowSortMeta(b);

  switch (sortBy) {
    case 'date_asc':
      return metaA.date - metaB.date || metaA.employee.localeCompare(metaB.employee);
    case 'employee_asc':
      return metaA.employee.localeCompare(metaB.employee) || metaB.date - metaA.date;
    case 'employee_desc':
      return metaB.employee.localeCompare(metaA.employee) || metaB.date - metaA.date;
    case 'status':
      return metaA.status - metaB.status || metaB.date - metaA.date;
    case 'type_asc':
      return metaA.type.localeCompare(metaB.type) || metaB.date - metaA.date;
    case 'submitted_desc':
      return metaB.submitted - metaA.submitted || metaB.date - metaA.date;
    case 'date_desc':
    default:
      return metaB.date - metaA.date || metaA.employee.localeCompare(metaB.employee);
  }
}

export function buildSortedRequestRows(
  rangeGroups: DateRangeGroup[],
  individualRequests: AttendanceRequest[],
  sortBy: RequestSortOption = 'date_desc'
): RequestDisplayRow[] {
  const rows: RequestDisplayRow[] = [
    ...sortRangeGroupsByDate(rangeGroups).map((item) => ({ type: 'range' as const, item })),
    ...sortIndividualRequestsByDate(individualRequests).map((item) => ({
      type: 'individual' as const,
      item,
    })),
  ];

  return rows.sort((a, b) => compareRows(a, b, sortBy));
}

export const REQUEST_SORT_OPTIONS: { value: RequestSortOption; label: string }[] = [
  { value: 'date_desc', label: 'Date (newest first)' },
  { value: 'date_asc', label: 'Date (oldest first)' },
  { value: 'submitted_desc', label: 'Submitted (newest first)' },
  { value: 'employee_asc', label: 'Employee (A–Z)' },
  { value: 'employee_desc', label: 'Employee (Z–A)' },
  { value: 'status', label: 'Status (pending first)' },
  { value: 'type_asc', label: 'Request type (A–Z)' },
];
