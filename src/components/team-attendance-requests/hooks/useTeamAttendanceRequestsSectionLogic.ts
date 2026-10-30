'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { employeeCredentialsInit } from '@/lib/employeeCredentialsInit';
import type { TeamRequestRow, TeamAttendanceRequestsSectionProps } from '../types';
import { getDefaultApproveValue, resolveApproveValue } from '../utils/teamAttendanceRequestsUtils';

export function useTeamAttendanceRequestsSectionLogic({ monthYear, onActionComplete }: TeamAttendanceRequestsSectionProps) {
  const [view, setView] = useState<'pending' | 'history'>('pending');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<TeamRequestRow[]>([]);
  const [history, setHistory] = useState<TeamRequestRow[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, historyRes] = await Promise.all([
        fetch('/api/employee/team-attendance-requests?status=Pending', employeeCredentialsInit({ cache: 'no-store' })),
        fetch(
          `/api/employee/team-attendance-requests?monthYear=${encodeURIComponent(monthYear)}`,
          employeeCredentialsInit({ cache: 'no-store' })
        ),
      ]);
      const pendingJson = await pendingRes.json();
      const historyJson = await historyRes.json();

      if (!pendingJson.success) throw new Error(pendingJson.error || 'Failed to load pending requests');
      if (!historyJson.success) throw new Error(historyJson.error || 'Failed to load request history');

      const mapRow = (row: Record<string, unknown>): TeamRequestRow => {
        const userRef = row.userId as {
          name?: string;
          employmentType?: string;
          category?: string;
          designation?: string;
        } | undefined;
        return {
          _id: String(row._id || ''),
          date: String(row.date || ''),
          requestedStatus: String(row.requestedStatus || ''),
          requestType: row.requestType as TeamRequestRow['requestType'],
          originalStatus: row.originalStatus ? String(row.originalStatus) : undefined,
          reason: row.reason ? String(row.reason) : undefined,
          startTime: row.startTime ? String(row.startTime) : undefined,
          endTime: row.endTime ? String(row.endTime) : undefined,
          status: row.status as TeamRequestRow['status'],
          partnerName: row.partnerName ? String(row.partnerName) : undefined,
          partnerRemarks: row.partnerRemarks ? String(row.partnerRemarks) : undefined,
          partnerApprovedAt: row.partnerApprovedAt ? String(row.partnerApprovedAt) : undefined,
          partnerProposedValue: row.partnerProposedValue ? String(row.partnerProposedValue) : undefined,
          hrRemarks: row.hrRemarks ? String(row.hrRemarks) : undefined,
          hrValue: row.hrValue ? String(row.hrValue) : undefined,
          approvedBy: row.approvedBy ? String(row.approvedBy) : undefined,
          approvedByEmail: row.approvedByEmail ? String(row.approvedByEmail) : undefined,
          approvedAt: row.approvedAt ? String(row.approvedAt) : undefined,
          rejectedBy: row.rejectedBy ? String(row.rejectedBy) : undefined,
          rejectedByEmail: row.rejectedByEmail ? String(row.rejectedByEmail) : undefined,
          rejectedAt: row.rejectedAt ? String(row.rejectedAt) : undefined,
          createdAt: row.createdAt ? String(row.createdAt) : undefined,
          updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
          userName: row.userName ? String(row.userName) : userRef?.name,
          originalCheckin: row.originalCheckin ? String(row.originalCheckin) : undefined,
          originalCheckout: row.originalCheckout ? String(row.originalCheckout) : undefined,
          employeeEmploymentType: userRef?.employmentType ? String(userRef.employmentType) : undefined,
          employeeCategory: userRef?.category ? String(userRef.category) : undefined,
          employeeDesignation: userRef?.designation ? String(userRef.designation) : undefined,
        };
      };

      const pendingRows = (Array.isArray(pendingJson.data) ? pendingJson.data : []).map(mapRow);
      const historyRows = (Array.isArray(historyJson.data) ? historyJson.data : []).map(mapRow);
      setPending(pendingRows);
      setHistory(historyRows);

      const nextRemarks: Record<string, string> = {};
      const nextValues: Record<string, string> = {};
      pendingRows.forEach((row: TeamRequestRow) => {
        nextRemarks[row._id] = 'Done';
        nextValues[row._id] = getDefaultApproveValue(row);
      });
      setRemarks(nextRemarks);
      setValues(nextValues);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
      setPending([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [monthYear]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const sortedHistory = useMemo(
    () =>
      [...history].sort((a, b) => {
        const ad = new Date(a.date).getTime();
        const bd = new Date(b.date).getTime();
        if (ad !== bd) return bd - ad;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      }),
    [history]
  );

  const handleAction = async (row: TeamRequestRow, action: 'approve' | 'reject') => {
    if (processingId) return;
    setProcessingId(row._id);
    setError(null);
    try {
      const res = await fetch(
        '/api/partner/bulk-action',
        employeeCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            ids: [row._id],
            remark: remarks[row._id] || (action === 'approve' ? 'Approved' : 'Rejected'),
            value:
              action === 'approve'
                ? resolveApproveValue(row, values[row._id] || getDefaultApproveValue(row))
                : undefined,
          }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to ${action} request`);
      }
      await loadRequests();
      onActionComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} request`);
    } finally {
      setProcessingId(null);
    }
  };

  return {
    view,
    setView,
    loading,
    processingId,
    error,
    pending,
    remarks,
    setRemarks,
    values,
    setValues,
    loadRequests,
    sortedHistory,
    handleAction,
  } as const;
}
