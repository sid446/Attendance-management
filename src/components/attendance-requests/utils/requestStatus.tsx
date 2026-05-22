import React from 'react';
import { AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';

const iconSize = { sm: 'h-4 w-4', md: 'h-5 w-5' } as const;

export const getStatusIcon = (status: string, size: keyof typeof iconSize = 'sm') => {
  const cls = iconSize[size];
  switch (status) {
    case 'Approved':
      return <CheckCircle className={`${cls} text-emerald-600`} aria-hidden />;
    case 'Rejected':
      return <XCircle className={`${cls} text-rose-600`} aria-hidden />;
    case 'Pending':
      return <Clock className={`${cls} text-amber-600`} aria-hidden />;
    case 'PendingHr':
      return <AlertCircle className={`${cls} text-rose-600`} aria-hidden />;
    default:
      return <AlertCircle className={`${cls} text-slate-500`} aria-hidden />;
  }
};

export const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case 'Approved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'Rejected':
      return 'border-rose-200 bg-rose-50 text-rose-900';
    case 'Pending':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'PendingHr':
      return 'border-rose-300 bg-rose-50 text-rose-900';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-800';
  }
};

export const getStatusBlockColor = (status: string) => {
  switch (status) {
    case 'Approved':
      return 'border-emerald-200 bg-emerald-50';
    case 'Rejected':
      return 'border-rose-200 bg-rose-50';
    case 'Pending':
      return 'border-amber-200 bg-amber-50';
    case 'PendingHr':
      return 'border-rose-300 bg-rose-50';
    default:
      return 'border-slate-200 bg-slate-50';
  }
};

export const formatStatusLabel = (status: string) =>
  status === 'PendingHr' ? 'Pending (HR)' : status;
