"use client";
import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Trash2,
  Edit,
  X,
  Check,
  AlertCircle,
  Users,
  Search,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

interface ClientPlace {
  _id: string;
  name: string;
  address: string;
  googleMapsLink: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  radiusMeters: number;
  assignedEmployees: Array<{
    _id: string;
    name: string;
    email: string;
    employeeCode?: string;
  }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface User {
  _id: string;
  name: string;
  email: string;
  employeeCode?: string;
}

interface ClientPlaceManagementProps {
  allUsers?: User[];
}

const CLIENT_PLACE_WORKFLOW_STEPS = ['Add a place with Maps link', 'Assign employees', 'Deactivate when no longer needed'] as const;

export const ClientPlaceManagement: React.FC<ClientPlaceManagementProps> = ({ allUsers = [] }) => {
  const [clientPlaces, setClientPlaces] = useState<ClientPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlace, setEditingPlace] = useState<ClientPlace | null>(null);
  const [assigningPlace, setAssigningPlace] = useState<ClientPlace | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [newPlace, setNewPlace] = useState({
    name: '',
    address: '',
    googleMapsLink: '',
    radiusMeters: 500
  });

  // Load client places
  const loadClientPlaces = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/client-places?includeInactive=true');
      const result = await response.json();

      if (result.success) {
        setClientPlaces(result.data);
      } else {
        setError(result.error || 'Failed to load client places');
      }
    } catch (err) {
      setError('Failed to load client places');
      console.error('Error loading client places:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClientPlaces();
  }, []);

  // Handle adding new client place
  const handleAddPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const response = await fetch('/api/client-places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlace)
      });

      const result = await response.json();

      if (result.success) {
        setClientPlaces(prev => [result.data, ...prev]);
        setNewPlace({ name: '', address: '', googleMapsLink: '', radiusMeters: 500 });
        setShowAddForm(false);
      } else {
        setError(result.error || 'Failed to add client place');
      }
    } catch (err) {
      setError('Failed to add client place');
      console.error('Error adding client place:', err);
    }
  };

  // Handle updating client place
  const handleUpdatePlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlace) return;

    try {
      setError(null);
      const response = await fetch('/api/client-places', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPlace._id,
          name: editingPlace.name,
          address: editingPlace.address,
          googleMapsLink: editingPlace.googleMapsLink,
          radiusMeters: editingPlace.radiusMeters
        })
      });

      const result = await response.json();

      if (result.success) {
        setClientPlaces(prev => prev.map(p => p._id === editingPlace._id ? result.data : p));
        setEditingPlace(null);
      } else {
        setError(result.error || 'Failed to update client place');
      }
    } catch (err) {
      setError('Failed to update client place');
      console.error('Error updating client place:', err);
    }
  };

  // Handle deleting (deactivating) client place
  const handleDeletePlace = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this client place?')) return;

    try {
      setError(null);
      const response = await fetch(`/api/client-places?id=${id}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        setClientPlaces(prev => prev.map(p => p._id === id ? { ...p, isActive: false } : p));
      } else {
        setError(result.error || 'Failed to delete client place');
      }
    } catch (err) {
      setError('Failed to delete client place');
      console.error('Error deleting client place:', err);
    }
  };

  // Handle reactivating client place
  const handleReactivatePlace = async (id: string) => {
    try {
      setError(null);
      const response = await fetch('/api/client-places', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: true })
      });

      const result = await response.json();

      if (result.success) {
        setClientPlaces(prev => prev.map(p => p._id === id ? result.data : p));
      } else {
        setError(result.error || 'Failed to reactivate client place');
      }
    } catch (err) {
      setError('Failed to reactivate client place');
      console.error('Error reactivating client place:', err);
    }
  };

  // Handle assigning employees
  const handleAssignEmployee = async (employeeId: string) => {
    if (!assigningPlace) return;

    const isAlreadyAssigned = assigningPlace.assignedEmployees.some(e => e._id === employeeId);
    const newAssignedIds = isAlreadyAssigned
      ? assigningPlace.assignedEmployees.filter(e => e._id !== employeeId).map(e => e._id)
      : [...assigningPlace.assignedEmployees.map(e => e._id), employeeId];

    try {
      setError(null);
      const response = await fetch('/api/client-places', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: assigningPlace._id,
          assignedEmployees: newAssignedIds
        })
      });

      const result = await response.json();

      if (result.success) {
        setClientPlaces(prev => prev.map(p => p._id === assigningPlace._id ? result.data : p));
        setAssigningPlace(result.data);
      } else {
        setError(result.error || 'Failed to update employee assignment');
      }
    } catch (err) {
      setError('Failed to update employee assignment');
      console.error('Error updating employee assignment:', err);
    }
  };

  const handlePermanentDeletePlace = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this client place? This action cannot be undone.')) return;
    try {
      setError(null);
      const response = await fetch(`/api/client-places?id=${id}&permanent=true`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        setClientPlaces((prev) => prev.filter((p) => p._id !== id));
      } else {
        setError(result.error || 'Failed to permanently delete client place');
      }
    } catch (err) {
      setError('Failed to permanently delete client place');
      console.error('Error permanently deleting client place:', err);
    }
  };

  // Filter employees for search
  const filteredEmployees = allUsers.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.employeeCode && user.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const inputCls =
    'w-full rounded-lg border border-blue-200/65 bg-panel px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  return (
    <section className="space-y-5 p-6 text-slate-900" aria-labelledby="client-place-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 id="client-place-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <MapPin className="h-6 w-6 text-blue-600" aria-hidden />
            Client place management
          </h2>
          <p className="max-w-2xl text-sm text-slate-600">
            Manage client locations and assign employees for GPS-based attendance.
          </p>
          <ol className="flex flex-wrap gap-2" aria-label="Workflow">
            {CLIENT_PLACE_WORKFLOW_STEPS.map((label, i) => (
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
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add client place
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 shadow-sm"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 rounded-lg p-1.5 text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500/25"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {showAddForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddForm(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="font-semibold text-slate-900">Add new client place</h3>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <form onSubmit={handleAddPlace} className="space-y-4 overflow-y-auto p-6">
              <div className="space-y-2">
                <label htmlFor="new-place-name" className="text-sm font-medium text-slate-700">
                  Client / place name <span className="text-red-600">*</span>
                </label>
                <input
                  id="new-place-name"
                  type="text"
                  value={newPlace.name}
                  onChange={(e) => setNewPlace((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., ABC Corporation office"
                  className={inputCls}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="new-place-maps" className="text-sm font-medium text-slate-700">
                  Google Maps link <span className="text-red-600">*</span>
                </label>
                <input
                  id="new-place-maps"
                  type="url"
                  value={newPlace.googleMapsLink}
                  onChange={(e) => setNewPlace((prev) => ({ ...prev, googleMapsLink: e.target.value }))}
                  placeholder="Paste Google Maps link…"
                  className={inputCls}
                  required
                />
                <p className="text-xs text-slate-600">Coordinates are extracted automatically from the link.</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="new-place-address" className="text-sm font-medium text-slate-700">
                  Address (optional)
                </label>
                <input
                  id="new-place-address"
                  type="text"
                  value={newPlace.address}
                  onChange={(e) => setNewPlace((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="Full address…"
                  className={inputCls}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="new-place-radius" className="text-sm font-medium text-slate-700">
                  Allowed radius (meters)
                </label>
                <input
                  id="new-place-radius"
                  type="number"
                  value={newPlace.radiusMeters}
                  onChange={(e) => setNewPlace((prev) => ({ ...prev, radiusMeters: parseInt(e.target.value, 10) || 500 }))}
                  min={50}
                  max={5000}
                  className={inputCls}
                />
                <p className="text-xs text-slate-600">
                  Employees must be within this radius to mark attendance (default 500 m).
                </p>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="rounded-lg border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Add client place
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingPlace && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingPlace(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="font-semibold text-slate-900">Edit client place</h3>
              <button
                type="button"
                onClick={() => setEditingPlace(null)}
                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <form onSubmit={handleUpdatePlace} className="space-y-4 overflow-y-auto p-6">
              <div className="space-y-2">
                <label htmlFor="edit-place-name" className="text-sm font-medium text-slate-700">
                  Client / place name <span className="text-red-600">*</span>
                </label>
                <input
                  id="edit-place-name"
                  type="text"
                  value={editingPlace.name}
                  onChange={(e) => setEditingPlace((prev) => (prev ? { ...prev, name: e.target.value } : null))}
                  className={inputCls}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-place-maps" className="text-sm font-medium text-slate-700">
                  Google Maps link
                </label>
                <input
                  id="edit-place-maps"
                  type="url"
                  value={editingPlace.googleMapsLink}
                  onChange={(e) =>
                    setEditingPlace((prev) => (prev ? { ...prev, googleMapsLink: e.target.value } : null))
                  }
                  className={inputCls}
                />
                <p className="text-xs text-slate-600">
                  Current coordinates: {editingPlace.coordinates.lat.toFixed(6)}, {editingPlace.coordinates.lng.toFixed(6)}
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-place-address" className="text-sm font-medium text-slate-700">
                  Address
                </label>
                <input
                  id="edit-place-address"
                  type="text"
                  value={editingPlace.address}
                  onChange={(e) => setEditingPlace((prev) => (prev ? { ...prev, address: e.target.value } : null))}
                  className={inputCls}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-place-radius" className="text-sm font-medium text-slate-700">
                  Allowed radius (meters)
                </label>
                <input
                  id="edit-place-radius"
                  type="number"
                  value={editingPlace.radiusMeters}
                  onChange={(e) =>
                    setEditingPlace((prev) =>
                      prev ? { ...prev, radiusMeters: parseInt(e.target.value, 10) || 500 } : null,
                    )
                  }
                  min={50}
                  max={5000}
                  className={inputCls}
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingPlace(null)}
                  className="rounded-lg border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assigningPlace && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setAssigningPlace(null);
              setSearchTerm('');
            }
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <h3 className="font-semibold text-slate-900">Assign employees</h3>
                <p className="text-sm text-slate-600">{assigningPlace.name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAssigningPlace(null);
                  setSearchTerm('');
                }}
                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="shrink-0 border-b border-slate-200 p-4">
              <label htmlFor="assign-employee-search" className="sr-only">
                Search employees
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="assign-employee-search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, email, or code…"
                  className={`${inputCls} pl-10`}
                />
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {assigningPlace.assignedEmployees.length > 0 && (
                <div className="mb-4">
                  <h4 className="mb-2 text-sm font-semibold text-emerald-800">
                    Currently assigned ({assigningPlace.assignedEmployees.length})
                  </h4>
                  <p className="mb-2 text-xs text-slate-600">Tap to remove from this place.</p>
                  <div className="space-y-1">
                    {assigningPlace.assignedEmployees.map((emp) => (
                      <button
                        key={emp._id}
                        type="button"
                        onClick={() => handleAssignEmployee(emp._id)}
                        className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/80 p-2.5 text-left transition-colors hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                      >
                        <div>
                          <span className="font-medium text-slate-900">{emp.name}</span>
                          {emp.employeeCode && (
                            <span className="ml-2 text-xs text-slate-600">({emp.employeeCode})</span>
                          )}
                        </div>
                        <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <h4 className="mb-2 text-sm font-semibold text-slate-800">Available employees</h4>
              {filteredEmployees.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-600">No employees found.</p>
              ) : (
                <div className="space-y-1">
                  {filteredEmployees
                    .filter((emp) => !assigningPlace.assignedEmployees.some((a) => a._id === emp._id))
                    .map((emp) => (
                      <button
                        key={emp._id}
                        type="button"
                        onClick={() => handleAssignEmployee(emp._id)}
                        className="flex w-full items-center justify-between rounded-lg border border-blue-200/65 bg-panel p-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <div>
                          <span className="font-medium text-slate-900">{emp.name}</span>
                          {emp.employeeCode && (
                            <span className="ml-2 text-xs text-slate-600">({emp.employeeCode})</span>
                          )}
                        </div>
                        <Plus className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={() => {
                  setAssigningPlace(null);
                  setSearchTerm('');
                }}
                className="w-full rounded-lg border border-blue-200/65 bg-panel px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12" aria-live="polite">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
          <span className="text-sm text-slate-600">Loading client places…</span>
          <span className="sr-only">Loading places list</span>
        </div>
      ) : clientPlaces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-12 text-center">
          <MapPin className="mx-auto mb-3 h-12 w-12 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-800">No client places yet</p>
          <p className="mt-1 text-sm text-slate-600">Use “Add client place” to create your first location.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clientPlaces.map((place) => (
            <article
              key={place._id}
              className={`flex flex-col overflow-hidden rounded-xl border bg-panel shadow-sm transition-opacity ${
                place.isActive ? 'border-blue-200/65' : 'border-rose-200 opacity-90'
              }`}
            >
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-slate-900">{place.name}</h3>
                    <p className="truncate text-sm text-slate-600">{place.address || '—'}</p>
                  </div>
                  {!place.isActive && (
                    <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-800">
                      Inactive
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
                    <span className="font-mono">
                      {place.coordinates.lat.toFixed(4)}, {place.coordinates.lng.toFixed(4)}
                    </span>
                  </div>
                  <div>Radius: {place.radiusMeters} m</div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-500" aria-hidden />
                  <span className="text-sm text-slate-600">
                    {place.assignedEmployees.length} employee{place.assignedEmployees.length !== 1 ? 's' : ''}{' '}
                    assigned
                  </span>
                </div>

                {place.assignedEmployees.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {place.assignedEmployees.slice(0, 3).map((emp) => (
                      <span
                        key={emp._id}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-800"
                      >
                        {emp.name.split(' ')[0]}
                      </span>
                    ))}
                    {place.assignedEmployees.length > 3 && (
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        +{place.assignedEmployees.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 p-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingPlace(place)}
                    className="rounded-lg border border-transparent p-1.5 text-slate-600 transition-colors hover:border-blue-200/70 hover:bg-panel focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssigningPlace(place)}
                    className="rounded-lg border border-transparent p-1.5 text-slate-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                    title="Assign employees"
                  >
                    <Users className="h-4 w-4" aria-hidden />
                  </button>
                  <a
                    href={place.googleMapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-transparent p-1.5 text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    title="Open in Google Maps"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                </div>

                {place.isActive ? (
                  <button
                    type="button"
                    onClick={() => handleDeletePlace(place._id)}
                    className="rounded-lg border border-transparent p-1.5 text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/25"
                    title="Deactivate"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                ) : (
                  <div className="flex flex-wrap justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleReactivatePlace(place._id)}
                      className="rounded-lg border border-emerald-200 bg-panel px-2 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                    >
                      Reactivate
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePermanentDeletePlace(place._id)}
                      className="rounded-lg border border-red-200 bg-panel px-2 py-1 text-xs font-medium text-red-800 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/25"
                      title="Permanently delete"
                    >
                      Delete permanently
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default ClientPlaceManagement;
