'use client';

import { useCallback, useMemo, useState } from 'react';
import type { AttendanceRequest, RequestSortOption, RequestStatusFilter } from '../types';
import {
  buildSortedRequestRows,
  filterIndividualRequests,
  filterRangeGroups,
  groupRequestsIntoRanges,
  type RequestListFilters,
} from '../utils';

const DEFAULT_SORT: RequestSortOption = 'date_desc';

export function useRequestFilters(requests: AttendanceRequest[]) {
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<RequestSortOption>(DEFAULT_SORT);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  const listFilters: RequestListFilters = useMemo(
    () => ({ statusFilter, monthFilter, leaveTypeFilter, partnerFilter, searchQuery }),
    [statusFilter, monthFilter, leaveTypeFilter, partnerFilter, searchQuery]
  );

  const { rangeGroups, individualRequests } = useMemo(
    () => groupRequestsIntoRanges(requests),
    [requests]
  );

  const filteredRangeGroups = useMemo(
    () => filterRangeGroups(rangeGroups, listFilters),
    [rangeGroups, listFilters]
  );

  const filteredIndividualRequests = useMemo(
    () => filterIndividualRequests(individualRequests, listFilters),
    [individualRequests, listFilters]
  );

  const sortedRequestRows = useMemo(
    () => buildSortedRequestRows(filteredRangeGroups, filteredIndividualRequests, sortBy),
    [filteredRangeGroups, filteredIndividualRequests, sortBy]
  );

  const totalRowCount = useMemo(
    () => rangeGroups.length + individualRequests.length,
    [rangeGroups.length, individualRequests.length]
  );

  const isEmpty = sortedRequestRows.length === 0;
  const hasActiveFilters =
    statusFilter !== 'all' ||
    monthFilter !== 'all' ||
    leaveTypeFilter !== 'all' ||
    partnerFilter !== 'all' ||
    searchQuery.trim() !== '' ||
    sortBy !== DEFAULT_SORT;

  const clearFilters = useCallback(() => {
    setStatusFilter('all');
    setMonthFilter('all');
    setLeaveTypeFilter('all');
    setPartnerFilter('all');
    setSearchQuery('');
    setSortBy(DEFAULT_SORT);
  }, []);

  const uniquePartners = useMemo(
    () =>
      Array.from(new Set(requests.map((r) => r.partnerName).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [requests]
  );

  return {
    statusFilter,
    setStatusFilter,
    monthFilter,
    setMonthFilter,
    leaveTypeFilter,
    setLeaveTypeFilter,
    partnerFilter,
    setPartnerFilter,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    listFilters,
    filteredRangeGroups,
    filteredIndividualRequests,
    sortedRequestRows,
    totalRowCount,
    filteredCount: sortedRequestRows.length,
    isEmpty,
    hasActiveFilters,
    clearFilters,
    uniquePartners,
  };
}
