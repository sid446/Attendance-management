'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Fine, TeamFineSectionProps } from '../types';

export function useTeamFineSectionLogic({ monthYear, teamMembers }: TeamFineSectionProps) {
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Staff' | 'Article'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'waived'>('all');

  const teamIdSet = useMemo(
    () => new Set(teamMembers.map((m) => String(m._id))),
    [teamMembers]
  );

  const fetchFines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/fines?monthYear=${encodeURIComponent(monthYear)}`);
      const data = await response.json();
      if (data.success) {
        setFines(Array.isArray(data.fines) ? data.fines : []);
      } else {
        setError(data.error || 'Failed to fetch fines');
      }
    } catch {
      setError('Failed to fetch fines');
    } finally {
      setLoading(false);
    }
  }, [monthYear]);

  useEffect(() => {
    if (teamMembers.length === 0) {
      setFines([]);
      return;
    }
    fetchFines();
  }, [teamMembers.length, fetchFines]);

  const teamFines = useMemo(() => {
    return fines.filter((fine) => {
      const uid = String(fine.userId?._id ?? '');
      return teamIdSet.has(uid);
    });
  }, [fines, teamIdSet]);

  const filteredFines = useMemo(() => {
    return teamFines.filter((fine) => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const code = (fine.userId?.employeeCode || fine.userId?.odId || '').toLowerCase();
        const matchName = fine.userId?.name?.toLowerCase().includes(search);
        const matchId = fine.userId?.odId?.toLowerCase().includes(search) || code.includes(search);
        if (!matchName && !matchId) return false;
      }
      if (categoryFilter !== 'all' && fine.category !== categoryFilter) return false;
      if (statusFilter !== 'all') {
        const hasMatchingStatus = fine.fineRecords.some((r) => r.status === statusFilter);
        if (!hasMatchingStatus) return false;
      }
      return true;
    });
  }, [teamFines, searchTerm, categoryFilter, statusFilter]);

  const totals = useMemo(() => {
    return filteredFines.reduce(
      (acc, fine) => ({
        totalFines: acc.totalFines + fine.totalFine,
        totalWarnings: acc.totalWarnings + fine.totalWarnings,
        employeesWithFines: acc.employeesWithFines + (fine.totalFine > 0 ? 1 : 0),
        employeesWithWarnings: acc.employeesWithWarnings + (fine.totalWarnings > 0 ? 1 : 0),
      }),
      { totalFines: 0, totalWarnings: 0, employeesWithFines: 0, employeesWithWarnings: 0 }
    );
  }, [filteredFines]);

  const toggleRow = (fineId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(fineId)) next.delete(fineId);
      else next.add(fineId);
      return next;
    });
  };

  const selectCls =
    'rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const inputCls =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const thBase = 'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

  return {
    loading,
    error,
    expandedRows,
    searchTerm,
    setSearchTerm,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    fetchFines,
    teamFines,
    filteredFines,
    totals,
    toggleRow,
    selectCls,
    inputCls,
    thBase,
  } as const;
}
