import React, { useState, useEffect, ChangeEvent, useMemo, useCallback, useRef } from 'react';
import { Edit2, Save, X, Plus, Upload, FileUp, Filter, Trash2, Search, Download, ChevronDown, ChevronUp, FileSpreadsheet, Settings, Users, Briefcase, CreditCard, Tag } from 'lucide-react';
import * as XLSX from 'xlsx';
import { User as UserBase, ScheduleTime, DailySchedule } from '@/types/ui';
import { fullEditDefaults, type EmployeeManagementTabId, type HrAccessLevel } from '@/lib/hrConsolePermissionUtils';
import { pickEditableUserPutBody, pickEditableFieldHistories, type EmployeeTabAccess } from '@/lib/hrEmployeeSaveFilter';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { confirmMajorAction } from '@/lib/confirmMajorAction';
import { getActiveFieldHistoryEntry } from '@/lib/userFieldHistory';
import { createDefaultDailySchedule, cloneDailySchedule } from '@/lib/defaultDailySchedule';
import { ScheduleTemplateToolbar } from '@/components/ScheduleTemplateToolbar';
import { ScheduleTemplateModal, type ScheduleTemplateRecord } from '@/components/ScheduleTemplateModal';

// Extend User type to include articleCreditsAsOnJan26 for local use
type User = UserBase & {
  articleCreditsAsOnJan26?: number;
};

type ManagedFieldKey =
  | 'designation'
  | 'registeredUnderPartner'
  | 'workingUnderPartner'
  | 'basicSalary'
  | 'laptopAllowance'
  | 'totalSalaryPerMonth'
  | 'totalSalaryPerAnnum';

const getDefaultManagedEffectiveDates = (): Record<ManagedFieldKey, string> => {
  return {
    designation: '',
    registeredUnderPartner: '',
    workingUnderPartner: '',
    basicSalary: '',
    laptopAllowance: '',
    totalSalaryPerMonth: '',
    totalSalaryPerAnnum: '',
  };
};

/** Stable MongoDB document id for URLs and comparisons (handles string, $oid, ObjectId-like). */
function isUserMarkedInactive(user: Pick<User, 'isActive'>): boolean {
  if (user.isActive === false) return true;
  const raw: unknown = user.isActive;
  return typeof raw === 'string' && raw.toLowerCase() === 'false';
}

function formatInactiveSinceDate(value: unknown): string {
  const ymd = toDateInputValue(value);
  if (!ymd) return '';
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function normalizeMongoId(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') {
    const s = raw.trim();
    return s && s !== 'undefined' ? s : '';
  }
  if (typeof raw === 'object' && raw !== null && '$oid' in (raw as Record<string, unknown>)) {
    const oid = (raw as { $oid: unknown }).$oid;
    return typeof oid === 'string' ? oid.trim() : '';
  }
  const s = String(raw);
  return s === '[object Object]' ? '' : s;
}

/** yyyy-mm-dd for <input type="date"> — local calendar day; empty if invalid */
function toDateInputValue(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const lead = t.match(/^(\d{4}-\d{2}-\d{2})/);
    if (lead) return lead[1];
  }
  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

const getManagedEffectiveDatesFromUser = (user?: Partial<User>): Record<ManagedFieldKey, string> => {
  const defaults = getDefaultManagedEffectiveDates();
  const fieldHistories = (user as any)?.fieldHistories || {};

  const fields: ManagedFieldKey[] = [
    'designation',
    'registeredUnderPartner',
    'workingUnderPartner',
    'basicSalary',
    'laptopAllowance',
    'totalSalaryPerMonth',
    'totalSalaryPerAnnum',
  ];

  for (const field of fields) {
    const history = Array.isArray(fieldHistories[field]) ? fieldHistories[field] : [];
    if (history.length === 0) continue;

    const active = history.find((h: any) => h && (h.effectiveTo === null || h.effectiveTo === undefined));
    const selected = active || history[history.length - 1];
    defaults[field] = toDateInputValue(selected?.effectiveFrom);
  }

  return defaults;
};

type SalaryHistoryFieldKey =
  | 'basicSalary'
  | 'laptopAllowance'
  | 'totalSalaryPerMonth'
  | 'totalSalaryPerAnnum';

/** Fields that show expandable effective-dated history (salary + HR basics). */
type FieldHistoryKey =
  | SalaryHistoryFieldKey
  | 'designation'
  | 'workingUnderPartner'
  | 'registeredUnderPartner';

function sortSalaryHistoryDesc(fieldHistory: unknown): Array<{
  value?: string;
  effectiveFrom?: unknown;
  effectiveTo?: unknown;
}> {
  const arr = Array.isArray(fieldHistory) ? [...fieldHistory] : [];
  return arr.sort(
    (a, b) =>
      new Date((b as { effectiveFrom?: string }).effectiveFrom as string).getTime() -
      new Date((a as { effectiveFrom?: string }).effectiveFrom as string).getTime()
  );
}

