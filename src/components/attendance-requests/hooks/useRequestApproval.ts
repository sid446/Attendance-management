'use client';

import { useState } from 'react';
import type { AttendanceRequest } from '../types';
import {
  getDefaultValueForType,
  getMaxValueForType,
  isLeaveRequestType,
  resolveApproveValueNumber,
} from '../utils';

interface UseRequestApprovalOptions {
  requests: AttendanceRequest[];
  refresh: () => Promise<void>;
  onRequestUpdate?: () => void;
  setError: (error: string | null) => void;
}

export function useRequestApproval({
  requests,
  refresh,
  onRequestUpdate,
  setError,
}: UseRequestApprovalOptions) {
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [selectedRequestId, setSelectedRequestId] = useState<string | string[] | null>(null);
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [approvalValue, setApprovalValue] = useState('');
  const [approvalValueError, setApprovalValueError] = useState<string | null>(null);
  const [modalProcessing, setModalProcessing] = useState(false);

  const submitApproval = async (
    requestId: string | string[],
    action: 'approve' | 'reject',
    remarks?: string,
    value?: string
  ) => {
    const requestIds = Array.isArray(requestId) ? requestId : [requestId];
    const processingId = Array.isArray(requestId) ? requestId[0] : requestId;

    setProcessingRequest(processingId as string);
    try {
      const response =
        requestIds.length > 1
          ? await fetch('/api/partner/bulk-action', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action,
                ids: requestIds,
                remark: remarks,
                value: value ? parseFloat(value) : undefined,
                approvedBy: 'HR',
                approvedByEmail: 'hr@asija.in',
              }),
            })
          : await fetch('/api/employee/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestId: requestIds[0],
                action,
                remarks,
                value,
                approvedBy: 'HR',
                approvedByEmail: 'hr@asija.in',
              }),
            });

      const result = await response.json();

      if (result.success) {
        await refresh();
        onRequestUpdate?.();
      } else {
        setError(result.error || 'Failed to process request');
      }
    } catch {
      setError('Failed to process request');
    } finally {
      setProcessingRequest(null);
    }
  };

  const openApprovalModal = (requestId: string | string[], action: 'approve' | 'reject') => {
    setSelectedRequestId(requestId);
    setApprovalAction(action);
    setApprovalRemarks('');
    setApprovalValueError(null);

    if (action === 'approve') {
      const reqIds = Array.isArray(requestId) ? requestId : [requestId];
      const req = requests.find((r) => r._id === reqIds[0]);
      if (req?.status === 'PendingHr' && req.partnerProposedValue) {
        setApprovalValue(req.partnerProposedValue);
      } else if (req) {
        setApprovalValue(getDefaultValueForType(req.requestedStatus));
      } else {
        setApprovalValue('');
      }
    } else {
      setApprovalValue('');
    }

    setShowApprovalModal(true);
  };

  const closeApprovalModal = () => {
    setShowApprovalModal(false);
    setSelectedRequestId(null);
    setApprovalRemarks('');
    setApprovalValue('');
    setApprovalValueError(null);
  };

  const handleModalSubmit = async () => {
    if (!selectedRequestId || modalProcessing) return;
    setModalProcessing(true);

    if (approvalAction === 'approve') {
      const reqIds = Array.isArray(selectedRequestId) ? selectedRequestId : [selectedRequestId];
      const req = requests.find((r) => r._id === reqIds[0]);
      if (req && !isLeaveRequestType(req.requestedStatus) && !req.requestedStatus.toLowerCase().includes('half')) {
        const maxVal = getMaxValueForType(req.requestedStatus);
        const effectiveRaw =
          approvalValue.trim() === '' ? getDefaultValueForType(req.requestedStatus) : approvalValue;
        const valNum = parseFloat(effectiveRaw.replace(',', '.'));
        if (maxVal != null && (!Number.isFinite(valNum) || valNum > maxVal || valNum < 0)) {
          setApprovalValueError(`Value must be between 0 and ${maxVal} for ${req.requestedStatus}`);
          setModalProcessing(false);
          return;
        }
      }
    }

    setApprovalValueError(null);

    let valueToSend = approvalValue;
    if (approvalAction === 'approve') {
      const reqIds = Array.isArray(selectedRequestId) ? selectedRequestId : [selectedRequestId];
      const req = requests.find((r) => r._id === reqIds[0]);
      if (req) {
        if (req.requestedStatus.toLowerCase().includes('half')) {
          valueToSend = '0.5';
        } else if (isLeaveRequestType(req.requestedStatus)) {
          valueToSend = '';
        } else {
          const n = resolveApproveValueNumber(req.requestedStatus, approvalValue);
          valueToSend = n !== undefined ? String(n) : '';
        }
      }
    }

    try {
      await submitApproval(selectedRequestId, approvalAction, approvalRemarks, valueToSend);
      setShowApprovalModal(false);
      setSelectedRequestId(null);
    } finally {
      setModalProcessing(false);
    }
  };

  return {
    processingRequest,
    showApprovalModal,
    approvalAction,
    selectedRequestId,
    approvalRemarks,
    setApprovalRemarks,
    approvalValue,
    setApprovalValue,
    approvalValueError,
    clearApprovalValueError: () => setApprovalValueError(null),
    modalProcessing,
    openApprovalModal,
    closeApprovalModal,
    handleModalSubmit,
  };
}
