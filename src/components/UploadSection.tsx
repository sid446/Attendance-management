import React, { ChangeEvent } from 'react';
import { Upload, AlertCircle } from 'lucide-react';

interface UploadSectionProps {
  file: File | null;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onProcessFile: () => void;
  processing: boolean;
  error: string | null;
  saveMessage: string | null;
  uploadErrors?: { odId: string; reason: string }[];
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  file,
  onFileChange,
  onProcessFile,
  processing,
  error,
  saveMessage,
  uploadErrors = []
}) => {
  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Upload Attendance Excel</h1>
          <p className="text-xs text-slate-400 mt-1">
            Upload a single-day or full-month Excel export. Records will be mapped, users created if
            missing, and monthly summaries updated.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          Accepted: <span className="text-slate-300">.xlsx, .xls</span>
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-xs font-medium text-slate-300 mb-2">Excel file</label>
        <div className="flex items-center gap-3">
          <label className="flex-1 flex items-center justify-between px-4 py-3 border border-dashed border-slate-700 rounded-lg cursor-pointer bg-slate-900/80 hover:border-emerald-500 hover:bg-slate-900 transition-colors">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400 truncate">
                {file ? file.name : 'Click to choose an Excel file'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">Browse</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={onFileChange}
              className="hidden"
            />
          </label>
          <button
            onClick={onProcessFile}
            disabled={!file || processing}
            className="px-4 py-2 bg-emerald-500 text-slate-950 text-xs font-medium rounded-md hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? 'Processing…' : 'Upload & Process'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      {saveMessage && (
        <div className="mt-3 bg-emerald-950/40 border border-emerald-700/60 text-emerald-100 px-4 py-3 rounded-md text-xs">
          {saveMessage}
        </div>
      )}

      {uploadErrors.length > 0 && (
        <div className="mt-4 border border-rose-800/50 rounded-lg overflow-hidden">
          <div className="bg-rose-950/50 px-4 py-2 border-b border-rose-800/50 flex items-center gap-2">
             <AlertCircle className="w-4 h-4 text-rose-400" />
             <span className="text-xs font-semibold text-rose-200">Failed Records details ({uploadErrors.length})</span>
          </div>
          <div className="max-h-48 overflow-y-auto bg-slate-900/50 p-2">
            <table className="w-full text-left text-[11px]">
              <thead className="text-rose-300 font-medium">
                <tr>
                   <th className="px-2 py-1">ID</th>
                   <th className="px-2 py-1">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-900/30 text-rose-100/80">
                {uploadErrors.map((err, i) => (
                  <tr key={i} className="hover:bg-rose-900/10">
                    <td className="px-2 py-1 font-mono">{err.odId}</td>
                    <td className="px-2 py-1">{err.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
