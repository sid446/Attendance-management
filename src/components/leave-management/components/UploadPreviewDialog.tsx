import React from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import type { UploadPreview } from '../types';
import { formatMonthLabel, formatLeaveValue } from '../utils/leaveManagementUtils';

export const UploadPreviewDialog: React.FC<{
  preview: UploadPreview;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}> = ({ preview, busy, onApply, onCancel }) => {
  const { matched, notFound, ambiguous, invalid, duplicateNames, reconcile } = preview;
  const userById = new Map(reconcile.users.map((u) => [u.userId, u]));
  const problems = notFound.length + ambiguous.length + invalid.length + duplicateNames.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Check before saving</h3>
            <p className="mt-1 text-sm text-slate-600">
              Nothing has been saved yet. This is what will happen if you continue.
              {preview.kind === 'adj' && preview.monthYear && (
                <> Values are the Adj/LWP <strong>change for {formatMonthLabel(preview.monthYear)}</strong> (overall till now is not typed).</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-4">
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{matched.length}</div>
            <div className="text-xs text-slate-600">Employees matched</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {reconcile.recordsUpdated}
            </div>
            <div className="text-xs text-slate-600">Attendance days changing</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {reconcile.usersProcessed}
            </div>
            <div className="text-xs text-slate-600">Recalculated</div>
          </div>
          <div>
            <div className={`text-2xl font-bold tabular-nums ${problems > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {problems}
            </div>
            <div className="text-xs text-slate-600">Rows needing attention</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <p className="text-sm text-slate-600">
            Leave will be recalculated from <strong>{reconcile.fromMonth}</strong> to{' '}
            <strong>{reconcile.toMonth}</strong> as{' '}
            <strong>B/F + earned after Jan − used after Jan + Adj till month</strong>, where earned
            is 2 per month with attendance (articles earn none). Days set by an approved employee
            request are kept exactly as they are. Employees not listed in the file are untouched.
            {preview.kind === 'adj' && preview.monthYear && (
              <> The uploaded number is the Adj/LWP change for {formatMonthLabel(preview.monthYear)}. Adj till this month is recalculated and is not editable.</>
            )}
            {reconcile.usersSkippedNoAttendance > 0 && (
              <> {reconcile.usersSkippedNoAttendance} matched employee(s) have no attendance in this range and will only get the new {preview.kind === 'adj' ? 'Adj/LWP' : 'opening balance'}.</>
            )}
          </p>

          {notFound.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="mb-1 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {notFound.length} name(s) not found — these rows will be skipped
              </div>
              <div className="text-amber-900/90">{notFound.join(', ')}</div>
            </div>
          )}

          {ambiguous.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="mb-1 font-medium">
                {ambiguous.length} name(s) match more than one employee — skipped
              </div>
              <ul className="list-disc pl-5">
                {ambiguous.map((a) => (
                  <li key={a.excelName}>
                    {a.excelName} → {a.candidates.join(' / ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {invalid.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="mb-1 font-medium">
                {invalid.length} row(s) have an unusable {preview.kind === 'adj' ? 'Adj/LWP' : 'B/F'} value
              </div>
              <ul className="list-disc pl-5">
                {invalid.map((r) => (
                  <li key={r.excelName}>
                    {r.excelName} — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {duplicateNames.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="mb-1 font-medium">
                {duplicateNames.length} repeated name(s) — only the first row was used
              </div>
              <div>{duplicateNames.join(', ')}</div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Employee
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {preview.kind === 'adj' ? 'Adj this month now' : 'B/F now'}
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {preview.kind === 'adj' ? 'Adj this month new' : 'B/F new'}
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Earned after Jan
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Used after Jan
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Balance after
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Days changing
                  </th>
                </tr>
              </thead>
              <tbody>
                {matched.map((m) => {
                  const u = userById.get(m.userId);
                  return (
                    <tr key={m.userId} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-900">
                        <div className="font-medium">{m.userName}</div>
                        {m.excelName !== m.userName && (
                          <div className="text-xs text-slate-500">in file: {m.excelName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-600">
                        {formatLeaveValue(
                          preview.kind === 'adj' ? m.currentLeaveAdjLwp : m.currentBalanceAsOfJan26
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-medium tabular-nums text-slate-900">
                        {formatLeaveValue(
                          preview.kind === 'adj' ? m.newLeaveAdjLwp : m.newBalanceAsOfJan26
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-emerald-800">
                        {u ? (u.isArticle ? 'N/A' : `+${formatLeaveValue(u.earned)}`) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-700">
                        {u ? formatLeaveValue(u.usedAfterJan26) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center font-medium tabular-nums text-slate-900">
                        {u ? formatLeaveValue(u.remaining) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-700">
                        {u && u.attendanceDayChanges > 0 ? (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                            {u.attendanceDayChanges}
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {reconcile.sampleChanges.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-900">
                Attendance days that will change
              </h4>
              <ul className="space-y-1 text-sm text-slate-700">
                {reconcile.sampleChanges.map((c, i) => (
                  <li key={`${c.userName}-${c.date}-${i}`}>
                    <span className="font-medium text-slate-900">{c.userName}</span> — {c.date}:{' '}
                    {c.fromType} → <strong>{c.toType}</strong>
                  </li>
                ))}
              </ul>
              {reconcile.recordsUpdated > reconcile.sampleChanges.length && (
                <p className="mt-2 text-xs text-slate-500">
                  Showing the first {reconcile.sampleChanges.length} of {reconcile.recordsUpdated}.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={busy || matched.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />}
            Save and recalculate
          </button>
        </div>
      </div>
    </div>
  );
};
