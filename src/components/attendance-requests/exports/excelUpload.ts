import * as XLSX from 'xlsx';
import type { AttendanceRequest } from '../types';
import { resolveApproveValueNumber } from '../utils/requestValues';

const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '');

export interface ApplyExcelActionsParams {
  file: File;
  requests: AttendanceRequest[];
  onRefresh: () => Promise<void>;
  onRequestUpdate?: () => void;
}

export interface ApplyExcelActionsResult {
  okCount: number;
  failCount: number;
  sampleErrors: string;
}

export async function applyActionsFromExcel({
  file,
  requests,
  onRefresh,
  onRequestUpdate,
}: ApplyExcelActionsParams): Promise<ApplyExcelActionsResult> {
  const readAsArrayBuffer = () =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });

  const buffer = await readAsArrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('No worksheet found in the Excel file.');
  }

  const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' }) as any[][];
  if (!matrix.length) {
    throw new Error('No data rows found in the Excel file.');
  }

  const normalizeCell = (v: unknown) => normalizeHeader(v);

  const findHeaderRowIndex = () => {
    for (let r = 0; r < Math.min(matrix.length, 30); r++) {
      const row = matrix[r] || [];
      const rowNorm = row.map(normalizeCell);
      const hasRequestIds = rowNorm.some((c: string) => c.includes('request id'));
      const hasDecision = rowNorm.some(
        (c: string) => c.includes('decision') || c.includes('approve/reject') || c === 'status'
      );
      if (hasRequestIds && hasDecision) return r;
    }
    return -1;
  };

  const headerRowIndex = findHeaderRowIndex();
  if (headerRowIndex === -1) {
    throw new Error('Could not find header row in the Excel. Make sure it contains a "Request ID(s)" column.');
  }

  const headerRow = (matrix[headerRowIndex] || []).map((h) => String(h ?? '').trim());
  const normalizedHeaders = headerRow.map((h) => normalizeHeader(h));
  const colIndex = (name: string) => normalizedHeaders.findIndex((h) => h === normalizeHeader(name));

  const requestIdsCol =
    colIndex('Request ID(s)') >= 0
      ? colIndex('Request ID(s)')
      : colIndex('Request IDs') >= 0
        ? colIndex('Request IDs')
        : colIndex('Request Ids') >= 0
          ? colIndex('Request Ids')
          : colIndex('Request Id');

  const decisionCol =
    colIndex('Decision (Approve/Reject)') >= 0
      ? colIndex('Decision (Approve/Reject)')
      : colIndex('Decision') >= 0
        ? colIndex('Decision')
        : colIndex('Approve/Reject') >= 0
          ? colIndex('Approve/Reject')
          : colIndex('Status');

  const remarkCol =
    colIndex('Remark (Text)') >= 0
      ? colIndex('Remark (Text)')
      : colIndex('Remark') >= 0
        ? colIndex('Remark')
        : colIndex('Remarks');

  const valueCol =
    colIndex('Value') >= 0
      ? colIndex('Value')
      : colIndex('Approval Value') >= 0
        ? colIndex('Approval Value')
        : colIndex('Attendance Value') >= 0
          ? colIndex('Attendance Value')
          : -1;

  if (requestIdsCol < 0) {
    throw new Error('Missing "Request ID(s)" column in the Excel.');
  }
  if (decisionCol < 0) {
    throw new Error('Missing "Decision (Approve/Reject)" column in the Excel.');
  }

  const results: { rowIndex: number; ok: boolean; message?: string }[] = [];

  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const excelRowNumber = r + 1;

    const idsRaw = row[requestIdsCol];
    const decisionRaw = row[decisionCol];
    const remarkRaw = remarkCol >= 0 ? row[remarkCol] : '';

    const ids = String(idsRaw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const decision = String(decisionRaw ?? '').trim().toLowerCase();
    const remarks = String(remarkRaw ?? '').trim();
    const valueRaw = valueCol >= 0 ? row[valueCol] : '';

    if (!ids.length) {
      results.push({ rowIndex: excelRowNumber, ok: false, message: 'Missing Request ID(s)' });
      continue;
    }

    const action: 'approve' | 'reject' | null =
      decision === 'approve' || decision === 'approved'
        ? 'approve'
        : decision === 'reject' || decision === 'rejected'
          ? 'reject'
          : null;

    if (!action) {
      results.push({ rowIndex: excelRowNumber, ok: false, message: 'Decision must be Approve or Reject' });
      continue;
    }

    const firstReq = requests.find((r) => r._id === ids[0]);
    const excelValueStr =
      valueRaw !== undefined && valueRaw !== null && String(valueRaw).trim() !== '' ? String(valueRaw) : '';
    const resolvedNum =
      action === 'approve' && firstReq
        ? resolveApproveValueNumber(firstReq.requestedStatus, excelValueStr)
        : undefined;

    try {
      let response: Response;
      if (ids.length > 1) {
        response = await fetch('/api/partner/bulk-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            ids,
            remark: remarks,
            value: action === 'approve' ? resolvedNum : undefined,
            approvedBy: 'HR',
            approvedByEmail: 'hr@asija.in',
          }),
        });
      } else {
        response = await fetch('/api/employee/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: ids[0],
            action,
            remarks,
            value:
              action === 'approve' ? (resolvedNum !== undefined ? String(resolvedNum) : '') : '',
            approvedBy: 'HR',
            approvedByEmail: 'hr@asija.in',
          }),
        });
      }

      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        results.push({
          rowIndex: excelRowNumber,
          ok: false,
          message: json?.error || `API failed (HTTP ${response.status})`,
        });
      } else {
        results.push({ rowIndex: excelRowNumber, ok: true });
      }
    } catch {
      results.push({ rowIndex: excelRowNumber, ok: false, message: 'Network error' });
    }
  }

  await onRefresh();
  if (onRequestUpdate) onRequestUpdate();

  const okCount = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  const sampleErrors = fail
    .slice(0, 10)
    .map((f) => `Row ${f.rowIndex}: ${f.message}`)
    .join('\n');

  return { okCount, failCount: fail.length, sampleErrors };
}
