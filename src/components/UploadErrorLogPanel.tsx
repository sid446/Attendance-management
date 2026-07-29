import React, { useEffect, useState } from 'react';
import { AlertCircle, Clock, Download, FileSpreadsheet, History, Loader2 } from 'lucide-react';
import {
  exportGroupedErrorsToExcel,
  exportHistoricalLogToExcel,
  fetchUploadErrorLogs,
  GroupedUploadError,
  sanitizeDownloadFileName,
  UploadLogType,
} from '@/lib/uploadErrorLogUtils';

interface UploadErrorLogPanelProps {
  groupedErrors: GroupedUploadError[];
  logType: UploadLogType;
  sectionTitle?: string;
  currentErrorsLabel?: string;
  exportFilePrefix: string;
}

export const UploadErrorLogPanel: React.FC<UploadErrorLogPanelProps> = ({
  groupedErrors,
  logType,
  sectionTitle = 'Upload history & logs',
  currentErrorsLabel = 'Current upload errors',
  exportFilePrefix,
}) => {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!showLogs) return;
    let cancelled = false;
    (async () => {
      setLoadingLogs(true);
      try {
        const data = await fetchUploadErrorLogs(logType);
        if (!cancelled) setLogs(data);
      } catch (err) {
        console.error('Failed to load upload logs:', err);
      } finally {
        if (!cancelled) setLoadingLogs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showLogs, logType]);

  const totalCurrent = groupedErrors.reduce((sum, e) => sum + e.count, 0);

  const runExport = async (key: string, action: () => Promise<void>) => {
    setExportError(null);
    setExportingKey(key);
    try {
      await action();
    } catch (err) {
      console.error('Failed to export error report:', err);
      setExportError(err instanceof Error ? err.message : 'Failed to download error report');
    } finally {
      setExportingKey(null);
    }
  };

  const historicalExportName = (log: { fileName?: string }) => {
    const original = String(log.fileName || 'upload').replace(/\.xlsx$/i, '');
    return sanitizeDownloadFileName(`${exportFilePrefix}_Errors_${original}.xlsx`);
  };

  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">{sectionTitle}</h3>
        <button
          type="button"
          onClick={() => setShowLogs(!showLogs)}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <History className="h-4 w-4" />
          {showLogs ? 'Hide logs' : 'View past logs'}
        </button>
      </div>

      {exportError && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{exportError}</span>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="text-xs font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {groupedErrors.length > 0 && !showLogs && (
        <div className="mt-4 overflow-hidden rounded-lg border border-red-200 shadow-sm">
          <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" aria-hidden />
              <span className="font-semibold text-red-900">
                {currentErrorsLabel} ({totalCurrent} total)
              </span>
            </div>
            <button
              type="button"
              disabled={exportingKey === 'current'}
              onClick={() =>
                runExport('current', () =>
                  exportGroupedErrorsToExcel(
                    groupedErrors,
                    `${exportFilePrefix}_Current_Errors.xlsx`
                  )
                )
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50 disabled:opacity-60"
            >
              {exportingKey === 'current' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export to Excel
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto bg-white p-0">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 font-medium text-slate-600 shadow-sm">
                <tr>
                  <th className="px-4 py-2">Error message</th>
                  <th className="px-4 py-2 text-center">Occurrences</th>
                  <th className="px-4 py-2">Sample records (max 5)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {groupedErrors.map((err, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="max-w-xs truncate px-4 py-2.5 text-red-700" title={err.message}>
                      {err.message}
                    </td>
                    <td className="px-4 py-2.5 text-center font-semibold text-slate-700">{err.count}</td>
                    <td
                      className="max-w-sm truncate px-4 py-2.5 font-mono text-xs text-slate-500"
                      title={(err.sampleRows || []).join(', ')}
                    >
                      {(err.sampleRows || []).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="mt-4 space-y-4">
          {loadingLogs ? (
            <div className="flex justify-center p-8 text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
              <span className="ml-3 text-sm">Loading logs…</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No error logs found.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log._id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center">
                  <div>
                    <h4 className="flex items-center gap-2 font-medium text-slate-800">
                      <FileSpreadsheet className="h-4 w-4 text-slate-500" />
                      {log.fileName}
                    </h4>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="h-3 w-3" />
                      {new Date(log.uploadDate).toLocaleString('en-GB')}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={exportingKey === log._id || !(log.errorDetails || []).length}
                    onClick={() =>
                      runExport(String(log._id), () =>
                        exportHistoricalLogToExcel(log, historicalExportName(log))
                      )
                    }
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50 disabled:opacity-60"
                  >
                    {exportingKey === log._id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                    ) : (
                      <Download className="h-4 w-4 text-slate-500" />
                    )}
                    Export Excel
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full whitespace-nowrap text-left text-sm">
                    <thead className="sticky top-0 border-b border-slate-200 bg-slate-50/50 font-medium text-slate-600 shadow-sm">
                      <tr>
                        <th className="px-4 py-2">Error message</th>
                        <th className="px-4 py-2 text-center">Occurrences</th>
                        <th className="px-4 py-2">Sample records</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {(log.errorDetails || []).map((err: GroupedUploadError, i: number) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="max-w-xs truncate px-4 py-2 text-red-600" title={err.message}>
                            {err.message}
                          </td>
                          <td className="px-4 py-2 text-center font-medium text-slate-700">{err.count}</td>
                          <td
                            className="max-w-sm truncate px-4 py-2 font-mono text-xs text-slate-500"
                            title={(err.sampleRows || []).join(', ')}
                          >
                            {(err.sampleRows || []).join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
