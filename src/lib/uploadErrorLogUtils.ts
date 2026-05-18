export type UploadLogType = 'attendance' | 'employee-master' | 'employee-schedule';

export type RowUploadError = {
  identifier: string;
  reason: string;
};

export type GroupedUploadError = {
  message: string;
  count: number;
  sampleRows: string[];
};

export function formatRowIdentifier(name: string, employeeCode?: string): string {
  const n = String(name || '').trim();
  const c = String(employeeCode || '').trim();
  if (n && c) return `${n} (${c})`;
  return n || c || '(unknown)';
}

export function groupRowErrors(errors: RowUploadError[]): GroupedUploadError[] {
  return errors.reduce((acc, curr) => {
    const existing = acc.find((e) => e.message === curr.reason);
    const id = curr.identifier || '(unknown)';
    if (existing) {
      existing.count++;
      if (existing.sampleRows.length < 5 && !existing.sampleRows.includes(id)) {
        existing.sampleRows.push(id);
      }
    } else {
      acc.push({
        message: curr.reason,
        count: 1,
        sampleRows: [id],
      });
    }
    return acc;
  }, [] as GroupedUploadError[]);
}

export function rowErrorsFromMessages(
  messages: string[],
  fallbackReason = 'Upload error'
): RowUploadError[] {
  return messages.map((msg) => ({
    identifier: '(upload)',
    reason: msg.trim() || fallbackReason,
  }));
}

export async function saveUploadErrorLog(
  fileName: string,
  errorDetails: GroupedUploadError[],
  logType: UploadLogType
): Promise<void> {
  if (errorDetails.length === 0) return;
  try {
    await fetch('/api/upload-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, errorDetails, logType }),
    });
  } catch (err) {
    console.error('Failed to save upload log', err);
  }
}

export async function fetchUploadErrorLogs(logType: UploadLogType): Promise<any[]> {
  const response = await fetch(`/api/upload-logs?type=${encodeURIComponent(logType)}`);
  const result = await response.json();
  if (result.success && Array.isArray(result.data)) {
    return result.data;
  }
  return [];
}

export async function exportGroupedErrorsToExcel(
  grouped: GroupedUploadError[],
  fileName: string,
  extraColumns?: Record<string, string>
): Promise<void> {
  const XLSX = (await import('xlsx')).default;
  const wsData = grouped.map((e) => ({
    ...(extraColumns || {}),
    'Error Message': e.message,
    Occurrences: e.count,
    'Sample Records (Max 5)': e.sampleRows.join(', '),
  }));
  const ws = XLSX.utils.json_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Errors');
  XLSX.writeFile(wb, fileName);
}

export async function exportHistoricalLogToExcel(
  log: { fileName: string; uploadDate: string | Date; errorDetails: GroupedUploadError[] },
  exportFileName: string
): Promise<void> {
  const XLSX = (await import('xlsx')).default;
  const wsData = log.errorDetails.map((e) => ({
    'File Name': log.fileName,
    'Upload Date': new Date(log.uploadDate).toLocaleString('en-GB'),
    'Error Message': e.message,
    Occurrences: e.count,
    'Sample Records (Max 5)': e.sampleRows.join(', '),
  }));
  const ws = XLSX.utils.json_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Errors');
  XLSX.writeFile(wb, exportFileName);
}
