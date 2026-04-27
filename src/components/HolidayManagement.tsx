import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Trash2, Edit, X, Check, AlertCircle, RefreshCw } from 'lucide-react';

interface Holiday {
  _id: string;
  date: string;
  name: string;
  type: 'national' | 'regional' | 'company' | 'optional';
  description?: string;
  year: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface HolidayManagementProps {
  currentYear?: number;
}

const HOLIDAY_MANAGEMENT_WORKFLOW_STEPS = ['Choose year', 'Add or edit holidays', 'Toggle active status'] as const;

export const HolidayManagement: React.FC<HolidayManagementProps> = ({
  currentYear = new Date().getFullYear()
}) => {
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
  const loadHolidays = async (year: number) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/holidays?year=${year}&activeOnly=false`);
      const result = await response.json();

      if (result.success) {
        setHolidays(result.data);
      } else {
        setError(result.error || 'Failed to load holidays');
      }
    } catch (err) {
      setError('Failed to load holidays');
      console.error('Error loading holidays:', err);
    } finally {
      setLoading(false);
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
        setHolidays(prev => [...prev, result.data]);
        setNewHoliday({
          date: '',
          name: '',
          type: 'national',
          description: '',
          year: selectedYear,
        });
        setShowAddForm(false);
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
      const response = await fetch(`/api/holidays?id=${holiday._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(holiday),
      });

      const result = await response.json();

      if (result.success) {
        setHolidays(prev => prev.map(h => h._id === holiday._id ? result.data : h));
        setEditingHoliday(null);
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
      const response = await fetch(`/api/holidays?id=${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        setHolidays(prev => prev.filter(h => h._id !== id));
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

  return (
    <section className="space-y-5 p-6 text-slate-900" aria-labelledby="holiday-management-heading">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h2 id="holiday-management-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Calendar className="h-6 w-6 text-blue-600" aria-hidden />
            Holiday management
          </h2>
          <p className="max-w-2xl text-sm text-slate-600">
            Define holidays for specific years. Days with no attendance records will be marked as holidays.
          </p>
          <ol className="flex flex-wrap gap-2" aria-label="Workflow">
            {HOLIDAY_MANAGEMENT_WORKFLOW_STEPS.map((label, i) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="holiday-year" className="text-xs font-medium text-slate-700">
              Year
            </label>
            <select
              id="holiday-year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className={`${selectCls} w-28`}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add holiday
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
          {error}
        </div>
      )}

      {showAddForm && (
        <div className="rounded-xl border border-blue-200/65 bg-panel p-4 shadow-sm">
          <h3 className="mb-3 text-base font-semibold text-slate-900">Add new holiday</h3>
          <form onSubmit={handleAddHoliday} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="new-holiday-date" className="mb-1 block text-sm font-medium text-slate-700">
                  Date
                </label>
                <input
                  id="new-holiday-date"
                  type="date"
                  value={newHoliday.date}
                  onChange={(e) => setNewHoliday((prev) => ({ ...prev, date: e.target.value }))}
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label htmlFor="new-holiday-type" className="mb-1 block text-sm font-medium text-slate-700">
                  Type
                </label>
                <select
                  id="new-holiday-type"
                  value={newHoliday.type}
                  onChange={(e) =>
                    setNewHoliday((prev) => ({ ...prev, type: e.target.value as Holiday['type'] }))
                  }
                  className={selectCls}
                >
                  <option value="national">National</option>
                  <option value="regional">Regional</option>
                  <option value="company">Company</option>
                  <option value="optional">Optional</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="new-holiday-name" className="mb-1 block text-sm font-medium text-slate-700">
                Holiday name
              </label>
              <input
                id="new-holiday-name"
                type="text"
                value={newHoliday.name}
                onChange={(e) => setNewHoliday((prev) => ({ ...prev, name: e.target.value }))}
                className={inputCls}
                placeholder="e.g., Republic Day"
                required
              />
            </div>
            <div>
              <label htmlFor="new-holiday-description" className="mb-1 block text-sm font-medium text-slate-700">
                Description (optional)
              </label>
              <input
                id="new-holiday-description"
                type="text"
                value={newHoliday.description}
                onChange={(e) => setNewHoliday((prev) => ({ ...prev, description: e.target.value }))}
                className={inputCls}
                placeholder="e.g., National holiday celebrating the constitution"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                Add holiday
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12" aria-live="polite">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
            <span className="text-sm text-slate-600">Loading holidays…</span>
            <span className="sr-only">Loading holiday list</span>
          </div>
        ) : holidays.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-600">No holidays defined for {selectedYear}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className={`${thBase} text-left`} scope="col">
                    Date
                  </th>
                  <th className={`${thBase} text-left`} scope="col">
                    Holiday name
                  </th>
                  <th className={`${thBase} text-left`} scope="col">
                    Type
                  </th>
                  <th className={`${thBase} text-left`} scope="col">
                    Description
                  </th>
                  <th className={`${thBase} text-center`} scope="col">
                    Status
                  </th>
                  <th className={`${thBase} text-center`} scope="col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidays.map((holiday) => (
                  <tr key={holiday._id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 text-left font-mono text-sm text-slate-800">
                      {editingHoliday?._id === holiday._id ? (
                        <input
                          type="date"
                          value={editingHoliday.date}
                          onChange={(e) =>
                            setEditingHoliday((prev) => (prev ? { ...prev, date: e.target.value } : null))
                          }
                          className={inputCellCls}
                        />
                      ) : (
                        new Date(holiday.date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingHoliday?._id === holiday._id ? (
                        <input
                          type="text"
                          value={editingHoliday.name}
                          onChange={(e) =>
                            setEditingHoliday((prev) => (prev ? { ...prev, name: e.target.value } : null))
                          }
                          className={inputCellCls}
                        />
                      ) : (
                        <span className="font-medium text-slate-900">{holiday.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingHoliday?._id === holiday._id ? (
                        <select
                          value={editingHoliday.type}
                          onChange={(e) =>
                            setEditingHoliday((prev) =>
                              prev ? { ...prev, type: e.target.value as Holiday['type'] } : null,
                            )
                          }
                          className={inputCellCls}
                        >
                          <option value="national">National</option>
                          <option value="regional">Regional</option>
                          <option value="company">Company</option>
                          <option value="optional">Optional</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getTypePillClasses(holiday.type)}`}
                        >
                          {holiday.type.charAt(0).toUpperCase() + holiday.type.slice(1)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {editingHoliday?._id === holiday._id ? (
                        <input
                          type="text"
                          value={editingHoliday.description || ''}
                          onChange={(e) =>
                            setEditingHoliday((prev) =>
                              prev ? { ...prev, description: e.target.value } : null,
                            )
                          }
                          className={inputCellCls}
                          placeholder="Optional description"
                        />
                      ) : (
                        holiday.description || '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(holiday)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/25 ${
                          holiday.isActive
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                            : 'border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {holiday.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {editingHoliday?._id === holiday._id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => editingHoliday && handleUpdateHoliday(editingHoliday)}
                              className="rounded-md border border-emerald-200 bg-panel p-1.5 text-emerald-800 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                              title="Save"
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingHoliday(null)}
                              className="rounded-md border border-blue-200/65 bg-panel p-1.5 text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingHoliday(holiday)}
                              className="rounded-md border border-blue-200/65 bg-panel p-1.5 text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              title="Edit"
                            >
                              <Edit className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteHoliday(holiday._id)}
                              className="rounded-md border border-red-200 bg-panel p-1.5 text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/25"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};