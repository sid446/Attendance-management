import type { AttendanceRequest, DateRangeGroup, RequestStatusFilter } from '../types';

export const matchesStatusFilter = (filter: RequestStatusFilter, status: string) =>
  filter === 'all' || status === filter || (filter === 'Pending' && status === 'PendingHr');

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function requestSearchHaystack(request: AttendanceRequest): string {
  return [
    request.userName,
    request.userId?.name,
    request.userId?.email,
    request.userId?.designation,
    request.partnerName,
    request.requestedStatus,
    request.originalStatus,
    request.reason,
    request.partnerRemarks,
    request.hrRemarks,
    request.status,
    request.date,
    request.monthYear,
    request.approvedBy,
    request.approvedByEmail,
    request.rejectedBy,
    request.rejectedByEmail,
    request.startTime,
    request.endTime,
    request.hrValue,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function rangeSearchHaystack(group: DateRangeGroup): string {
  return [
    group.userName,
    group.designation,
    group.partnerName,
    group.requestedStatus,
    group.reason,
    group.partnerRemarks,
    group.hrRemarks,
    group.status,
    group.startDate,
    group.endDate,
    group.dates.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export const matchesSearchQuery = (haystack: string, searchQuery: string): boolean => {
  const query = normalizeSearch(searchQuery);
  if (!query) return true;
  return haystack.includes(query);
};

export interface RequestListFilters {
  statusFilter: RequestStatusFilter;
  monthFilter: string;
  leaveTypeFilter: string;
  partnerFilter: string;
  searchQuery: string;
}

export const filterRangeGroups = (
  rangeGroups: DateRangeGroup[],
  { statusFilter, monthFilter, leaveTypeFilter, partnerFilter, searchQuery }: RequestListFilters
) =>
  rangeGroups.filter(
    (group) =>
      matchesStatusFilter(statusFilter, group.status) &&
      (monthFilter === 'all' ||
        group.dates.some((date) => {
          const requestDate = new Date(date);
          const monthYear = `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, '0')}`;
          return monthYear === monthFilter;
        })) &&
      (leaveTypeFilter === 'all' || group.requestedStatus === leaveTypeFilter) &&
      (partnerFilter === 'all' || group.partnerName === partnerFilter) &&
      matchesSearchQuery(rangeSearchHaystack(group), searchQuery)
  );

export const filterIndividualRequests = (
  individualRequests: AttendanceRequest[],
  { statusFilter, monthFilter, leaveTypeFilter, partnerFilter, searchQuery }: RequestListFilters
) =>
  individualRequests.filter(
    (request) =>
      matchesStatusFilter(statusFilter, request.status) &&
      (monthFilter === 'all' || request.monthYear === monthFilter) &&
      (leaveTypeFilter === 'all' || request.requestedStatus === leaveTypeFilter) &&
      (partnerFilter === 'all' || request.partnerName === partnerFilter) &&
      matchesSearchQuery(requestSearchHaystack(request), searchQuery)
  );
