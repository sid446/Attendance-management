"use client";
import React, { useState, useEffect } from 'react';
import { MapPin, Check, X, AlertCircle, Loader2, Navigation, RefreshCw } from 'lucide-react';
import { istDateString } from '@/lib/attendanceRequestWindow';
import { employeeCredentialsInit } from '@/lib/employeeCredentialsInit';
import { formatDistanceMeters } from '@/lib/geoDistance';

interface GpsFix {
  lat: number;
  lng: number;
  accuracyMeters: number | null;
}

interface ClientPlace {
  _id: string;
  name: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  radiusMeters: number;
}

interface LocationAttendanceRecord {
  _id: string;
  clientPlaceId: {
    _id: string;
    name: string;
    address: string;
  };
  date: string;
  inPunch?: {
    time: string;
    distanceFromClient: number;
    accuracyMeters?: number;
    isWithinRadius: boolean;
    status: string;
  };
  outPunch?: {
    time: string;
    distanceFromClient: number;
    accuracyMeters?: number;
    isWithinRadius: boolean;
    status: string;
  };
  totalHours?: number;
  status: string;
}

interface LocationAttendanceSectionProps {
  userId: string;
  /**
   * When true, omit the outer “page card” chrome — parent provides the section frame
   * (e.g. employee Attendance tab “Client location punch” block).
   */
  embedded?: boolean;
}

