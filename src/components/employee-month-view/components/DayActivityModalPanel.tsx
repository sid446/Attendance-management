import { isHrModifiedAttendanceRecord } from '@/lib/attendanceRequestDayDisplay';
import { isExtraWorkRequest } from '@/lib/extraWorkRequest';
import type { DayActivityModalData } from '../types';
import { resolveExtraWorkTimeLines, formatDayActivityDate } from '../utils/employeeMonthViewUtils';

export function DayActivityModalPanel({
  data,
  onClose,
}: {
  data: DayActivityModalData;
  onClose: () => void;
}) {
  const { date, request, record } = data;
  const hrEditEntries = request?.hrEditHistory ?? [];
  const showHrEditFromRecord =
    isHrModifiedAttendanceRecord(record) && hrEditEntries.length === 0;
  const recordIn = record?.editedCheckin || record?.checkin || record?.inTime || '';
  const recordOut = record?.editedCheckout || record?.checkout || record?.outTime || '';
  const isExtraWork = request ? isExtraWorkRequest(request) : false;
  const extraWorkLines = resolveExtraWorkTimeLines(record, request);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-activity-title"
        className="relative max-h-[min(85vh,640px)] w-[min(440px,95%)] overflow-y-auto rounded-xl border border-blue-200/65 bg-panel p-4 text-sm text-slate-900 shadow-xl"
      >
        <h3 id="day-activity-title" className="mb-1 font-semibold text-slate-900">
          Day details
        </h3>
        <p className="mb-4 text-xs text-slate-500">{formatDayActivityDate(date)}</p>

        <div className="space-y-4">
          {(recordIn || recordOut) && (
            <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Attendance punch
              </h4>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-slate-600">In → out</dt>
                  <dd className="font-mono text-right text-slate-900">
                    {recordIn || '--:--'} → {recordOut || '--:--'}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {extraWorkLines.length > 0 && (
            <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900">
                Extra work
              </h4>
              <div className="space-y-2 text-xs">
                {extraWorkLines.map((line, index) => (
                  <div key={`${line.startTime}-${line.endTime}-${index}`} className="flex justify-between gap-4">
                    <dt className="shrink-0 text-amber-800">
                      Slot {index + 1}
                      {line.pending ? ' (pending)' : ''}
                    </dt>
                    <dd className="font-mono text-right text-amber-950">
                      {line.startTime || '--:--'} → {line.endTime || '--:--'}
                    </dd>
                  </div>
                ))}
              </div>
            </section>
          )}

          {request && (
            <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {request.requestSource === 'hr_direct'
                  ? 'HR calendar edit'
                  : isExtraWork
                    ? 'Extra work request'
                    : 'Correction request'}
              </h4>
              <dl className="space-y-2 text-xs">
                {request.requestSource === 'hr_direct' && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-slate-600">Source</dt>
                    <dd className="text-right text-slate-900">HR direct edit</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-slate-600">Status</dt>
                  <dd className="text-right font-medium text-slate-900">{request.status || 'Unknown'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-slate-600">Requested</dt>
                  <dd className="break-words text-right text-slate-900">
                    {request.requestedStatus || 'Unknown'}
                  </dd>
                </div>
                {request.originalStatus && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-slate-600">Original</dt>
                    <dd className="break-words text-right text-slate-900">{request.originalStatus}</dd>
                  </div>
                )}
                {request.reason && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-slate-600">Reason</dt>
                    <dd className="break-words text-right text-slate-900">{request.reason}</dd>
                  </div>
                )}
                {(request.startTime || request.endTime) && !isExtraWork && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-slate-600">Requested time</dt>
                    <dd className="text-right text-slate-900">
                      {[request.startTime, request.endTime].filter(Boolean).join(' – ') || '—'}
                    </dd>
                  </div>
                )}
                {request.createdAt && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-slate-600">Raised on</dt>
                    <dd className="text-right text-slate-900">
                      {new Date(request.createdAt).toLocaleString('en-IN')}
                    </dd>
                  </div>
                )}
                {request.status === 'Approved' && (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-slate-600">Approved by</dt>
                      <dd className="text-right text-slate-900">{request.approvedBy || 'Unknown'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-slate-600">Approver email</dt>
                      <dd className="break-all text-right text-slate-900">{request.approvedByEmail || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-slate-600">Approved on</dt>
                      <dd className="text-right text-slate-900">
                        {request.approvedAt
                          ? new Date(request.approvedAt).toLocaleString('en-IN')
                          : 'N/A'}
                      </dd>
                    </div>
                    {request.partnerRemarks && (
                      <div className="flex justify-between gap-4">
                        <dt className="shrink-0 text-slate-600">Partner remark</dt>
                        <dd className="break-words text-right text-slate-900">{request.partnerRemarks}</dd>
                      </div>
                    )}
                    {request.hrRemarks && (
                      <div className="flex justify-between gap-4">
                        <dt className="shrink-0 text-slate-600">HR remark</dt>
                        <dd className="break-words text-right text-slate-900">{request.hrRemarks}</dd>
                      </div>
                    )}
                    {request.hrValue && (
                      <div className="flex justify-between gap-4">
                        <dt className="shrink-0 text-slate-600">Approved value</dt>
                        <dd className="text-right text-slate-900">{request.hrValue}</dd>
                      </div>
                    )}
                  </>
                )}
                {request.status === 'Pending' && (
                  <p className="pt-1 text-slate-600">Awaiting approval from your partner.</p>
                )}
                {request.status === 'PendingHr' && (
                  <>
                    <p className="pt-1 text-rose-800">
                      Partner approved. <strong>HR final approval</strong> is required before your
                      attendance is updated.
                    </p>
                    {request.partnerRemarks && (
                      <div className="flex justify-between gap-4">
                        <dt className="shrink-0 text-slate-600">Partner remark</dt>
                        <dd className="break-words text-right text-slate-900">{request.partnerRemarks}</dd>
                      </div>
                    )}
                    {request.partnerApprovedAt && (
                      <div className="flex justify-between gap-4">
                        <dt className="shrink-0 text-slate-600">Partner approved on</dt>
                        <dd className="text-right text-slate-900">
                          {new Date(request.partnerApprovedAt).toLocaleString('en-IN')}
                        </dd>
                      </div>
                    )}
                  </>
                )}
                {request.status === 'Rejected' && (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-slate-600">Rejected by</dt>
                      <dd className="text-right text-slate-900">{request.rejectedBy || 'Unknown'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-slate-600">Rejecter email</dt>
                      <dd className="break-all text-right text-slate-900">{request.rejectedByEmail || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-slate-600">Rejected on</dt>
                      <dd className="text-right text-slate-900">
                        {request.rejectedAt
                          ? new Date(request.rejectedAt).toLocaleString('en-IN')
                          : 'N/A'}
                      </dd>
                    </div>
                    {request.partnerRemarks && (
                      <div className="flex justify-between gap-4">
                        <dt className="shrink-0 text-slate-600">Remark</dt>
                        <dd className="break-words text-right text-slate-900">{request.partnerRemarks}</dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            </section>
          )}

          {hrEditEntries.length > 0 && (
            <section className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fuchsia-800">
                HR edit history
              </h4>
              <div className="space-y-3">
                {[...hrEditEntries].reverse().map((entry, index) => (
                  <div
                    key={`${entry.editedAt || index}-${entry.editedByEmail || index}`}
                    className="rounded-md border border-fuchsia-100 bg-white/80 p-2.5 text-xs"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-fuchsia-900">
                        {entry.editedByEmail || entry.editedBy || 'HR'}
                      </span>
                      {entry.editedAt && (
                        <span className="text-[10px] text-slate-500">
                          {new Date(entry.editedAt).toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                    {entry.changeSummary && (
                      <p className="mb-1.5 font-medium text-slate-800">{entry.changeSummary}</p>
                    )}
                    <dl className="space-y-1 text-[11px] text-slate-600">
                      {(entry.previousStatus || entry.newStatus) && (
                        <div className="flex justify-between gap-3">
                          <dt>Status</dt>
                          <dd className="text-right text-slate-800">
                            {entry.previousStatus || '—'} → {entry.newStatus || '—'}
                          </dd>
                        </div>
                      )}
                      {(entry.previousStartTime ||
                        entry.previousEndTime ||
                        entry.newStartTime ||
                        entry.newEndTime) && (
                        <div className="flex justify-between gap-3">
                          <dt>Time</dt>
                          <dd className="text-right text-slate-800">
                            {[entry.previousStartTime, entry.previousEndTime]
                              .filter(Boolean)
                              .join(' – ') || '—'}{' '}
                            →{' '}
                            {[entry.newStartTime, entry.newEndTime].filter(Boolean).join(' – ') || '—'}
                          </dd>
                        </div>
                      )}
                      {(entry.previousValue || entry.newValue) && (
                        <div className="flex justify-between gap-3">
                          <dt>Value</dt>
                          <dd className="text-right text-slate-800">
                            {entry.previousValue || '—'} → {entry.newValue || '—'}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {entry.remarks && (
                      <p className="mt-1.5 text-[11px] text-slate-700">
                        <span className="text-slate-500">Remark: </span>
                        {entry.remarks}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {showHrEditFromRecord && (
            <section className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fuchsia-800">
                HR attendance edit
              </h4>
              <dl className="space-y-2 text-xs">
                {record?.typeOfPresence && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-slate-600">Status on record</dt>
                    <dd className="break-words text-right text-slate-900">{record.typeOfPresence}</dd>
                  </div>
                )}
                {(recordIn || recordOut) && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-slate-600">Times on record</dt>
                    <dd className="text-right text-slate-900">
                      {recordIn || '--:--'} → {recordOut || '--:--'}
                    </dd>
                  </div>
                )}
                {typeof record?.value === 'number' && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-slate-600">Day value</dt>
                    <dd className="text-right text-slate-900">{record.value}</dd>
                  </div>
                )}
                {record?.remarks && (
                  <div className="flex flex-col gap-1">
                    <dt className="text-slate-600">HR note</dt>
                    <dd className="break-words rounded-md border border-fuchsia-100 bg-white/80 px-2 py-1.5 text-slate-900">
                      {record.remarks}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-blue-200/65 bg-panel px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
