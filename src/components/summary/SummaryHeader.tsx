'use client';

import React from 'react';
import { SUMMARY_WORKFLOW_STEPS } from './constants';

export interface SummaryHeaderProps {
  currentPeriodLabel: string;
}

export const SummaryHeader: React.FC<SummaryHeaderProps> = ({ currentPeriodLabel }) => (
  <header className="space-y-2">
    <h1 id="attendance-summary-heading" className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
      Attendance summary
    </h1>
    <p className="max-w-3xl text-sm text-slate-600">
      Review team totals for the selected period. Search by name, open a row for the monthly calendar, or export for
      reporting.
      <span className="text-slate-400"> · </span>
      <span className="font-medium text-slate-800">{currentPeriodLabel}</span>
    </p>
    <ol className="flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Summary workflow">
      {SUMMARY_WORKFLOW_STEPS.map((t, i) => (
        <li
          key={t}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-200/50 bg-sky-100/50 px-2 py-1"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
            {i + 1}
          </span>
          {t}
        </li>
      ))}
    </ol>
  </header>
);