export const LocationAttendanceSection: React.FC<LocationAttendanceSectionProps> = ({
  userId,
  embedded = false,
}) => {
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

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center gap-2 text-sm text-muted-foreground ${
          embedded ? 'py-14' : 'rounded-xl border border-border bg-surface p-6'
        }`}
      >
        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
        <span>Loading assigned locations...</span>
      </div>
    );
  }

  if (assignedPlaces.length === 0) {
    return (
      <div
        className={
          embedded
            ? 'rounded-lg border border-dashed border-border bg-background py-10 text-center'
            : 'rounded-xl border border-border bg-surface p-6'
        }
      >
        <div className={embedded ? 'px-4' : 'py-6'}>
          <MapPin className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-1 text-lg font-semibold text-foreground">No client places assigned</h3>
          <p className="text-sm text-muted-foreground">
            You haven&apos;t been assigned to any client locations yet.
            <br />
            Contact your administrator if you need access.
          </p>
        </div>
      </div>
    );
  }

  const rootCard =
    embedded
      ? 'overflow-hidden rounded-lg border border-border bg-surface'
      : 'overflow-hidden rounded-xl border border-border bg-surface';

  return (
    <div className={rootCard}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-emerald-400" />
          <h3 className="font-semibold text-foreground">
            {embedded ? 'Mark Check-in / Check-out at site' : 'Mark attendance — client place & outstation'}
          </h3>
        </div>
        <button
          onClick={fetchData}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          title="Refresh"
          type="button"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* How it works */}
      <div className="m-4 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-900/20 p-3 text-sm text-amber-100">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div className="space-y-1.5">
          <p className="font-medium text-amber-50">Check-in and Check-out are separate</p>
          <ul className="list-disc space-y-1 pl-4 text-amber-100/90">
            <li>
              Punched in on the thumb machine (even if it is not in the app yet)? Use{' '}
              <strong>Check-out</strong> only. In-time is applied when the machine file is uploaded
              later. Do not Check-in here or this GPS time becomes today&apos;s in-time.
            </li>
            <li>Need GPS in-time (no thumb in, or already out on the machine)? Use Check-in.</li>
            <li>At the client all day? Check-in on arrival and Check-out when leaving.</li>
            <li>Hours stay incomplete until both sides exist (GPS and/or later thumb upload).</li>
          </ul>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="m-4 flex items-center gap-2 p-3 bg-rose-900/20 border border-rose-500/30 rounded-lg text-rose-200 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Message Display */}
      {message && (
        <div className={`m-4 flex items-center gap-2 p-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-emerald-900/20 border border-emerald-500/30 text-emerald-200'
            : 'bg-rose-900/20 border border-rose-500/30 text-rose-200'
        }`}>
          {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Assigned Places List */}
      <div className="space-y-3 p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Select a client location, then Check-in or Check-out. You must be within{' '}
          {assignedPlaces[0]?.radiusMeters || 500}m of the location.
        </p>

        {assignedPlaces.map(place => {
          const record = getRecordForPlace(place._id);
          const { hasIn, hasOut, done } = placePunchSides(place._id);
          const isSelected = selectedPlace?._id === place._id;
          const busy = markingAttendance || gettingLocation;

          return (
            <div
              key={place._id}
              className={`cursor-pointer rounded-lg border p-4 transition-all ${
                isSelected
                  ? 'border-emerald-500/50 bg-emerald-900/20'
                  : 'border-border bg-background hover:bg-surface/70'
              }`}
              onClick={() => {
                if (!done) setSelectedPlace(place);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="truncate font-medium text-foreground">{place.name}</h4>
                  <p className="truncate text-sm text-muted-foreground">{place.address}</p>
                </div>

                {record ? (
                  <div className="flex flex-col items-end gap-1">
                    {record.inPunch && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        record.inPunch.isWithinRadius
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : 'bg-amber-900/50 text-amber-300'
                      }`}>
                        In: {record.inPunch.time} ({formatDistanceMeters(record.inPunch.distanceFromClient)})
                      </span>
                    )}
                    {record.outPunch && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        record.outPunch.isWithinRadius
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : 'bg-amber-900/50 text-amber-300'
                      }`}>
                        Out: {record.outPunch.time} ({formatDistanceMeters(record.outPunch.distanceFromClient)})
                      </span>
                    )}
                    {record.totalHours !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        Total: {record.totalHours.toFixed(2)} hrs
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="rounded bg-background px-2 py-0.5 text-xs text-muted-foreground border border-border">
                    Not marked
                  </span>
                )}
              </div>

              {isSelected && !done && (
                <div className="mt-4 border-t border-border pt-4">
                  {locationError && (
                    <div className="mb-3 flex items-center gap-2 text-sm text-amber-300 bg-amber-900/20 p-2 rounded">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{locationError}</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAttendance('in');
                      }}
                      disabled={busy || hasIn}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy && punchBusyType === 'in' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {gettingLocation ? 'Getting Location...' : 'Marking...'}
                        </>
                      ) : (
                        <>
                          <Navigation className="w-4 h-4" />
                          {hasIn ? 'Check-in marked' : 'Check in'}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAttendance('out');
                      }}
                      disabled={busy || hasOut}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy && punchBusyType === 'out' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {gettingLocation ? 'Getting Location...' : 'Marking...'}
                        </>
                      ) : (
                        <>
                          <Navigation className="w-4 h-4" />
                          {hasOut ? 'Check-out marked' : 'Check out'}
                        </>
                      )}
                    </button>
                  </div>

                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Your current location will be verified against the client place coordinates
                  </p>

                  {currentLocation && (
                    <p className="mt-1 break-all text-center font-mono text-[11px] text-muted-foreground">
                      Last GPS fix: {currentLocation.lat}, {currentLocation.lng}
                      {currentLocation.accuracyMeters !== null &&
                        ` (±${currentLocation.accuracyMeters.toFixed(0)} m)`}
                    </p>
                  )}
                </div>
              )}

              {done && (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <Check className="w-4 h-4" />
                    <span>Attendance complete for today</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Today's Summary */}
      {todayRecords.length > 0 && (
        <div className="border-t border-border bg-background/60 p-4">
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">Today&apos;s location attendance</h4>
          <div className="text-sm text-foreground">
            {todayRecords.map(record => (
              <div key={record._id} className="flex items-center justify-between py-1">
                <span>{record.clientPlaceId.name}</span>
                <span className={`text-xs ${
                  record.status === 'complete' ? 'text-emerald-400' :
                  record.status === 'partial' ? 'text-amber-400' : 'text-muted-foreground'
                }`}>
                  {record.status === 'complete' ? 'Complete' :
                   record.status === 'partial' ? 'In progress' : 'Pending'}
                  {record.totalHours !== undefined && ` (${record.totalHours.toFixed(1)}h)`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationAttendanceSection;
