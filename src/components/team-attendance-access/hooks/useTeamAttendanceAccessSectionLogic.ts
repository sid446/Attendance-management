import { useEffect, useMemo, useState } from 'react';
import { User } from '@/types/ui';
import type { TeamAttendanceAccessRule, TeamAttendanceAccessSectionProps } from '../types';
import { getEntityId, normalizeName } from '../utils/teamAttendanceAccessUtils';

export function useTeamAttendanceAccessSectionLogic({ allUsers }: TeamAttendanceAccessSectionProps) {
  const [rules, setRules] = useState<TeamAttendanceAccessRule[]>([]);
  const [selectedViewerId, setSelectedViewerId] = useState('');
  const [includeOwnTeam, setIncludeOwnTeam] = useState(true);
  const [canApproveRequests, setCanApproveRequests] = useState(false);
  const [canApproveSelf, setCanApproveSelf] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [extraUserIds, setExtraUserIds] = useState<string[]>([]);
  const [extraPartnerNames, setExtraPartnerNames] = useState<string[]>([]);
  const [viewerSearchTerm, setViewerSearchTerm] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showGrantAllConfirm, setShowGrantAllConfirm] = useState(false);

  const activeUsers = useMemo(
    () => allUsers.filter((user) => user && user._id && user.isActive !== false),
    [allUsers]
  );

  const partnerNames = useMemo(() => {
    const names = new Set<string>();
    activeUsers.forEach((user) => {
      const name = String(user.workingUnderPartner || '').trim();
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [activeUsers]);

  const selectedViewer = useMemo(
    () => activeUsers.find((user) => user._id === selectedViewerId) || null,
    [activeUsers, selectedViewerId]
  );

  const selectedRule = useMemo(
    () => rules.find((rule) => getEntityId(rule.viewerUserId) === selectedViewerId) || null,
    [rules, selectedViewerId]
  );

  const viewerOptions = useMemo(() => {
    const term = viewerSearchTerm.trim().toLowerCase();
    const filtered = activeUsers.filter((user) => {
      if (!term) return true;
      return (
        String(user.name || '').toLowerCase().includes(term) ||
        String(user.employeeCode || '').toLowerCase().includes(term) ||
        String(user.odId || '').toLowerCase().includes(term) ||
        String(user.email || '').toLowerCase().includes(term)
      );
    });

    if (selectedViewer && !filtered.some((user) => user._id === selectedViewer._id)) {
      return [selectedViewer, ...filtered];
    }

    return filtered;
  }, [activeUsers, selectedViewer, viewerSearchTerm]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return activeUsers.filter((user) => {
      if (!term) return true;
      return (
        String(user.name || '').toLowerCase().includes(term) ||
        String(user.employeeCode || '').toLowerCase().includes(term) ||
        String(user.odId || '').toLowerCase().includes(term)
      );
    });
  }, [activeUsers, searchTerm]);

  const previewUsers = useMemo(() => {
    if (!selectedViewer || !isActive) return [];
    const visible = new Map<string, User>();
    const selectedViewerName = normalizeName(selectedViewer.name);

    if (includeOwnTeam) {
      activeUsers.forEach((user) => {
        if (user._id !== selectedViewerId && normalizeName(user.workingUnderPartner) === selectedViewerName) {
          visible.set(user._id, user);
        }
      });
    }

    activeUsers.forEach((user) => {
      if (extraUserIds.includes(user._id)) {
        visible.set(user._id, user);
      }
      if (
        user._id !== selectedViewerId &&
        user.workingUnderPartner &&
        extraPartnerNames.some((partner) => normalizeName(partner) === normalizeName(user.workingUnderPartner))
      ) {
        visible.set(user._id, user);
      }
    });

    if (!extraUserIds.includes(selectedViewerId)) {
      visible.delete(selectedViewerId);
    }

    return Array.from(visible.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeUsers, extraPartnerNames, extraUserIds, includeOwnTeam, isActive, selectedViewer, selectedViewerId]);

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/team-attendance-access', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch access rules');
      }
      setRules(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch access rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRules();
  }, []);

  useEffect(() => {
    if (!selectedViewerId && activeUsers.length > 0) {
      setSelectedViewerId(activeUsers[0]._id);
    }
  }, [activeUsers, selectedViewerId]);

  useEffect(() => {
    if (!selectedViewerId) return;
    if (!selectedRule) {
      setIncludeOwnTeam(true);
      setCanApproveRequests(false);
      setCanApproveSelf(false);
      setIsActive(true);
      setExtraUserIds([]);
      setExtraPartnerNames([]);
      return;
    }

    setIncludeOwnTeam(selectedRule.includeOwnTeam !== false);
    setCanApproveRequests(selectedRule.canApproveRequests !== false);
    setCanApproveSelf(selectedRule.canApproveSelf === true);
    setIsActive(selectedRule.isActive !== false);
    setExtraUserIds((selectedRule.extraUserIds || []).map(getEntityId).filter(Boolean));
    setExtraPartnerNames(selectedRule.extraPartnerNames || []);
  }, [selectedRule, selectedViewerId]);

  const toggleUser = (userId: string) => {
    setExtraUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const applyGrantAllActive = () => {
    setExtraUserIds(activeUsers.map((user) => user._id));
    setShowGrantAllConfirm(false);
    setMessage(
      `Selected all ${activeUsers.length} active employees for ${selectedViewer?.name || 'this viewer'}. Click Save Access to apply.`
    );
  };

  const togglePartner = (partnerName: string) => {
    setExtraPartnerNames((prev) =>
      prev.includes(partnerName) ? prev.filter((name) => name !== partnerName) : [...prev, partnerName]
    );
  };

  const saveRule = async () => {
    if (!selectedViewerId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/team-attendance-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewerUserId: selectedViewerId,
          includeOwnTeam,
          extraUserIds,
          extraPartnerNames,
          canApproveRequests,
          canApproveSelf: canApproveRequests && canApproveSelf,
          isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save access rule');
      }
      setMessage('Access rule saved.');
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save access rule');
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async () => {
    if (!selectedViewerId || !selectedRule) return;
    if (!window.confirm('Remove this custom team attendance access rule?')) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/team-attendance-access', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerUserId: selectedViewerId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to delete access rule');
      }
      setMessage('Custom access rule removed.');
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete access rule');
    } finally {
      setSaving(false);
    }
  };

  return {
    selectedViewerId,
    setSelectedViewerId,
    includeOwnTeam,
    setIncludeOwnTeam,
    canApproveRequests,
    setCanApproveRequests,
    canApproveSelf,
    setCanApproveSelf,
    isActive,
    setIsActive,
    extraUserIds,
    extraPartnerNames,
    viewerSearchTerm,
    setViewerSearchTerm,
    searchTerm,
    setSearchTerm,
    loading,
    saving,
    error,
    setError,
    message,
    setMessage,
    showGrantAllConfirm,
    setShowGrantAllConfirm,
    activeUsers,
    partnerNames,
    selectedViewer,
    selectedRule,
    viewerOptions,
    filteredUsers,
    previewUsers,
    toggleUser,
    applyGrantAllActive,
    togglePartner,
    saveRule,
    deleteRule,
  } as const;
}
