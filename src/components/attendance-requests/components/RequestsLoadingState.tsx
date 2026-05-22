'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';

export const RequestsLoadingState: React.FC = () => (
  <section
    className="rounded-xl border border-blue-200/65 bg-panel p-6 shadow-sm"
    aria-busy="true"
    aria-label="Loading attendance requests"
  >
    <div className="flex items-center justify-center gap-2 py-12 text-slate-600">
      <RefreshCw className="h-6 w-6 animate-spin text-blue-600" aria-hidden />
      <span role="status">Loading requests…</span>
    </div>
  </section>
);
