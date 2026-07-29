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

async function loadXlsx() {
  const mod = await import('xlsx');
  // Next / bundlers may expose the API on the namespace or on `.default`.
  return (mod as { default?: typeof mod }).default ?? mod;
}

/** Windows / browser-safe download name (slashes in original upload names break downloads). */
export function sanitizeDownloadFileName(name: string): string {
  const trimmed = String(name || 'errors').trim() || 'errors';
  const withExt = /\.xlsx$/i.test(trimmed) ? trimmed : `${trimmed}.xlsx`;
  return withExt
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizeDownloadFileName(fileName);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function downloadSheetAsExcel(
  rows: Record<string, string | number>[],
  fileName: string,
  sheetName = 'Errors'
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Excel download is only available in the browser');
  }
  if (!rows.length) {
    throw new Error('No errors to export');
  }

  const XLSX = await loadXlsx();
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBrowserDownload(blob, fileName);
}

export async function exportGroupedErrorsToExcel(
  grouped: GroupedUploadError[],
  fileName: string,
  extraColumns?: Record<string, string>
): Promise<void> {
  const wsData = grouped.map((e) => ({
    ...(extraColumns || {}),
    'Error Message': e.message,
    Occurrences: e.count,
    'Sample Records (Max 5)': (e.sampleRows || []).join(', '),
  }));
  await downloadSheetAsExcel(wsData, fileName);
}

export async function exportHistoricalLogToExcel(
  log: { fileName: string; uploadDate: string | Date; errorDetails: GroupedUploadError[] },
  exportFileName: string
): Promise<void> {
  const details = Array.isArray(log.errorDetails) ? log.errorDetails : [];
  const wsData = details.map((e) => ({
    'File Name': log.fileName,
    'Upload Date': new Date(log.uploadDate).toLocaleString('en-GB'),
    'Error Message': e.message,
    Occurrences: e.count,
    'Sample Records (Max 5)': (e.sampleRows || []).join(', '),
  }));
  // Strip any extension from the original upload name before building the export name,
  // so we never produce `…file.xlsx.xlsx` or keep path separators from the source file.
  const base = String(exportFileName || 'Upload_Errors').replace(/\.xlsx$/i, '');
  await downloadSheetAsExcel(wsData, `${base}.xlsx`);
}
