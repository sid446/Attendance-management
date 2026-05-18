'use client';

import React from 'react';
import { Users, Clock, AlertCircle, UserX } from 'lucide-react';
import { formatHoursMinutes } from '@/lib/attendanceSummaryMetrics';

export interface SummaryStats {
  totalEmployees: number;
  totalHours: number;
  totalLate: number;
  totalAbsents: number;
}

export interface SummaryStatsCardsProps {
  stats: SummaryStats;
}

export const SummaryStatsCards: React.FC<SummaryStatsCardsProps> = ({ stats }) => (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-md border border-blue-200/50 bg-sky-100/50 px-4 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">People in view</p>
            <Users className="h-4 w-4 text-slate-500" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{stats.totalEmployees}</p>
        </div>
        <div className="rounded-md border border-blue-200/50 bg-sky-100/50 px-4 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Late arrivals</p>
            <AlertCircle className="h-4 w-4 text-slate-500" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{stats.totalLate}</p>
        </div>
        <div className="rounded-md border border-blue-200/50 bg-sky-100/50 px-4 py-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Absence days</p>
            <UserX className="h-4 w-4 text-slate-500" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{stats.totalAbsents}</p>
        </div>
        <div className="col-span-2 rounded-md border border-blue-200/50 bg-sky-100/50 px-4 py-3 shadow-sm lg:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total hours logged</p>
            <Clock className="h-4 w-4 text-slate-500" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{formatHoursMinutes(stats.totalHours)}</p>
        </div>
      </div>
);
