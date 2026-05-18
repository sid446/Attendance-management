'use client';

import React from 'react';
import type { DailySchedule, ScheduleTime } from '@/types/ui';
import { SCHEDULE_WEEK_DAYS, type ScheduleWeekDay } from '@/lib/defaultDailySchedule';

type DayField = 'inTime' | 'outTime' | 'isHoliday' | 'isHalfDay';

export interface ScheduleWeekGridProps {
  daily: DailySchedule;
  onDayChange: (day: ScheduleWeekDay, field: DayField, value: string | boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  accent?: 'blue' | 'emerald';
}

export function ScheduleWeekGrid({
  daily,
  onDayChange,
  disabled = false,
  compact = false,
  accent = 'blue',
}: ScheduleWeekGridProps) {
  const focusRing = accent === 'emerald' ? 'focus:border-emerald-500' : 'focus:border-blue-500';
  const labelSize = compact ? 'text-[10px]' : 'text-xs';
  const inputSize = compact ? 'text-xs py-1' : 'text-sm py-1.5';
  const checkSize = compact ? 'text-[10px]' : 'text-xs';

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {SCHEDULE_WEEK_DAYS.map((day) => {
        const slot: ScheduleTime = daily[day] || { inTime: '', outTime: '' };
        const isHoliday = slot.isHoliday || false;
        return (
          <div
            key={day}
            className={`space-y-3 rounded-lg border border-slate-200 ${compact ? 'bg-white p-3' : 'bg-slate-50/90 p-3'}`}
          >
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold capitalize text-slate-800">{day}</label>
              <div className="flex gap-2">
                <label className={`flex items-center gap-1 ${checkSize}`}>
                  <input
                    type="checkbox"
                    checked={isHoliday}
                    onChange={(e) => onDayChange(day, 'isHoliday', e.target.checked)}
                    className="h-3 w-3"
                    disabled={disabled}
                  />
                  Holiday
                </label>
                <label className={`flex items-center gap-1 ${checkSize}`}>
                  <input
                    type="checkbox"
                    checked={slot.isHalfDay || false}
                    onChange={(e) => onDayChange(day, 'isHalfDay', e.target.checked)}
                    className="h-3 w-3"
                    disabled={disabled}
                  />
                  {compact ? 'Half' : 'Half Day'}
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <label className={`text-slate-500 ${labelSize}`}>In Time</label>
                <input
                  type="time"
                  value={slot.inTime || ''}
                  onChange={(e) => onDayChange(day, 'inTime', e.target.value)}
                  className={`w-full rounded border border-blue-200/65 bg-panel px-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${inputSize} ${focusRing} text-slate-900`}
                  disabled={disabled || isHoliday}
                />
              </div>
              <div>
                <label className={`text-slate-500 ${labelSize}`}>Out Time</label>
                <input
                  type="time"
                  value={slot.outTime || ''}
                  onChange={(e) => onDayChange(day, 'outTime', e.target.value)}
                  className={`w-full rounded border border-blue-200/65 bg-panel px-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${inputSize} ${focusRing} text-slate-900`}
                  disabled={disabled || isHoliday}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
