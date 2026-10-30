"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TeamMember, ApproverGroup, ApproverOption, ManageAttendanceApproverSectionProps } from '../types';
import { loginEmailKey, displayLoginEmail } from '../utils/manageAttendanceApproverUtils';

export function useManageAttendanceApproverSectionLogic({ viewerUserId }: ManageAttendanceApproverSectionProps) {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [groups, setGroups] = useState<ApproverGroup[]>([]);
  const [approverPickList, setApproverPickList] = useState<ApproverOption[]>([]);
  const [draftEmails, setDraftEmails] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = useCallback(async () => {
    if (!viewerUserId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/employee/team-attendance-approver?viewerUserId=${encodeURIComponent(viewerUserId)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load team approvers");
      }
      const data = json.data || {};
      const nextMembers: TeamMember[] = Array.isArray(data.members) ? data.members : [];
      setMembers(nextMembers);
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setApproverPickList(Array.isArray(data.approverPickList) ? data.approverPickList : []);
      const drafts: Record<string, string> = {};
      nextMembers.forEach((member) => {
        drafts[member._id] = member.attendanceEmail || member.email || "";
      });
      setDraftEmails(drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team approvers");
      setMembers([]);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [viewerUserId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredMembers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(term) ||
        member.odId.toLowerCase().includes(term) ||
        member.employeeCode.toLowerCase().includes(term) ||
        member.attendanceEmail.toLowerCase().includes(term)
    );
  }, [members, searchTerm]);

  const pickListByLoginEmail = useMemo(() => {
    const map = new Map<string, ApproverOption>();
    approverPickList.forEach((option) => {
      const key = loginEmailKey(option);
      if (key && !map.has(key)) map.set(key, option);
    });
    return map;
  }, [approverPickList]);

  const handleSelectApprover = (employeeId: string, approverUserId: string) => {
    const option = approverPickList.find((item) => item._id === approverUserId);
    if (!option) return;
    setDraftEmails((prev) => ({
      ...prev,
      [employeeId]: displayLoginEmail(option),
    }));
  };

  const handleSave = async (member: TeamMember) => {
    const attendanceEmail = String(draftEmails[member._id] || "").trim();
    if (!attendanceEmail) {
      setError("Attendance approver email is required.");
      return;
    }
    setSavingId(member._id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/employee/team-attendance-approver", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewerUserId,
          employeeId: member._id,
          attendanceEmail,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save");
      }
      setMessage(`Updated attendance approver for ${member.name}.`);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  return {
    loading,
    savingId,
    error,
    message,
    members,
    groups,
    approverPickList,
    draftEmails,
    setDraftEmails,
    searchTerm,
    setSearchTerm,
    filteredMembers,
    pickListByLoginEmail,
    handleSelectApprover,
    handleSave,
  } as const;
}
