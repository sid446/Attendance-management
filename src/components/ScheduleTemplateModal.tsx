'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, Trash2 } from 'lucide-react';
import type { DailySchedule } from '@/types/ui';
import { ScheduleWeekGrid } from '@/components/ScheduleWeekGrid';
import { cloneDailySchedule, createDefaultDailySchedule, type ScheduleWeekDay } from '@/lib/defaultDailySchedule';

export interface ScheduleTemplateRecord {
  _id: string;
  name: string;
  daily: DailySchedule;
}

interface ScheduleTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: ScheduleTemplateRecord | null;
  onSave: (payload: { _id?: string; name: string; daily: DailySchedule }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  saving?: boolean;
}

export function ScheduleTemplateModal({
  isOpen,
  onClose,
  template,
  onSave,
  onDelete,
  saving = false,
}: ScheduleTemplateModalProps) {
  const [name, setName] = useState('');
  const [daily, setDaily] = useState<DailySchedule>(createDefaultDailySchedule());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (template) {
      setName(template.name);
      setDaily(cloneDailySchedule(template.daily));
    } else {
      setName('');
      setDaily(createDefaultDailySchedule());
    }
  }, [isOpen, template]);

  if (!isOpen || !mounted) return null;

  const handleDayChange = (
    day: ScheduleWeekDay,
    field: 'inTime' | 'outTime' | 'isHoliday' | 'isHalfDay',
    value: string | boolean
  ) => {
    setDaily((prev) => {
      const daySchedule = { ...(prev[day] || { inTime: '', outTime: '' }) };
      if (field === 'isHoliday' || field === 'isHalfDay') {
        daySchedule[field] = value as boolean;
      } else {
        daySchedule[field] = value as string;
      }
      return { ...prev, [day]: daySchedule };
    });
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onSave({
      _id: template?._id,
      name: trimmed,
      daily: cloneDailySchedule(daily),
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-template-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-200 bg-blue-50">
              <Clock className="h-5 w-5 text-blue-800" aria-hidden />
            </div>
            <div>
              <h2 id="schedule-template-modal-title" className="text-base font-semibold text-slate-900">
                {template ? 'Edit predefined schedule' : 'New predefined schedule'}
              </h2>
              <p className="text-xs text-slate-500">Set weekly in/out times — reusable when adding employee schedules</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Template name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Article, Office regular"
              className="w-full max-w-md rounded-md border border-slate-300 bg-panel px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              disabled={saving}
            />
          </label>
          <ScheduleWeekGrid daily={daily} onDayChange={handleDayChange} disabled={saving} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <div>
            {template && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(template._id)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete template
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-panel px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !name.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : template ? 'Update template' : 'Save template'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
