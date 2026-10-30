'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EmployeeFineDoc, EmployeeFineSectionProps } from '../types';
import { fetchOwnFine, recordTotals } from '../utils/employeeFineUtils';

export function useEmployeeFineSectionLogic({ monthYear, userCategory }: Pick<EmployeeFineSectionProps, 'monthYear' | 'userCategory'>) {
  const [fine, setFine] = useState<EmployeeFineDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'waived'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const doc = await fetchOwnFine(monthYear);
      setFine(doc);
    } catch (err) {
      setFine(null);
      setError(err instanceof Error ? err.message : 'Failed to fetch fines');
    } finally {
      setLoading(false);
    }
  }, [monthYear]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => recordTotals(fine), [fine]);

  const filteredRecords = useMemo(() => {
    const records = fine?.fineRecords ?? [];
    if (statusFilter === 'all') return records;
    return records.filter((r) => r.status === statusFilter);
  }, [fine, statusFilter]);

  const category = fine?.category || (userCategory === 'Article' ? 'Article' : 'Staff');
  const selectCls =
    'rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  return {
    loading,
    error,
    statusFilter,
    setStatusFilter,
    load,
    totals,
    filteredRecords,
    category,
    selectCls,
  } as const;
}