function formatSalaryHistoryRowDate(value: unknown): string {
  if (value == null || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB');
}

const USERS_LIST_ENDPOINT = '/api/users?listOnly=1&includeInactive=1';

/** Shown under edit/add titles; matches roster “numbered chips” pattern. */
const EDIT_EMPLOYEE_WORKFLOW_STEPS = ['Choose tab', 'Update fields', 'Save changes'] as const;
const ADD_EMPLOYEE_WORKFLOW_STEPS = ['Basic details', 'Schedule if needed', 'Create employee'] as const;

function EmployeeManagementTableSkeleton() {
  const rowCount = 8;
  return (
    <div className="overflow-x-auto" aria-busy="true" aria-label="Loading employees">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs font-medium uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3.5" scope="col">
              Employee
            </th>
            <th className="hidden px-4 py-3.5 md:table-cell" scope="col">
              Email
            </th>
            <th className="hidden px-4 py-3.5 lg:table-cell" scope="col">
              Team
            </th>
            <th className="hidden px-4 py-3.5 sm:table-cell" scope="col">
              Designation
            </th>
            <th className="hidden px-4 py-3.5 xl:table-cell" scope="col">
              Joined
            </th>
            <th className="hidden px-4 py-3.5 md:table-cell" scope="col">
              Status
            </th>
            <th className="px-4 py-3.5 text-right" scope="col">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 animate-pulse">
          {Array.from({ length: rowCount }, (_, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-sky-100/40' : 'bg-panel/80'}>
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-xl bg-slate-200/80" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3.5 max-w-full w-36 rounded bg-slate-200" />
                    <div className="h-2.5 max-w-full w-24 rounded bg-slate-100" />
                  </div>
                </div>
              </td>
              <td className="hidden px-4 py-3.5 md:table-cell">
                <div className="h-3 w-40 rounded bg-slate-200" />
              </td>
              <td className="hidden px-4 py-3.5 lg:table-cell">
                <div className="h-3 w-28 rounded bg-slate-200" />
              </td>
              <td className="hidden px-4 py-3.5 sm:table-cell">
                <div className="h-3 w-24 rounded bg-slate-200" />
              </td>
              <td className="hidden px-4 py-3.5 xl:table-cell">
                <div className="h-3 w-20 rounded bg-slate-200" />
              </td>
              <td className="hidden px-4 py-3.5 md:table-cell">
                <div className="h-3 w-16 rounded bg-slate-200" />
              </td>
              <td className="px-4 py-3.5 text-right">
                <div className="ml-auto h-8 w-20 rounded-lg bg-slate-200" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { Workbook, Worksheet, Row, Cell } from 'exceljs';

export const EmployeeManagementSection: React.FC<{
  selectedUserId?: string | null;
  onRefreshUsers?: () => void;
  employeesSectionAccess?: HrAccessLevel;
  employeeTabAccess?: EmployeeTabAccess;
}> = ({ selectedUserId, onRefreshUsers, employeesSectionAccess = 'edit', employeeTabAccess: employeeTabAccessProp }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Edit State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({});
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);

  // Filter State
  const [filterDesignations, setFilterDesignations] = useState<string[]>([]);
  const [filterTeams, setFilterTeams] = useState<string[]>([]);
  const [filterUsers, setFilterUsers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  /** When false, deactivated employees are hidden from the table (still in data for export / re-activate). */
  const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);
  // Dropdown visibility state
  const [showDesignationDropdown, setShowDesignationDropdown] = useState(false);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Upload State
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStats, setUploadStats] = useState<any>(null);

  // UI State
  const [showAdditionalFields, setShowAdditionalFields] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'schedule' | 'extended' | 'bank' | 'salary' | 'history'>('basic');
  const [showBulkUploadFormat, setShowBulkUploadFormat] = useState<boolean>(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState<boolean>(false);

  const tabAccess = useMemo(
    () => employeeTabAccessProp ?? fullEditDefaults().employeeTabs,
    [employeeTabAccessProp]
  );
  const employeesCanEdit = employeesSectionAccess === 'edit';
  const denyEdits = !employeesCanEdit || tabAccess[activeTab] !== 'edit';

  useEffect(() => {
    if (tabAccess[activeTab] !== 'none') return;
    const order: EmployeeManagementTabId[] = ['basic', 'schedule', 'extended', 'bank', 'salary', 'history'];
    const next = order.find((t) => tabAccess[t] !== 'none');
    if (next) setActiveTab(next);
  }, [activeTab, tabAccess]);

  // Predefined Values State
  const [showPredefinedValues, setShowPredefinedValues] = useState<boolean>(false);
  const [predefinedModal, setPredefinedModal] = useState<{
    type: 'team' | 'designation' | 'paidFrom' | 'category' | null;
    isOpen: boolean;
  }>({ type: null, isOpen: false });
  const [predefinedValues, setPredefinedValues] = useState<{
    teams: string[];
    designations: string[];
    paidFrom: string[];
    categories: string[];
  }>({
    teams: [],
    designations: [],
    paidFrom: [],
    categories: []
  });
  const predefinedValueInputRef = useRef<HTMLInputElement | null>(null);
  const [isSavingPredefinedValue, setIsSavingPredefinedValue] = useState<boolean>(false);

  const [scheduleTemplates, setScheduleTemplates] = useState<ScheduleTemplateRecord[]>([]);
  const [scheduleTemplateModal, setScheduleTemplateModal] = useState<{
    isOpen: boolean;
    template: ScheduleTemplateRecord | null;
  }>({ isOpen: false, template: null });
  const [isSavingScheduleTemplate, setIsSavingScheduleTemplate] = useState(false);

  // History State
  const [employeeHistory, setEmployeeHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [changeReason, setChangeReason] = useState<string>('');
  const [managedFieldsEffectiveFromByField, setManagedFieldsEffectiveFromByField] = useState<Record<ManagedFieldKey, string>>(getDefaultManagedEffectiveDates());
  const [fieldRevisionPanel, setFieldRevisionPanel] = useState<{
    field: FieldHistoryKey;
    value: string;
    effectiveFrom: string;
  } | null>(null);
  /** Per field: expanded history panel (effective from + end date for every segment). */
  const [fieldHistoryExpanded, setFieldHistoryExpanded] = useState<Partial<Record<FieldHistoryKey, boolean>>>({});
  const [fieldHistoryEdit, setFieldHistoryEdit] = useState<{
    field: FieldHistoryKey;
    originalEffectiveFrom: string;
    originalValue: string;
    value: string;
    effectiveFrom: string;
    effectiveTo: string;
  } | null>(null);
  const openedForSelectionRef = useRef<string | null>(null);
  /** Bumped on unmount and before each users-list fetch so stale responses cannot overwrite newer state (e.g. after delete). */
  const usersListFetchGenerationRef = useRef(0);

  // Extra Info State
  const [newExtraLabel, setNewExtraLabel] = useState<string>('');
  const [isSavingExtraLabel, setIsSavingExtraLabel] = useState<boolean>(false);

  // Unique Designations
  const uniqueDesignations = useMemo(() => {
    const list = users.map(u => u.designation).filter(Boolean);
    return Array.from(new Set(list)).sort() as string[];
  }, [users]);
  // Unique Teams
  const uniqueTeams = useMemo(() => {
    const list = users.map(u => u.team || u.workingUnderPartner).filter(Boolean);
    return Array.from(new Set(list)).sort() as string[];
  }, [users]);
  // Unique User Names
  const uniqueUserNames = useMemo(() => {
    return users.map(u => u.name).filter(Boolean).sort();
  }, [users]);

  const inactiveUserCount = useMemo(() => users.filter(isUserMarkedInactive).length, [users]);

  // Fetch users (list payload; use soft refresh after mutations to avoid table skeleton flash)
  const fetchUsers = async (opts?: { soft?: boolean }) => {
    const gen = ++usersListFetchGenerationRef.current;
    if (!opts?.soft) {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await fetch(USERS_LIST_ENDPOINT, hrCredentialsInit({ cache: 'no-store' }));
      const result = await response.json();
      if (gen !== usersListFetchGenerationRef.current) {
        return;
      }
      if (result.success) {
        setUsers(result.data);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      if (gen === usersListFetchGenerationRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch users');
      }
    } finally {
      if (gen === usersListFetchGenerationRef.current && !opts?.soft) {
        setLoading(false);
      }
    }
  };

  const fetchEmployeeHistory = useCallback(async (userId: string) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/users/${userId}/history`, hrCredentialsInit());
      const result = await response.json();
      if (result.success) {
        setEmployeeHistory(result.data);
      } else {
        console.error('Failed to fetch employee history:', result.error);
        setEmployeeHistory([]);
      }
    } catch (err) {
      console.error('Failed to fetch employee history:', err);
      setEmployeeHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const applyUserToEditForm = useCallback((user: User) => {
    const formDataCopy: Partial<User> = {
      ...user,
      joiningDate: toDateInputValue(user.joiningDate),
      inactiveAsOf: toDateInputValue(user.inactiveAsOf) || undefined,
      team: user.workingUnderPartner || user.team || '',
    };
    if (formDataCopy.schedules && Array.isArray(formDataCopy.schedules)) {
      formDataCopy.schedules = (formDataCopy.schedules as any[]).map((entry: any) => ({
        ...entry,
        effectiveFrom: toDateInputValue(entry.effectiveFrom),
      })) as User['schedules'];
    }
    if (formDataCopy.seasonalSchedules && Array.isArray(formDataCopy.seasonalSchedules)) {
      formDataCopy.seasonalSchedules = (formDataCopy.seasonalSchedules as any[]).map((entry: any) => ({
        ...entry,
        effectiveFrom: toDateInputValue(entry.effectiveFrom),
      })) as User['seasonalSchedules'];
    }
    setEditingUser(user);
    setFormData(formDataCopy);
    setManagedFieldsEffectiveFromByField(getManagedEffectiveDatesFromUser(formDataCopy));
  }, []);

  const openUserForEdit = useCallback(
    async (user: User) => {
      setError(null);
      const uid = normalizeMongoId(user._id);
      if (!uid) {
        setError('Missing employee id. Please refresh the page.');
        return;
      }
      try {
        const response = await fetch(`/api/users/${encodeURIComponent(uid)}`, hrCredentialsInit());
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Failed to load employee');
        }
        const fullUser = result.data as User;
        applyUserToEditForm(fullUser);
        void fetchEmployeeHistory(normalizeMongoId(fullUser._id) || uid);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load employee');
        applyUserToEditForm(user);
        void fetchEmployeeHistory(uid);
      }
    },
    [applyUserToEditForm, fetchEmployeeHistory]
  );

  // Open editor when parent passes selectedUserId (once per selection, after list is loaded)
  useEffect(() => {
    if (!selectedUserId) {
      openedForSelectionRef.current = null;
      return;
    }
    if (users.length === 0) return;
    const user = users.find((u) => normalizeMongoId(u._id) === selectedUserId);
    if (!user) return;
    if (openedForSelectionRef.current === selectedUserId) return;
    openedForSelectionRef.current = selectedUserId;
    void openUserForEdit(user);
  }, [selectedUserId, users, openUserForEdit]);

  const handleDeleteUser = async (user: User) => {
    if (!employeesCanEdit || tabAccess.basic !== 'edit') {
      alert('You do not have permission to deactivate employees.');
      return;
    }
    if (
      !confirmMajorAction(`Deactivate employee "${user.name}"`, [
        'This will deactivate their account.',
      ])
    ) {
      return;
    }

    const id = normalizeMongoId(user._id);
    if (!id) {
      alert('Missing employee id. Please refresh the page and try again.');
      return;
    }

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(id)}`, hrCredentialsInit({
        method: 'DELETE',
      }));

      const text = await response.text();
      let result: { success?: boolean; error?: string; data?: User } = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        alert(`Delete failed (bad response). HTTP ${response.status}.`);
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete user');
      }

      const serverUser = result.data as User | undefined;
      const inactiveAsOf = serverUser?.inactiveAsOf ?? undefined;

      // Hide immediately (table filters out isActive === false) even if a slow initial fetch would race.
      setUsers((prev) =>
        prev.map((u) =>
          normalizeMongoId(u._id) === id
            ? { ...u, isActive: false, inactiveAsOf: inactiveAsOf ?? u.inactiveAsOf }
            : u
        )
      );

      if (onRefreshUsers) {
        onRefreshUsers();
      }
      await fetchUsers({ soft: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleEditClick = (user: User) => {
    openedForSelectionRef.current = normalizeMongoId(user._id) || null;
    void openUserForEdit(user);
  };

  const handleCancelEdit = () => {
    if (selectedUserId) {
      openedForSelectionRef.current = selectedUserId;
    }
    setEditingUser(null);
    setFormData({});
    setEmployeeHistory([]);
    setChangeReason('');
    setManagedFieldsEffectiveFromByField(getDefaultManagedEffectiveDates());
    setFieldRevisionPanel(null);
    setFieldHistoryExpanded({});
    setError(null);
  };

  // Employment type history state for UI
  const [newEmploymentType, setNewEmploymentType] = useState<string>('');
  const [newEmploymentTypeDate, setNewEmploymentTypeDate] = useState<string>('');
  const [employmentTypeEditIdx, setEmploymentTypeEditIdx] = useState<number | null>(null);
  const [employmentTypeEditValue, setEmploymentTypeEditValue] = useState<string>('');
  const [employmentTypeEditDate, setEmploymentTypeEditDate] = useState<string>('');

  const handleInputChange = (field: keyof User, value: any) => {
    if (denyEdits) return;
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      // When workingUnderPartner changes, also update team to the same value
      // and auto-populate attendanceEmail from partner's email
      if (field === 'workingUnderPartner') {
        newData.team = value;
        // Look up partner's email in users list
        if (value) {
          const partnerName = value.trim().toLowerCase();
          const partnerUser = users.find(u => 
            u.name?.toLowerCase().trim() === partnerName ||
            u.name?.toLowerCase().trim().replace(/\s+/g, '.') === partnerName ||
            u.name?.toLowerCase().trim().replace(/\./g, ' ') === partnerName
          );
          if (partnerUser) {
            newData.attendanceEmail = partnerUser.attendanceEmail || partnerUser.email || '';
          }
        }
      }
      // Prevent direct employmentType change, use history
      if (field === 'employmentType') {
        return prev;
      }
      return newData;
    });
  };

  const hasManagedFieldValue = (field: ManagedFieldKey) => {
    const value = (formData as any)[field];
    if (value === null || value === undefined) return false;
    return String(value).trim() !== '';
  };

  // Add new employment type history entry
  const handleDeleteEmploymentTypeHistory = (index: number) => {
    if (
      !confirmMajorAction('Delete this employment type history entry', [
        'The entry will be removed when you save the employee.',
      ])
    ) {
      return;
    }
    setFormData(prev => {
      const history = Array.isArray(prev.employmentTypeHistory) ? [...prev.employmentTypeHistory] : [];
      history.splice(index, 1);
      return {
        ...prev,
        employmentTypeHistory: history,
        employmentType: history.length > 0 ? history[history.length - 1].employmentType : '',
      };
    });
    if (employmentTypeEditIdx === index) {
      setEmploymentTypeEditIdx(null);
    }
  };

  const handleStartEditEmploymentTypeHistory = (index: number) => {
    const entry = formData.employmentTypeHistory?.[index];
    if (!entry) return;
    setEmploymentTypeEditIdx(index);
    setEmploymentTypeEditValue(entry.employmentType || '');
    setEmploymentTypeEditDate(toDateInputValue(entry.effectiveFrom));
  };

  const handleSaveEmploymentTypeHistoryEdit = () => {
    if (employmentTypeEditIdx == null || !employmentTypeEditValue || !employmentTypeEditDate) return;
    setFormData(prev => {
      const history = Array.isArray(prev.employmentTypeHistory) ? [...prev.employmentTypeHistory] : [];
      if (!history[employmentTypeEditIdx]) return prev;
      history[employmentTypeEditIdx] = {
        employmentType: employmentTypeEditValue,
        effectiveFrom: employmentTypeEditDate,
      };
      history.sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime());
      return {
        ...prev,
        employmentTypeHistory: history,
        employmentType: history[history.length - 1]?.employmentType || '',
      };
    });
    setEmploymentTypeEditIdx(null);
    setEmploymentTypeEditValue('');
    setEmploymentTypeEditDate('');
  };

  const handleAddEmploymentTypeHistory = () => {
    if (!newEmploymentType || !newEmploymentTypeDate) return;
    setFormData(prev => {
      const history = Array.isArray(prev.employmentTypeHistory) ? [...prev.employmentTypeHistory] : [];
      history.push({ employmentType: newEmploymentType, effectiveFrom: new Date(newEmploymentTypeDate) });
      // Sort by date ascending
      history.sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime());
      return {
        ...prev,
        employmentTypeHistory: history,
        employmentType: newEmploymentType, // Set current type for display
      };
    });
    setNewEmploymentType('');
    setNewEmploymentTypeDate('');
  };

  const handleExtraInfoChange = (index: number, field: 'label' | 'value', value: string) => {
    setFormData(prev => {
      const current = Array.isArray(prev.extraInfo) ? [...prev.extraInfo] : [];
      if (!current[index]) current[index] = { label: '', value: '' };
      current[index] = { ...current[index], [field]: value };
      return { ...prev, extraInfo: current };
    });
  };

  const handleAddExtraInfo = () => {
    setFormData(prev => ({
      ...prev,
      extraInfo: [...(prev.extraInfo || []), { label: '', value: '' }],
    }));
  };

  const handleRemoveExtraInfo = (index: number) => {
    setFormData(prev => {
      const current = Array.isArray(prev.extraInfo) ? [...prev.extraInfo] : [];
      current.splice(index, 1);
      return { ...prev, extraInfo: current };
    });
  };

  const allExtraLabels = useMemo(() => {
    const labels = new Set<string>();
    for (const u of users) {
      if (Array.isArray(u.extraInfo)) {
        for (const item of u.extraInfo) {
          const label = (item.label || '').trim();
          if (label) labels.add(label);
        }
      }
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const handleAddGlobalExtraLabel = async () => {
    const label = newExtraLabel.trim();
    if (!label) {
      alert('Please enter a label name');
      return;
    }
    if (allExtraLabels.some((l) => l.toLowerCase() === label.toLowerCase())) {
      alert('This field already exists');
      return;
    }

    if (
      !confirmMajorAction(`Add extra field "${label}" to all employees`, [
        'A new blank column will appear on every employee profile.',
      ])
    ) {
      return;
    }

    setIsSavingExtraLabel(true);
    try {
      const res = await fetch('/api/users/extra-info', hrCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      }));
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to add field');
      }
      setNewExtraLabel('');
      // Refresh users so new field appears everywhere
      fetchUsers({ soft: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add field');
    } finally {
      setIsSavingExtraLabel(false);
    }
  };

  // Predefined Values Functions
  const fetchPredefinedValues = async () => {
    try {
      const res = await fetch('/api/users/predefined-values', hrCredentialsInit());
      const json = await res.json();
      if (res.ok && json.success) {
        setPredefinedValues(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch predefined values:', err);
    }
  };

  const handleAddPredefinedValue = async (type: 'team' | 'designation' | 'paidFrom' | 'category', value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    // Map singular types to plural keys
    const typeMapping: Record<string, keyof typeof predefinedValues> = {
      'team': 'teams',
      'designation': 'designations',
      'paidFrom': 'paidFrom',
      'category': 'categories'
    };

    const mappedType = typeMapping[type];
    if (!mappedType) {
      alert('Invalid type selected');
      return;
    }

    // Check if value already exists
    const existingValues = predefinedValues[mappedType] || [];
    if (existingValues.some((v: string) => v.toLowerCase() === trimmedValue.toLowerCase())) {
      alert(`${type} "${trimmedValue}" already exists`);
      return;
    }

    if (
      !confirmMajorAction(`Add "${trimmedValue}" to ${type} options`, [
        'This value will be available in employee dropdowns.',
      ])
    ) {
      return;
    }

    setIsSavingPredefinedValue(true);
    try {
      const res = await fetch('/api/users/predefined-values', hrCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: mappedType, value: trimmedValue }),
      }));
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to add value');
      }
      if (predefinedValueInputRef.current) {
        predefinedValueInputRef.current.value = '';
      }
      fetchPredefinedValues();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add value');
    } finally {
      setIsSavingPredefinedValue(false);
    }
  };

  const handleRemovePredefinedValue = async (type: keyof typeof predefinedValues, value: string) => {
    if (
      !confirmMajorAction(`Remove "${value}" from ${type} options`, [
        'This value will no longer appear in employee dropdowns.',
      ])
    ) {
      return;
    }
    
    try {
      const res = await fetch('/api/users/predefined-values', hrCredentialsInit({
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, value }),
      }));
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to remove value');
      }
      fetchPredefinedValues();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove value');
    }
  };

  useEffect(() => {
    (async () => {
      const gen = ++usersListFetchGenerationRef.current;
      setLoading(true);
      setError(null);
      try {
        const [usersRes, preRes, templatesRes] = await Promise.all([
          fetch(USERS_LIST_ENDPOINT, hrCredentialsInit({ cache: 'no-store' })),
          fetch('/api/users/predefined-values', hrCredentialsInit({ cache: 'no-store' })),
          fetch('/api/schedule-templates', hrCredentialsInit({ cache: 'no-store' })),
        ]);
        const usersJson = await usersRes.json();
        const preJson = await preRes.json();
        const templatesJson = await templatesRes.json();
        if (gen !== usersListFetchGenerationRef.current) {
          return;
        }
        if (usersJson.success) {
          setUsers(usersJson.data);
        } else {
          throw new Error(usersJson.error || 'Failed to fetch users');
        }
        if (preJson.success && preJson.data) {
          setPredefinedValues(preJson.data);
        }
        if (templatesJson.success && Array.isArray(templatesJson.data)) {
          setScheduleTemplates(templatesJson.data);
        }
      } catch (err) {
        if (gen === usersListFetchGenerationRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch users');
        }
      } finally {
        if (gen === usersListFetchGenerationRef.current) {
          setLoading(false);
        }
      }
    })();
    return () => {
      usersListFetchGenerationRef.current++;
    };
  }, []);

  // Schedule Helper Functions
  const getScheduleForYear = (user: User, year: number): { daily?: DailySchedule; regular?: ScheduleTime; saturday?: ScheduleTime; monthly?: ScheduleTime } => {
    // Check if user has new schedule entries structure
    if (user?.schedules && Array.isArray(user.schedules)) {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);
      
      // Find the schedule entry applicable for this year (effectiveFrom <= yearEnd, take latest)
      const applicableEntry = user.schedules
        .filter(entry => new Date(entry.effectiveFrom) <= yearEnd)
        .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
      
      if (applicableEntry) {
        return { daily: applicableEntry.daily };
      }
    }

    // Fallback to legacy structure for backward compatibility
    return {
      regular: user?.scheduleInOutTime,
      saturday: user?.scheduleInOutTimeSat,
      monthly: user?.scheduleInOutTimeMonth,
    };
  };

  const setScheduleForYear = (user: User, year: number, day: string, scheduleTime: ScheduleTime | undefined): User => {
    const effectiveFrom = new Date(year, 0, 1).toISOString(); // January 1st of the year as ISO string
    
    // Initialize schedules array if it doesn't exist
    const schedules = Array.isArray(user.schedules) ? [...user.schedules] : [];
    
    // Find existing entry for this year
    const existingIndex = schedules.findIndex(entry => 
      new Date(entry.effectiveFrom).getTime() === new Date(effectiveFrom).getTime()
    );
    
    let entry;
    if (existingIndex >= 0) {
      entry = { ...schedules[existingIndex] };
    } else {
      entry = {
        effectiveFrom,
        daily: {},
      };
    }
    
    // Update the specific day
    if (!entry.daily) entry.daily = {};
    (entry.daily as any)[day] = scheduleTime;
    
    if (existingIndex >= 0) {
      schedules[existingIndex] = entry;
    } else {
      schedules.push(entry);
      // Sort by effectiveFrom ascending
      schedules.sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime());
    }
    
    return {
      ...user,
      schedules,
    };
  };

  const getAvailableScheduleYears = (user: User): number[] => {
    const years = new Set<number>();

    // Add years from new schedule entries structure
    if (user.schedules && Array.isArray(user.schedules)) {
      user.schedules.forEach(entry => {
        years.add(new Date(entry.effectiveFrom).getFullYear());
      });
    }

    // Add current year if no schedules exist yet
    if (years.size === 0) {
      years.add(new Date().getFullYear());
    }

    // Add years from 2025 to 2028 as defaults
    [2025, 2026, 2027, 2028].forEach(year => years.add(year));

    return Array.from(years).sort((a, b) => b - a); // Most recent first
  };



  const handleScheduleEntryChange = (entryIndex: number, day: string, field: 'inTime' | 'outTime' | 'isHoliday' | 'isHalfDay', value: string | boolean) => {
    if (denyEdits) return;
    setFormData(prev => {
      const schedules = Array.isArray(prev.schedules) ? [...prev.schedules] : [];
      if (!schedules[entryIndex]) return prev;

      const entry = { ...schedules[entryIndex] };
      if (!entry.daily) entry.daily = {};

      const daySchedule = (entry.daily as any)[day] || {};

      let updatedDaySchedule: any;
      if (field === 'isHoliday' || field === 'isHalfDay') {
        updatedDaySchedule = { ...daySchedule, [field]: value };
      } else {
        updatedDaySchedule = { ...daySchedule, [field]: value };
      }

      entry.daily = { ...entry.daily, [day]: updatedDaySchedule };
      schedules[entryIndex] = entry;

      return { ...prev, schedules };
    });
  };

  const handleEffectiveFromChange = (entryIndex: number, value: string) => {
    if (denyEdits) return;
    setFormData(prev => {
      const schedules = Array.isArray(prev.schedules) ? [...prev.schedules] : [];
      if (!schedules[entryIndex]) return prev;

      schedules[entryIndex] = { ...schedules[entryIndex], effectiveFrom: value };
      // Sort by effectiveFrom descending
      schedules.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());

      return { ...prev, schedules };
    });
  };

  const fetchScheduleTemplates = async () => {
    try {
      const res = await fetch('/api/schedule-templates', hrCredentialsInit({ cache: 'no-store' }));
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setScheduleTemplates(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch schedule templates:', err);
    }
  };

  const handleAddScheduleEntry = (dailyOverride?: DailySchedule) => {
    if (denyEdits) return;
    const newEffectiveFrom = toDateInputValue(new Date());
    setFormData(prev => {
      const schedules = Array.isArray(prev.schedules) ? [...prev.schedules] : [];
      const newEntry = {
        effectiveFrom: newEffectiveFrom,
        daily: dailyOverride ? cloneDailySchedule(dailyOverride) : createDefaultDailySchedule(),
      };
      schedules.push(newEntry);
      schedules.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
      return { ...prev, schedules };
    });
  };

  const handleApplyScheduleTemplate = (templateId: string) => {
    if (denyEdits) return;
    const template = scheduleTemplates.find((t) => t._id === templateId);
    if (!template) return;
    handleAddScheduleEntry(template.daily);
  };

  const handleSaveScheduleTemplate = async (payload: {
    _id?: string;
    name: string;
    daily: DailySchedule;
  }) => {
    const isEdit = Boolean(payload._id);
    if (
      !confirmMajorAction(
        isEdit ? `Update schedule template "${payload.name}"` : `Create schedule template "${payload.name}"`,
        ['Predefined schedule templates can be applied to employee profiles.']
      )
    ) {
      return;
    }
    setIsSavingScheduleTemplate(true);
    try {
      const res = await fetch('/api/schedule-templates', hrCredentialsInit({
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }));
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to save schedule template');
      }
      await fetchScheduleTemplates();
      setScheduleTemplateModal({ isOpen: false, template: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule template');
    } finally {
      setIsSavingScheduleTemplate(false);
    }
  };

  const handleDeleteScheduleTemplate = async (id: string) => {
    if (
      !confirmMajorAction('Delete this predefined schedule template', [
        'This cannot be undone.',
      ])
    ) {
      return;
    }
    setIsSavingScheduleTemplate(true);
    try {
      const res = await fetch('/api/schedule-templates', hrCredentialsInit({
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: id }),
      }));
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to delete schedule template');
      }
      await fetchScheduleTemplates();
      setScheduleTemplateModal({ isOpen: false, template: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule template');
    } finally {
      setIsSavingScheduleTemplate(false);
    }
  };

  const handleRemoveScheduleEntry = (entryIndex: number) => {
    if (denyEdits) return;
    setFormData(prev => {
      const schedules = Array.isArray(prev.schedules) ? [...prev.schedules] : [];
      schedules.splice(entryIndex, 1);
      return { ...prev, schedules };
    });
  };

  const handleAddSeasonalSchedule = () => {
    if (denyEdits) return;
    setFormData(prev => {
      const seasonalSchedules = Array.isArray(prev.seasonalSchedules) ? [...prev.seasonalSchedules] : [];
      seasonalSchedules.push({
        startMonth: 11, // December
        endMonth: 0,    // January
        effectiveFrom: toDateInputValue(new Date()),
        daily: createDefaultDailySchedule(),
      });
      return { ...prev, seasonalSchedules };
    });
  };

  const handleRemoveSeasonalSchedule = (index: number) => {
    if (denyEdits) return;
    setFormData(prev => {
      const seasonalSchedules = Array.isArray(prev.seasonalSchedules) ? [...prev.seasonalSchedules] : [];
      seasonalSchedules.splice(index, 1);
      return { ...prev, seasonalSchedules };
    });
  };

  const handleSeasonalScheduleFieldChange = (index: number, field: string, value: any) => {
    if (denyEdits) return;
    setFormData(prev => {
      const seasonalSchedules = Array.isArray(prev.seasonalSchedules) ? [...prev.seasonalSchedules] : [];
      if (!seasonalSchedules[index]) return prev;
      seasonalSchedules[index] = { ...seasonalSchedules[index], [field]: value };
      return { ...prev, seasonalSchedules };
    });
  };

  const handleSeasonalScheduleTimeChange = (index: number, day: string, field: string, value: any) => {
    if (denyEdits) return;
    setFormData(prev => {
      const seasonalSchedules = Array.isArray(prev.seasonalSchedules) ? [...prev.seasonalSchedules] : [];
      if (!seasonalSchedules[index]) return prev;
      const entry = { ...seasonalSchedules[index] };
      const daily = { ...entry.daily };
      const dayData = { ...(daily[day] || {}) };
      (dayData as any)[field] = value;
      daily[day] = dayData as any;
      entry.daily = daily;
      seasonalSchedules[index] = entry;
      return { ...prev, seasonalSchedules };
    });
  };

  // Helper function to prepare formData for saving (convert effectiveFrom strings to Date objects)
  const prepareFormDataForSave = (data: any) => {
    const prepared = { ...data };
    if (prepared.schedules && Array.isArray(prepared.schedules)) {
      prepared.schedules = prepared.schedules.map((entry: any) => ({
        ...entry,
        effectiveFrom: new Date(entry.effectiveFrom)
      }));
    }
    if (prepared.seasonalSchedules && Array.isArray(prepared.seasonalSchedules)) {
      prepared.seasonalSchedules = prepared.seasonalSchedules.map((entry: any) => ({
        ...entry,
        effectiveFrom: new Date(entry.effectiveFrom)
      }));
    }
    if (prepared.fieldHistories && typeof prepared.fieldHistories === 'object') {
      const normalized: Record<string, unknown[]> = {};
      for (const [field, entries] of Object.entries(prepared.fieldHistories)) {
        if (!Array.isArray(entries)) continue;
        normalized[field] = entries.map((entry: any) => ({
          ...entry,
          effectiveFrom: entry.effectiveFrom ? new Date(entry.effectiveFrom) : entry.effectiveFrom,
          effectiveTo:
            entry.effectiveTo == null || entry.effectiveTo === ''
              ? null
              : new Date(entry.effectiveTo),
        }));
      }
      prepared.fieldHistories = normalized;
    }
    return prepared;
  };

  const handleIsActiveChange = (checked: boolean) => {
    if (denyEdits) return;
    setFormData((prev) => ({
      ...prev,
      isActive: checked,
      ...(checked ? { inactiveAsOf: undefined } : {}),
    }));
  };

  const handleSave = async () => {
    if (!editingUser || !editingUser._id) return;

    if (formData.isActive === false) {
      const d = formData.inactiveAsOf;
      if (d == null || String(d).trim() === '') {
        setError('Select the inactive date (first day the employee is inactive) when unchecking Active.');
        return;
      }
    }

    if (
      !confirmMajorAction(`Save changes for ${editingUser.name}`, [
        'Employee profile, schedule, and history fields you edited will be updated in the database.',
        changeReason ? `Reason: ${changeReason}` : '',
      ].filter(Boolean))
    ) {
      return;
    }

    setSaveLoading(true);
    setError(null);

    try {
      const prepared = prepareFormDataForSave(formData) as Record<string, unknown>;
      const payload = pickEditableUserPutBody(prepared, tabAccess, {
        changedBy: 'HR Admin',
        changeReason: changeReason || 'Employee information update',
        managedEffectiveFromByField: managedFieldsEffectiveFromByField,
      });
      if (Object.keys(payload).length === 0) {
        setError('Nothing to save for your access level on this tab.');
        setSaveLoading(false);
        return;
      }

      const fieldHistoriesPayload = pickEditableFieldHistories(prepared.fieldHistories, tabAccess);
      if (fieldHistoriesPayload) {
        payload.fieldHistories = fieldHistoriesPayload;
      }

      const response = await fetch(`/api/users/${editingUser._id}`, hrCredentialsInit({
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }));

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update user');
      }

      // Update local state
      setUsers(prev => prev.map(u => u._id === editingUser._id ? result.data : u));
      setEditingUser(null);
      setFormData({});
      setEmployeeHistory([]);
      setChangeReason('');
      setManagedFieldsEffectiveFromByField(getDefaultManagedEffectiveDates());
      setFieldRevisionPanel(null);
      setFieldHistoryExpanded({});
      setFieldHistoryEdit(null);
      setEmploymentTypeEditIdx(null);

      // Refresh user data to ensure schedule changes are reflected
      if (onRefreshUsers) {
        onRefreshUsers();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCreateNew = async () => {
    if (!formData.name || !formData.email || !formData.odId || !formData.joiningDate) {
      setError('OD ID, Name, Email, and Joining Date are required');
      return;
    }
    if (formData.isActive === false) {
      const d = formData.inactiveAsOf;
      if (d == null || String(d).trim() === '') {
        setError('Select the inactive date when adding an inactive employee.');
        return;
      }
    }

    if (!employeesCanEdit || tabAccess.basic !== 'edit') {
      setError('You do not have permission to create employees.');
      return;
    }

    if (
      !confirmMajorAction(`Create new employee ${formData.name}`, [
        `Email: ${formData.email}`,
        `OD ID: ${formData.odId}`,
        'A new employee record will be added to the system.',
      ])
    ) {
      return;
    }

    setSaveLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/users', hrCredentialsInit({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(prepareFormDataForSave(formData)),
      }));

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create user');
      }

      // Add to local state
      setUsers(prev => [...prev, result.data]);
      setIsAddingNew(false);
      setFormData({});
      
      // Refresh user data to ensure new user is included
      if (onRefreshUsers) {
        onRefreshUsers();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create employee');
    } finally {
      setSaveLoading(false);
    }
  };

  const formatTime = (excelTime: any): string => {
      // Logic duplicated/simplified from main page to avoid circular deps or complex refactor
      if (!excelTime) return '00:00';
      if (typeof excelTime === 'string') return excelTime; // Assume "09:00"
      if (typeof excelTime === 'number') {
        // Excel decimal day
        const totalSeconds = Math.round(excelTime * 24 * 60 * 60);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
      return '00:00';
  };

  const formatExcelDate = (val: any) => {
    if (!val) return undefined;
    
    // Handle string values carefully
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (['-', 'NA', 'N/A', '', 'na', 'n/a'].includes(trimmed.toLowerCase())) return undefined;
        if (trimmed === '.') return undefined;
        
        // Try parsing string date
        const d = new Date(trimmed);
        return !isNaN(d.getTime()) ? d.toISOString() : undefined;
    }

    if (val instanceof Date) return !isNaN(val.getTime()) ? val.toISOString() : undefined;
    
    if (typeof val === 'number') {
        // Convert Excel serial date to JS Date
        // 25569 is the offset for 1970-01-01
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        return !isNaN(date.getTime()) ? date.toISOString() : undefined;
    }
    
    return undefined;
  };

  const handleBulkUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStats(null);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      
      // Select sheet: Prioritize "Master", then any non-"Summary", then first sheet
      let targetSheetName = workbook.SheetNames.find(name => name.toLowerCase().includes('master'));
      if (!targetSheetName) {
         // Fallback: try to find one that isn't "Summary"
         targetSheetName = workbook.SheetNames.find(name => !name.toLowerCase().includes('summary'));
      }
      // Ultimate fallback
      if (!targetSheetName) {
         targetSheetName = workbook.SheetNames[0];
      }
      
      const worksheet = workbook.Sheets[targetSheetName];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        throw new Error(`Sheet "${targetSheetName}" appears to be empty or missing headers`);
      }

      // Heuristic scan for header row using scoring
      let headerRowIndex = 0;
      let maxScore = 0;

      const scoreKeywords = [
        'designation', 'code', 'paid from', 'category', 
        'gender', 'registration', 'membership', 'tally', 'mail', 
        'parent', 'guardian', 'address', 'articleship', 'joining'
      ];

      for (let i = 0; i < Math.min(jsonData.length, 120); i++) {
        const row = jsonData[i] as any[];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        const rowStr = row.map(c => String(c || '').toLowerCase().trim());
        
        let score = 0;
        
        // Critical: Must have a Name-like column
        // Higher weight for exact matches
        if (rowStr.some(c => c === 'name' || c === 'employee name' || c === 'staff name' || c === 'student name')) {
            score += 10;
        } else if (rowStr.some(c => c.includes('name'))) {
            score += 5;
        }

        // Add points for other keywords
        const matches = scoreKeywords.filter(kw => rowStr.some(cell => cell.includes(kw))).length;
        score += matches;

        if (score > maxScore) {
            maxScore = score;
            headerRowIndex = i;
        }
      }
      
      // If maxScore is 0, it means we didn't finding ANYTHING resembling a header with Name.
      // We will fallback to 0 but it will likely fail.

      // Find headers
      // Find headers
      const headers = jsonData[headerRowIndex] as string[];
      if (!headers || headers.length === 0) {
          throw new Error('Could not find header row or header row is empty');
      }
      
      // Use lowercase comparison for better matching
      const findCol = (searches: string[]) => {
          return headers.findIndex(h => {
              if (!h) return false;
              const val = String(h).trim().toLowerCase();
              // check for exact match first
              if (searches.some(s => s.toLowerCase() === val)) return true;
              // check for partial match if exact fails? 
              // Let's stick to strict-ish matching but allow variations
              return searches.some(s => val.includes(s.toLowerCase()));
          });
      };

      const idx = {
          employmentType: findCol(['Employment Type', 'Emp Type', 'Type of Employment']),
        name: findCol(['Name', 'Employee Name']),
        regNo: findCol(['Registration / Membership No.', 'Registration No', 'Membership No']),
        empCode: findCol(['Employee Code', 'Emp Code']),
        paidFrom: findCol(['Paid From', 'Paid by']),
        designation: findCol(['Designation']),
        category: findCol(['Category']),
        tallyName: findCol(['Tally Name']),
        gender: findCol(['Gender']),
        email: findCol(['Asija Mail ID', 'Email', 'Mail ID']),
        attendanceApprover: findCol(['Attendance Email', 'Attendance Mail ID', 'Attendance Approver']),
        parentName: findCol(['Parents/Guardians Names', 'Parent / Guardian Name', 'Father Name', 'Parent Name']),
        parentOcc: findCol(['Parents/Guardians Occupation', 'Parent / Guardian Occupation', 'Father Occupation']),
        mobile: findCol(['Cell No.', 'Mobile', 'Phone']),
        altMobile: findCol(['Alternate No.', 'Alternate Mobile']),
        altEmail: findCol(['Alternate Mail Id', 'Alt Email']),
        addr1: findCol(['Address 1', 'Address Line 1', 'Current Address']),
        addr2: findCol(['Address 2', 'Address Line 2', 'Permanent Address']),
        emergencyContactNo: findCol(['Emergency Contact No.', 'Emergency Contact']),
        emergencyContactRelation: findCol(['Relation', 'Emergency Contact Relation']),
        anniversaryDate: findCol(['Anniversary Date']),
        bankName: findCol(['Bank Name']),
        branchName: findCol(['Branch Name']),
        accountNumber: findCol(['Account No.', 'Account Number']),
        ifscCode: findCol(['IFSC', 'IFSC Code']),
        accountType: findCol(['Type of Account', 'Account Type']),
        accountHolderName: findCol(['Name of Account Holder', 'Account Holder Name']),
        aadhaarNumber: findCol(['Aadhar No.', 'Aadhaar Number']),
        panNumber: findCol(['PAN', 'PAN Number']),
        basicSalary: findCol(['Basis Salary/Stipend/Fees', 'Basic Salary']),
        laptopAllowance: findCol(['Laptop Allowance', 'Laptop Allowence']),
        totalSalaryPerMonth: findCol(['Total Salary (P/M)', 'Total Salary Per Month']),
        totalSalaryPerAnnum: findCol(['Per Annum', 'Total Salary Per Annum']),
        joinDate: findCol(['Date of Joining -in Asija', 'Date of Joining', 'Joining Date']),
        articleStart: findCol(['Articleship Start Date', 'Article Start']),
        transfer: findCol(['Transfer Case']),
        yr1: findCol(['1st Yr of Articleship', '1st Year']),
        yr2: findCol(['2nd Yr of Articleship', '2nd Year']),
        yr3: findCol(['3rd Yr of Articleship', '3rd Year']),
        scholarship: findCol(['Filled Scholarship', 'Scholarship']),
        qual: findCol(['Qualification Level', 'Qualification']),
        nextAttempt: findCol(['Next Attempt Due Date', 'Next Attempt']),
        regPartner: findCol(['Registered Under Partner', 'Reg Partner']),
        workPartner: findCol(['Working Under Partner', 'Work Partner']),
        leavesBF: findCol(['Leaves B/F', 'Leaves Brought Forward', 'Balance Leaves']),
        articleCredits: findCol(['Credits for Articles (as on 1st Jan 26)'])
      };

      if (idx.name === -1) {
        throw new Error(`Could not find "Name" column in headers on row ${headerRowIndex + 1}. Found headers: ${headers.map(h => String(h)).join(', ')}`);
      }

      const employees = jsonData.slice(headerRowIndex + 1).map(row => {
        const name = row[idx.name];
        // Ensure name is a non-empty string
        if (!name || String(name).trim() === '') return null;

        // Helper to get val
        const getVal = (i: number) => i !== -1 ? row[i] : undefined;

        // Parse article credits (number)
        let articleCreditsAsOnJan26 = undefined;
        if (idx.articleCredits !== -1) {
          const val = row[idx.articleCredits];
          if (val !== undefined && val !== null && val !== '') {
            const num = Number(val);
            if (!isNaN(num)) articleCreditsAsOnJan26 = num;
          }
        }

        // Set both earned and remaining from Leaves B/F if present
        let leaveBalance: any = undefined;
        if (idx.leavesBF !== -1) {
          let bfRaw = getVal(idx.leavesBF);
          let bf = Number(bfRaw);
          if (isNaN(bf) || bfRaw === '' || bfRaw === null) bf = 0;
          // Determine if article for monthlyEarned using values from columns
          let isArticle = false;
          const designationVal = getVal(idx.designation);
          const employmentTypeVal = getVal(idx.employmentType);
          if (designationVal && typeof designationVal === 'string' && designationVal.toLowerCase() === 'article') {
            isArticle = true;
          } else if (employmentTypeVal && typeof employmentTypeVal === 'string' && employmentTypeVal.toLowerCase() === 'article') {
            isArticle = true;
          }
          leaveBalance = {
            balanceAsOfJan26: bf,
            earned: 0,
            used: 0,
            usedAfterJan26: 0,
            remaining: bf,
            lastUpdated: new Date(),
            monthlyEarned: isArticle ? 1 : 2
          };
        }
        return {
          name: String(name),
          registrationNo: getVal(idx.regNo),
          employeeCode: getVal(idx.empCode),
          paidFrom: getVal(idx.paidFrom),
          designation: getVal(idx.designation),
          category: getVal(idx.category),
          tallyName: getVal(idx.tallyName),
          gender: getVal(idx.gender),
          // Save email from Excel to email section
          email: getVal(idx.email),
          parentName: getVal(idx.parentName),
          parentOccupation: getVal(idx.parentOcc),
          mobileNumber: getVal(idx.mobile),
          alternateMobileNumber: getVal(idx.altMobile),
          alternateEmail: getVal(idx.altEmail),
          address1: getVal(idx.addr1),
          address2: getVal(idx.addr2),
          emergencyContactNo: getVal(idx.emergencyContactNo),
          emergencyContactRelation: getVal(idx.emergencyContactRelation),
          anniversaryDate: formatExcelDate(row[idx.anniversaryDate]),
          bankName: getVal(idx.bankName),
          branchName: getVal(idx.branchName),
          accountNumber: getVal(idx.accountNumber),
          ifscCode: getVal(idx.ifscCode),
          accountType: getVal(idx.accountType),
          accountHolderName: getVal(idx.accountHolderName),
          aadhaarNumber: getVal(idx.aadhaarNumber),
          panNumber: getVal(idx.panNumber),
          basicSalary: getVal(idx.basicSalary),
          laptopAllowance: getVal(idx.laptopAllowance),
          totalSalaryPerMonth: getVal(idx.totalSalaryPerMonth),
          totalSalaryPerAnnum: getVal(idx.totalSalaryPerAnnum),
          joiningDate: formatExcelDate(row[idx.joinDate]), 
          articleshipStartDate: formatExcelDate(row[idx.articleStart]),
          transferCase: getVal(idx.transfer),
          firstYearArticleship: getVal(idx.yr1),
          secondYearArticleship: getVal(idx.yr2),
          thirdYearArticleship: getVal(idx.yr3),
          filledScholarship: getVal(idx.scholarship),
          qualificationLevel: getVal(idx.qual),
          nextAttemptDueDate: formatExcelDate(row[idx.nextAttempt]),
          registeredUnderPartner: getVal(idx.regPartner),
          workingUnderPartner: getVal(idx.workPartner),
          leaveBalance,
          articleCreditsAsOnJan26,
          extraInfo: allExtraLabels.map(label => {
            const colIndex = headers.findIndex(h => String(h).trim().toLowerCase() === label.toLowerCase());
            const value = colIndex !== -1 ? getVal(colIndex) : '';
            return { label, value: value || '' };
          }),
        };
      }).filter(Boolean);

      if (
        !confirmMajorAction('Bulk update employees from Excel', [
          `File: ${file.name}`,
          `${employees.length} employee row(s) found`,
          'Matched employees will be created or updated from the spreadsheet.',
        ])
      ) {
        return;
      }

      const response = await fetch('/api/users/bulk-update', hrCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees }),
      }));

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }

      setUploadStats(result.data);
      fetchUsers({ soft: true }); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleScheduleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setUploadStats(null);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]; // Assume first sheet or user ensures correct sheet
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Find header row with "Name as per Master Sheet"
      let headerRowIndex = -1;
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as any[];
        if (row && row.some(cell => String(cell).trim().includes('Name as per Master Sheet'))) {
             headerRowIndex = i;
             break;
        }
      }

      if (headerRowIndex === -1) {
          throw new Error('Could not find header row with "Name as per Master Sheet"');
      }

      const headers = jsonData[headerRowIndex].map(h => String(h).trim());
      
      const colDetails = {
          name: headers.findIndex(h => h.includes('Name as per Master Sheet')),
          inTime: headers.findIndex(h => h.includes('Sch-In')),
          outTime: headers.findIndex(h => h === 'Sch-Out'), // Exact match or partial? Use exact to differentiate from other Sch-Outs
          outTimeSat: headers.findIndex(h => h.includes('Sch-Out (For Sat)')),
          outTimeMonth: headers.findIndex(h => h.includes('Sch-Out (Dec- Jan)'))
      };

      if (colDetails.name === -1) throw new Error('Column "Name as per Master Sheet" not found');

      // Helper to format time
      const fmtTime = (val: any) => {
          if (!val) return undefined;
          let s = String(val).trim();
          if (typeof val === 'number') {
              const totalSeconds = Math.round(val * 86400);
              const h = Math.floor(totalSeconds / 3600);
              const m = Math.floor((totalSeconds % 3600) / 60);
              s = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          }
          // Validate HH:mm
          if (/^\d{1,2}:\d{2}$/.test(s)) {
             const parts = s.split(':');
             return `${parts[0].padStart(2, '0')}:${parts[1]}`;
          }
          return s; 
      };

      const schedules = [];
      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          if (!row || !row[colDetails.name]) continue;

          schedules.push({
              name: row[colDetails.name],
              inTime: colDetails.inTime !== -1 ? fmtTime(row[colDetails.inTime]) : undefined,
              outTime: colDetails.outTime !== -1 ? fmtTime(row[colDetails.outTime]) : undefined,
              outTimeSat: colDetails.outTimeSat !== -1 ? fmtTime(row[colDetails.outTimeSat]) : undefined,
              outTimeMonth: colDetails.outTimeMonth !== -1 ? fmtTime(row[colDetails.outTimeMonth]) : undefined
          });
      }

      if (
        !confirmMajorAction('Bulk update employee schedules from Excel', [
          `File: ${file.name}`,
          `${schedules.length} schedule row(s) found`,
          'Matched employees will have their daily schedule times updated.',
        ])
      ) {
        return;
      }

      const response = await fetch('/api/users/bulk-schedule-update', hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schedules })
      }));

      const result = await response.json();
      if (result.success) {
          setUploadStats(result.stats);
          fetchUsers({ soft: true });
      } else {
          throw new Error(result.error);
      }

    } catch (err) {
       setError(err instanceof Error ? err.message : 'Schedule upload failed');
    } finally {
       setLoading(false);
       e.target.value = '';
    }
  };

  const handleLeaveBalanceUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStats(null);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        throw new Error('File appears to be empty or missing headers');
      }

      // Find header row
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
        const row = jsonData[i] as any[];
        if (row && Array.isArray(row) && row.some(cell => cell != null && String(cell).toLowerCase().includes('name'))) {
          headerRowIndex = i;
          break;
        }
      }

      const headerRow = jsonData[headerRowIndex];
      if (!headerRow || !Array.isArray(headerRow)) {
        throw new Error('Could not find header row with column names');
      }
      const headers = headerRow.map(h => h != null ? String(h).toLowerCase().trim() : '');
      
      // Find column indices - using safe string checks
      const nameIdx = headers.findIndex(h => h && h.includes('name') && !h.includes('tally'));
      const allowedIdx = headers.findIndex(h => h && (h.includes('allowed') || h.includes('earned') || h.includes('due')));
      // Look specifically for "Total Leaves Taken" - must include "total" and "taken" to avoid "Transfer (Leaves taken in previous firm)"
      const takenIdx = headers.findIndex(h => h && h.includes('total') && h.includes('taken'));

      if (nameIdx === -1) {
        throw new Error('Could not find "Name" column');
      }
      if (allowedIdx === -1) {
        throw new Error('Could not find "Leaves Allowed" column');
      }
      if (takenIdx === -1) {
        throw new Error('Could not find "Total Leaves Taken" column. Make sure the column header contains both "Total" and "Taken".');
      }

      const leaveData = [];
      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i] as any[];
        if (!row || !row[nameIdx]) continue;

        leaveData.push({
          name: String(row[nameIdx]).trim(),
          leavesAllowed: row[allowedIdx],
          leavesTaken: row[takenIdx]
        });
      }

      if (leaveData.length === 0) {
        throw new Error('No leave data found in the file');
      }

      if (
        !confirmMajorAction('Update leave balances from Excel', [
          `File: ${file.name}`,
          `${leaveData.length} employee row(s) found`,
          'Only employees listed in the file will be updated.',
          'Existing leave balances will be replaced with Excel data.',
        ])
      ) {
        return;
      }

      const response = await fetch('/api/users/bulk-leave-update', hrCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaveData })
      }));

      const result = await response.json();
      if (result.success) {
        setUploadStats(result.stats);
        fetchUsers({ soft: true });
      } else {
        throw new Error(result.error);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Leave balance upload failed');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const filteredUsers = users.filter((user) => {
    const inactive = isUserMarkedInactive(user);
    if (showInactiveEmployees) {
      if (!inactive) return false;
    } else if (inactive) {
      return false;
    }
    // Multi-select Designation filter
    if (filterDesignations.length > 0 && !filterDesignations.includes(user.designation || '')) {
      return false;
    }
    // Multi-select Team filter
    if (filterTeams.length > 0 && !filterTeams.includes(user.team || user.workingUnderPartner || '')) {
      return false;
    }
    // Multi-select User filter
    if (filterUsers.length > 0 && !filterUsers.includes(user.name || '')) {
      return false;
    }
    // Search term filter
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      const matchName = user.name?.toLowerCase().includes(lowerTerm);
      const matchEmail = user.email?.toLowerCase().includes(lowerTerm);
      const matchOdId = user.odId?.toLowerCase().includes(lowerTerm);
      const matchEmpCode = user.employeeCode?.toLowerCase().includes(lowerTerm);
      return matchName || matchEmail || matchOdId || matchEmpCode;
    }
    return true;
  });

  const handleExportToExcel = async () => {
    if (!users.length) {
      alert('No employees to export');
      return;
    }

    // Import ExcelJS dynamically
    const ExcelJS = (await import('exceljs')).default;

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Asija Attendance System';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Master', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] // Freeze first row and first column
    });

    // Define all columns matching the upload format exactly
    const baseColumns = [
      { key: 'name', header: 'Name', width: 22 },
      { key: 'registrationNo', header: 'Registration / Membership No.', width: 25 },
      { key: 'employeeCode', header: 'Employee Code', width: 15 },
      { key: 'paidFrom', header: 'Paid From', width: 12 },
      { key: 'designation', header: 'Designation', width: 18 },
      { key: 'category', header: 'Category', width: 12 },
      { key: 'tallyName', header: 'Tally Name', width: 18 },
      { key: 'gender', header: 'Gender', width: 10 },
      { key: 'email', header: 'Asija Mail ID', width: 28 },
      { key: 'attendanceApprover', header: 'Attendance Approver', width: 28 },
      { key: 'parentName', header: 'Parents/Guardians Names', width: 25 },
      { key: 'parentOccupation', header: 'Parents/Guardians Occupation', width: 25 },
      { key: 'mobileNumber', header: 'Cell No.', width: 15 },
      { key: 'alternateMobileNumber', header: 'Alternate No.', width: 15 },
      { key: 'alternateEmail', header: 'Alternate Mail Id', width: 25 },
      { key: 'address1', header: 'Address 1', width: 35 },
      { key: 'address2', header: 'Address 2', width: 35 },
      { key: 'emergencyContactNo', header: 'Emergency Contact No.', width: 18 },
      { key: 'emergencyContactRelation', header: 'Relation', width: 12 },
      { key: 'anniversaryDate', header: 'Anniversary Date', width: 15 },
      { key: 'bankName', header: 'Bank Name', width: 20 },
      { key: 'branchName', header: 'Branch Name', width: 18 },
      { key: 'accountNumber', header: 'Account No.', width: 18 },
      { key: 'ifscCode', header: 'IFSC', width: 12 },
      { key: 'accountType', header: 'Type of Account', width: 15 },
      { key: 'accountHolderName', header: 'Name of Account Holder', width: 22 },
      { key: 'aadhaarNumber', header: 'Aadhar No.', width: 15 },
      { key: 'panNumber', header: 'PAN', width: 12 },
      { key: 'basicSalary', header: 'Basis Salary/Stipend/Fees', width: 22 },
      { key: 'laptopAllowance', header: 'Laptop Allowance', width: 16 },
      { key: 'totalSalaryPerMonth', header: 'Total Salary (P/M)', width: 16 },
      { key: 'totalSalaryPerAnnum', header: 'Per Annum', width: 14 },
      { key: 'pf', header: 'PF', width: 10 },
      { key: 'esi', header: 'ESI', width: 10 },
      { key: 'gratuity', header: 'Gratuity', width: 10 },
      { key: 'joiningDate', header: 'Date of Joining -in Asija', width: 22 },
      { key: 'articleshipStartDate', header: 'Articleship Start Date', width: 20 },
      { key: 'transferCase', header: 'Transfer Case', width: 14 },
      { key: 'firstYearArticleship', header: '1st Yr of Articleship', width: 18 },
      { key: 'secondYearArticleship', header: '2nd Yr of Articleship', width: 18 },
      { key: 'thirdYearArticleship', header: '3rd Yr of Articleship', width: 18 },
      { key: 'filledScholarship', header: 'Filled Scholarship', width: 16 },
      { key: 'qualificationLevel', header: 'Qualification Level', width: 18 },
      { key: 'nextAttemptDueDate', header: 'Next Attempt Due Date', width: 20 },
      { key: 'registeredUnderPartner', header: 'Registered Under Partner', width: 22 },
      { key: 'workingUnderPartner', header: 'Working Under Partner', width: 20 },
      { key: 'employmentStatus', header: 'Status (Active / Inactive)', width: 18 },
      { key: 'inactiveAsOf', header: 'Inactive Since', width: 16 },
    ];

    worksheet.columns = baseColumns;

    // Helper to format date
    const toDateString = (value?: string) => {
      if (!value) return '';
      const d = new Date(value);
      if (isNaN(d.getTime())) return '';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    // Add data rows
    users.forEach((u) => {
      const inactive = isUserMarkedInactive(u);
      const rowData: { [key: string]: any } = {
        name: u.name || '',
        registrationNo: u.registrationNo || '',
        employeeCode: u.employeeCode || '',
        paidFrom: u.paidFrom || '',
        designation: u.designation || '',
        category: u.category || '',
        tallyName: u.tallyName || '',
        gender: u.gender || '',
        email: u.email || '',
        attendanceApprover: u.attendanceEmail || '',
        parentName: u.parentName || '',
        parentOccupation: u.parentOccupation || '',
        mobileNumber: u.mobileNumber || '',
        alternateMobileNumber: u.alternateMobileNumber || '',
        alternateEmail: u.alternateEmail || '',
        address1: u.address1 || '',
        address2: u.address2 || '',
        emergencyContactNo: u.emergencyContactNo || '',
        emergencyContactRelation: u.emergencyContactRelation || '',
        anniversaryDate: toDateString(u.anniversaryDate),
        bankName: u.bankName || '',
        branchName: u.branchName || '',
        accountNumber: u.accountNumber || '',
        ifscCode: u.ifscCode || '',
        accountType: u.accountType || '',
        accountHolderName: u.accountHolderName || '',
        aadhaarNumber: u.aadhaarNumber || '',
        panNumber: u.panNumber || '',
        basicSalary: u.basicSalary || '',
        laptopAllowance: u.laptopAllowance || '',
        totalSalaryPerMonth: u.totalSalaryPerMonth || '',
        totalSalaryPerAnnum: u.totalSalaryPerAnnum || '',
        pf: u.pf || '',
        esi: u.esi || '',
        gratuity: u.gratuity || '',
        joiningDate: toDateString(u.joiningDate),
        articleshipStartDate: toDateString(u.articleshipStartDate),
        transferCase: u.transferCase || '',
        firstYearArticleship: u.firstYearArticleship || '',
        secondYearArticleship: u.secondYearArticleship || '',
        thirdYearArticleship: u.thirdYearArticleship || '',
        filledScholarship: u.filledScholarship || '',
        qualificationLevel: u.qualificationLevel || '',
        nextAttemptDueDate: toDateString(u.nextAttemptDueDate),
        registeredUnderPartner: u.registeredUnderPartner || '',
        workingUnderPartner: u.workingUnderPartner || '',
        employmentStatus: inactive ? 'Inactive' : 'Active',
        inactiveAsOf: inactive ? toDateString(u.inactiveAsOf as string | undefined) : '',
      };

      worksheet.addRow(rowData);
    });

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 35;

    // Define color groups for better visual organization
    const colorGroups = {
      personal: { start: 1, end: 8, color: 'FF2E7D32' },      // Green - Personal Info
      contact: { start: 9, end: 15, color: 'FF1565C0' },      // Blue - Contact Info
      address: { start: 16, end: 17, color: 'FF00838F' },     // Teal - Address
      emergency: { start: 18, end: 20, color: 'FFD84315' },   // Orange - Emergency
      bank: { start: 21, end: 26, color: 'FF00695C' },        // Dark Teal - Bank
      identity: { start: 27, end: 28, color: 'FF4527A0' },    // Deep Purple - Identity
      salary: { start: 29, end: 34, color: 'FFC62828' },      // Red - Salary
      employment: { start: 35, end: 48, color: 'FF283593' },  // Indigo - Employment
    };

    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

      // Determine color based on column group
      let bgColor = 'FF37474F'; // Default grey
      for (const [, group] of Object.entries(colorGroups)) {
        if (colNumber >= group.start && colNumber <= group.end) {
          bgColor = group.color;
          break;
        }
      }

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor }
      };

      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // Style data rows with alternating colors
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const isEvenRow = rowNumber % 2 === 0;
      
      row.eachCell((cell, colNumber) => {
        cell.font = { size: 10, color: { argb: 'FF1A1A1A' } };
        
        // Alternating row colors
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEvenRow ? 'FFF5F5F5' : 'FFFFFFFF' }
        };

        // Left align text columns, center align others
        const textColumns = [1, 2, 6, 7, 9, 10, 11, 12, 15, 16, 17, 21, 22, 26]; // Name, addresses, emails, etc.
        cell.alignment = {
          vertical: 'middle',
          horizontal: textColumns.includes(colNumber) ? 'left' : 'center',
          wrapText: colNumber >= 16 && colNumber <= 17 // Wrap text for address columns
        };

        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
      });

      row.height = 22; // Set consistent row height
    });

    // Add autofilter to header row
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columnCount }
    };

    // Generate filename with date
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const fileName = `Employee_Master_${dateStr}.xlsx`;

    // Save file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const findFieldHistoryEntryIndex = (
    history: Array<{ value?: string; effectiveFrom?: unknown }>,
    effectiveFrom: string,
    value: string
  ) =>
    history.findIndex(
      (entry) =>
        toDateInputValue(entry.effectiveFrom) === effectiveFrom && String(entry.value ?? '') === value
    );


  const handleStartEditFieldHistory = (
    field: FieldHistoryKey,
    row: { value?: string; effectiveFrom?: unknown; effectiveTo?: unknown }
  ) => {
    setFieldHistoryEdit({
      field,
      originalEffectiveFrom: toDateInputValue(row.effectiveFrom),
      originalValue: String(row.value ?? ''),
      value: String(row.value ?? ''),
      effectiveFrom: toDateInputValue(row.effectiveFrom),
      effectiveTo:
        row.effectiveTo == null || row.effectiveTo === '' ? '' : toDateInputValue(row.effectiveTo),
    });
  };

  const handleSaveFieldHistoryEdit = () => {
    if (!fieldHistoryEdit) return;
    const { field, originalEffectiveFrom, originalValue, value, effectiveFrom, effectiveTo } = fieldHistoryEdit;
    if (!effectiveFrom.trim()) {
      alert('Effective from date is required.');
      return;
    }

    setFormData((prev) => {
      const histories = { ...((prev as any).fieldHistories || {}) };
      const arr = [...(histories[field] || [])];
      const idx = findFieldHistoryEntryIndex(arr, originalEffectiveFrom, originalValue);
      if (idx < 0) return prev;

      arr[idx] = {
        ...arr[idx],
        value,
        effectiveFrom,
        effectiveTo: effectiveTo.trim() ? effectiveTo : null,
      };
      histories[field] = arr;

      const active = getActiveFieldHistoryEntry(arr);
      if (active && field in getDefaultManagedEffectiveDates()) {
        setManagedFieldsEffectiveFromByField((p) => ({
          ...p,
          [field as ManagedFieldKey]: toDateInputValue(active.effectiveFrom),
        }));
      }

      return {
        ...prev,
        fieldHistories: histories,
        [field]: active?.value ?? '',
      } as Partial<User>;
    });

    setFieldHistoryEdit(null);
  };

  const handleDeleteFieldHistoryEntry = (
    field: FieldHistoryKey,
    row: { value?: string; effectiveFrom?: unknown }
  ) => {
    if (
      !confirmMajorAction(`Delete this ${field} history entry`, [
        `Value: ${row.value ?? '—'}`,
        'The entry will be removed when you save the employee.',
      ])
    ) {
      return;
    }

    setFormData((prev) => {
      const histories = { ...((prev as any).fieldHistories || {}) };
      const arr = [...(histories[field] || [])];
      const idx = findFieldHistoryEntryIndex(
        arr,
        toDateInputValue(row.effectiveFrom),
        String(row.value ?? '')
      );
      if (idx >= 0) arr.splice(idx, 1);
      histories[field] = arr;

      const active = getActiveFieldHistoryEntry(arr);
      const next = {
        ...prev,
        fieldHistories: histories,
        [field]: active?.value ?? '',
      } as Partial<User>;

      if (active && field in getDefaultManagedEffectiveDates()) {
        setManagedFieldsEffectiveFromByField((p) => ({
          ...p,
          [field as ManagedFieldKey]: toDateInputValue(active.effectiveFrom),
        }));
      }

      return next;
    });

    if (
      fieldHistoryEdit?.field === field &&
      fieldHistoryEdit.originalEffectiveFrom === toDateInputValue(row.effectiveFrom) &&
      fieldHistoryEdit.originalValue === String(row.value ?? '')
    ) {
      setFieldHistoryEdit(null);
    }
  };

  const applyFieldRevisionValue = (field: FieldHistoryKey, value: string) => {
    if (field === 'workingUnderPartner') {
      handleInputChange('workingUnderPartner', value);
      handleInputChange('team', value);
      return;
    }
    handleInputChange(field as keyof User, value);
  };

  const openFieldRevisionPanel = (field: FieldHistoryKey) => {
    setFieldHistoryExpanded((prev) => ({ ...prev, [field]: true }));
    setFieldRevisionPanel({
      field,
      value: '',
      effectiveFrom: toDateInputValue(new Date()),
    });
  };

  const applyFieldRevision = () => {
    if (!fieldRevisionPanel) return;
    const { field, value, effectiveFrom } = fieldRevisionPanel;
    if (!effectiveFrom.trim()) {
      alert('Please select the effective from date.');
      return;
    }
    applyFieldRevisionValue(field, value);
    setManagedFieldsEffectiveFromByField((prev) => ({ ...prev, [field]: effectiveFrom }));
    setFieldRevisionPanel(null);
  };

  const renderFieldWithHistory = (config: {
    field: FieldHistoryKey;
    label: string;
    historyLabel: string;
    emptyHistoryMessage: string;
    addButtonLabel: string;
    revisionHint: string;
    revisionPlaceholder?: string;
    theme?: 'salary' | 'extended' | 'basic';
    inputType: 'text' | 'select';
    selectOptions?: string[];
    selectEmptyLabel?: string;
  }) => {
    const {
      field,
      label,
      historyLabel,
      emptyHistoryMessage,
      addButtonLabel,
      revisionHint,
      revisionPlaceholder,
      theme = 'salary',
      inputType,
      selectOptions = [],
      selectEmptyLabel = 'Select…',
    } = config;

    const inputCls =
      'w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
    const dateCls =
      'w-full min-h-9 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-xs text-slate-900 [color-scheme:light] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
    const panelBorder = theme === 'extended' ? 'border-blue-200' : 'border-slate-200';
    const panelTitle = theme === 'extended' ? 'text-blue-900' : 'text-slate-800';
    const panelBtn =
      'rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

    const histAll = sortSalaryHistoryDesc((formData as any)?.fieldHistories?.[field]);
    const historyOpen = Boolean(fieldHistoryExpanded[field]);
    const currentValue = String((formData as any)[field] || '');
    const historyCount = histAll.length;

    return (
      <div key={field}>
        <button
          type="button"
          onClick={() =>
            setFieldHistoryExpanded((prev) => ({
              ...prev,
              [field]: !prev[field],
            }))
          }
          className="mb-2 flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-[11px] text-slate-700 hover:border-slate-300 hover:bg-slate-100"
          aria-expanded={historyOpen}
        >
          <span className="flex items-center gap-2">
            {historyOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
            <span>
              {historyLabel}
              {historyCount > 0 ? (
                <span className="ml-1.5 text-slate-500">({historyCount})</span>
              ) : null}
            </span>
          </span>
          <span className="text-[10px] text-slate-500 shrink-0">Effective from · End date</span>
        </button>
        {historyOpen && (
          <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-2">
            {historyCount === 0 ? (
              <p className="py-1 text-[11px] text-slate-600">{emptyHistoryMessage}</p>
            ) : (
              <ul className="max-h-56 space-y-0 overflow-y-auto divide-y divide-slate-200 text-[11px]">
                {histAll.map((row, idx) => {
                  const isOpenEnded = row.effectiveTo == null || row.effectiveTo === '';
                  const currentCls = 'font-medium text-blue-800';
                  const rowKey = `${toDateInputValue(row.effectiveFrom)}-${String(row.value ?? '')}-${idx}`;
                  const isEditing =
                    fieldHistoryEdit?.field === field &&
                    fieldHistoryEdit.originalEffectiveFrom === toDateInputValue(row.effectiveFrom) &&
                    fieldHistoryEdit.originalValue === String(row.value ?? '');

                  if (isEditing && fieldHistoryEdit) {
                    return (
                      <li key={rowKey} className="space-y-2 py-2 first:pt-0">
                        {inputType === 'select' ? (
                          <select
                            value={fieldHistoryEdit.value}
                            onChange={(e) =>
                              setFieldHistoryEdit((p) => (p ? { ...p, value: e.target.value } : p))
                            }
                            className={inputCls}
                          >
                            <option value="">{selectEmptyLabel}</option>
                            {selectOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={fieldHistoryEdit.value}
                            onChange={(e) =>
                              setFieldHistoryEdit((p) => (p ? { ...p, value: e.target.value } : p))
                            }
                            className={inputCls}
                          />
                        )}
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[10px] text-slate-500">Effective from</label>
                            <input
                              type="date"
                              value={fieldHistoryEdit.effectiveFrom}
                              onChange={(e) =>
                                setFieldHistoryEdit((p) => (p ? { ...p, effectiveFrom: e.target.value } : p))
                              }
                              className={dateCls}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] text-slate-500">End date (blank = current)</label>
                            <input
                              type="date"
                              value={fieldHistoryEdit.effectiveTo}
                              onChange={(e) =>
                                setFieldHistoryEdit((p) => (p ? { ...p, effectiveTo: e.target.value } : p))
                              }
                              className={dateCls}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={handleSaveFieldHistoryEdit} className={panelBtn}>
                            Save entry
                          </button>
                          <button
                            type="button"
                            onClick={() => setFieldHistoryEdit(null)}
                            className="rounded-md border border-blue-200/65 bg-panel px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li key={rowKey} className="flex flex-col gap-1 py-2 first:pt-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900">{row.value ?? '—'}</div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-slate-600">
                            <span>
                              <span className="text-slate-500">From </span>
                              {formatSalaryHistoryRowDate(row.effectiveFrom)}
                            </span>
                            <span>
                              <span className="text-slate-500">End </span>
                              {isOpenEnded ? (
                                <span className={currentCls}>Current (no end date)</span>
                              ) : (
                                formatSalaryHistoryRowDate(row.effectiveTo)
                              )}
                            </span>
                          </div>
                        </div>
                        {!denyEdits && (
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditFieldHistory(field, row)}
                              className="rounded p-1 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                              title="Edit entry"
                              aria-label="Edit history entry"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFieldHistoryEntry(field, row)}
                              className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                              title="Delete entry"
                              aria-label="Delete history entry"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
        {inputType === 'select' ? (
          <select
            value={currentValue}
            onChange={(e) => applyFieldRevisionValue(field, e.target.value)}
            className={inputCls}
          >
            <option value="">{selectEmptyLabel}</option>
            {selectOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={currentValue}
            onChange={(e) => handleInputChange(field as keyof User, e.target.value)}
            className={inputCls}
          />
        )}
        {hasManagedFieldValue(field as ManagedFieldKey) && (
        <div className="mt-2">
          <label className="block text-[11px] text-slate-500 mb-1">Effective from (current value)</label>
          <input
            type="date"
            value={managedFieldsEffectiveFromByField[field as ManagedFieldKey]}
            onChange={(e) =>
              setManagedFieldsEffectiveFromByField((prev) => ({
                ...prev,
                [field]: e.target.value,
              }))
            }
            className={dateCls}
          />
        </div>
        )}
        <button
          type="button"
          onClick={() => openFieldRevisionPanel(field)}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-blue-200/65 bg-panel px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-900"
        >
          <Plus className="w-3.5 h-3.5" />
          {addButtonLabel}
        </button>
        {fieldRevisionPanel?.field === field && (
          <div className={`mt-2 space-y-2 rounded-md border ${panelBorder} bg-slate-50 p-2`}>
            <div className={`text-[11px] ${panelTitle}`}>{revisionHint}</div>
            {inputType === 'select' ? (
              <select
                value={fieldRevisionPanel.value}
                onChange={(e) =>
                  setFieldRevisionPanel((p) => (p && p.field === field ? { ...p, value: e.target.value } : p))
                }
                className={inputCls}
              >
                <option value="">{selectEmptyLabel}</option>
                {selectOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={fieldRevisionPanel.value}
                onChange={(e) =>
                  setFieldRevisionPanel((p) => (p && p.field === field ? { ...p, value: e.target.value } : p))
                }
                placeholder={revisionPlaceholder}
                className={inputCls}
              />
            )}
            <input
              type="date"
              value={fieldRevisionPanel.effectiveFrom}
              onChange={(e) =>
                setFieldRevisionPanel((p) => (p && p.field === field ? { ...p, effectiveFrom: e.target.value } : p))
              }
              className={dateCls}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={applyFieldRevision} className={panelBtn}>
                Apply to current row
              </button>
              <button
                type="button"
                onClick={() => setFieldRevisionPanel(null)}
                className="rounded-md border border-blue-200/65 bg-panel px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSalaryFieldWithHistory = (field: SalaryHistoryFieldKey, label: string, theme: 'salary' | 'extended' = 'salary') =>
    renderFieldWithHistory({
      field,
      label,
      historyLabel: 'Salary history',
      emptyHistoryMessage:
        'No saved history for this field yet. After you add a new value and save, previous values appear here with start and end dates.',
      addButtonLabel: 'Add new salary',
      revisionHint: 'New amount (applies to the form; save employee to persist)',
      revisionPlaceholder: 'Amount',
      theme,
      inputType: 'text',
    });

  const scheduleTemplateModalEl = (
    <ScheduleTemplateModal
      isOpen={scheduleTemplateModal.isOpen}
      onClose={() => setScheduleTemplateModal({ isOpen: false, template: null })}
      template={scheduleTemplateModal.template}
      onSave={handleSaveScheduleTemplate}
      onDelete={scheduleTemplateModal.template ? handleDeleteScheduleTemplate : undefined}
      saving={isSavingScheduleTemplate}
    />
  );

  // ============== EDIT FORM VIEW =================
  if (editingUser) {
    return (
      <>
      <section
        className="employee-edit-date-inputs rounded-lg border border-blue-200/65 bg-panel p-6 shadow-sm"
        aria-labelledby="edit-employee-heading"
      >
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <h2 id="edit-employee-heading" className="text-xl font-semibold tracking-tight text-slate-900">
              Edit employee
            </h2>
            <p className="max-w-2xl text-sm text-slate-600">
              Work through the tabs (basic, schedule, bank, salary, history), then use Save changes. Salary fields can
              record history before you save.
            </p>
            <ol className="flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Suggested workflow">
              {EDIT_EMPLOYEE_WORKFLOW_STEPS.map((t, i) => (
                <li
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>
          </div>
          <button
            type="button"
            onClick={handleCancelEdit}
            className="shrink-0 self-start rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:self-auto"
            aria-label="Close edit form"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div
            className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tab Navigation */}
          <div className="md:col-span-2 mb-4">
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
              {tabAccess.basic !== 'none' && (
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'basic'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                Basic Info
              </button>
              )}
              {tabAccess.schedule !== 'none' && (
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'schedule'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                Schedule
              </button>
              )}
              {tabAccess.extended !== 'none' && (
              <button
                type="button"
                onClick={() => setActiveTab('extended')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'extended'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                Extended
              </button>
              )}
              {tabAccess.bank !== 'none' && (
              <button
                type="button"
                onClick={() => setActiveTab('bank')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'bank'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                Bank Details
              </button>
              )}
              {tabAccess.salary !== 'none' && (
              <button
                type="button"
                onClick={() => setActiveTab('salary')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'salary'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                Salary & Leave
              </button>
              )}
              {tabAccess.history !== 'none' && (
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'history'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                History
              </button>
              )}
            </div>
          </div>

          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <>
              <div className="space-y-4">
                <h3 className="text-sm font-medium border-b border-slate-200 text-slate-900 pb-2">Basic Information</h3>
                
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">OD ID</label>
                  <input
                    type="text"
                    value={formData.odId || ''}
                    onChange={(e) => handleInputChange('odId', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Attendance Email</label>
                  <input
                    type="email"
                    value={formData.attendanceEmail || ''}
                    onChange={(e) => handleInputChange('attendanceEmail', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {formData.category === 'Article' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Credits for Articles (as on 1st Jan 26)</label>
                    <input
                      type="number"
                      value={formData.articleCreditsAsOnJan26 ?? ''}
                      onChange={(e) => handleInputChange('articleCreditsAsOnJan26', e.target.value === '' ? undefined : Number(e.target.value))}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      min="0"
                    />
                  </div>
                )}

                {renderFieldWithHistory({
                  field: 'designation',
                  label: 'Designation',
                  historyLabel: 'Designation history',
                  emptyHistoryMessage:
                    'No saved history yet. After you change designation and save, previous values appear here with start and end dates.',
                  addButtonLabel: 'Add new designation',
                  revisionHint: 'New designation (applies to the form; save employee to persist)',
                  theme: 'basic',
                  inputType: 'select',
                  selectOptions: predefinedValues.designations,
                  selectEmptyLabel: 'Select designation',
                })}

                {renderFieldWithHistory({
                  field: 'workingUnderPartner',
                  label: 'Work Partner',
                  historyLabel: 'Work partner history',
                  emptyHistoryMessage:
                    'No saved history yet. After you change work partner and save, previous partners appear here with start and end dates.',
                  addButtonLabel: 'Add new work partner',
                  revisionHint: 'New work partner (applies to the form; save employee to persist)',
                  theme: 'basic',
                  inputType: 'select',
                  selectOptions: predefinedValues.teams,
                  selectEmptyLabel: 'Select work partner',
                })}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Team <span className="text-slate-500">(auto-filled from Work Partner)</span></label>
                  <input
                    type="text"
                    value={formData.team || ''}
                    disabled
                    className="w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                    title="Team automatically matches Work Partner"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Employment Type History</label>
                  <div className="space-y-2 mb-2">
                      {Array.isArray(formData.employmentTypeHistory)
                        ? formData.employmentTypeHistory.map((entry: { employmentType: string; effectiveFrom: string | number | Date }, idx: number) => (
                            <div key={String(idx)} className="flex flex-wrap items-center gap-2 text-xs">
                            {employmentTypeEditIdx === idx ? (
                              <>
                                <select
                                  value={employmentTypeEditValue}
                                  onChange={(e) => setEmploymentTypeEditValue(e.target.value)}
                                  className="rounded-md border border-blue-200/65 bg-panel px-2 py-1 text-sm text-slate-900 shadow-sm"
                                >
                                  <option value="">Select Type</option>
                                  <option value="fulltime">Full Time</option>
                                  <option value="halftime">Half Time</option>
                                  <option value="article">Article</option>
                                </select>
                                <input
                                  type="date"
                                  value={employmentTypeEditDate}
                                  onChange={(e) => setEmploymentTypeEditDate(e.target.value)}
                                  className="min-h-9 rounded border border-slate-300 bg-panel px-2 py-1 text-sm text-slate-900 [color-scheme:light]"
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveEmploymentTypeHistoryEdit}
                                  className="rounded-md bg-blue-600 px-2 py-1 text-white"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEmploymentTypeEditIdx(null)}
                                  className="rounded-md border border-slate-300 bg-panel px-2 py-1 text-slate-700"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                            <span className="rounded-md bg-slate-200 px-2 py-1 font-medium text-slate-800">{entry.employmentType}</span>
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">
                              From: {new Date(entry.effectiveFrom).toLocaleDateString('en-GB')}
                            </span>
                            {!denyEdits && (
                              <>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-panel px-2 py-1 text-slate-700 hover:bg-slate-50"
                                  title="Edit this entry"
                                  onClick={() => handleStartEditEmploymentTypeHistory(idx)}
                                >
                                  <Edit2 className="h-3 w-3" />
                                  Edit
                                </button>
                            <button
                              type="button"
                              className="px-2 py-1 bg-red-600 text-white rounded"
                              title="Delete this entry"
                              onClick={() => handleDeleteEmploymentTypeHistory(idx)}
                            >
                              Delete
                            </button>
                              </>
                            )}
                              </>
                            )}
                          </div>
                        ))
                      : null}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <select
                      value={newEmploymentType}
                      onChange={e => setNewEmploymentType(e.target.value)}
                      className="rounded-md border border-blue-200/65 bg-panel px-2 py-1 text-sm text-slate-900 shadow-sm"
                    >
                      <option value="">Select Type</option>
                      <option value="fulltime">Full Time</option>
                      <option value="halftime">Half Time</option>
                      <option value="article">Article</option>
                    </select>
                      <input
                        type="date"
                        value={newEmploymentTypeDate}
                        onChange={e => setNewEmploymentTypeDate(e.target.value)}
                        className="min-h-9 rounded border border-slate-300 bg-panel px-2 py-1 text-sm text-slate-900 [color-scheme:light]"
                      />
                    <button
                      type="button"
                      onClick={handleAddEmploymentTypeHistory}
                      className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Joining Date</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.joiningDate)}
                    onChange={(e) => handleInputChange('joiningDate', e.target.value)}
                    className="w-full min-h-10 rounded border border-slate-300 bg-panel px-3 py-2 text-sm text-slate-900 [color-scheme:light] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                
                 <div className="flex flex-col gap-3 mt-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive !== false}
                      onChange={(e) => handleIsActiveChange(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                    />
                    <label htmlFor="isActive" className="text-sm text-slate-800">
                      Active employee
                    </label>
                  </div>
                  {formData.isActive === false && (
                    <div>
                      <label htmlFor="inactiveAsOf" className="block text-xs font-medium text-slate-600 mb-1">
                        Inactive as of (first day excluded from attendance &amp; summaries)
                      </label>
                      <input
                        id="inactiveAsOf"
                        type="date"
                        value={toDateInputValue(formData.inactiveAsOf)}
                        onChange={(e) => handleInputChange('inactiveAsOf', e.target.value)}
                        className="w-full max-w-xs min-h-10 rounded border border-slate-300 bg-panel px-3 py-2 text-sm text-slate-900 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                        required
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Days on and after this date are not counted in reports or dashboards.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Placeholder for second column */}
              <div className="hidden md:block"></div>
            </>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="md:col-span-2 space-y-6">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-3">
                <h3 className="text-sm font-semibold text-slate-900">Work schedule entries</h3>
                <ScheduleTemplateToolbar
                  templates={scheduleTemplates}
                  disabled={denyEdits}
                  onApplyTemplate={handleApplyScheduleTemplate}
                  onAddBlankEntry={() => handleAddScheduleEntry()}
                  onNewTemplate={() => setScheduleTemplateModal({ isOpen: true, template: null })}
                  onEditTemplate={(t) => setScheduleTemplateModal({ isOpen: true, template: t })}
                />
              </div>

              {(formData.schedules || []).map((entry, index) => (
                <div key={index} className="rounded-lg border border-blue-200/65 bg-panel p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-slate-700">Effective from</label>
                      <input
                        type="date"
                        value={toDateInputValue(entry.effectiveFrom)}
                        onChange={(e) => handleEffectiveFromChange(index, e.target.value)}
                        className="min-h-9 rounded border border-slate-300 bg-panel px-2 py-1 text-sm text-slate-900 [color-scheme:light]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveScheduleEntry(index)}
                      className="rounded-md bg-rose-600 px-2 py-1 text-sm font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {/* Monday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Monday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.monday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'monday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.monday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'monday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.monday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'monday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.monday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.monday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'monday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.monday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Tuesday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Tuesday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.tuesday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'tuesday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.tuesday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'tuesday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.tuesday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'tuesday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.tuesday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.tuesday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'tuesday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.tuesday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Wednesday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Wednesday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.wednesday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'wednesday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.wednesday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'wednesday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.wednesday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'wednesday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.wednesday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.wednesday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'wednesday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.wednesday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Thursday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Thursday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.thursday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'thursday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.thursday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'thursday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.thursday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'thursday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.thursday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.thursday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'thursday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.thursday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Friday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Friday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.friday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'friday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.friday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'friday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.friday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'friday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.friday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.friday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'friday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.friday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Saturday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Saturday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.saturday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'saturday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.saturday?.isHalfDay) !== false}
                              onChange={(e) => handleScheduleEntryChange(index, 'saturday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.saturday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'saturday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.saturday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.saturday?.outTime || '13:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'saturday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.saturday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Sunday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Sunday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.sunday?.isHoliday) !== false}
                              onChange={(e) => handleScheduleEntryChange(index, 'sunday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.sunday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'sunday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.sunday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'sunday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.sunday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.sunday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'sunday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                            disabled={entry.daily?.sunday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="pt-6 mt-6 border-t border-slate-200">
                <div className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Seasonal schedule overrides</h3>
                    <p className="text-xs text-slate-500">Recurring rules that apply for specific months (e.g. Dec-Jan winter timings)</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSeasonalSchedule}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    Add seasonal override
                  </button>
                </div>

                <div className="space-y-6 mt-4">
                  {(formData.seasonalSchedules || []).map((entry, index) => (
                    <div key={index} className="rounded-lg border border-emerald-200/65 bg-emerald-50/30 p-4 shadow-sm">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-slate-700">From Month</label>
                            <select
                              value={entry.startMonth}
                              onChange={(e) => handleSeasonalScheduleFieldChange(index, 'startMonth', parseInt(e.target.value))}
                              className="rounded border border-slate-300 bg-panel px-2 py-1 text-sm text-slate-900 shadow-sm"
                            >
                              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                                <option key={i} value={i}>{m}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-slate-700">To Month</label>
                            <select
                              value={entry.endMonth}
                              onChange={(e) => handleSeasonalScheduleFieldChange(index, 'endMonth', parseInt(e.target.value))}
                              className="rounded border border-slate-300 bg-panel px-2 py-1 text-sm text-slate-900 shadow-sm"
                            >
                              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                                <option key={i} value={i}>{m}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-slate-700 text-xs">Version Effective</label>
                            <input
                              type="date"
                              value={toDateInputValue(entry.effectiveFrom)}
                              onChange={(e) => handleSeasonalScheduleFieldChange(index, 'effectiveFrom', e.target.value)}
                              className="min-h-9 rounded border border-slate-300 bg-panel px-2 py-1 text-xs text-slate-900 [color-scheme:light]"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSeasonalSchedule(index)}
                          className="rounded-md bg-rose-600 px-2 py-1 text-sm font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                          <div key={day} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-semibold capitalize text-slate-800">{day}</label>
                              <div className="flex gap-2">
                                <label className="flex items-center gap-1 text-[10px]">
                                  <input
                                    type="checkbox"
                                    checked={entry.daily?.[day]?.isHoliday || false}
                                    onChange={(e) => handleSeasonalScheduleTimeChange(index, day, 'isHoliday', e.target.checked)}
                                    className="w-3 h-3"
                                  />
                                  Holiday
                                </label>
                                <label className="flex items-center gap-1 text-[10px]">
                                  <input
                                    type="checkbox"
                                    checked={entry.daily?.[day]?.isHalfDay || false}
                                    onChange={(e) => handleSeasonalScheduleTimeChange(index, day, 'isHalfDay', e.target.checked)}
                                    className="w-3 h-3"
                                  />
                                  Half
                                </label>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] text-slate-500">In Time</label>
                                <input
                                  type="time"
                                  value={entry.daily?.[day]?.inTime || ''}
                                  onChange={(e) => handleSeasonalScheduleTimeChange(index, day, 'inTime', e.target.value)}
                                  className="w-full rounded border border-slate-200 bg-panel px-2 py-1 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none"
                                  disabled={entry.daily?.[day]?.isHoliday}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500">Out Time</label>
                                <input
                                  type="time"
                                  value={entry.daily?.[day]?.outTime || ''}
                                  onChange={(e) => handleSeasonalScheduleTimeChange(index, day, 'outTime', e.target.value)}
                                  className="w-full rounded border border-slate-200 bg-panel px-2 py-1 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none"
                                  disabled={entry.daily?.[day]?.isHoliday}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(formData.seasonalSchedules || []).length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 bg-slate-50/50">
                      No seasonal overrides defined for this employee.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Extended Tab */}
          {activeTab === 'extended' && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium border-b border-slate-200 text-slate-900 pb-2 mb-4">Extended Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Identity & Contact */}
                {[
                  { label: 'Registration No.', key: 'registrationNo' },
                  { label: 'Employee Code', key: 'employeeCode' },
                  { label: 'Paid From', key: 'paidFrom' },
                  { label: 'Tally Name', key: 'tallyName' },
                  { label: 'Category', key: 'category' },
                  { label: 'Gender', key: 'gender' },
                  { label: 'Mobile No.', key: 'mobileNumber' },
                  { label: 'Alt Mobile', key: 'alternateMobileNumber' },
                  { label: 'Alt Email', key: 'alternateEmail' },
                  { label: 'Attendance Email', key: 'attendanceEmail' },
                  { label: 'Parent Name', key: 'parentName' },
                  { label: 'Parent Occ.', key: 'parentOccupation' },
                ].map((field) => {
                  // Special handling for dropdown fields
                  if (field.key === 'designation') {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">Select {field.label.toLowerCase()}</option>
                          {predefinedValues.designations.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    );
                  } else if (field.key === 'paidFrom') {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">Select {field.label.toLowerCase()}</option>
                          {predefinedValues.paidFrom.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    );
                  } else if (field.key === 'category') {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">Select {field.label.toLowerCase()}</option>
                          {predefinedValues.categories.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    );
                  } else {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        <input
                          type="text"
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                    );
                  }
                })}

                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 1</label>
                        <input
                          type="text"
                          value={formData.address1 || ''}
                          onChange={(e) => handleInputChange('address1', e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 2</label>
                        <input
                          type="text"
                          value={formData.address2 || ''}
                          onChange={(e) => handleInputChange('address2', e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                </div>

                {/* Emergency Contact & Banking */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Emergency Contact No.</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactNo || ''}
                      onChange={(e) => handleInputChange('emergencyContactNo' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Relation</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactRelation || ''}
                      onChange={(e) => handleInputChange('emergencyContactRelation' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Anniversary Date</label>
                    <input
                      type="date"
                      value={toDateInputValue((formData as any).anniversaryDate)}
                      onChange={(e) => handleInputChange('anniversaryDate' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Aadhar No.</label>
                    <input
                      type="text"
                      value={(formData as any).aadhaarNumber || ''}
                      onChange={(e) => handleInputChange('aadhaarNumber' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">PAN</label>
                    <input
                      type="text"
                      value={(formData as any).panNumber || ''}
                      onChange={(e) => handleInputChange('panNumber' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                {/* Salary Information */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                </div>

                {/* Articleship & Professional */}
                {renderFieldWithHistory({
                  field: 'registeredUnderPartner',
                  label: 'Reg. Partner',
                  historyLabel: 'Registered partner history',
                  emptyHistoryMessage:
                    'No saved history yet. After you change registered partner and save, previous values appear here with start and end dates.',
                  addButtonLabel: 'Add new registered partner',
                  revisionHint: 'New registered partner (applies to the form; save employee to persist)',
                  revisionPlaceholder: 'Partner name',
                  theme: 'extended',
                  inputType: 'text',
                })}

                {[
                  { label: 'Transfer Case', key: 'transferCase' },
                  { label: '1st Year Art.', key: 'firstYearArticleship' },
                  { label: '2nd Year Art.', key: 'secondYearArticleship' },
                  { label: '3rd Year Art.', key: 'thirdYearArticleship' },
                  { label: 'Filled Scholarship', key: 'filledScholarship' },
                  { label: 'Qualification', key: 'qualificationLevel' },
                  { label: 'Work Timing (Text)', key: 'workingTiming' },
                ].map((field) => (
                  <div key={field.key}>
                     <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                    <input
                      type="text"
                      value={(formData as any)[field.key] || ''}
                      onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                ))}

                {/* Dates */}
                 <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Articleship Start</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.articleshipStartDate)}
                    onChange={(e) => handleInputChange('articleshipStartDate', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                 <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Next Attempt Due</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.nextAttemptDueDate)}
                    onChange={(e) => handleInputChange('nextAttemptDueDate', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

              </div>

              {/* Flexible Additional Info */}
              <div className="mt-6 md:col-span-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-800">
                    Additional info (PAN, Aadhaar, etc.)
                  </h4>
                  <p className="text-[11px] text-slate-500">Fields are managed from the main page.</p>
                </div>
                <div className="space-y-2">
                  {(formData.extraInfo || []).map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={item.label}
                        disabled
                        className="col-span-4 cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-500"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={item.value}
                        onChange={(e) => handleExtraInfoChange(idx, 'value', e.target.value)}
                        className="col-span-8 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  ))}
                  {(formData.extraInfo || []).length === 0 && (
                    <p className="text-[11px] text-slate-500">No additional info fields defined yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bank Details Tab */}
          {activeTab === 'bank' && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium border-b border-slate-200 text-slate-900 pb-2 mb-4">Bank Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={(formData as any).bankName || ''}
                    onChange={(e) => handleInputChange('bankName' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Branch Name</label>
                  <input
                    type="text"
                    value={(formData as any).branchName || ''}
                    onChange={(e) => handleInputChange('branchName' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={(formData as any).accountNumber || ''}
                    onChange={(e) => handleInputChange('accountNumber' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={(formData as any).ifscCode || ''}
                    onChange={(e) => handleInputChange('ifscCode' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Account Type</label>
                  <input
                    type="text"
                    value={(formData as any).accountType || ''}
                    onChange={(e) => handleInputChange('accountType' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Account Holder Name</label>
                  <input
                    type="text"
                    value={(formData as any).accountHolderName || ''}
                    onChange={(e) => handleInputChange('accountHolderName' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Salary & Leave Tab */}
          {activeTab === 'salary' && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium border-b border-slate-200 text-slate-900 pb-2 mb-4">Salary & Leave Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Salary Details */}
                <div className="md:col-span-3">
                  <h4 className="mb-3 border-b border-slate-200 pb-1 text-sm font-semibold text-slate-800">Salary Details</h4>
                </div>
                
                {renderSalaryFieldWithHistory('basicSalary', 'Basic Salary', 'salary')}
                {renderSalaryFieldWithHistory('laptopAllowance', 'Laptop Allowance', 'salary')}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Other Allowance</label>
                  <input
                    type="text"
                    value={(formData as any).otherAllowance || ''}
                    onChange={(e) => handleInputChange('otherAllowance' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Bonus</label>
                  <input
                    type="text"
                    value={(formData as any).bonus || ''}
                    onChange={(e) => handleInputChange('bonus' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Incentive</label>
                  <input
                    type="text"
                    value={(formData as any).incentive || ''}
                    onChange={(e) => handleInputChange('incentive' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                {renderSalaryFieldWithHistory('totalSalaryPerMonth', 'Total Salary (P/M)', 'salary')}
                {renderSalaryFieldWithHistory('totalSalaryPerAnnum', 'Per Annum', 'salary')}
                
                {/* Deductions */}
                <div className="md:col-span-3">
                  <h4 className="mb-3 border-b border-slate-200 pb-1 text-sm font-semibold text-slate-800">Deductions</h4>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">PF (Provident Fund)</label>
                  <input
                    type="text"
                    value={(formData as any).pf || ''}
                    onChange={(e) => handleInputChange('pf' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ESI</label>
                  <input
                    type="text"
                    value={(formData as any).esi || ''}
                    onChange={(e) => handleInputChange('esi' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Gratuity</label>
                  <input
                    type="text"
                    value={(formData as any).gratuity || ''}
                    onChange={(e) => handleInputChange('gratuity' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                
                {/* Leave Information */}
                <div className="md:col-span-3">
                  <h4 className="mb-3 border-b border-slate-200 pb-1 text-sm font-semibold text-slate-800">Leave Information</h4>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Total Earned</label>
                  <div className="text-sm font-medium rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
                    {(formData as any).leaveBalance?.earned || 0} days
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Total Used</label>
                  <div className="text-sm font-medium rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
                    {(formData as any).leaveBalance?.used || 0} days
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Balance Available</label>
                  <div
                    className={`text-sm font-medium rounded-md border px-3 py-2 ${
                      ((formData as any).leaveBalance?.remaining || 0) > 0
                        ? 'border-blue-200 bg-blue-50 text-blue-900'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    {(formData as any).leaveBalance?.remaining || 0} days
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Monthly Earned Rate</label>
                  <div className="text-sm font-medium rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
                    {(formData as any).leaveBalance?.monthlyEarned || 2} days/month
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Last Updated</label>
                  <div className="text-sm font-medium rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
                    {(formData as any).leaveBalance?.lastUpdated 
                      ? new Date((formData as any).leaveBalance.lastUpdated).toLocaleDateString('en-GB')
                      : 'Never'
                    }
                  </div>
                </div>
                
              </div>
            </div>
          )}

          {/* Extended Tab */}
          {activeTab === 'extended' && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium border-b border-slate-200 text-slate-900 pb-2 mb-4">Extended Details (Optional)</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Identity & Contact */}
                {[
                  { label: 'Registration No.', key: 'registrationNo' },
                  { label: 'Employee Code', key: 'employeeCode' },
                  { label: 'Paid From', key: 'paidFrom' },
                  { label: 'Tally Name', key: 'tallyName' },
                  { label: 'Category', key: 'category' },
                  { label: 'Gender', key: 'gender' },
                  { label: 'Mobile No.', key: 'mobileNumber' },
                  { label: 'Alt Mobile', key: 'alternateMobileNumber' },
                  { label: 'Alt Email', key: 'alternateEmail' },
                  { label: 'Attendance Email', key: 'attendanceEmail' },
                  { label: 'Parent Name', key: 'parentName' },
                  { label: 'Parent Occ.', key: 'parentOccupation' },
                ].map((field) => {
                  // Special handling for dropdown fields
                  if (field.key === 'paidFrom') {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">Select {field.label.toLowerCase()}</option>
                          {predefinedValues.paidFrom.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    );
                  } else if (field.key === 'category') {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">Select {field.label.toLowerCase()}</option>
                          {predefinedValues.categories.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    );
                  } else {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        <input
                          type="text"
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                    );
                  }
                })}

                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 1</label>
                        <input
                          type="text"
                          value={formData.address1 || ''}
                          onChange={(e) => handleInputChange('address1', e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 2</label>
                        <input
                          type="text"
                          value={formData.address2 || ''}
                          onChange={(e) => handleInputChange('address2', e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                </div>

                {/* Emergency Contact & Banking */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Emergency Contact No.</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactNo || ''}
                      onChange={(e) => handleInputChange('emergencyContactNo' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Relation</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactRelation || ''}
                      onChange={(e) => handleInputChange('emergencyContactRelation' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Anniversary Date</label>
                    <input
                      type="date"
                      value={toDateInputValue((formData as any).anniversaryDate)}
                      onChange={(e) => handleInputChange('anniversaryDate' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={(formData as any).bankName || ''}
                      onChange={(e) => handleInputChange('bankName' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={(formData as any).branchName || ''}
                      onChange={(e) => handleInputChange('branchName' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Account No.</label>
                    <input
                      type="text"
                      value={(formData as any).accountNumber || ''}
                      onChange={(e) => handleInputChange('accountNumber' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">IFSC</label>
                    <input
                      type="text"
                      value={(formData as any).ifscCode || ''}
                      onChange={(e) => handleInputChange('ifscCode' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Type of Account</label>
                    <input
                      type="text"
                      value={(formData as any).accountType || ''}
                      onChange={(e) => handleInputChange('accountType' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Name of Account Holder</label>
                    <input
                      type="text"
                      value={(formData as any).accountHolderName || ''}
                      onChange={(e) => handleInputChange('accountHolderName' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Aadhar No.</label>
                    <input
                      type="text"
                      value={(formData as any).aadhaarNumber || ''}
                      onChange={(e) => handleInputChange('aadhaarNumber' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">PAN</label>
                    <input
                      type="text"
                      value={(formData as any).panNumber || ''}
                      onChange={(e) => handleInputChange('panNumber' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                {/* Salary Information */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderSalaryFieldWithHistory('basicSalary', 'Basis Salary/Stipend/Fees', 'extended')}
                  {renderSalaryFieldWithHistory('laptopAllowance', 'Laptop Allowance', 'extended')}
                  {renderSalaryFieldWithHistory('totalSalaryPerMonth', 'Total Salary (P/M)', 'extended')}
                  {renderSalaryFieldWithHistory('totalSalaryPerAnnum', 'Per Annum', 'extended')}
                </div>

                {/* Articleship & Professional */}
                {renderFieldWithHistory({
                  field: 'registeredUnderPartner',
                  label: 'Reg. Partner',
                  historyLabel: 'Registered partner history',
                  emptyHistoryMessage:
                    'No saved history yet. After you change registered partner and save, previous values appear here with start and end dates.',
                  addButtonLabel: 'Add new registered partner',
                  revisionHint: 'New registered partner (applies to the form; save employee to persist)',
                  revisionPlaceholder: 'Partner name',
                  theme: 'extended',
                  inputType: 'text',
                })}

                {[
                  { label: 'Transfer Case', key: 'transferCase' },
                  { label: '1st Year Art.', key: 'firstYearArticleship' },
                  { label: '2nd Year Art.', key: 'secondYearArticleship' },
                  { label: '3rd Year Art.', key: 'thirdYearArticleship' },
                  { label: 'Filled Scholarship', key: 'filledScholarship' },
                  { label: 'Qualification', key: 'qualificationLevel' },
                  { label: 'Work Timing (Text)', key: 'workingTiming' },
                ].map((field) => (
                  <div key={field.key}>
                     <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                    <input
                      type="text"
                      value={(formData as any)[field.key] || ''}
                      onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                ))}

                {/* Dates */}
                 <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Articleship Start</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.articleshipStartDate)}
                    onChange={(e) => handleInputChange('articleshipStartDate', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                 <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Next Attempt Due</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.nextAttemptDueDate)}
                    onChange={(e) => handleInputChange('nextAttemptDueDate', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="md:col-span-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Change history</h3>

                {/* Change Reason Input */}
                <div className="mb-6">
                  <label className="mb-2 block text-sm font-medium text-slate-800">
                    Reason for Changes (Optional)
                  </label>
                  <textarea
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="Enter reason for the changes being made..."
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    rows={3}
                  />
                </div>

                {/* History Table */}
                {historyLoading ? (
                  <div className="py-8 text-center">
                    <div className="text-sm text-slate-600">Loading history…</div>
                  </div>
                ) : employeeHistory.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="text-sm text-slate-600">No change history found</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full text-left text-sm text-slate-800">
                      <caption className="sr-only">Field change history for this employee</caption>
                      <thead className="border-b border-slate-200 bg-slate-100 text-xs font-medium uppercase tracking-wide text-slate-600">
                        <tr>
                          <th scope="col" className="px-4 py-3">
                            Field
                          </th>
                          <th scope="col" className="px-4 py-3">
                            Old value
                          </th>
                          <th scope="col" className="px-4 py-3">
                            New value
                          </th>
                          <th scope="col" className="px-4 py-3">
                            Changed by
                          </th>
                          <th scope="col" className="px-4 py-3">
                            Date
                          </th>
                          <th scope="col" className="px-4 py-3">
                            Reason
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {employeeHistory.map((entry, index) => (
                          <tr key={index} className="hover:bg-slate-50/90">
                            <td className="px-4 py-3">
                              <span className="font-medium text-slate-900">
                                {entry.fieldName === 'workingUnderPartner'
                                  ? 'Work Partner'
                                  : entry.fieldName === 'designation'
                                    ? 'Designation'
                                    : entry.fieldName === 'paidFrom'
                                      ? 'Paid From'
                                      : entry.fieldName === 'category'
                                        ? 'Category'
                                        : entry.fieldName === 'qualificationLevel'
                                          ? 'Qualification'
                                          : entry.fieldName === 'registeredUnderPartner'
                                            ? 'Reg. Partner'
                                            : entry.fieldName}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-slate-500 line-through">{entry.oldValue || 'N/A'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-medium text-blue-800">{entry.newValue || 'N/A'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-slate-700">{entry.changedBy}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-slate-600">
                                {new Date(entry.changedAt).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-slate-600">{entry.changeReason || 'N/A'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={handleCancelEdit}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveLoading || denyEdits}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            {saveLoading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </section>
      {scheduleTemplateModalEl}
    </>
    );
  }

  // ============== ADD NEW EMPLOYEE FORM VIEW =================
  if (isAddingNew) {
    return (
      <>
      <section
        className="employee-edit-date-inputs rounded-lg border border-blue-200/65 bg-panel p-6 shadow-sm"
        aria-labelledby="add-employee-heading"
      >
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <h2 id="add-employee-heading" className="text-xl font-semibold tracking-tight text-slate-900">
              Add new employee
            </h2>
            <p className="max-w-2xl text-sm text-slate-600">
              Enter required details on Basic, add schedule rows if timings apply, then create the record. You can return
              later to fill Extended from the roster.
            </p>
            <ol className="flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Suggested workflow">
              {ADD_EMPLOYEE_WORKFLOW_STEPS.map((t, i) => (
                <li
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>
          </div>
          <button
            type="button"
            onClick={() => setIsAddingNew(false)}
            className="shrink-0 self-start rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:self-auto"
            aria-label="Close add employee form"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Tab Navigation */}
          <div className="mb-4 md:col-span-2">
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
              {tabAccess.basic !== 'none' && (
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'basic'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                Basic Info
              </button>
              )}
              {tabAccess.schedule !== 'none' && (
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'schedule'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                Schedule
              </button>
              )}
              {tabAccess.extended !== 'none' && (
              <button
                type="button"
                onClick={() => setActiveTab('extended')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'extended'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                Extended
              </button>
              )}
            </div>
          </div>

          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <>
              <div className="space-y-4">
                <h3 className="text-sm font-medium border-b border-slate-200 text-slate-900 pb-2">Basic Information</h3>
                
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">OD ID *</label>
                  <input
                    type="text"
                    value={formData.odId || ''}
                    onChange={(e) => handleInputChange('odId', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>

                {renderFieldWithHistory({
                  field: 'designation',
                  label: 'Designation',
                  historyLabel: 'Designation history',
                  emptyHistoryMessage:
                    'No saved history yet. After you change designation and save, previous values appear here with start and end dates.',
                  addButtonLabel: 'Add new designation',
                  revisionHint: 'New designation (applies to the form; save employee to persist)',
                  theme: 'basic',
                  inputType: 'select',
                  selectOptions: predefinedValues.designations,
                  selectEmptyLabel: 'Select designation',
                })}

                {renderFieldWithHistory({
                  field: 'workingUnderPartner',
                  label: 'Work Partner',
                  historyLabel: 'Work partner history',
                  emptyHistoryMessage:
                    'No saved history yet. After you change work partner and save, previous partners appear here with start and end dates.',
                  addButtonLabel: 'Add new work partner',
                  revisionHint: 'New work partner (applies to the form; save employee to persist)',
                  theme: 'basic',
                  inputType: 'select',
                  selectOptions: predefinedValues.teams,
                  selectEmptyLabel: 'Select work partner',
                })}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Team <span className="text-slate-500">(auto-filled from Work Partner)</span></label>
                  <input
                    type="text"
                    value={formData.team || ''}
                    disabled
                    className="w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                    title="Team automatically matches Work Partner"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Joining Date *</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.joiningDate)}
                    onChange={(e) => handleInputChange('joiningDate', e.target.value)}
                    className="w-full min-h-10 rounded border border-slate-300 bg-panel px-3 py-2 text-sm text-slate-900 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500"
                    required
                  />
                </div>
                
                 <div className="flex flex-col gap-3 mt-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isActiveNew"
                      checked={formData.isActive !== false}
                      onChange={(e) => handleIsActiveChange(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                    />
                    <label htmlFor="isActiveNew" className="text-sm text-slate-800">
                      Active employee
                    </label>
                  </div>
                  {formData.isActive === false && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Inactive as of (first day excluded from attendance &amp; summaries) *
                      </label>
                      <input
                        type="date"
                        value={toDateInputValue(formData.inactiveAsOf)}
                        onChange={(e) => handleInputChange('inactiveAsOf', e.target.value)}
                        className="w-full max-w-xs min-h-10 rounded border border-slate-300 bg-panel px-3 py-2 text-sm text-slate-900 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500"
                        required
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Placeholder for second column */}
              <div className="hidden md:block"></div>
            </>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="md:col-span-2 space-y-6">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-3">
                <h3 className="text-sm font-semibold text-slate-900">Work schedule entries</h3>
                <ScheduleTemplateToolbar
                  templates={scheduleTemplates}
                  disabled={denyEdits}
                  onApplyTemplate={handleApplyScheduleTemplate}
                  onAddBlankEntry={() => handleAddScheduleEntry()}
                  onNewTemplate={() => setScheduleTemplateModal({ isOpen: true, template: null })}
                  onEditTemplate={(t) => setScheduleTemplateModal({ isOpen: true, template: t })}
                />
              </div>

              {(formData.schedules || []).map((entry, index) => (
                <div key={index} className="rounded-lg border border-blue-200/65 bg-panel p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-slate-700">Effective from</label>
                      <input
                        type="date"
                        value={toDateInputValue(entry.effectiveFrom)}
                        onChange={(e) => handleEffectiveFromChange(index, e.target.value)}
                        className="min-h-9 rounded border border-slate-300 bg-panel px-2 py-1 text-sm text-slate-900 [color-scheme:light]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveScheduleEntry(index)}
                      className="rounded-md bg-rose-600 px-2 py-1 text-sm font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {/* Monday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Monday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.monday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'monday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.monday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'monday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.monday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'monday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.monday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.monday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'monday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.monday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Tuesday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Tuesday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.tuesday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'tuesday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.tuesday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'tuesday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.tuesday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'tuesday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.tuesday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.tuesday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'tuesday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.tuesday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Wednesday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Wednesday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.wednesday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'wednesday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.wednesday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'wednesday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.wednesday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'wednesday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.wednesday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.wednesday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'wednesday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.wednesday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Thursday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Thursday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.thursday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'thursday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.thursday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'thursday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.thursday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'thursday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.thursday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.thursday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'thursday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.thursday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Friday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Friday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.friday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'friday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.friday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'friday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.friday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'friday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.friday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.friday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'friday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.friday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Saturday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Saturday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.saturday?.isHoliday) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'saturday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.saturday?.isHalfDay) !== false}
                              onChange={(e) => handleScheduleEntryChange(index, 'saturday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.saturday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'saturday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.saturday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.saturday?.outTime || '13:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'saturday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.saturday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Sunday */}
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-800">Sunday</label>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.sunday?.isHoliday) !== false}
                              onChange={(e) => handleScheduleEntryChange(index, 'sunday', 'isHoliday', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Holiday
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={(entry.daily?.sunday?.isHalfDay) || false}
                              onChange={(e) => handleScheduleEntryChange(index, 'sunday', 'isHalfDay', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Half Day
                          </label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500">In Time</label>
                          <input
                            type="time"
                            value={entry.daily?.sunday?.inTime || '10:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'sunday', 'inTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.sunday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.sunday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'sunday', 'outTime', e.target.value)}
                            className="w-full rounded border border-blue-200/65 bg-panel px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/25"
                            disabled={entry.daily?.sunday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="pt-6 mt-6 border-t border-slate-200">
                <div className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Seasonal schedule overrides</h3>
                    <p className="text-xs text-slate-500">Recurring rules that apply for specific months (e.g. Dec-Jan winter timings)</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSeasonalSchedule}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    Add seasonal override
                  </button>
                </div>

                <div className="space-y-6 mt-4">
                  {(formData.seasonalSchedules || []).map((entry, index) => (
                    <div key={index} className="rounded-lg border border-emerald-200/65 bg-emerald-50/30 p-4 shadow-sm">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-slate-700">From Month</label>
                            <select
                              value={entry.startMonth}
                              onChange={(e) => handleSeasonalScheduleFieldChange(index, 'startMonth', parseInt(e.target.value))}
                              className="rounded border border-slate-300 bg-panel px-2 py-1 text-sm text-slate-900 shadow-sm"
                            >
                              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                                <option key={i} value={i}>{m}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-slate-700">To Month</label>
                            <select
                              value={entry.endMonth}
                              onChange={(e) => handleSeasonalScheduleFieldChange(index, 'endMonth', parseInt(e.target.value))}
                              className="rounded border border-slate-300 bg-panel px-2 py-1 text-sm text-slate-900 shadow-sm"
                            >
                              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                                <option key={i} value={i}>{m}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-slate-700 text-xs">Version Effective</label>
                            <input
                              type="date"
                              value={toDateInputValue(entry.effectiveFrom)}
                              onChange={(e) => handleSeasonalScheduleFieldChange(index, 'effectiveFrom', e.target.value)}
                              className="min-h-9 rounded border border-slate-300 bg-panel px-2 py-1 text-xs text-slate-900 [color-scheme:light]"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSeasonalSchedule(index)}
                          className="rounded-md bg-rose-600 px-2 py-1 text-sm font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                          <div key={day} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-semibold capitalize text-slate-800">{day}</label>
                              <div className="flex gap-2">
                                <label className="flex items-center gap-1 text-[10px]">
                                  <input
                                    type="checkbox"
                                    checked={entry.daily?.[day]?.isHoliday || false}
                                    onChange={(e) => handleSeasonalScheduleTimeChange(index, day, 'isHoliday', e.target.checked)}
                                    className="w-3 h-3"
                                  />
                                  Holiday
                                </label>
                                <label className="flex items-center gap-1 text-[10px]">
                                  <input
                                    type="checkbox"
                                    checked={entry.daily?.[day]?.isHalfDay || false}
                                    onChange={(e) => handleSeasonalScheduleTimeChange(index, day, 'isHalfDay', e.target.checked)}
                                    className="w-3 h-3"
                                  />
                                  Half
                                </label>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] text-slate-500">In Time</label>
                                <input
                                  type="time"
                                  value={entry.daily?.[day]?.inTime || ''}
                                  onChange={(e) => handleSeasonalScheduleTimeChange(index, day, 'inTime', e.target.value)}
                                  className="w-full rounded border border-slate-200 bg-panel px-2 py-1 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none"
                                  disabled={entry.daily?.[day]?.isHoliday}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500">Out Time</label>
                                <input
                                  type="time"
                                  value={entry.daily?.[day]?.outTime || ''}
                                  onChange={(e) => handleSeasonalScheduleTimeChange(index, day, 'outTime', e.target.value)}
                                  className="w-full rounded border border-slate-200 bg-panel px-2 py-1 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none"
                                  disabled={entry.daily?.[day]?.isHoliday}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(formData.seasonalSchedules || []).length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 bg-slate-50/50">
                      No seasonal overrides defined for this employee.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Extended Tab */}
          {activeTab === 'extended' && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium border-b border-slate-200 text-slate-900 pb-2 mb-4">Extended Details (Optional)</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Identity & Contact */}
                {[
                  { label: 'Registration No.', key: 'registrationNo' },
                  { label: 'Employee Code', key: 'employeeCode' },
                  { label: 'Paid From', key: 'paidFrom' },
                  { label: 'Tally Name', key: 'tallyName' },
                  { label: 'Category', key: 'category' },
                  { label: 'Gender', key: 'gender' },
                  { label: 'Mobile No.', key: 'mobileNumber' },
                  { label: 'Alt Mobile', key: 'alternateMobileNumber' },
                  { label: 'Alt Email', key: 'alternateEmail' },
                  { label: 'Attendance Email', key: 'attendanceEmail' },
                  { label: 'Parent Name', key: 'parentName' },
                  { label: 'Parent Occ.', key: 'parentOccupation' },
                ].map((field) => {
                  // Special handling for dropdown fields
                  if (field.key === 'paidFrom') {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">Select {field.label.toLowerCase()}</option>
                          {predefinedValues.paidFrom.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    );
                  } else if (field.key === 'category') {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">Select {field.label.toLowerCase()}</option>
                          {predefinedValues.categories.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    );
                  } else {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                        <input
                          type="text"
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                    );
                  }
                })}

                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 1</label>
                        <input
                          type="text"
                          value={formData.address1 || ''}
                          onChange={(e) => handleInputChange('address1', e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 2</label>
                        <input
                          type="text"
                          value={formData.address2 || ''}
                          onChange={(e) => handleInputChange('address2', e.target.value)}
                          className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                </div>

                {/* Emergency Contact & Banking */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Emergency Contact No.</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactNo || ''}
                      onChange={(e) => handleInputChange('emergencyContactNo' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Relation</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactRelation || ''}
                      onChange={(e) => handleInputChange('emergencyContactRelation' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Anniversary Date</label>
                    <input
                      type="date"
                      value={toDateInputValue((formData as any).anniversaryDate)}
                      onChange={(e) => handleInputChange('anniversaryDate' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={(formData as any).bankName || ''}
                      onChange={(e) => handleInputChange('bankName' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={(formData as any).branchName || ''}
                      onChange={(e) => handleInputChange('branchName' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Account No.</label>
                    <input
                      type="text"
                      value={(formData as any).accountNumber || ''}
                      onChange={(e) => handleInputChange('accountNumber' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">IFSC</label>
                    <input
                      type="text"
                      value={(formData as any).ifscCode || ''}
                      onChange={(e) => handleInputChange('ifscCode' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Type of Account</label>
                    <input
                      type="text"
                      value={(formData as any).accountType || ''}
                      onChange={(e) => handleInputChange('accountType' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Name of Account Holder</label>
                    <input
                      type="text"
                      value={(formData as any).accountHolderName || ''}
                      onChange={(e) => handleInputChange('accountHolderName' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Aadhar No.</label>
                    <input
                      type="text"
                      value={(formData as any).aadhaarNumber || ''}
                      onChange={(e) => handleInputChange('aadhaarNumber' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">PAN</label>
                    <input
                      type="text"
                      value={(formData as any).panNumber || ''}
                      onChange={(e) => handleInputChange('panNumber' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                {/* Salary Information */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderSalaryFieldWithHistory('basicSalary', 'Basis Salary/Stipend/Fees', 'extended')}
                  {renderSalaryFieldWithHistory('laptopAllowance', 'Laptop Allowance', 'extended')}
                  {renderSalaryFieldWithHistory('totalSalaryPerMonth', 'Total Salary (P/M)', 'extended')}
                  {renderSalaryFieldWithHistory('totalSalaryPerAnnum', 'Per Annum', 'extended')}
                </div>

                {/* Articleship & Professional */}
                {renderFieldWithHistory({
                  field: 'registeredUnderPartner',
                  label: 'Reg. Partner',
                  historyLabel: 'Registered partner history',
                  emptyHistoryMessage:
                    'No saved history yet. After you change registered partner and save, previous values appear here with start and end dates.',
                  addButtonLabel: 'Add new registered partner',
                  revisionHint: 'New registered partner (applies to the form; save employee to persist)',
                  revisionPlaceholder: 'Partner name',
                  theme: 'extended',
                  inputType: 'text',
                })}

                {[
                  { label: 'Transfer Case', key: 'transferCase' },
                  { label: '1st Year Art.', key: 'firstYearArticleship' },
                  { label: '2nd Year Art.', key: 'secondYearArticleship' },
                  { label: '3rd Year Art.', key: 'thirdYearArticleship' },
                  { label: 'Filled Scholarship', key: 'filledScholarship' },
                  { label: 'Qualification', key: 'qualificationLevel' },
                  { label: 'Work Timing (Text)', key: 'workingTiming' },
                ].map((field) => (
                  <div key={field.key}>
                     <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                    <input
                      type="text"
                      value={(formData as any)[field.key] || ''}
                      onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                ))}

                {/* Dates */}
                 <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Articleship Start</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.articleshipStartDate)}
                    onChange={(e) => handleInputChange('articleshipStartDate', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                 <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Next Attempt Due</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.nextAttemptDueDate)}
                    onChange={(e) => handleInputChange('nextAttemptDueDate', e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => setIsAddingNew(false)}
            className="rounded-md px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreateNew}
            disabled={saveLoading || denyEdits || !formData.name || !formData.email || !formData.odId || !formData.joiningDate}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {saveLoading ? 'Creating…' : 'Create employee'}
          </button>
        </div>
      </section>
      {scheduleTemplateModalEl}
    </>
    );
  }

  // ============== LIST VIEW =================
  const employeeListWorkflowSteps = ['Filter or search', 'Open a person', 'Save or export'] as const;

  return (
    <section
      className="w-full space-y-5 text-slate-900"
      aria-labelledby="employee-management-heading"
    >
      {/* Header: hierarchy, plain language, numbered workflow (orientation before action) */}
      <div className="rounded-md border border-blue-200/65 bg-panel px-4 py-5 shadow-sm sm:px-6">
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start lg:gap-6">
            <header className="min-w-0 flex-1 space-y-2">
              <h1
                id="employee-management-heading"
                className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white">
                  <Users className="h-5 w-5" aria-hidden />
                </span>
                Employee management
              </h1>
              <p className="max-w-2xl text-sm text-slate-600">
                Search and filter the roster, open someone to edit tabs (basic, schedule, salary), or move data with Excel.
              </p>
              <ol className="flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Suggested workflow">
                {employeeListWorkflowSteps.map((t, i) => (
                  <li
                    key={t}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    {t}
                  </li>
                ))}
              </ol>
              {!showInactiveEmployees && inactiveUserCount > 0 && (
                <p className="text-xs text-amber-800">
                  Inactive employees are hidden. Turn on &quot;Show inactive&quot; in the toolbar to view inactive
                  employees only.
                </p>
              )}
              {showInactiveEmployees && (
                <p className="text-xs text-slate-600">
                  Showing inactive employees only. Uncheck &quot;Show inactive&quot; to return to the active list.
                </p>
              )}
            </header>

            {/* Quick stats — calm contrast on white */}
            {loading ? (
              <div className="flex animate-pulse items-center gap-3" aria-hidden>
                <div className="flex w-[9.5rem] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-slate-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-6 w-10 rounded bg-slate-200" />
                    <div className="h-2.5 w-24 rounded bg-slate-100" />
                  </div>
                </div>
                <div className="flex w-[9.5rem] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-slate-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-6 w-10 rounded bg-slate-200" />
                    <div className="h-2.5 w-28 rounded bg-slate-100" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                    <Users className="h-4 w-4 text-blue-700" aria-hidden />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">{users.length}</p>
                    <p className="text-xs text-slate-600">Total employees</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200/80">
                    <Briefcase className="h-4 w-4 text-slate-700" aria-hidden />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">{uniqueDesignations.length}</p>
                    <p className="text-xs text-slate-600">Designations</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Search and actions — familiar controls, visible focus, responsive stack */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
              <div className="relative max-w-md flex-1">
                <label htmlFor="employee-list-search" className="sr-only">
                  Search employees by name, email, or code
                </label>
                <input
                  id="employee-list-search"
                  type="search"
                  placeholder="Search by name, email, code…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-blue-200/65 bg-panel py-2.5 pl-10 pr-10 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                />
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="relative min-w-[10rem] flex-1 sm:max-w-[11rem]">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-blue-200/65 bg-panel px-3 py-2.5 text-left text-sm text-slate-800 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  onClick={() => setShowDesignationDropdown((v) => !v)}
                  aria-expanded={showDesignationDropdown}
                  aria-haspopup="listbox"
                >
                  <span>{filterDesignations.length > 0 ? `${filterDesignations.length} designations` : 'Designations'}</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                </button>
                {showDesignationDropdown && (
                  <div
                    className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-blue-200/65 bg-panel py-1 shadow-lg"
                    role="listbox"
                    aria-label="Filter by designation"
                  >
                    <div className="p-2">
                      <label className="mb-1 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={filterDesignations.length === 0}
                          onChange={() => setFilterDesignations([])}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                        />
                        All designations
                      </label>
                      {uniqueDesignations.map((opt) => (
                        <label key={opt} className="mb-1 flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            checked={filterDesignations.includes(opt)}
                            onChange={() => {
                              setFilterDesignations((prev) =>
                                prev.includes(opt) ? prev.filter((d) => d !== opt) : [...prev, opt]
                              );
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative min-w-[10rem] flex-1 sm:max-w-[11rem]">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-blue-200/65 bg-panel px-3 py-2.5 text-left text-sm text-slate-800 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  onClick={() => setShowTeamDropdown((v) => !v)}
                  aria-expanded={showTeamDropdown}
                  aria-haspopup="listbox"
                >
                  <span>{filterTeams.length > 0 ? `${filterTeams.length} teams` : 'Teams'}</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                </button>
                {showTeamDropdown && (
                  <div
                    className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-blue-200/65 bg-panel py-1 shadow-lg"
                    role="listbox"
                    aria-label="Filter by team"
                  >
                    <div className="p-2">
                      <label className="mb-1 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={filterTeams.length === 0}
                          onChange={() => setFilterTeams([])}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                        />
                        All teams
                      </label>
                      {uniqueTeams.map((opt) => (
                        <label key={opt} className="mb-1 flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            checked={filterTeams.includes(opt)}
                            onChange={() => {
                              setFilterTeams((prev) =>
                                prev.includes(opt) ? prev.filter((t) => t !== opt) : [...prev, opt]
                              );
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative min-w-[10rem] flex-1 sm:max-w-[11rem]">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-blue-200/65 bg-panel px-3 py-2.5 text-left text-sm text-slate-800 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  onClick={() => setShowUserDropdown((v) => !v)}
                  aria-expanded={showUserDropdown}
                  aria-haspopup="listbox"
                >
                  <span>{filterUsers.length > 0 ? `${filterUsers.length} names` : 'Names'}</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                </button>
                {showUserDropdown && (
                  <div
                    className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-blue-200/65 bg-panel py-1 shadow-lg"
                    role="listbox"
                    aria-label="Filter by employee name"
                  >
                    <div className="p-2">
                      <label className="mb-1 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={filterUsers.length === 0}
                          onChange={() => setFilterUsers([])}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                        />
                        All names
                      </label>
                      {uniqueUserNames.map((opt) => (
                        <label key={opt} className="mb-1 flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            checked={filterUsers.includes(opt)}
                            onChange={() => {
                              setFilterUsers((prev) =>
                                prev.includes(opt) ? prev.filter((u) => u !== opt) : [...prev, opt]
                              );
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFormData({ isActive: true, inactiveAsOf: undefined });
                  setIsAddingNew(true);
                }}
                disabled={!employeesCanEdit || tabAccess.basic !== 'edit'}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add employee
              </button>

              <label className="inline-flex h-10 min-w-0 shrink-0 cursor-pointer select-none items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={showInactiveEmployees}
                  onChange={(e) => setShowInactiveEmployees(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                />
                <span>
                  Show inactive
                  {inactiveUserCount > 0 ? ` (${inactiveUserCount})` : ''}
                </span>
              </label>

              <div className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" aria-hidden />

              <button
                type="button"
                onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                disabled={!employeesCanEdit}
                className={`rounded-lg border p-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                  showSettingsPanel
                    ? 'border-blue-200 bg-blue-50 text-blue-900'
                    : 'border-blue-200/65 bg-panel text-slate-600 hover:bg-slate-50'
                }`}
                aria-pressed={showSettingsPanel}
                aria-label="Settings: custom fields, predefined values, Excel format"
              >
                <Settings className="h-4 w-4" aria-hidden />
              </button>

              <button
                type="button"
                onClick={handleExportToExcel}
                className="rounded-lg border border-blue-200/65 bg-panel p-2.5 text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                aria-label="Export roster to Excel"
              >
                <Download className="h-4 w-4" aria-hidden />
              </button>

              <label
                className={`rounded-lg border p-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-blue-500/30 ${
                  isUploading
                    ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                    : 'cursor-pointer border-blue-200/65 bg-panel text-slate-600 hover:bg-blue-50/80 hover:text-blue-800'
                }`}
                title={isUploading ? 'Uploading…' : 'Bulk upload from Excel'}
              >
                <span className="sr-only">Bulk upload Excel file</span>
                <Upload className="h-4 w-4" aria-hidden />
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleBulkUpload}
                  className="hidden"
                  disabled={isUploading || !employeesCanEdit}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Active filters — explicit feedback, easy reset */}
      {(searchTerm || filterDesignations.length > 0 || filterTeams.length > 0 || filterUsers.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-xs font-medium text-slate-600">Active filters</span>
          {searchTerm && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-900">
              Search: &quot;{searchTerm}&quot;
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="rounded p-0.5 text-blue-800 hover:bg-blue-100"
                aria-label="Remove search filter"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filterDesignations.map((designation) => (
            <span
              key={designation}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200/65 bg-panel px-2.5 py-1 text-xs text-slate-800"
            >
              {designation}
              <button
                type="button"
                onClick={() => setFilterDesignations(filterDesignations.filter((d) => d !== designation))}
                className="rounded p-0.5 text-slate-600 hover:bg-slate-100"
                aria-label={`Remove designation ${designation}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {filterTeams.map((team) => (
            <span
              key={team}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200/65 bg-panel px-2.5 py-1 text-xs text-slate-800"
            >
              {team}
              <button
                type="button"
                onClick={() => setFilterTeams(filterTeams.filter((t) => t !== team))}
                className="rounded p-0.5 text-slate-600 hover:bg-slate-100"
                aria-label={`Remove team ${team}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {filterUsers.map((user) => (
            <span
              key={user}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200/65 bg-panel px-2.5 py-1 text-xs text-slate-800"
            >
              {user}
              <button
                type="button"
                onClick={() => setFilterUsers(filterUsers.filter((u) => u !== user))}
                className="rounded p-0.5 text-slate-600 hover:bg-slate-100"
                aria-label={`Remove name filter ${user}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setFilterDesignations([]);
              setFilterTeams([]);
              setFilterUsers([]);
            }}
            className="ml-auto text-xs font-medium text-blue-700 hover:text-blue-900 focus:outline-none focus:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Settings — same light system as the rest of the console */}
      {showSettingsPanel && (
        <div className="overflow-hidden rounded-md border border-blue-200/65 bg-panel shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-slate-600" aria-hidden />
              <h2 className="text-sm font-semibold text-slate-900">Settings and configuration</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowSettingsPanel(false)}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200/80 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              aria-label="Close settings panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="divide-y divide-slate-200">
            <div>
              <button
                type="button"
                onClick={() => setShowAdditionalFields(!showAdditionalFields)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5"
                aria-expanded={showAdditionalFields}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                    <Tag className="h-4 w-4 text-slate-600" aria-hidden />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">Custom fields</div>
                    <div className="text-xs text-slate-600">
                      {allExtraLabels.length} additional field{allExtraLabels.length === 1 ? '' : 's'} on the roster
                    </div>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${showAdditionalFields ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>

              {showAdditionalFields && (
                <div className="flex flex-col gap-4 border-t border-slate-100 px-4 pb-4 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0 flex-1">
                    {allExtraLabels.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {allExtraLabels.map((label) => (
                          <span
                            key={label}
                            className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800"
                          >
                            <span>{label}</span>
                            <button
                              type="button"
                              className="rounded p-0.5 text-slate-500 opacity-100 transition-opacity hover:bg-rose-50 hover:text-rose-700 sm:opacity-0 sm:group-hover:opacity-100"
                              aria-label={`Remove custom field ${label}`}
                              onClick={async () => {
                                if (
                                  !confirmMajorAction(`Remove extra field "${label}" from all employees`, [
                                    'This column will be deleted from every employee profile.',
                                  ])
                                ) {
                                  return;
                                }
                                try {
                                  const res = await fetch('/api/users/extra-info', hrCredentialsInit({
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ label }),
                                  }));
                                  const json = await res.json();
                                  if (!res.ok || !json.success) {
                                    throw new Error(json.error || 'Failed to remove field');
                                  }
                                  fetchUsers({ soft: true });
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : 'Failed to remove field');
                                }
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600">No custom fields yet. Add a label below to use it on profiles.</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="new-extra-label" className="sr-only">
                      New custom field name
                    </label>
                    <input
                      id="new-extra-label"
                      type="text"
                      placeholder="New field name…"
                      value={newExtraLabel}
                      onChange={(e) => setNewExtraLabel(e.target.value)}
                      className="min-w-[10rem] flex-1 rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25 sm:max-w-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddGlobalExtraLabel}
                      disabled={isSavingExtraLabel || !newExtraLabel.trim()}
                      className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      {isSavingExtraLabel ? 'Adding…' : 'Add field'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowPredefinedValues(!showPredefinedValues)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5"
                aria-expanded={showPredefinedValues}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                    <Settings className="h-4 w-4 text-slate-600" aria-hidden />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">Predefined values</div>
                    <div className="text-xs text-slate-600">
                      Dropdown options for team, designation, paid from, and category
                    </div>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${showPredefinedValues ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>

              {showPredefinedValues && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => setPredefinedModal({ type: 'team', isOpen: true })}
                      className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                          <Users className="h-5 w-5 text-blue-700" aria-hidden />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">Teams</div>
                          <div className="text-xs text-slate-600">{predefinedValues.teams.length} values</div>
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-slate-400 group-hover:text-slate-600" aria-hidden />
                    </button>

                    <button
                      type="button"
                      onClick={() => setPredefinedModal({ type: 'designation', isOpen: true })}
                      className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200/80">
                          <Briefcase className="h-5 w-5 text-slate-700" aria-hidden />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">Designations</div>
                          <div className="text-xs text-slate-600">{predefinedValues.designations.length} values</div>
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-slate-400 group-hover:text-slate-600" aria-hidden />
                    </button>

                    <button
                      type="button"
                      onClick={() => setPredefinedModal({ type: 'paidFrom', isOpen: true })}
                      className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                          <CreditCard className="h-5 w-5 text-emerald-800" aria-hidden />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">Paid from</div>
                          <div className="text-xs text-slate-600">{predefinedValues.paidFrom.length} values</div>
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-slate-400 group-hover:text-slate-600" aria-hidden />
                    </button>

                    <button
                      type="button"
                      onClick={() => setPredefinedModal({ type: 'category', isOpen: true })}
                      className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                          <Tag className="h-5 w-5 text-amber-900" aria-hidden />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">Categories</div>
                          <div className="text-xs text-slate-600">{predefinedValues.categories.length} values</div>
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-slate-400 group-hover:text-slate-600" aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowBulkUploadFormat(!showBulkUploadFormat)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5"
                aria-expanded={showBulkUploadFormat}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                    <FileSpreadsheet className="h-4 w-4 text-slate-600" aria-hidden />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">Excel upload format</div>
                    <div className="text-xs text-slate-600">Expected column headers for bulk import</div>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${showBulkUploadFormat ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>

              {showBulkUploadFormat && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5">
                  <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-slate-900">Expected column headers</h4>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {[
                        'Name',
                        'Registration / Membership No.',
                        'Employee Code',
                        'Paid From',
                        'Designation',
                        'Category',
                        'Tally Name',
                        'Gender',
                        'Asija Mail ID',
                        'Attendance Approver',
                        'Parents/Guardians Names',
                        'Parents/Guardians Occupation',
                        'Cell No.',
                        'Alternate No.',
                        'Alternate Mail Id',
                        'Address 1',
                        'Address 2',
                        'Emergency Contact No.',
                        'Relation',
                        'Anniversary Date',
                        'Bank Name',
                        'Branch Name',
                        'Account No.',
                        'IFSC',
                        'Type of Account',
                        'Name of Account Holder',
                        'Aadhar No.',
                        'PAN',
                        'Basis Salary/Stipend/Fees',
                        'Laptop Allowance',
                        'Total Salary (P/M)',
                        'Per Annum',
                        'Date of Joining -in Asija',
                        'Articleship Start Date',
                        'Transfer Case',
                        '1st Yr of Articleship',
                        '2nd Yr of Articleship',
                        '3rd Yr of Articleship',
                        'Filled Scholarship',
                        'Qualification Level',
                        'Next Attempt Due Date',
                        'Registered Under Partner',
                        'Working Under Partner',
                        'Work Timings',
                      ].map((column, index) => (
                        <div
                          key={index}
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            column === 'Name'
                              ? 'border-emerald-200 bg-emerald-50 font-medium text-emerald-900'
                              : 'border-blue-200/65 bg-panel text-slate-700'
                          }`}
                        >
                          {column}
                          {column === 'Name' && <span className="ml-1 text-emerald-700">*</span>}
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-slate-600">
                      <span className="font-medium text-emerald-800">*</span> Required column. All others are optional.
                    </p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
                    <p className="text-sm text-slate-800">
                      <strong className="text-blue-900">Tip:</strong> Export the roster first, edit the spreadsheet, then
                      upload so column names stay aligned.
                    </p>
                  </div>

                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <h4 className="mb-3 text-sm font-semibold text-slate-900">Leave balance upload</h4>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="mb-3 text-xs text-slate-600">Required columns in the Excel file:</p>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                          Name <span className="text-emerald-800">*</span>
                        </span>
                        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                          Leaves Allowed <span className="text-emerald-800">*</span>
                        </span>
                        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                          Total Leaves Taken (Current+Previous Years) <span className="text-emerald-800">*</span>
                        </span>
                      </div>
                      <label
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                          isUploading
                            ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                            : 'bg-amber-600 text-white hover:bg-amber-700 focus-within:ring-2 focus-within:ring-amber-500/40'
                        }`}
                      >
                        <Upload className="h-4 w-4" aria-hidden />
                        {isUploading ? 'Uploading…' : 'Upload leave balance Excel'}
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleLeaveBalanceUpload}
                          className="hidden"
                          disabled={isUploading}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error / success — high contrast, semantic roles */}
      {error && (
        <div
          className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-900"
          role="alert"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
            <X className="h-4 w-4 text-red-700" aria-hidden />
          </div>
          <span className="text-sm leading-relaxed">{error}</span>
        </div>
      )}

      {uploadStats && (
        <div className="space-y-2">
          <div
            className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950"
            role="status"
            aria-live="polite"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
              <Upload className="h-4 w-4 text-emerald-800" aria-hidden />
            </div>
            <div className="text-sm">
              <strong>Upload complete:</strong> {uploadStats.updated} updated, {uploadStats.created} created
              {uploadStats.failed > 0 && <span className="ml-2 font-medium text-red-800">, {uploadStats.failed} failed</span>}
              {uploadStats.message && <div className="mt-1 text-xs text-emerald-900/90">{uploadStats.message}</div>}
            </div>
          </div>
          {uploadStats.errors && uploadStats.errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-red-200 bg-red-50/80 p-4">
              <p className="mb-2 text-xs font-semibold text-red-900">Error details</p>
              <ul className="space-y-1 text-xs text-red-800">
                {uploadStats.errors.map((err: unknown, idx: React.Key | null | undefined) => (
                  <li key={idx}>{String(err)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Employee table */}
      <div className="overflow-hidden rounded-md border border-blue-200/65 bg-panel shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-800" id="employee-table-summary">
            {showInactiveEmployees
              ? `${filteredUsers.length} inactive employee${filteredUsers.length === 1 ? '' : 's'}`
              : filteredUsers.length === users.length
                ? `${users.length} employees`
                : `Showing ${filteredUsers.length} of ${users.length} employees`}
          </p>
        </div>

        {loading ? (
          <EmployeeManagementTableSkeleton />
        ) : filteredUsers.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
              <Users className="h-8 w-8 text-slate-500" aria-hidden />
            </div>
            <p className="text-sm text-slate-600">
              {users.length === 0
                ? 'No employees yet. Add someone or bulk-upload from Excel to get started.'
                : showInactiveEmployees
                  ? 'No inactive employees. Uncheck "Show inactive" to view active employees.'
                  : 'No rows match your filters. Try clearing search or filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-describedby="employee-table-summary">
              <caption className="sr-only">Employee roster with edit and deactivate actions</caption>
              <thead className="border-b border-slate-200 bg-slate-100 text-xs font-medium uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    Employee
                  </th>
                  <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
                    Email
                  </th>
                  <th scope="col" className="hidden px-4 py-3.5 lg:table-cell">
                    Team
                  </th>
                  <th scope="col" className="hidden px-4 py-3.5 sm:table-cell">
                    Designation
                  </th>
                  <th scope="col" className="hidden px-4 py-3.5 xl:table-cell">
                    Joined
                  </th>
                  <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredUsers.map((user, index) => {
                  const inactive = isUserMarkedInactive(user);
                  const inactiveSince = formatInactiveSinceDate(user.inactiveAsOf);
                  return (
                  <tr
                    key={user._id}
                    className={`transition-colors hover:bg-sky-100/50 ${index % 2 === 0 ? 'bg-panel/90' : 'bg-sky-100/35'}`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50">
                          <span className="text-sm font-semibold text-blue-800">
                            {user.name?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{user.name}</p>
                          <p className="font-mono text-xs text-slate-600">{user.odId || user.employeeCode || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3.5 md:table-cell">
                      <span className="text-slate-700">{user.email || '—'}</span>
                    </td>
                    <td className="hidden px-4 py-3.5 lg:table-cell">
                      <span className="text-slate-700">{user.workingUnderPartner || user.team || '—'}</span>
                    </td>
                    <td className="hidden px-4 py-3.5 sm:table-cell">
                      {user.designation ? (
                        <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-800">
                          {user.designation}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3.5 xl:table-cell">
                      <span className="text-slate-700">
                        {user.joiningDate
                          ? new Date(user.joiningDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3.5 md:table-cell">
                      {inactive ? (
                        <div>
                          <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950">
                            Inactive
                          </span>
                          {inactiveSince ? (
                            <p className="mt-1 text-xs text-slate-600">Since {inactiveSince}</p>
                          ) : (
                            <p className="mt-1 text-xs text-slate-500">Since date not set</p>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditClick(user)}
                          disabled={employeesSectionAccess === 'none'}
                          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Edit ${user.name ?? 'employee'}`}
                        >
                          <Edit2 className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user)}
                          disabled={!employeesCanEdit || tabAccess.basic !== 'edit'}
                          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Deactivate ${user.name ?? 'employee'}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {scheduleTemplateModalEl}

      {/* Predefined values modal — dialog pattern, focus-friendly */}
      {predefinedModal.isOpen && predefinedModal.type && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPredefinedModal({ type: null, isOpen: false });
          }}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="predefined-modal-title"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    predefinedModal.type === 'team'
                      ? 'bg-blue-100'
                      : predefinedModal.type === 'designation'
                        ? 'bg-slate-200'
                        : predefinedModal.type === 'paidFrom'
                          ? 'bg-emerald-100'
                          : 'bg-amber-100'
                  }`}
                >
                  {predefinedModal.type === 'team' && <Users className="h-5 w-5 text-blue-800" aria-hidden />}
                  {predefinedModal.type === 'designation' && <Briefcase className="h-5 w-5 text-slate-800" aria-hidden />}
                  {predefinedModal.type === 'paidFrom' && <CreditCard className="h-5 w-5 text-emerald-800" aria-hidden />}
                  {predefinedModal.type === 'category' && <Tag className="h-5 w-5 text-amber-900" aria-hidden />}
                </div>
                <div>
                  <h3 id="predefined-modal-title" className="text-lg font-semibold text-slate-900">
                    {predefinedModal.type === 'team'
                      ? 'Teams'
                      : predefinedModal.type === 'designation'
                        ? 'Designations'
                        : predefinedModal.type === 'paidFrom'
                          ? 'Paid from'
                          : 'Categories'}
                  </h3>
                  <p className="text-xs text-slate-600">Values appear in employee dropdowns</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPredefinedModal({ type: null, isOpen: false })}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200/80 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-5">
              <div className="space-y-2">
                {(() => {
                  const values =
                    predefinedModal.type === 'team'
                      ? predefinedValues.teams
                      : predefinedModal.type === 'designation'
                        ? predefinedValues.designations
                        : predefinedModal.type === 'paidFrom'
                          ? predefinedValues.paidFrom
                          : predefinedValues.categories;

                  return values.length > 0 ? (
                    values.map((value) => (
                      <div
                        key={value}
                        className="group flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 p-3 transition-colors hover:bg-slate-50"
                      >
                        <span className="text-sm text-slate-900">{value}</span>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-rose-50 hover:text-rose-700 sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label={`Remove ${value}`}
                          onClick={() =>
                            handleRemovePredefinedValue(
                              predefinedModal.type === 'team'
                                ? 'teams'
                                : predefinedModal.type === 'designation'
                                  ? 'designations'
                                  : predefinedModal.type === 'paidFrom'
                                    ? 'paidFrom'
                                    : 'categories',
                              value
                            )
                          }
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                        {predefinedModal.type === 'team' && <Users className="h-6 w-6 text-slate-500" aria-hidden />}
                        {predefinedModal.type === 'designation' && <Briefcase className="h-6 w-6 text-slate-500" aria-hidden />}
                        {predefinedModal.type === 'paidFrom' && <CreditCard className="h-6 w-6 text-slate-500" aria-hidden />}
                        {predefinedModal.type === 'category' && <Tag className="h-6 w-6 text-slate-500" aria-hidden />}
                      </div>
                      <p className="text-sm text-slate-600">
                        No{' '}
                        {predefinedModal.type === 'team'
                          ? 'teams'
                          : predefinedModal.type === 'designation'
                            ? 'designations'
                            : predefinedModal.type === 'paidFrom'
                              ? 'paid from values'
                              : 'categories'}{' '}
                        yet
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Add one below</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-50/80 p-5">
              <div className="flex gap-2">
                <input
                  type="text"
                  ref={predefinedValueInputRef}
                  placeholder={`Add ${predefinedModal.type === 'team' ? 'team' : predefinedModal.type === 'designation' ? 'designation' : predefinedModal.type === 'paidFrom' ? 'paid from' : 'category'}…`}
                  className="flex-1 rounded-lg border border-blue-200/65 bg-panel px-4 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && predefinedModal.type) {
                      const value = predefinedValueInputRef.current?.value || '';
                      handleAddPredefinedValue(predefinedModal.type, value);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!predefinedModal.type) return;
                    const value = predefinedValueInputRef.current?.value || '';
                    handleAddPredefinedValue(predefinedModal.type, value);
                  }}
                  disabled={isSavingPredefinedValue}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {isSavingPredefinedValue ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
