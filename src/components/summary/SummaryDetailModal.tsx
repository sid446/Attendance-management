'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { SummaryDetailRow } from './types';

export interface SummaryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: SummaryDetailRow[];
}

export const SummaryDetailModal: React.FC<SummaryDetailModalProps> = ({ isOpen, onClose, title, data }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-blue-200/65 bg-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-detail-modal-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-blue-200/50 bg-sky-100/50 px-4 py-3">
          <h3 id="summary-detail-modal-title" className="text-sm font-semibold text-slate-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[min(60vh,480px)] flex-1 overflow-y-auto p-3">
          {data.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No records found</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {data.map((d, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-md border border-transparent px-3 py-2.5 text-sm transition-colors hover:border-blue-200/60 hover:bg-sky-100/55 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="whitespace-nowrap rounded border border-blue-200/65 bg-panel px-2 py-0.5 font-mono text-xs text-slate-800">
                      {/^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date.split('-').reverse().join('/') : new Date(d.date).toLocaleDateString('en-GB')}
                    </div>
                    {d.subInfo && (
                      <span className="whitespace-nowrap rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">
                        {d.subInfo}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 text-left font-mono text-xs leading-relaxed text-slate-600 wrap-break-word">
                    {d.info}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-end border-t border-blue-200/50 bg-sky-100/50 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
