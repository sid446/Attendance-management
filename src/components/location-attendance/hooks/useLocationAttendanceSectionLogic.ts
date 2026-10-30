"use client";

import { useState, useEffect } from 'react';
import { istDateString } from '@/lib/attendanceRequestWindow';
import { employeeCredentialsInit } from '@/lib/employeeCredentialsInit';
import type { ClientPlace, LocationAttendanceRecord, GpsFix, LocationAttendanceSectionProps } from '../types';

export function useLocationAttendanceSectionLogic({ userId }: Pick<LocationAttendanceSectionProps, 'userId'>) {
  const [assignedPlaces, setAssignedPlaces] = useState<ClientPlace[]>([]);
  const [todayRecords, setTodayRecords] = useState<LocationAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<ClientPlace | null>(null);
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [punchBusyType, setPunchBusyType] = useState<'in' | 'out' | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<GpsFix | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch assigned client places and today's records
  const fetchData = async () => {
    const todayDate = istDateString();
    try {
      setLoading(true);
      setError(null);

      const [placesRes, recordsRes] = await Promise.all([
        fetch(`/api/client-places?employeeId=${userId}`, employeeCredentialsInit()),
        fetch(
          `/api/employee/location-attendance?userId=${userId}&date=${todayDate}`,
          employeeCredentialsInit()
        ),
      ]);

      const placesData = await placesRes.json();
      const recordsData = await recordsRes.json();

      if (placesData.success) {
        setAssignedPlaces(placesData.data);
      }

      if (recordsData.success) {
        setTodayRecords(recordsData.data);
      }
    } catch (err) {
      setError('Failed to load data');
      console.error('Error loading location attendance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  // Get current GPS location
  const getCurrentLocation = (): Promise<GpsFix> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      setGettingLocation(true);
      setLocationError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Passed through untouched — the device reading is the source of truth.
          const fix: GpsFix = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyMeters: Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : null,
          };
          setCurrentLocation(fix);
          setGettingLocation(false);
          resolve(fix);
        },
        (error) => {
          setGettingLocation(false);
          let errorMessage = 'Unable to get your location';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable. Please try again.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out. Please try again.';
              break;
          }
          setLocationError(errorMessage);
          reject(new Error(errorMessage));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    });
  };

  const handleMarkAttendance = async (type: 'in' | 'out') => {
    if (!selectedPlace) {
      setMessage({ type: 'error', text: 'Please select a client place' });
      return;
    }

    const confirmed =
      type === 'out'
        ? window.confirm(
            "This sets today's out-time only. Thumb-machine in-time is uploaded later and will be kept."
          )
        : window.confirm(
            "This sets today's in-time from this location. If you already punched in on the thumb machine, cancel and use Check-out instead so that in-time is not replaced."
          );
    if (!confirmed) return;

    try {
      setMarkingAttendance(true);
      setPunchBusyType(type);
      setMessage(null);

      const fix = await getCurrentLocation();

      const response = await fetch('/api/employee/location-attendance', employeeCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          clientPlaceId: selectedPlace._id,
          punchType: type,
          coordinates: { lat: fix.lat, lng: fix.lng },
          accuracyMeters: fix.accuracyMeters ?? undefined
        })
      }));

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        fetchData();
        setSelectedPlace(null);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to mark attendance' });
      }
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to mark attendance' });
    } finally {
      setMarkingAttendance(false);
      setPunchBusyType(null);
    }
  };

  // Get record for a specific client place
  const getRecordForPlace = (placeId: string): LocationAttendanceRecord | undefined => {
    return todayRecords.find(
      (r) => String(r.clientPlaceId?._id || '') === String(placeId)
    );
  };

  const placePunchSides = (placeId: string): { hasIn: boolean; hasOut: boolean; done: boolean } => {
    const record = getRecordForPlace(placeId);
    const hasIn = !!record?.inPunch;
    const hasOut = !!record?.outPunch;
    return { hasIn, hasOut, done: hasIn && hasOut };
  };

  return {
    assignedPlaces,
    todayRecords,
    loading,
    error,
    selectedPlace,
    setSelectedPlace,
    markingAttendance,
    punchBusyType,
    gettingLocation,
    currentLocation,
    locationError,
    message,
    setMessage,
    fetchData,
    handleMarkAttendance,
    getRecordForPlace,
    placePunchSides,
  } as const;
}
