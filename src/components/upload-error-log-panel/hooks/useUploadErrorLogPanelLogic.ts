import { useEffect, useState } from 'react';
import { fetchUploadErrorLogs, sanitizeDownloadFileName } from '@/lib/uploadErrorLogUtils';
import type { UploadErrorLogPanelProps } from '../types';

export function useUploadErrorLogPanelLogic({ groupedErrors, logType, exportFilePrefix }: Pick<UploadErrorLogPanelProps, 'groupedErrors' | 'logType' | 'exportFilePrefix'>) {
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

  return {
    showLogs,
    setShowLogs,
    logs,
    loadingLogs,
    exportingKey,
    exportError,
    setExportError,
    totalCurrent,
    runExport,
    historicalExportName,
  } as const;
}
