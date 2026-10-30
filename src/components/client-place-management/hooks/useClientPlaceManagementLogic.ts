"use client";

import React, { useState, useEffect } from 'react';
import { formatCoordinate } from '@/lib/geoDistance';
import type { ClientPlace, LocationInputMode, ClientPlaceManagementProps } from '../types';
import { EMPTY_NEW_PLACE } from '../constants';

export function useClientPlaceManagementLogic({ allUsers = [] }: ClientPlaceManagementProps) {
  const [clientPlaces, setClientPlaces] = useState<ClientPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlace, setEditingPlace] = useState<ClientPlace | null>(null);
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [assigningPlace, setAssigningPlace] = useState<ClientPlace | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [addMode, setAddMode] = useState<LocationInputMode>('coordinates');
  const [editMode, setEditMode] = useState<LocationInputMode>('coordinates');
  const [assignTeamName, setAssignTeamName] = useState('');
  type AssignConfirm =
    | { kind: 'all' }
    | { kind: 'team'; team: string }
    | { kind: 'remove-all' }
    | { kind: 'remove-team'; team: string };
  const [assignConfirm, setAssignConfirm] = useState<AssignConfirm | null>(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const [newPlace, setNewPlace] = useState(EMPTY_NEW_PLACE);

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

      const payload: Record<string, unknown> = {
        name: newPlace.name,
        address: newPlace.address,
        radiusMeters: newPlace.radiusMeters,
      };

      if (addMode === 'coordinates') {
        const lat = parseFloat(newPlace.lat.trim());
        const lng = parseFloat(newPlace.lng.trim());
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setError('Enter valid latitude and longitude numbers.');
          return;
        }
        payload.coordinates = { lat, lng };
        if (newPlace.googleMapsLink.trim()) {
          payload.googleMapsLink = newPlace.googleMapsLink.trim();
        }
      } else {
        if (!newPlace.googleMapsLink.trim()) {
          setError('Paste a Google Maps link, or switch to Enter coordinates.');
          return;
        }
        payload.googleMapsLink = newPlace.googleMapsLink.trim();
      }

      const response = await fetch('/api/client-places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setClientPlaces((prev) => [result.data, ...prev]);
        setNewPlace(EMPTY_NEW_PLACE);
        setAddMode('coordinates');
        setShowAddForm(false);
        setAssigningPlace(result.data);
        setSearchTerm('');
        setAssignTeamName('');
      } else {
        setError(result.error || 'Failed to add client place');
      }
    } catch (err) {
      setError('Failed to add client place');
      console.error('Error adding client place:', err);
    }
  };

  const openEditPlace = (place: ClientPlace) => {
    setEditingPlace(place);
    setEditLat(formatCoordinate(place.coordinates.lat));
    setEditLng(formatCoordinate(place.coordinates.lng));
    setEditMode('coordinates');
  };

  // Handle updating client place
  const handleUpdatePlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlace) return;

    try {
      setError(null);

      const payload: Record<string, unknown> = {
        id: editingPlace._id,
        name: editingPlace.name,
        address: editingPlace.address,
        radiusMeters: editingPlace.radiusMeters,
        googleMapsLink: editingPlace.googleMapsLink || '',
      };

      if (editMode === 'coordinates') {
        const lat = parseFloat(editLat.trim());
        const lng = parseFloat(editLng.trim());
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setError('Enter valid latitude and longitude numbers.');
          return;
        }
        payload.coordinates = { lat, lng };
      } else if ((editingPlace.googleMapsLink || '').trim()) {
        // Re-extract from the link only when that mode is chosen.
        payload.googleMapsLink = editingPlace.googleMapsLink!.trim();
      } else {
        setError('Paste a Google Maps link, or switch to Enter coordinates.');
        return;
      }

      const response = await fetch('/api/client-places', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setClientPlaces((prev) => prev.map((p) => (p._id === editingPlace._id ? result.data : p)));
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

  const normalizePartner = (value: unknown) =>
    String(value || '').replace(/[.\s]/g, '').toLowerCase();

  const activeEmployees = allUsers.filter((user) => user && user._id && user.isActive !== false);

  const teamNames = Array.from(
    new Set(
      activeEmployees
        .map((user) => String(user.workingUnderPartner || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

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

  const saveAssignedIds = async (assignedIds: string[]) => {
    if (!assigningPlace) return;

    try {
      setBulkAssigning(true);
      setError(null);
      const response = await fetch('/api/client-places', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: assigningPlace._id,
          assignedEmployees: assignedIds,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setClientPlaces((prev) => prev.map((p) => (p._id === assigningPlace._id ? result.data : p)));
        setAssigningPlace(result.data);
      } else {
        setError(result.error || 'Failed to update employee assignment');
      }
    } catch (err) {
      setError('Failed to update employee assignment');
      console.error('Error updating employee assignment:', err);
    } finally {
      setBulkAssigning(false);
    }
  };

  const confirmBulkAssign = async () => {
    if (!assignConfirm || !assigningPlace) return;
    const currentIds = assigningPlace.assignedEmployees.map((e) => e._id);

    if (assignConfirm.kind === 'all') {
      await saveAssignedIds(
        Array.from(new Set([...currentIds, ...activeEmployees.map((user) => user._id)]))
      );
    } else if (assignConfirm.kind === 'team') {
      const teamKey = normalizePartner(assignConfirm.team);
      const teamIds = activeEmployees
        .filter((user) => normalizePartner(user.workingUnderPartner) === teamKey)
        .map((user) => user._id);
      await saveAssignedIds(Array.from(new Set([...currentIds, ...teamIds])));
    } else if (assignConfirm.kind === 'remove-all') {
      await saveAssignedIds([]);
    } else {
      const teamKey = normalizePartner(assignConfirm.team);
      const remaining = assigningPlace.assignedEmployees
        .filter((emp) => {
          const user = allUsers.find((u) => u._id === emp._id);
          return normalizePartner(user?.workingUnderPartner) !== teamKey;
        })
        .map((emp) => emp._id);
      await saveAssignedIds(remaining);
    }
    setAssignConfirm(null);
  };

  const teamAssignCount = assignTeamName
    ? activeEmployees.filter(
        (user) => normalizePartner(user.workingUnderPartner) === normalizePartner(assignTeamName)
      ).length
    : 0;

  const teamRemoveCount =
    assignTeamName && assigningPlace
      ? assigningPlace.assignedEmployees.filter((emp) => {
          const user = allUsers.find((u) => u._id === emp._id);
          return normalizePartner(user?.workingUnderPartner) === normalizePartner(assignTeamName);
        }).length
      : 0;

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

  return {
    clientPlaces,
    loading,
    error,
    setError,
    showAddForm,
    setShowAddForm,
    editingPlace,
    setEditingPlace,
    editLat,
    setEditLat,
    editLng,
    setEditLng,
    assigningPlace,
    setAssigningPlace,
    searchTerm,
    setSearchTerm,
    addMode,
    setAddMode,
    editMode,
    setEditMode,
    assignTeamName,
    setAssignTeamName,
    assignConfirm,
    setAssignConfirm,
    bulkAssigning,
    newPlace,
    setNewPlace,
    handleAddPlace,
    openEditPlace,
    handleUpdatePlace,
    handleDeletePlace,
    handleReactivatePlace,
    activeEmployees,
    teamNames,
    handleAssignEmployee,
    confirmBulkAssign,
    teamAssignCount,
    teamRemoveCount,
    handlePermanentDeletePlace,
    filteredEmployees,
    inputCls,
  } as const;
}
