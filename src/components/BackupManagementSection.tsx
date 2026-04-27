import React, { useState, useEffect } from 'react';
import {
  Download,
  Upload,
  Database,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  X,
} from 'lucide-react';

interface BackupFile {
  _id: string;
  fileName: string;
  size: number;
  created: Date;
  collections: string[];
}

interface BackupStats {
  totalBackups: number;
  totalSize: number;
  oldestBackup: Date | null;
  newestBackup: Date | null;
  collections: string[];
}

const BACKUP_MANAGEMENT_WORKFLOW_STEPS = ['Review backups & stats', 'Create a new snapshot', 'Restore only when necessary'] as const;

export const BackupManagementSection: React.FC = () => {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [creatingBackup, setCreatingBackup] = useState<boolean>(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch backup data
  const fetchBackupData = async () => {
    setLoading(true);
    try {
      const [backupsResponse, statsResponse] = await Promise.all([
        fetch('/api/backup?action=list'),
        fetch('/api/backup?action=stats')
      ]);

      const backupsData = await backupsResponse.json();
      const statsData = await statsResponse.json();

      if (backupsData.success) {
        setBackups(backupsData.data.map((backup: any) => ({
          ...backup,
          created: new Date(backup.created)
        })));
      }

      if (statsData.success) {
        setStats({
          ...statsData.data,
          oldestBackup: statsData.data.oldestBackup ? new Date(statsData.data.oldestBackup) : null,
          newestBackup: statsData.data.newestBackup ? new Date(statsData.data.newestBackup) : null
        });
      }
    } catch (err) {
      setError('Failed to fetch backup data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackupData();
  }, []);

  // Create new backup
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          compress: true
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('Backup created successfully!');
        fetchBackupData(); // Refresh the list
      } else {
        setError(result.error || 'Failed to create backup');
      }
    } catch (err) {
      setError('Failed to create backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  // Restore from backup
  const handleRestoreBackup = async (backupId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to restore from ${fileName}? This will overwrite current data.`)) {
      return;
    }

    setRestoringBackup(backupId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ backupId }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(`Successfully restored ${result.data.documents} documents from ${result.data.collections.length} collections`);
        fetchBackupData(); // Refresh the list
      } else {
        setError(result.error || 'Failed to restore backup');
      }
    } catch (err) {
      setError('Failed to restore backup');
    } finally {
      setRestoringBackup(null);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const statCardCls = 'rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm';

  return (
    <section className="space-y-5 p-6 text-slate-900" aria-labelledby="backup-management-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 id="backup-management-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Database className="h-7 w-7 text-blue-600" aria-hidden />
            Database backup &amp; restore
          </h2>
          <p className="max-w-2xl text-sm text-slate-600">
            Create compressed snapshots and restore when you need to roll back data.
          </p>
          <ol className="flex flex-wrap gap-2" aria-label="Workflow">
            {BACKUP_MANAGEMENT_WORKFLOW_STEPS.map((label, i) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>
        <button
          type="button"
          onClick={fetchBackupData}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <RefreshCw className={`h-4 w-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-2 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 rounded-lg p-1.5 text-red-800 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500/25"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="mb-2 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm"
        >
          <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <span className="min-w-0 flex-1">{success}</span>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="shrink-0 rounded-lg p-1.5 text-emerald-900 transition-colors hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className={statCardCls}>
            <div className="text-2xl font-bold text-blue-700">{stats.totalBackups}</div>
            <div className="text-sm font-medium text-slate-700">Total backups</div>
          </div>
          <div className={statCardCls}>
            <div className="text-2xl font-bold text-emerald-700">{formatFileSize(stats.totalSize)}</div>
            <div className="text-sm font-medium text-slate-700">Total size</div>
          </div>
          <div className={statCardCls}>
            <div className="text-2xl font-bold text-violet-700">{stats.collections.length}</div>
            <div className="text-sm font-medium text-slate-700">Collections</div>
          </div>
          <div className={statCardCls}>
            <div className="text-sm font-bold leading-snug text-amber-800">
              {stats.newestBackup ? formatDate(stats.newestBackup) : 'None'}
            </div>
            <div className="text-sm font-medium text-slate-700">Latest backup</div>
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={handleCreateBackup}
          disabled={creatingBackup}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
        >
          {creatingBackup ? (
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          {creatingBackup ? 'Creating backup…' : 'Create new backup'}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 className="text-base font-semibold text-slate-900">Available backups</h3>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12" aria-live="polite">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
            <span className="text-sm text-slate-600">Loading backups…</span>
            <span className="sr-only">Loading backup list</span>
          </div>
        ) : backups.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Database className="mx-auto mb-4 h-12 w-12 text-slate-300" aria-hidden />
            <p className="font-medium text-slate-800">No backups found</p>
            <p className="mt-2 text-sm text-slate-600">Create your first backup to get started.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {backups.map((backup) => (
              <li key={backup._id} className="p-4 transition-colors hover:bg-slate-50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      <span className="truncate font-medium text-slate-900">{backup.fileName}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {formatDate(backup.created)}
                      </span>
                      <span>{formatFileSize(backup.size)}</span>
                      <span>
                        {backup.collections.length} collection{backup.collections.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {backup.collections.length > 0 && (
                      <div className="mt-2 text-xs text-slate-600">
                        <span className="font-medium text-slate-700">Collections:</span> {backup.collections.join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRestoreBackup(backup._id, backup.fileName)}
                      disabled={restoringBackup === backup._id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 transition-colors hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:opacity-50"
                    >
                      {restoringBackup === backup._id ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Upload className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Restore
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4 shadow-sm">
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Backup information</h4>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Backups are stored securely in your MongoDB database.</li>
          <li>Each backup contains all collections and their data.</li>
          <li>Restore operations will overwrite existing data.</li>
          <li>Backups are automatically cleaned up after 90 days.</li>
          <li>Only the 10 most recent backups are kept automatically.</li>
          <li>Backups include metadata about creation time and collections.</li>
        </ul>
      </div>
    </section>
  );
};