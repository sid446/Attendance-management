"use client";
import React, { useState, useEffect } from 'react';
import { MapPin, Clock, Check, X, AlertCircle, Loader2, Navigation, RefreshCw } from 'lucide-react';

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
    isWithinRadius: boolean;
    status: string;
  };
  outPunch?: {
    time: string;
    distanceFromClient: number;
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
  const [gettingLocation, setGettingLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [punchType, setPunchType] = useState<'in' | 'out'>('in');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const todayDate = new Date().toISOString().split('T')[0];

  // Fetch assigned client places and today's records
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [placesRes, recordsRes] = await Promise.all([
        fetch(`/api/client-places?employeeId=${userId}`),
        fetch(`/api/employee/location-attendance?userId=${userId}&date=${todayDate}`)
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
  const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      setGettingLocation(true);
      setLocationError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentLocation(coords);
          setGettingLocation(false);
          resolve(coords);
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

  // Mark attendance with location
  const handleMarkAttendance = async () => {
    if (!selectedPlace) {
      setMessage({ type: 'error', text: 'Please select a client place' });
      return;
    }

    try {
      setMarkingAttendance(true);
      setMessage(null);

      // Get current location
      const location = await getCurrentLocation();

      // Mark attendance
      const response = await fetch('/api/employee/location-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          clientPlaceId: selectedPlace._id,
          punchType,
          coordinates: location
        })
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        fetchData(); // Refresh data
        setSelectedPlace(null);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to mark attendance' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to mark attendance' });
    } finally {
      setMarkingAttendance(false);
    }
  };

  // Get record for a specific client place
  const getRecordForPlace = (placeId: string): LocationAttendanceRecord | undefined => {
    return todayRecords.find(r => r.clientPlaceId._id === placeId);
  };

  // Determine what punch type is available for a place
  const getAvailablePunchType = (placeId: string): 'in' | 'out' | 'done' => {
    const record = getRecordForPlace(placeId);
    if (!record) return 'in';
    if (record.inPunch && !record.outPunch) return 'out';
    if (record.inPunch && record.outPunch) return 'done';
    return 'in';
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
            {embedded ? 'Mark in / out at site' : 'Mark attendance — client place & outstation'}
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
          Select a client location to mark your attendance. You must be within{' '}
          {assignedPlaces[0]?.radiusMeters || 500}m of the location.
        </p>

        {assignedPlaces.map(place => {
          const record = getRecordForPlace(place._id);
          const availablePunch = getAvailablePunchType(place._id);
          const isSelected = selectedPlace?._id === place._id;

          return (
            <div
              key={place._id}
              className={`cursor-pointer rounded-lg border p-4 transition-all ${
                isSelected
                  ? 'border-emerald-500/50 bg-emerald-900/20'
                  : 'border-border bg-background hover:bg-surface/70'
              }`}
              onClick={() => {
                if (availablePunch !== 'done') {
                  setSelectedPlace(place);
                  setPunchType(availablePunch);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="truncate font-medium text-foreground">{place.name}</h4>
                  <p className="truncate text-sm text-muted-foreground">{place.address}</p>
                </div>

                {/* Status Badge */}
                {record ? (
                  <div className="flex flex-col items-end gap-1">
                    {record.inPunch && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        record.inPunch.isWithinRadius
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : 'bg-amber-900/50 text-amber-300'
                      }`}>
                        In: {record.inPunch.time} ({record.inPunch.distanceFromClient}m)
                      </span>
                    )}
                    {record.outPunch && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        record.outPunch.isWithinRadius
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : 'bg-amber-900/50 text-amber-300'
                      }`}>
                        Out: {record.outPunch.time} ({record.outPunch.distanceFromClient}m)
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

              {/* Action Buttons (when selected) */}
              {isSelected && availablePunch !== 'done' && (
                <div className="mt-4 border-t border-border pt-4">
                  {locationError && (
                    <div className="mb-3 flex items-center gap-2 text-sm text-amber-300 bg-amber-900/20 p-2 rounded">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{locationError}</span>
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkAttendance();
                    }}
                    disabled={markingAttendance || gettingLocation}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                      availablePunch === 'in'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-rose-600 hover:bg-rose-500 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {(markingAttendance || gettingLocation) ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {gettingLocation ? 'Getting Location...' : 'Marking...'}
                      </>
                    ) : (
                      <>
                        <Navigation className="w-4 h-4" />
                        Mark {availablePunch === 'in' ? 'In' : 'Out'} Time
                      </>
                    )}
                  </button>

                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Your current location will be verified against the client place coordinates
                  </p>
                </div>
              )}

              {availablePunch === 'done' && (
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
