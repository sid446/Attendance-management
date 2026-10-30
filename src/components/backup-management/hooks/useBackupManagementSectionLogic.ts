import { useEffect, useState } from 'react';
import type { SnapshotRecord, BackupStats, CompareResult, InspectResult } from '../types';

export function useBackupManagementSectionLogic() {
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [compareFor, setCompareFor] = useState<string | null>(null);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [restoreFor, setRestoreFor] = useState<SnapshotRecord | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [inspectCollection, setInspectCollection] = useState('users');
  const [inspectQuery, setInspectQuery] = useState('');
  const [inspectMonth, setInspectMonth] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<InspectResult | null>(null);
  const [screen, setScreen] = useState<{ dbName: string; label: string; section: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [listResponse, statsResponse] = await Promise.all([
        fetch('/api/backup?action=list'),
        fetch('/api/backup?action=stats'),
      ]);
      const listBody = await listResponse.json();
      const statsBody = await statsResponse.json();
      if (!listResponse.ok || !listBody.success) {
        throw new Error(listBody.error || 'Could not load backups');
      }
      setSnapshots(listBody.data || []);
      if (statsResponse.ok && statsBody.success) setStats(statsBody.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createCopy = async () => {
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/backup', { method: 'POST' });
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Backup failed');
      }
      const snap = body.data?.snapshot as SnapshotRecord | undefined;
      setSuccess(
        snap
          ? `Verified copy ${snap.label} saved in a separate database. Live data was not changed.`
          : 'Verified copy saved. Live data was not changed.'
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setCreating(false);
    }
  };

  const openCompare = async (dbName: string) => {
    setCompareFor(dbName);
    setCompare(null);
    setInspection(null);
    setComparing(true);
    setError(null);
    try {
      const response = await fetch(`/api/backup/compare?dbName=${encodeURIComponent(dbName)}`);
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Compare failed');
      setCompare(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compare failed');
    } finally {
      setComparing(false);
    }
  };

  const runInspect = async (queryOverride?: string) => {
    if (!compareFor) return;
    const query = (queryOverride ?? inspectQuery).trim();
    setInspecting(true);
    setError(null);
    setInspection(null);
    try {
      const params = new URLSearchParams({
        dbName: compareFor,
        collection: inspectCollection,
        q: query,
      });
      if (inspectMonth.trim()) params.set('monthYear', inspectMonth.trim());
      const response = await fetch(`/api/backup/inspect?${params.toString()}`);
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not open that record');
      setInspection(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that record');
    } finally {
      setInspecting(false);
    }
  };

  const restore = async () => {
    if (!restoreFor) return;
    setRestoring(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbName: restoreFor.dbName, confirmText }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Restore failed');
      setSuccess(
        `Live data now matches ${restoreFor.label}. The previous live data is saved as ${body.data?.safetyDbName}.`
      );
      setRestoreFor(null);
      setConfirmText('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const statCard = 'rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm';

  return {
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
  } as const;
}
