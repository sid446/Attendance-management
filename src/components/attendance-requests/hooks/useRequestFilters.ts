'use client';

import { useMemo, useState } from 'react';
import type { AttendanceRequest, RequestStatusFilter } from '../types';
import {
  buildSortedRequestRows,
  filterIndividualRequests,
  filterRangeGroups,
  groupRequestsIntoRanges,
  type RequestListFilters,
} from '../utils';

export function useRequestFilters(requests: AttendanceRequest[]) {
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  const listFilters: RequestListFilters = useMemo(
    () => ({ statusFilter, monthFilter, leaveTypeFilter }),
    [statusFilter, monthFilter, leaveTypeFilter]
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
    () => buildSortedRequestRows(filteredRangeGroups, filteredIndividualRequests),
    [filteredRangeGroups, filteredIndividualRequests]
  );

  const isEmpty = sortedRequestRows.length === 0;
  const hasActiveFilters = statusFilter !== 'all' || monthFilter !== 'all' || leaveTypeFilter !== 'all';

  return {
    statusFilter,
    setStatusFilter,
    monthFilter,
    setMonthFilter,
    leaveTypeFilter,
    setLeaveTypeFilter,
    viewMode,
    setViewMode,
    listFilters,
    filteredRangeGroups,
    filteredIndividualRequests,
    sortedRequestRows,
    isEmpty,
    hasActiveFilters,
  };
}
