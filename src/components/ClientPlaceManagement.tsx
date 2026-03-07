"use client";
import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, Edit, X, Check, AlertCircle, Users, Search, ExternalLink } from 'lucide-react';

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

  // Filter employees for search
  const filteredEmployees = allUsers.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.employeeCode && user.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-400" />
            Client Place Management
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Manage client locations and assign employees for GPS-based attendance
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Client Place
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-900/20 border border-rose-500/30 rounded-lg text-rose-200">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="font-semibold text-white">Add New Client Place</h3>
              <button onClick={() => setShowAddForm(false)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddPlace} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Client/Place Name *</label>
                <input
                  type="text"
                  value={newPlace.name}
                  onChange={(e) => setNewPlace(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., ABC Corporation Office"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Google Maps Link *</label>
                <input
                  type="url"
                  value={newPlace.googleMapsLink}
                  onChange={(e) => setNewPlace(prev => ({ ...prev, googleMapsLink: e.target.value }))}
                  placeholder="Paste Google Maps link here..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                  required
                />
                <p className="text-xs text-slate-500">
                  Coordinates will be extracted automatically from the link
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Address (Optional)</label>
                <input
                  type="text"
                  value={newPlace.address}
                  onChange={(e) => setNewPlace(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Full address..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Allowed Radius (meters)</label>
                <input
                  type="number"
                  value={newPlace.radiusMeters}
                  onChange={(e) => setNewPlace(prev => ({ ...prev, radiusMeters: parseInt(e.target.value) || 500 }))}
                  min="50"
                  max="5000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                />
                <p className="text-xs text-slate-500">
                  Employees must be within this radius to mark attendance (default: 500m)
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Add Client Place
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Form Modal */}
      {editingPlace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="font-semibold text-white">Edit Client Place</h3>
              <button onClick={() => setEditingPlace(null)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdatePlace} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Client/Place Name *</label>
                <input
                  type="text"
                  value={editingPlace.name}
                  onChange={(e) => setEditingPlace(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Google Maps Link</label>
                <input
                  type="url"
                  value={editingPlace.googleMapsLink}
                  onChange={(e) => setEditingPlace(prev => prev ? { ...prev, googleMapsLink: e.target.value } : null)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                />
                <p className="text-xs text-slate-500">
                  Current coordinates: {editingPlace.coordinates.lat.toFixed(6)}, {editingPlace.coordinates.lng.toFixed(6)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Address</label>
                <input
                  type="text"
                  value={editingPlace.address}
                  onChange={(e) => setEditingPlace(prev => prev ? { ...prev, address: e.target.value } : null)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Allowed Radius (meters)</label>
                <input
                  type="number"
                  value={editingPlace.radiusMeters}
                  onChange={(e) => setEditingPlace(prev => prev ? { ...prev, radiusMeters: parseInt(e.target.value) || 500 } : null)}
                  min="50"
                  max="5000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingPlace(null)}
                  className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employee Assignment Modal */}
      {assigningPlace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
              <div>
                <h3 className="font-semibold text-white">Assign Employees</h3>
                <p className="text-sm text-slate-400">{assigningPlace.name}</p>
              </div>
              <button onClick={() => { setAssigningPlace(null); setSearchTerm(''); }} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-800 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search employees by name, email, or code..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* Currently Assigned */}
              {assigningPlace.assignedEmployees.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-emerald-400 mb-2">Currently Assigned ({assigningPlace.assignedEmployees.length})</h4>
                  <div className="space-y-1">
                    {assigningPlace.assignedEmployees.map(emp => (
                      <div
                        key={emp._id}
                        onClick={() => handleAssignEmployee(emp._id)}
                        className="flex items-center justify-between p-2 bg-emerald-900/20 border border-emerald-500/30 rounded-lg cursor-pointer hover:bg-emerald-900/40 transition-colors"
                      >
                        <div>
                          <span className="text-slate-200">{emp.name}</span>
                          {emp.employeeCode && (
                            <span className="ml-2 text-xs text-slate-500">({emp.employeeCode})</span>
                          )}
                        </div>
                        <Check className="w-4 h-4 text-emerald-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Employees */}
              <h4 className="text-sm font-medium text-slate-400 mb-2">Available Employees</h4>
              {filteredEmployees.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No employees found</p>
              ) : (
                <div className="space-y-1">
                  {filteredEmployees
                    .filter(emp => !assigningPlace.assignedEmployees.some(a => a._id === emp._id))
                    .map(emp => (
                      <div
                        key={emp._id}
                        onClick={() => handleAssignEmployee(emp._id)}
                        className="flex items-center justify-between p-2 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors"
                      >
                        <div>
                          <span className="text-slate-200">{emp.name}</span>
                          {emp.employeeCode && (
                            <span className="ml-2 text-xs text-slate-500">({emp.employeeCode})</span>
                          )}
                        </div>
                        <Plus className="w-4 h-4 text-slate-500" />
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 shrink-0">
              <button
                onClick={() => { setAssigningPlace(null); setSearchTerm(''); }}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Places List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading client places...</div>
      ) : clientPlaces.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No client places added yet</p>
          <p className="text-sm mt-1">Click "Add Client Place" to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clientPlaces.map(place => (
            <div
              key={place._id}
              className={`bg-slate-900 border rounded-xl overflow-hidden ${
                place.isActive ? 'border-slate-700' : 'border-rose-900/50 opacity-60'
              }`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{place.name}</h3>
                    <p className="text-sm text-slate-400 truncate">{place.address}</p>
                  </div>
                  {!place.isActive && (
                    <span className="text-xs bg-rose-900/50 text-rose-300 px-2 py-0.5 rounded">Inactive</span>
                  )}
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{place.coordinates.lat.toFixed(4)}, {place.coordinates.lng.toFixed(4)}</span>
                  </div>
                  <div>Radius: {place.radiusMeters}m</div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-400">
                    {place.assignedEmployees.length} employee{place.assignedEmployees.length !== 1 ? 's' : ''} assigned
                  </span>
                </div>

                {place.assignedEmployees.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {place.assignedEmployees.slice(0, 3).map(emp => (
                      <span key={emp._id} className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                        {emp.name.split(' ')[0]}
                      </span>
                    ))}
                    {place.assignedEmployees.length > 3 && (
                      <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                        +{place.assignedEmployees.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 p-2 flex items-center justify-between bg-slate-950/50">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingPlace(place)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setAssigningPlace(place)}
                    className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                    title="Assign Employees"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                  <a
                    href={place.googleMapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"
                    title="Open in Google Maps"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                {place.isActive ? (
                  <button
                    onClick={() => handleDeletePlace(place._id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                    title="Deactivate"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleReactivatePlace(place._id)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                  >
                    Reactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientPlaceManagement;
