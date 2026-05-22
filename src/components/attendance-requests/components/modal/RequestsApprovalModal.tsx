'use client';

import React from 'react';
import type { AttendanceRequest } from '../../types';
import {
  getDefaultValueForType,
  getMaxValueForType,
  isFixedValueType,
  isLeaveRequestType,
} from '../../utils/requestValues';

export interface RequestsApprovalModalProps {
  isOpen: boolean;
  action: 'approve' | 'reject';
  selectedRequestId: string | string[] | null;
  requests: AttendanceRequest[];
  remarks: string;
  onRemarksChange: (value: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  valueError: string | null;
  onValueErrorClear: () => void;
  modalProcessing: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export const RequestsApprovalModal: React.FC<RequestsApprovalModalProps> = ({
  isOpen,
  action,
  selectedRequestId,
  requests,
  remarks,
  onRemarksChange,
  value,
  onValueChange,
  valueError,
  onValueErrorClear,
  modalProcessing,
  onClose,
  onSubmit,
}) => {
  if (!isOpen) return null;

  const modalTitleId = 'attendance-request-approval-title';

  let req: AttendanceRequest | undefined;
  if (selectedRequestId) {
    if (Array.isArray(selectedRequestId)) {
      req = requests.find((r) => r._id === selectedRequestId[0]);
    } else {
      req = requests.find((r) => r._id === selectedRequestId);
    }
  }

  const renderValueField = () => {
    if (action !== 'approve' || !req) return null;

    if (isFixedValueType(req.requestedStatus)) {
      if (req.requestedStatus.toLowerCase().includes('half')) {
        return (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <span className="text-sm text-slate-600">Attendance value: </span>
            <span className="text-sm font-medium text-slate-900">0.5 days</span>
            <span className="ml-2 text-xs text-slate-500">(fixed for half-day)</span>
          </div>
        );
      }
      return (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <span className="text-sm text-slate-600">No attendance value required for leave requests</span>
        </div>
      );
    }

    const maxVal = getMaxValueForType(req.requestedStatus);

    return (
      <div>
        <label htmlFor="approval-value" className="mb-1 block text-sm font-medium text-slate-700">
          Value{' '}
          {maxVal ? (
            <span className="font-normal text-slate-500">(max: {maxVal})</span>
          ) : (
            <span className="font-normal text-slate-500">(if applicable)</span>
          )}
        </label>
        <input
          id="approval-value"
          type="number"
          step="0.01"
          min="0"
          max={maxVal || undefined}
          className={`w-full rounded-md border bg-panel p-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
            valueError ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'
          }`}
          value={value}
          onChange={(e) => {
            let val = e.target.value;
            if (maxVal && parseFloat(val) > maxVal) {
              val = maxVal.toString();
            }
            onValueChange(val);
            onValueErrorClear();
          }}
          placeholder={maxVal ? `0.00 - ${maxVal}` : 'Enter value (optional)'}
        />
        {valueError && (
          <div className="mt-1 text-xs text-red-800" role="alert">
            {valueError}
          </div>
        )}
        {maxVal && <div className="mt-1 text-xs text-amber-800">Max value allowed: {maxVal}</div>}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-blue-200/65 bg-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <span id={modalTitleId} className="text-lg font-semibold text-slate-900">
            {action === 'approve' ? 'Approve request' : 'Reject request'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <span className="text-xl leading-none" aria-hidden>
              &times;
            </span>
          </button>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <label htmlFor="approval-remarks" className="mb-1 block text-sm font-medium text-slate-700">
              Remarks
            </label>
            <textarea
              id="approval-remarks"
              className="w-full rounded-md border border-blue-200/65 bg-panel p-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              rows={3}
              value={remarks}
              onChange={(e) => onRemarksChange(e.target.value)}
              placeholder={action === 'approve' ? 'Approval remarks (optional)' : 'Reason for rejection'}
            />
          </div>
          {renderValueField()}
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              onClick={onClose}
              className="rounded-md border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={modalProcessing}
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 ${
                action === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500/40'
                  : 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500/40'
              } ${modalProcessing ? 'cursor-not-allowed opacity-60' : ''}`}
              type="button"
            >
              {modalProcessing ? 'Processing...' : action === 'approve' ? 'Approve' : 'Reject'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
