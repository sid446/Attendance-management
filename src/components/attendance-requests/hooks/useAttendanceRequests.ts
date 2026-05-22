'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AttendanceRequest } from '../types';

interface UseAttendanceRequestsOptions {
  userId?: string;
  partnerName?: string;
}

export function useAttendanceRequests({ userId, partnerName }: UseAttendanceRequestsOptions) {
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (userId) params.append('userId', userId);
      if (partnerName) params.append('partnerName', partnerName);

      const response = await fetch(`/api/employee/request-correction?${params}`);
      const result = await response.json();

      if (result.success) {
        setRequests(result.data);
      } else {
        setError(result.error || 'Failed to fetch requests');
      }
    } catch {
      setError('Failed to fetch requests');
    } finally {
      setLoading(false);
    }
  }, [userId, partnerName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { requests, loading, error, setError, refresh };
}
