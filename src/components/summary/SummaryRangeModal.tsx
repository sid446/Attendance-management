'use client';

import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { X } from 'lucide-react';

export interface SummaryRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDateIso: string;
  onApplyCustom: (start: string, end: string) => void;
  onSelectLast3Months: () => void;
  onSelectLast6Months: () => void;
  onSelectLast12Months: () => void;
  onSelectLastMonth: () => void;
  onSelectCurrentMonth: () => void;
}

export const SummaryRangeModal: React.FC<SummaryRangeModalProps> = ({
  isOpen,
  onClose,
  defaultDateIso,
  onApplyCustom,
  onSelectLast3Months,
  onSelectLast6Months,
  onSelectLast12Months,
  onSelectLastMonth,
  onSelectCurrentMonth,
}) => {
  const [customStartDate, setCustomStartDate] = useState(defaultDateIso);
  const [customEndDate, setCustomEndDate] = useState(defaultDateIso);

  if (!isOpen) return null;

  return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose} role="presentation">
        <div
          className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-blue-200/65 bg-panel shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="summary-range-modal-title"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-blue-200/50 bg-sky-100/50 px-4 py-3">
              <h3 id="summary-range-modal-title" className="text-sm font-semibold text-slate-900">
                Custom date range
              </h3>
              <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Close"><X className="w-4 h-4"/></button>
          </div>
          <div className="p-4 flex-1">
            <p className="text-xs text-slate-500 mb-3">Pick a preset or choose start and end dates.</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button type="button" onClick={onSelectLast3Months} className="px-3 py-2 text-sm rounded-md border border-blue-200/65 bg-panel text-slate-800 hover:bg-slate-100 transition-colors">Last 3 months</button>
              <button type="button" onClick={onSelectLast6Months} className="px-3 py-2 text-sm rounded-md border border-blue-200/65 bg-panel text-slate-800 hover:bg-slate-100 transition-colors">Last 6 months</button>
              <button type="button" onClick={onSelectLast12Months} className="px-3 py-2 text-sm rounded-md border border-blue-200/65 bg-panel text-slate-800 hover:bg-slate-100 transition-colors">Last 12 months</button>
              <button type="button" onClick={onSelectLastMonth} className="px-3 py-2 text-sm rounded-md border border-blue-200/65 bg-panel text-slate-800 hover:bg-slate-100 transition-colors">Last month</button>
              <button type="button" onClick={onSelectCurrentMonth} className="px-3 py-2 text-sm rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100/80 transition-colors col-span-2">This month</button>
            </div>
            <div className="space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">Start and end</h4>
              <div>
                <DatePicker
                  selected={new Date(customStartDate)}
                  onChange={(date: Date | null) => date && setCustomStartDate(date.toISOString().split('T')[0])}
                  className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  dateFormat="yyyy-MM-dd"
                />
              </div>
              <div className="text-center text-xs text-slate-500">to</div>
              <div>
                <DatePicker
                  selected={new Date(customEndDate)}
                  onChange={(date: Date | null) => date && setCustomEndDate(date.toISOString().split('T')[0])}
                  className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  dateFormat="yyyy-MM-dd"
                />
              </div>
              <button type="button" onClick={() => onApplyCustom(customStartDate, customEndDate)} className="w-full mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">Apply range</button>
            </div>
          </div>
          <div className="flex shrink-0 justify-end border-t border-blue-200/50 bg-sky-100/50 px-4 py-2.5">
              <button type="button" onClick={onClose} className="text-sm text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    );
};
