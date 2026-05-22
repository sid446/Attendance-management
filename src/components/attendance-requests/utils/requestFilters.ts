import type { AttendanceRequest, DateRangeGroup, RequestStatusFilter } from '../types';

export const matchesStatusFilter = (filter: RequestStatusFilter, status: string) =>
  filter === 'all' || status === filter || (filter === 'Pending' && status === 'PendingHr');

export interface RequestListFilters {
  statusFilter: RequestStatusFilter;
  monthFilter: string;
  leaveTypeFilter: string;
}

export const filterRangeGroups = (
  rangeGroups: DateRangeGroup[],
  { statusFilter, monthFilter, leaveTypeFilter }: RequestListFilters
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
      (leaveTypeFilter === 'all' || group.requestedStatus === leaveTypeFilter)
  );

export const filterIndividualRequests = (
  individualRequests: AttendanceRequest[],
  { statusFilter, monthFilter, leaveTypeFilter }: RequestListFilters
) =>
  individualRequests.filter(
    (request) =>
      matchesStatusFilter(statusFilter, request.status) &&
      (monthFilter === 'all' || request.monthYear === monthFilter) &&
      (leaveTypeFilter === 'all' || request.requestedStatus === leaveTypeFilter)
  );
