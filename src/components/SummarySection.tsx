import React from 'react';
import { AttendanceSummaryView } from '@/types/ui';

interface SummarySectionProps {
  summaries: AttendanceSummaryView[];
  uploadTotal: number;
  uploadSaved: number;
  uploadFailed: number;
}

export const SummarySection: React.FC<SummarySectionProps> = ({
  summaries,
  uploadTotal,
  uploadSaved,
  uploadFailed
}) => {
  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Attendance Summary</h2>
          <p className="text-xs text-slate-400 mt-1">
            One row per employee per month with calculated totals.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-[11px] text-slate-400">
          <span>Users: {summaries.length}</span>
          {uploadTotal > 0 && (
            <span>
              Last upload: {uploadSaved}/{uploadTotal} saved
              {uploadFailed > 0 && `, ${uploadFailed} failed`}
            </span>
          )}
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="text-xs text-slate-500">No attendance data found yet. Upload an Excel file to begin.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800">
                <th className="px-3 py-2 text-left font-semibold text-slate-300">User</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-300">Month</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-300">Total Hours</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-300">Late Arrivals</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-300">Excess Hours</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-300">Half Days</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-300">Present</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-300">Absent</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-300">Leave</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-800/80 hover:bg-slate-900/80 transition-colors"
                >
                  <td className="px-3 py-2 text-slate-50 font-medium">{item.userName}</td>
                  <td className="px-3 py-2 text-slate-300">{item.monthYear}</td>
                  <td className="px-3 py-2 text-right text-slate-200">{item.summary.totalHour}</td>
                  <td className="px-3 py-2 text-right text-amber-300">{item.summary.totalLateArrival}</td>
                  <td className="px-3 py-2 text-right text-emerald-200">{item.summary.excessHour}</td>
                  <td className="px-3 py-2 text-right text-slate-200">{item.summary.totalHalfDay}</td>
                  <td className="px-3 py-2 text-right text-emerald-300">{item.summary.totalPresent}</td>
                  <td className="px-3 py-2 text-right text-rose-300">{item.summary.totalAbsent}</td>
                  <td className="px-3 py-2 text-right text-sky-300">{item.summary.totalLeave}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
