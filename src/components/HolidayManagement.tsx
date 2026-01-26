import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Trash2, Edit, X, Check, AlertCircle } from 'lucide-react';

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

export const HolidayManagement: React.FC<HolidayManagementProps> = ({
  currentYear = new Date().getFullYear()
}) => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);

  const [newHoliday, setNewHoliday] = useState({
    date: '',
    name: '',
    type: 'national' as const,
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

  // Get type color
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'national': return 'text-red-400 bg-red-400/10';
      case 'regional': return 'text-blue-400 bg-blue-400/10';
      case 'company': return 'text-green-400 bg-green-400/10';
      case 'optional': return 'text-yellow-400 bg-yellow-400/10';
      default: return 'text-slate-400 bg-slate-400/10';
    }
  };

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-50 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Holiday Management
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Define holidays for specific years. Days with no attendance records will be marked as holidays.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-100 w-24"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-emerald-500 text-slate-950 font-medium rounded-md hover:bg-emerald-400 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Holiday
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Add Holiday Form */}
      {showAddForm && (
        <div className="border border-slate-700 rounded-lg p-4 bg-slate-800/50">
          <h3 className="text-sm font-medium text-slate-200 mb-3">Add New Holiday</h3>
          <form onSubmit={handleAddHoliday} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Date</label>
                <input
                  type="date"
                  value={newHoliday.date}
                  onChange={(e) => setNewHoliday(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Type</label>
                <select
                  value={newHoliday.type}
                  onChange={(e) => setNewHoliday(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="national">National</option>
                  <option value="regional">Regional</option>
                  <option value="company">Company</option>
                  <option value="optional">Optional</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Holiday Name</label>
              <input
                type="text"
                value={newHoliday.name}
                onChange={(e) => setNewHoliday(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
                placeholder="e.g., Republic Day"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
              <input
                type="text"
                value={newHoliday.description}
                onChange={(e) => setNewHoliday(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
                placeholder="e.g., National holiday celebrating the constitution"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-500 text-slate-950 font-medium rounded-md hover:bg-emerald-400 transition-colors"
              >
                Add Holiday
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-slate-700 text-slate-200 font-medium rounded-md hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Holidays List */}
      <div className="border border-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">
            Loading holidays...
          </div>
        ) : holidays.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No holidays defined for {selectedYear}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-400">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-400">Holiday Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-400">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-400">Description</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-400">Status</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {holidays.map((holiday) => (
                  <tr key={holiday._id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-left font-mono text-slate-300">
                      {editingHoliday?._id === holiday._id ? (
                        <input
                          type="date"
                          value={editingHoliday.date}
                          onChange={(e) => setEditingHoliday(prev => prev ? { ...prev, date: e.target.value } : null)}
                          className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200"
                        />
                      ) : (
                        new Date(holiday.date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingHoliday?._id === holiday._id ? (
                        <input
                          type="text"
                          value={editingHoliday.name}
                          onChange={(e) => setEditingHoliday(prev => prev ? { ...prev, name: e.target.value } : null)}
                          className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200"
                        />
                      ) : (
                        <span className="text-slate-200">{holiday.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingHoliday?._id === holiday._id ? (
                        <select
                          value={editingHoliday.type}
                          onChange={(e) => setEditingHoliday(prev => prev ? { ...prev, type: e.target.value as any } : null)}
                          className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200"
                        >
                          <option value="national">National</option>
                          <option value="regional">Regional</option>
                          <option value="company">Company</option>
                          <option value="optional">Optional</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(holiday.type)}`}>
                          {holiday.type.charAt(0).toUpperCase() + holiday.type.slice(1)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {editingHoliday?._id === holiday._id ? (
                        <input
                          type="text"
                          value={editingHoliday.description || ''}
                          onChange={(e) => setEditingHoliday(prev => prev ? { ...prev, description: e.target.value } : null)}
                          className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200"
                          placeholder="Optional description"
                        />
                      ) : (
                        holiday.description || '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(holiday)}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          holiday.isActive
                            ? 'text-emerald-400 bg-emerald-400/10'
                            : 'text-slate-500 bg-slate-500/10'
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
                              onClick={() => editingHoliday && handleUpdateHoliday(editingHoliday)}
                              className="p-1 text-emerald-400 hover:text-emerald-300"
                              title="Save"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setEditingHoliday(null)}
                              className="p-1 text-slate-400 hover:text-slate-300"
                              title="Cancel"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingHoliday(holiday)}
                              className="p-1 text-slate-400 hover:text-slate-300"
                              title="Edit"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteHoliday(holiday._id)}
                              className="p-1 text-rose-400 hover:text-rose-300"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
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