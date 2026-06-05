import type { AttendanceRequest, DateRangeGroup, RequestDisplayRow } from '../types';

export function requestDateToTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Sort by attendance date (newest first). */
export function compareRequestsByDateDesc(aDate: string, bDate: string): number {
  return requestDateToTime(bDate) - requestDateToTime(aDate);
}

export function sortRangeGroupsByDate(rangeGroups: DateRangeGroup[]): DateRangeGroup[] {
  return [...rangeGroups].sort((a, b) => compareRequestsByDateDesc(a.startDate, b.startDate));
}

export function sortIndividualRequestsByDate(requests: AttendanceRequest[]): AttendanceRequest[] {
  return [...requests].sort((a, b) => compareRequestsByDateDesc(a.date, b.date));
}

export function buildSortedRequestRows(
  rangeGroups: DateRangeGroup[],
  individualRequests: AttendanceRequest[]
): RequestDisplayRow[] {
  const rows: RequestDisplayRow[] = [
    ...sortRangeGroupsByDate(rangeGroups).map((item) => ({ type: 'range' as const, item })),
    ...sortIndividualRequestsByDate(individualRequests).map((item) => ({ type: 'individual' as const, item })),
  ];

  return rows.sort((a, b) => {
    const dateA = a.type === 'range' ? a.item.startDate : a.item.date;
    const dateB = b.type === 'range' ? b.item.startDate : b.item.date;
    return compareRequestsByDateDesc(dateA, dateB);
  });
}
