'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { NumericFilter } from '../../types';
function NumericFilterInput({
  label,
  filter,
  onChange,
}: {
  label: string;
  filter: NumericFilter;
  onChange: (filter: NumericFilter) => void;
}) {
  return (
      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</label>
        <div className="flex gap-2">
          <select
            value={filter.operator}
            onChange={(e) => onChange({...filter, operator: e.target.value})}
            className="flex-1 rounded-md border border-blue-200/65 bg-panel px-2 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">All</option>
            <option value="equals">=</option>
            <option value="greater">&gt;</option>
            <option value="less">&lt;</option>
            <option value="greaterEqual">Ã¢â€°Â¥</option>
            <option value="lessEqual">Ã¢â€°Â¤</option>
          </select>
          {filter.operator !== 'all' && (
            <input
              type="number"
              min="0"
              step="0.5"
              value={filter.value}
              onChange={(e) => onChange({...filter, value: parseFloat(e.target.value) || 0})}
              className="w-24 rounded-md border border-blue-200/65 bg-panel px-2 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="0"
            />
          )}
        </div>
      </div>
  );
}

export interface SummaryAdvancedFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: string[];
  designations: string[];
  teamFilter: string;
  designationFilter: string;
  onTeamFilterChange: (value: string) => void;
  onDesignationFilterChange: (value: string) => void;
  lateFilter: NumericFilter;
  onLateFilterChange: (f: NumericFilter) => void;
  presentFilter: NumericFilter;
  onPresentFilterChange: (f: NumericFilter) => void;
  absentFilter: NumericFilter;
  onAbsentFilterChange: (f: NumericFilter) => void;
  leaveFilter: NumericFilter;
  onLeaveFilterChange: (f: NumericFilter) => void;
  halfDayFilter: NumericFilter;
  onHalfDayFilterChange: (f: NumericFilter) => void;
  workHoursFilter: NumericFilter;
  onWorkHoursFilterChange: (f: NumericFilter) => void;
  excessFilter: NumericFilter;
  onExcessFilterChange: (f: NumericFilter) => void;
  onClearAll: () => void;
}

export const SummaryAdvancedFiltersModal: React.FC<SummaryAdvancedFiltersModalProps> = ({
  isOpen,
  onClose,
  teams,
  designations,
  teamFilter,
  designationFilter,
  onTeamFilterChange,
  onDesignationFilterChange,
  lateFilter,
  onLateFilterChange,
  presentFilter,
  onPresentFilterChange,
  absentFilter,
  onAbsentFilterChange,
  leaveFilter,
  onLeaveFilterChange,
  halfDayFilter,
  onHalfDayFilterChange,
  workHoursFilter,
  onWorkHoursFilterChange,
  excessFilter,
  onExcessFilterChange,
  onClearAll,
}) => {
  if (!isOpen) return null;

  return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose} role="presentation">
        <div
          className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-blue-200/65 bg-panel shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="summary-advanced-filters-title"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-blue-200/50 bg-sky-100/50 px-4 py-3">
              <h3 id="summary-advanced-filters-title" className="text-sm font-semibold text-slate-900">
                Refine results
              </h3>
              <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Close"><X className="w-4 h-4"/></button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Filters */}
              <div className="space-y-4">
                <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-2">Organization</h4>
                
                <div className="space-y-2">
                  <label htmlFor="summary-filter-team" className="block text-xs font-medium text-slate-600">
                    Team
                  </label>
                  <select
                    id="summary-filter-team"
                    value={teamFilter}
                    onChange={(e) => onTeamFilterChange(e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="all">All teams</option>
                    {teams.map(team => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="summary-filter-designation" className="block text-xs font-medium text-slate-600">
                    Designation
                  </label>
                  <select
                    id="summary-filter-designation"
                    value={designationFilter}
                    onChange={(e) => onDesignationFilterChange(e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="all">All designations</option>
                    {designations.map(designation => (
                      <option key={designation} value={designation}>{designation}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Numeric Filters */}
              <div className="space-y-4">
                <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-2">Metrics</h4>
                
                <NumericFilterInput
                  label="Late Arrivals"
                  filter={lateFilter}
                  onChange={onLateFilterChange}
                />
                
                <NumericFilterInput
                  label="Present Days"
                  filter={presentFilter}
                  onChange={onPresentFilterChange}
                />
                
                <NumericFilterInput
                  label="Absent Days"
                  filter={absentFilter}
                  onChange={onAbsentFilterChange}
                />
                
                <NumericFilterInput
                  label="Leave Days"
                  filter={leaveFilter}
                  onChange={onLeaveFilterChange}
                />
                
                <NumericFilterInput
                  label="Half Days"
                  filter={halfDayFilter}
                  onChange={onHalfDayFilterChange}
                />
                
                <NumericFilterInput
                  label="Work Hours"
                  filter={workHoursFilter}
                  onChange={onWorkHoursFilterChange}
                />
                
                <NumericFilterInput
                  label="Excess/Deficit Hours"
                  filter={excessFilter}
                  onChange={onExcessFilterChange}
                />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between border-t border-blue-200/50 bg-sky-100/50 px-4 py-3">
            <button
              type="button"
              onClick={onClearAll}
              className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-md hover:bg-slate-100 transition-colors"
            >
              Clear all
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-md hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
};
