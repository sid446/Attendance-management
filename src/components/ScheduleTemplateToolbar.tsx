'use client';

import React from 'react';
import { Clock, Plus } from 'lucide-react';
import type { ScheduleTemplateRecord } from '@/components/ScheduleTemplateModal';

interface ScheduleTemplateToolbarProps {
  templates: ScheduleTemplateRecord[];
  disabled?: boolean;
  onApplyTemplate: (templateId: string) => void;
  onAddBlankEntry: () => void;
  onNewTemplate: () => void;
  onEditTemplate: (template: ScheduleTemplateRecord) => void;
}

export function ScheduleTemplateToolbar({
  templates,
  disabled = false,
  onApplyTemplate,
  onAddBlankEntry,
  onNewTemplate,
  onEditTemplate,
}: ScheduleTemplateToolbarProps) {
  const [selectedId, setSelectedId] = React.useState('');

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedId('');
    if (id) onApplyTemplate(id);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="schedule-template-apply">
          Apply predefined schedule
        </label>
        <select
          id="schedule-template-apply"
          value={selectedId}
          onChange={handleSelect}
          disabled={disabled || templates.length === 0}
          className="min-h-9 max-w-[220px] rounded-md border border-slate-300 bg-panel px-2 py-1.5 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">
            {templates.length === 0 ? 'No templates yet' : 'Apply predefined…'}
          </option>
          {templates.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </select>
        {templates.length > 0 && (
          <select
            aria-label="Edit predefined schedule template"
            defaultValue=""
            disabled={disabled}
            onChange={(e) => {
              const id = e.target.value;
              e.target.value = '';
              const t = templates.find((x) => x._id === id);
              if (t) onEditTemplate(t);
            }}
            className="min-h-9 max-w-[140px] rounded-md border border-slate-300 bg-panel px-2 py-1.5 text-sm text-slate-700 disabled:opacity-50"
          >
            <option value="">Edit template…</option>
            {templates.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={onNewTemplate}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-100 disabled:opacity-50"
        >
          <Clock className="h-4 w-4" aria-hidden />
          New template
        </button>
      </div>
      <button
        type="button"
        onClick={onAddBlankEntry}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Add blank entry
      </button>
    </div>
  );
}
