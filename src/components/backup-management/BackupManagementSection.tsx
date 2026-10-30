import React from 'react';
import { Database, Clock, AlertTriangle, CheckCircle, RefreshCw, X, Shield } from 'lucide-react';
import { BACKUP_PREVIEW_SECTIONS } from '@/lib/backupPreviewHeader';
import { WORKFLOW } from './constants';
import { formatBytes, formatWhen, statusLabel } from './utils';
import { useBackupManagementSectionLogic } from './hooks';

export const BackupManagementSection: React.FC = () => {
  const {
    snapshots,
    stats,
    loading,
    creating,
    error,
    setError,
    success,
    setSuccess,
    setCompareFor,
    compare,
    setCompare,
    comparing,
    restoreFor,
    setRestoreFor,
    confirmText,
    setConfirmText,
    restoring,
    inspectCollection,
    setInspectCollection,
    inspectQuery,
    setInspectQuery,
    inspectMonth,
    setInspectMonth,
    inspecting,
    inspection,
    setInspection,
    screen,
    setScreen,
    load,
    createCopy,
    openCompare,
    runInspect,
    restore,
    statCard,
  } = useBackupManagementSectionLogic();

  return (
    <section className="space-y-5 p-6 text-slate-900" aria-labelledby="backup-management-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 id="backup-management-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Database className="h-7 w-7 text-blue-600" aria-hidden />
            Database copies
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Each copy is a separate database with the same records as live. Creating a copy only reads live data.
            The last 7 verified copies are kept. They stay put if a day is missed, and the oldest is removed only when an 8th copy succeeds. Restore is admin-only and asks you to type the copy date.
          </p>
          <ol className="flex flex-wrap gap-2" aria-label="Workflow">
            {WORKFLOW.map((label, index) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {index + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <RefreshCw className={`h-4 w-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 rounded-lg p-1.5 text-red-800 hover:bg-red-100" aria-label="Dismiss error">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {success && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm">
          <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <span className="min-w-0 flex-1">{success}</span>
          <button type="button" onClick={() => setSuccess(null)} className="shrink-0 rounded-lg p-1.5 text-emerald-900 hover:bg-emerald-100" aria-label="Dismiss message">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className={statCard}>
            <div className="text-2xl font-bold text-blue-700">{stats.verifiedBackups}</div>
            <div className="text-sm font-medium text-slate-700">Verified copies</div>
          </div>
          <div className={statCard}>
            <div className="text-2xl font-bold text-emerald-700">{formatBytes(stats.totalSize)}</div>
            <div className="text-sm font-medium text-slate-700">Stored size</div>
          </div>
          <div className={statCard}>
            <div className="text-2xl font-bold text-violet-700">{stats.keepCopies} copies</div>
            <div className="text-sm font-medium text-slate-700">Kept</div>
          </div>
          <div className={statCard}>
            <div className="text-sm font-bold leading-snug text-amber-800">{formatWhen(stats.newestBackup)}</div>
            <div className="text-sm font-medium text-slate-700">Latest copy</div>
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={createCopy}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
        >
          {creating ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <Shield className="h-4 w-4" aria-hidden />}
          {creating ? 'Copying live data…' : "Copy today's data"}
        </button>
        <p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">
          This reads every business record and writes it into today’s copy database. Attendance on the live system stays as it is.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 className="text-base font-semibold text-slate-900">Saved copies</h3>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
            <span className="text-sm text-slate-600">Loading copies…</span>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Database className="mx-auto mb-4 h-12 w-12 text-slate-300" aria-hidden />
            <p className="font-medium text-slate-800">No copies yet</p>
            <p className="mt-2 text-sm text-slate-600">Create today’s copy before you need it.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {snapshots.map((snapshot) => (
              <li key={snapshot.dbName} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{snapshot.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          snapshot.status === 'verified'
                            ? 'bg-emerald-50 text-emerald-800'
                            : snapshot.status === 'failed'
                              ? 'bg-red-50 text-red-800'
                              : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {statusLabel(snapshot.status)}
                      </span>
                      {snapshot.kind === 'prerestore' && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Safety copy</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        {formatWhen(snapshot.createdAt)}
                      </span>
                      <span>{formatBytes(snapshot.sizeBytes)}</span>
                      <span>{snapshot.totalDocuments.toLocaleString('en-IN')} records</span>
                      <span>{snapshot.collections.length} collections</span>
                    </div>
                    {snapshot.error && <p className="mt-1 text-xs text-red-700">{snapshot.error}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openCompare(snapshot.dbName)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                    >
                      Compare
                    </button>
                    <button
                      type="button"
                      disabled={snapshot.status !== 'verified'}
                      onClick={() => setScreen({ dbName: snapshot.dbName, label: snapshot.label, section: 'summary' })}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-900 hover:bg-blue-100 disabled:opacity-40"
                    >
                      Open screens
                    </button>
                    <button
                      type="button"
                      disabled={snapshot.status !== 'verified'}
                      onClick={() => {
                        setRestoreFor(snapshot);
                        setConfirmText('');
                      }}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(comparing || compare) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-900">
              Live vs {compare?.label || 'copy'}
            </h3>
            <button type="button" onClick={() => { setCompare(null); setCompareFor(null); setInspection(null); }} className="text-sm text-slate-600 hover:text-slate-900">
              Close
            </button>
          </div>
          {comparing ? (
            <p className="text-sm text-slate-600">Counting records…</p>
          ) : compare ? (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {BACKUP_PREVIEW_SECTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={compare.status !== 'verified'}
                    onClick={() => setScreen({ dbName: compare.dbName, label: compare.label, section: item.id })}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-900 hover:bg-blue-100 disabled:opacity-40"
                  >
                    Open {item.label}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Collection</th>
                      <th className="py-2 pr-3 font-medium">Live</th>
                      <th className="py-2 pr-3 font-medium">Copy</th>
                      <th className="py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compare.rows.map((row) => (
                      <tr key={row.name} className="border-t border-slate-100">
                        <td className="py-2 pr-3 font-mono text-xs text-slate-800">{row.name}</td>
                        <td className="py-2 pr-3">{row.mainCount.toLocaleString('en-IN')}</td>
                        <td className="py-2 pr-3">{row.copyCount.toLocaleString('en-IN')}</td>
                        <td className={`py-2 ${row.state === 'match' ? 'text-emerald-700' : 'text-amber-800'}`}>
                          {row.state === 'match' && 'Same count'}
                          {row.state === 'mismatch' && 'Count differs'}
                          {row.state === 'added-after-copy' && 'Added on live after this copy'}
                          {row.state === 'missing-on-live' && 'Only in the copy'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <form
                className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[10rem_1fr_8rem_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  runInspect();
                }}
              >
                <label className="text-sm text-slate-700">
                  Collection
                  <select
                    value={inspectCollection}
                    onChange={(event) => setInspectCollection(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  >
                    {(compare.rows.length ? compare.rows : [{ name: 'users' }]).map((row) => (
                      <option key={row.name} value={row.name}>{row.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-700">
                  Employee email, code, or id
                  <input
                    value={inspectQuery}
                    onChange={(event) => setInspectQuery(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Month
                  <input
                    value={inspectMonth}
                    onChange={(event) => setInspectMonth(event.target.value)}
                    placeholder="YYYY-MM"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={inspecting}
                  className="self-end rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {inspecting ? 'Opening…' : 'Open record'}
                </button>
              </form>

              {inspection && inspection.matches.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {inspection.matches.map((match) => (
                    <li key={match._id}>
                      <button
                        type="button"
                        className="text-left text-blue-700 hover:underline"
                        onClick={() => {
                          setInspectQuery(match._id);
                          runInspect(match._id);
                        }}
                      >
                        {match.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {inspection && inspection.matches.length === 0 && (
                <div className="mt-3 space-y-2">
                  <p className={`text-sm font-medium ${inspection.equal ? 'text-emerald-700' : 'text-amber-800'}`}>
                    {!inspection.found && 'No matching record on live or on this copy.'}
                    {inspection.found && inspection.equal && 'This record matches on live and on the copy.'}
                    {inspection.found && inspection.equal === false && 'This record is different, or it exists on only one side.'}
                  </p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                      {JSON.stringify(inspection.main, null, 2) || 'null'}
                    </pre>
                    <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                      {JSON.stringify(inspection.copy, null, 2) || 'null'}
                    </pre>
                  </div>
                  <p className="text-xs text-slate-500">Left is live. Right is the copy. Passwords are hidden.</p>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {screen && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950/75 p-2 sm:p-4">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Backup {screen.label}</h3>
                <p className="text-xs text-slate-500">Same screens as the admin console, filled from this copy. Live data stays as it is.</p>
              </div>
              <button
                type="button"
                onClick={() => setScreen(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-2">
              {BACKUP_PREVIEW_SECTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScreen((current) => current ? { ...current, section: item.id } : current)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    screen.section === item.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <iframe
              key={`${screen.dbName}-${screen.section}`}
              title={`Backup ${screen.label} ${screen.section}`}
              className="min-h-0 w-full flex-1 bg-white"
              src={`/admin?backupPreview=${encodeURIComponent(screen.dbName)}&section=${encodeURIComponent(screen.section)}`}
            />
          </div>
        </div>
      )}

      {restoreFor && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h3 className="text-base font-semibold text-amber-950">Restore {restoreFor.label}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-amber-950">
            Do this when nobody is marking attendance. Current live data is saved first as a safety copy, then replaced with this copy.
            You can restore that safety copy if the result is wrong.
          </p>
          <label className="mt-3 block text-sm text-amber-950">
            Type <span className="font-mono font-semibold">{restoreFor.label}</span> to continue
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="mt-1 w-full max-w-md rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={restoring || confirmText.trim() !== restoreFor.label}
              onClick={restore}
              className="rounded-lg bg-amber-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {restoring ? 'Restoring…' : 'Replace live data'}
            </button>
            <button
              type="button"
              onClick={() => setRestoreFor(null)}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-950"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
