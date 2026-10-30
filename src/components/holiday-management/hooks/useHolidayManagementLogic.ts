import React, { useState, useEffect } from 'react';
import type { Holiday, HolidayManagementProps } from '../types';

export function useHolidayManagementLogic({ currentYear = new Date().getFullYear() }: HolidayManagementProps) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);

  const [newHoliday, setNewHoliday] = useState<{
    date: string;
    name: string;
    type: Holiday['type'];
    description: string;
    year: number;
  }>({
    date: '',
    name: '',
    type: 'national',
    description: '',
    year: selectedYear,
  });

  // Load holidays for selected year
  const loadHolidays = async (year: number, silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const response = await fetch(`/api/holidays?year=${year}&activeOnly=false`);
      const result = await response.json();

      if (result.success) {
        setHolidays(Array.isArray(result.data) ? result.data : []);
      } else if (!silent) {
        setError(result.error || 'Failed to load holidays');
      }
    } catch (err) {
      if (!silent) {
        setError('Failed to load holidays');
      }
      console.error('Error loading holidays:', err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadHolidays(selectedYear);
  }, [selectedYear]);

  // Handle adding new holiday
  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const response = await fetch('/api/holidays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newHoliday,
          year: selectedYear,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setNewHoliday({
          date: '',
          name: '',
          type: 'national',
          description: '',
          year: selectedYear,
        });
        setShowAddForm(false);
        await loadHolidays(selectedYear, true);
      } else {
        setError(result.error || 'Failed to add holiday');
      }
    } catch (err) {
      setError('Failed to add holiday');
      console.error('Error adding holiday:', err);
    }
  };

  // Handle updating holiday
  const handleUpdateHoliday = async (holiday: Holiday) => {
    try {
      setError(null);
      const calendarYear =
        /^(\d{4})-\d{2}-\d{2}$/.test(holiday.date)
          ? parseInt(holiday.date.slice(0, 4), 10)
          : holiday.year;
      const payload = { ...holiday, year: calendarYear };

      const response = await fetch(`/api/holidays?id=${encodeURIComponent(String(holiday._id))}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setEditingHoliday(null);
        await loadHolidays(selectedYear, true);
      } else {
        setError(result.error || 'Failed to update holiday');
      }
    } catch (err) {
      setError('Failed to update holiday');
      console.error('Error updating holiday:', err);
    }
  };

  // Handle deleting holiday
  const handleDeleteHoliday = async (id: string) => {
    if (!confirm('Are you sure you want to delete this holiday?')) return;

    try {
      setError(null);
      const response = await fetch(`/api/holidays?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        await loadHolidays(selectedYear, true);
      } else {
        setError(result.error || 'Failed to delete holiday');
      }
    } catch (err) {
      setError('Failed to delete holiday');
      console.error('Error deleting holiday:', err);
    }
  };

  // Handle toggling holiday active status
  const handleToggleActive = async (holiday: Holiday) => {
    await handleUpdateHoliday({ ...holiday, isActive: !holiday.isActive });
  };

  // Generate year options
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 2 + i);

  const getTypePillClasses = (type: string) => {
    switch (type) {
      case 'national':
        return 'border border-red-200 bg-red-50 text-red-900';
      case 'regional':
        return 'border border-blue-200 bg-blue-50 text-blue-900';
      case 'company':
        return 'border border-emerald-200 bg-emerald-50 text-emerald-900';
      case 'optional':
        return 'border border-amber-200 bg-amber-50 text-amber-900';
      default:
        return 'border border-slate-200 bg-slate-50 text-slate-700';
    }
  };

  const selectCls =
    'rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const inputCls =
    'w-full rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const inputCellCls =
    'w-full rounded-md border border-blue-200/65 bg-panel px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const thBase = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600';

  return {
    holidays,
    loading,
    error,
    selectedYear,
    setSelectedYear,
    showAddForm,
    setShowAddForm,
    editingHoliday,
    setEditingHoliday,
    newHoliday,
    setNewHoliday,
    handleAddHoliday,
    handleUpdateHoliday,
    handleDeleteHoliday,
    handleToggleActive,
    yearOptions,
    getTypePillClasses,
    selectCls,
    inputCls,
    inputCellCls,
    thBase,
  } as const;
}
