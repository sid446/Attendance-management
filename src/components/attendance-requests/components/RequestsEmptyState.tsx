'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface RequestsEmptyStateProps {
  hasActiveFilters: boolean;
}

export const RequestsEmptyState: React.FC<RequestsEmptyStateProps> = ({ hasActiveFilters }) => (
  <div className="py-10 text-center">
    <AlertCircle className="mx-auto mb-3 h-12 w-12 text-slate-400" aria-hidden />
    <p className="text-slate-600">
      {hasActiveFilters ? 'No requests found for selected filters' : 'No attendance requests found'}
    </p>
  </div>
);
