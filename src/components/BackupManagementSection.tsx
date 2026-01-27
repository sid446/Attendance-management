import React, { useState, useEffect } from 'react';
import { Download, Upload, Trash2, Database, Clock, FileText, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

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

  return (
    <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-blue-400 flex items-center gap-2">
          <Database className="w-6 h-6" />
          Database Backup & Restore
        </h2>
        <button
          onClick={fetchBackupData}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 text-rose-300 px-4 py-3 rounded-md mb-6 border border-rose-500/20 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 text-emerald-300 px-4 py-3 rounded-md mb-6 border border-emerald-500/20 flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}

      {/* Backup Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-400">{stats.totalBackups}</div>
            <div className="text-sm text-slate-400">Total Backups</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">{formatFileSize(stats.totalSize)}</div>
            <div className="text-sm text-slate-400">Total Size</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="text-lg font-bold text-purple-400">{stats.collections.length}</div>
            <div className="text-sm text-slate-400">Collections</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="text-sm font-bold text-orange-400">
              {stats.newestBackup ? formatDate(stats.newestBackup) : 'None'}
            </div>
            <div className="text-sm text-slate-400">Latest Backup</div>
          </div>
        </div>
      )}

      {/* Create Backup Button */}
      <div className="mb-6">
        <button
          onClick={handleCreateBackup}
          disabled={creatingBackup}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors disabled:opacity-50"
        >
          {creatingBackup ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {creatingBackup ? 'Creating Backup...' : 'Create New Backup'}
        </button>
      </div>

      {/* Backup Files List */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-slate-200">Available Backups</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-slate-400" />
            <div className="text-slate-400">Loading backups...</div>
          </div>
        ) : backups.length === 0 ? (
          <div className="p-8 text-center">
            <Database className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <div className="text-slate-400">No backups found</div>
            <div className="text-sm text-slate-500 mt-2">Create your first backup to get started</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {backups.map((backup, index) => (
              <div key={index} className="p-4 hover:bg-slate-800/30">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="font-medium text-slate-200">{backup.fileName}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(backup.created)}
                      </span>
                      <span>{formatFileSize(backup.size)}</span>
                      <span>{backup.collections.length} collections</span>
                    </div>
                    {backup.collections.length > 0 && (
                      <div className="mt-2 text-xs text-slate-500">
                        Collections: {backup.collections.join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestoreBackup(backup._id, backup.fileName)}
                      disabled={restoringBackup === backup._id}
                      className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs transition-colors disabled:opacity-50"
                    >
                      {restoringBackup === backup.fileName ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Upload className="w-3 h-3" />
                      )}
                      Restore
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backup Information */}
      <div className="mt-6 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
        <h4 className="text-sm font-semibold text-slate-200 mb-2">Backup Information</h4>
        <ul className="text-sm text-slate-400 space-y-1">
          <li>• Backups are stored securely in your MongoDB database</li>
          <li>• Each backup contains all collections and their data</li>
          <li>• Restore operations will overwrite existing data</li>
          <li>• Backups are automatically cleaned up after 90 days</li>
          <li>• Only the 10 most recent backups are kept automatically</li>
          <li>• Backups include metadata about creation time and collections</li>
        </ul>
      </div>
    </div>
  );
};