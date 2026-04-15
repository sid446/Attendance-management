import React, { useState, useEffect, ChangeEvent, useMemo, useCallback, useRef } from 'react';
import { Edit2, Save, X, Plus, Upload, FileUp, Filter, Trash2, Search, Download, ChevronDown, ChevronUp, FileSpreadsheet, Settings, Users, Briefcase, CreditCard, Tag } from 'lucide-react';
import * as XLSX from 'xlsx';
import { User as UserBase, ScheduleTime, DailySchedule } from '@/types/ui';

// Extend User type to include articleCreditsAsOnJan26 for local use
type User = UserBase & {
  articleCreditsAsOnJan26?: number;
};

type ManagedFieldKey =
  | 'registeredUnderPartner'
  | 'workingUnderPartner'
  | 'basicSalary'
  | 'laptopAllowance'
  | 'totalSalaryPerMonth'
  | 'totalSalaryPerAnnum';

const getDefaultManagedEffectiveDates = (): Record<ManagedFieldKey, string> => {
  return {
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
  return d.toLocaleDateString();
}

const USERS_LIST_ENDPOINT = '/api/users?listOnly=1&includeInactive=1';

function EmployeeManagementTableSkeleton() {
  const rowCount = 8;
  return (
    <div className="overflow-x-auto" aria-busy="true" aria-label="Loading employees">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-800/50 text-slate-400 font-medium text-xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-3.5">Employee</th>
            <th className="px-4 py-3.5 hidden md:table-cell">Email</th>
            <th className="px-4 py-3.5 hidden lg:table-cell">Team</th>
            <th className="px-4 py-3.5 hidden sm:table-cell">Designation</th>
            <th className="px-4 py-3.5 hidden xl:table-cell">Joined</th>
            <th className="px-4 py-3.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50 animate-pulse">
          {Array.from({ length: rowCount }, (_, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-slate-900/20' : ''}>
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-700/60 shrink-0" />
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="h-3.5 bg-slate-700/60 rounded w-36 max-w-full" />
                    <div className="h-2.5 bg-slate-800 rounded w-24 max-w-full" />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3.5 hidden md:table-cell">
                <div className="h-3 bg-slate-700/50 rounded w-40" />
              </td>
              <td className="px-4 py-3.5 hidden lg:table-cell">
                <div className="h-3 bg-slate-700/50 rounded w-28" />
              </td>
              <td className="px-4 py-3.5 hidden sm:table-cell">
                <div className="h-3 bg-slate-700/50 rounded w-24" />
              </td>
              <td className="px-4 py-3.5 hidden xl:table-cell">
                <div className="h-3 bg-slate-700/50 rounded w-20" />
              </td>
              <td className="px-4 py-3.5 text-right">
                <div className="h-8 bg-slate-700/50 rounded-lg w-20 ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { Workbook, Worksheet, Row, Cell } from 'exceljs';

export const EmployeeManagementSection: React.FC<{ selectedUserId?: string | null; onRefreshUsers?: () => void }> = ({ selectedUserId, onRefreshUsers }) => {
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
  const [newPredefinedValue, setNewPredefinedValue] = useState<{
    type: 'team' | 'designation' | 'paidFrom' | 'category';
    value: string;
  }>({ type: 'team', value: '' });
  const [isSavingPredefinedValue, setIsSavingPredefinedValue] = useState<boolean>(false);

  // History State
  const [employeeHistory, setEmployeeHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [changeReason, setChangeReason] = useState<string>('');
  const [managedFieldsEffectiveFromByField, setManagedFieldsEffectiveFromByField] = useState<Record<ManagedFieldKey, string>>(getDefaultManagedEffectiveDates());
  const [salaryRevisionPanel, setSalaryRevisionPanel] = useState<{
    field: SalaryHistoryFieldKey;
    value: string;
    effectiveFrom: string;
  } | null>(null);
  /** Per salary field: expanded "all history" panel (effective from + end date for every segment). */
  const [salaryHistoryExpanded, setSalaryHistoryExpanded] = useState<Partial<Record<SalaryHistoryFieldKey, boolean>>>({});
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
      const response = await fetch(USERS_LIST_ENDPOINT, { cache: 'no-store' });
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
      const response = await fetch(`/api/users/${userId}/history`);
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
        const response = await fetch(`/api/users/${encodeURIComponent(uid)}`);
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
    if (!window.confirm(`Are you sure you want to delete employee "${user.name}"? This will deactivate their account.`)) {
      return;
    }

    const id = normalizeMongoId(user._id);
    if (!id) {
      alert('Missing employee id. Please refresh the page and try again.');
      return;
    }

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

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
    setSalaryRevisionPanel(null);
    setSalaryHistoryExpanded({});
    setError(null);
  };

  // Employment type history state for UI
  const [newEmploymentType, setNewEmploymentType] = useState<string>('');
  const [newEmploymentTypeDate, setNewEmploymentTypeDate] = useState<string>('');

  const handleInputChange = (field: keyof User, value: any) => {
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
    setFormData(prev => {
      const history = Array.isArray(prev.employmentType) ? [...prev.employmentType] : [];
      history.splice(index, 1);
      return {
        ...prev,
        employmentTypeHistory: history,
        employmentType: history.length > 0 ? history[history.length - 1].employmentType : '',
      };
    });
  };

  const handleAddEmploymentTypeHistory = () => {
    if (!newEmploymentType || !newEmploymentTypeDate) return;
    setFormData(prev => {
      const history = Array.isArray(prev.employmentType) ? [...prev.employmentType] : [];
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

    setIsSavingExtraLabel(true);
    try {
      const res = await fetch('/api/users/extra-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
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
      const res = await fetch('/api/users/predefined-values');
      const json = await res.json();
      if (res.ok && json.success) {
        setPredefinedValues(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch predefined values:', err);
    }
  };

  const handleAddPredefinedValue = async () => {
    const { type, value } = newPredefinedValue;
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

    setIsSavingPredefinedValue(true);
    try {
      const res = await fetch('/api/users/predefined-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: mappedType, value: trimmedValue }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to add value');
      }
      setNewPredefinedValue({ ...newPredefinedValue, value: '' });
      fetchPredefinedValues();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add value');
    } finally {
      setIsSavingPredefinedValue(false);
    }
  };

  const handleRemovePredefinedValue = async (type: keyof typeof predefinedValues, value: string) => {
    if (!window.confirm(`Remove "${value}" from ${type}?`)) return;
    
    try {
      const res = await fetch('/api/users/predefined-values', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, value }),
      });
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
        const [usersRes, preRes] = await Promise.all([
          fetch(USERS_LIST_ENDPOINT, { cache: 'no-store' }),
          fetch('/api/users/predefined-values', { cache: 'no-store' }),
        ]);
        const usersJson = await usersRes.json();
        const preJson = await preRes.json();
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
    setFormData(prev => {
      const schedules = Array.isArray(prev.schedules) ? [...prev.schedules] : [];
      if (!schedules[entryIndex]) return prev;

      schedules[entryIndex] = { ...schedules[entryIndex], effectiveFrom: value };
      // Sort by effectiveFrom descending
      schedules.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());

      return { ...prev, schedules };
    });
  };

  const handleAddScheduleEntry = () => {
    const newEffectiveFrom = toDateInputValue(new Date());
    setFormData(prev => {
      const schedules = Array.isArray(prev.schedules) ? [...prev.schedules] : [];
      const newEntry = {
        effectiveFrom: newEffectiveFrom,
        daily: {
          monday: { inTime: '10:45', outTime: '19:45' },
          tuesday: { inTime: '10:45', outTime: '19:45' },
          wednesday: { inTime: '10:45', outTime: '19:45' },
          thursday: { inTime: '10:45', outTime: '19:45' },
          friday: { inTime: '10:45', outTime: '19:45' },
          saturday: { inTime: '10:45', outTime: '13:45', isHalfDay: true },
          sunday: { inTime: '', outTime: '', isHoliday: true }
        }
      };
      schedules.push(newEntry);
      schedules.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
      return { ...prev, schedules };
    });
  };

  const handleRemoveScheduleEntry = (entryIndex: number) => {
    setFormData(prev => {
      const schedules = Array.isArray(prev.schedules) ? [...prev.schedules] : [];
      schedules.splice(entryIndex, 1);
      return { ...prev, schedules };
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
    return prepared;
  };

  const handleIsActiveChange = (checked: boolean) => {
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

    setSaveLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/users/${editingUser._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...prepareFormDataForSave(formData),
          changedBy: 'HR Admin', // You can make this dynamic based on logged-in user
          changeReason: changeReason || 'Employee information update',
          managedEffectiveFromByField: managedFieldsEffectiveFromByField,
        }),
      });

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
      setSalaryRevisionPanel(null);
      setSalaryHistoryExpanded({});

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

    setSaveLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(prepareFormDataForSave(formData)),
      });

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

      const response = await fetch('/api/users/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees }),
      });

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

      const response = await fetch('/api/users/bulk-schedule-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schedules })
      });

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

    // Show confirmation dialog
    const confirmed = window.confirm(
      'This will update leave balances ONLY for employees present in the Excel file.\n\n' +
      '• Only employees listed in the Excel will be affected\n' +
      '• No other employees will be modified\n' +
      '• Existing leave balances will be replaced with Excel data\n\n' +
      'Do you want to proceed?'
    );

    if (!confirmed) {
      e.target.value = ''; // Reset file input
      return;
    }

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

      const response = await fetch('/api/users/bulk-leave-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaveData })
      });

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
    if (!showInactiveEmployees && isUserMarkedInactive(user)) {
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
      { key: 'otherAllowance', header: 'Other Allowance', width: 15 },
      { key: 'bonus', header: 'Bonus', width: 10 },
      { key: 'incentive', header: 'Incentive', width: 10 },
      { key: 'totalSalaryPerMonth', header: 'Total Salary (P/M)', width: 16 },
      { key: 'totalSalaryPerAnnum', header: 'Per Annum', width: 14 },
      { key: 'pf', header: 'PF', width: 10 },
      { key: 'esi', header: 'ESI', width: 10 },
      { key: 'gratuity', header: 'Gratuity', width: 10 },
      { key: 'leavesBalanceAsOfJan26', header: 'Leaves B/F', width: 20 },
      { key: 'leavesEarned', header: 'Leaves Earned (after Jan 26)', width: 22 },
      { key: 'leavesTaken', header: 'Total Leaves Taken', width: 18 },
      { key: 'balanceLeaves', header: 'Balance Leaves', width: 14 },
      { key: 'articleCreditsAsOnJan26', header: 'Credits for Articles (as on 1st Jan 26)', width: 18 },
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
      { key: 'workTimingsMonFri', header: 'Work Timings (Mon to Fri)', width: 22 },
      { key: 'scheduledHoursMonFri', header: 'Scheduled Daily Hours (Mon to Fri)', width: 22 },
      { key: 'workTimingsSat', header: 'Work Timings (Sat)', width: 18 },
      { key: 'scheduledHoursSat', header: 'Scheduled Daily Hours (Sat)', width: 18 },
      { key: 'weeklyScheduledHours', header: 'Weekly Scheduled Hours', width: 22 },
    ];

    // Add extra info columns dynamically
    const extraColumns = allExtraLabels.map((label, idx) => ({
      key: `extra_${idx}`,
      header: label,
      width: Math.max(15, label.length + 2)
    }));

    worksheet.columns = [...baseColumns, ...extraColumns];

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
      // Schedule export logic
      const getScheduleExportInfo = (user: User) => {
        // Use latest schedule entry if available
        let scheduleEntry = undefined;
        if (user.schedules && Array.isArray(user.schedules) && user.schedules.length > 0) {
          scheduleEntry = user.schedules[user.schedules.length - 1];
        }
        // Fallback to legacy fields
        const daily = scheduleEntry ? scheduleEntry.daily : undefined;
        // Mon-Fri timings
        let monFriIn = '', monFriOut = '', monFriHours = '';
        let satIn = '', satOut = '', satHours = '';
        let weeklyHours = 0;
        // Monday-Friday
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        let monFriCount = 0;
        let monFriTotal = 0;
        days.forEach(day => {
          let st = daily && daily[day] ? daily[day] : (user.scheduleInOutTime ? user.scheduleInOutTime : undefined);
          if (st && st.inTime && st.outTime && !st.isHoliday) {
            if (!monFriIn) monFriIn = st.inTime;
            monFriOut = st.outTime;
            // Calculate hours
            const [inH, inM] = st.inTime.split(':').map(Number);
            const [outH, outM] = st.outTime.split(':').map(Number);
            let hours = (outH * 60 + outM) - (inH * 60 + inM);
            if (st.isHalfDay) hours /= 2;
            monFriTotal += hours;
            monFriCount++;
          }
        });
        if (monFriCount > 0) {
          monFriHours = (monFriTotal / monFriCount / 60).toFixed(2);
        }
        // Saturday
        let satSt = daily && daily['saturday'] ? daily['saturday'] : (user.scheduleInOutTimeSat ? user.scheduleInOutTimeSat : undefined);
        if (satSt && satSt.inTime && satSt.outTime && !satSt.isHoliday) {
          satIn = satSt.inTime;
          satOut = satSt.outTime;
          let hours = (Number(satSt.outTime.split(':')[0]) * 60 + Number(satSt.outTime.split(':')[1])) - (Number(satSt.inTime.split(':')[0]) * 60 + Number(satSt.inTime.split(':')[1]));
          // Do NOT halve for half-day, keep original value
          satHours = (hours / 60).toFixed(2);
          weeklyHours = monFriTotal + hours;
        } else {
          weeklyHours = monFriTotal;
        }
        return {
          workTimingsMonFri: monFriIn && monFriOut ? `${monFriIn} - ${monFriOut}` : '',
          scheduledHoursMonFri: monFriHours,
          workTimingsSat: satIn && satOut ? `${satIn} - ${satOut}` : '',
          scheduledHoursSat: satHours,
          weeklyScheduledHours: (weeklyHours / 60).toFixed(2),
        };
      };

      const scheduleInfo = getScheduleExportInfo(u);
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
        otherAllowance: u.otherAllowance || '',
        bonus: u.bonus || '',
        incentive: u.incentive || '',
        totalSalaryPerMonth: u.totalSalaryPerMonth || '',
        totalSalaryPerAnnum: u.totalSalaryPerAnnum || '',
        pf: u.pf || '',
        esi: u.esi || '',
        gratuity: u.gratuity || '',
        leavesBalanceAsOfJan26: u.leaveBalance?.balanceAsOfJan26 || 0,
        leavesEarned: u.leaveBalance?.earned || 0,
        leavesTaken: u.leaveBalance?.used || 0,
        balanceLeaves: u.leaveBalance?.remaining || 0,
        joiningDate: toDateString(u.joiningDate),
        articleCreditsAsOnJan26: typeof u.articleCreditsAsOnJan26 === 'number' ? u.articleCreditsAsOnJan26 : '',
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
        ...scheduleInfo,
      };

      // Add extra info columns
      allExtraLabels.forEach((label, idx) => {
        const item = u.extraInfo?.find(e => e.label === label);
        rowData[`extra_${idx}`] = item?.value || '';
      });

      worksheet.addRow(rowData);
    });

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 35;

    // Define color groups for better visual organization
    const colorGroups = {
      personal: { start: 1, end: 8, color: 'FF2E7D32' },      // Green - Personal Info
      contact: { start: 9, end: 17, color: 'FF1565C0' },      // Blue - Contact Info
      address: { start: 16, end: 17, color: 'FF00838F' },     // Teal - Address
      emergency: { start: 18, end: 19, color: 'FFD84315' },   // Orange - Emergency
      family: { start: 20, end: 20, color: 'FF6A1B9A' },      // Purple - Family
      bank: { start: 21, end: 26, color: 'FF00695C' },        // Dark Teal - Bank
      identity: { start: 27, end: 28, color: 'FF4527A0' },    // Deep Purple - Identity
      salary: { start: 29, end: 38, color: 'FFC62828' },      // Red - Salary
      leave: { start: 39, end: 41, color: 'FFEF6C00' },       // Amber - Leave
      employment: { start: 42, end: 53, color: 'FF283593' },  // Indigo - Employment
      extra: { start: 54, end: 999, color: 'FF37474F' },      // Blue Grey - Extra Info
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

  const openSalaryRevisionPanel = (field: SalaryHistoryFieldKey) => {
    setSalaryHistoryExpanded((prev) => ({ ...prev, [field]: true }));
    setSalaryRevisionPanel({
      field,
      value: '',
      effectiveFrom: toDateInputValue(new Date()),
    });
  };

  const applySalaryRevision = () => {
    if (!salaryRevisionPanel) return;
    const { field, value, effectiveFrom } = salaryRevisionPanel;
    if (!effectiveFrom.trim()) {
      alert('Please select the effective from date for the new salary.');
      return;
    }
    handleInputChange(field as keyof User, value);
    setManagedFieldsEffectiveFromByField((prev) => ({ ...prev, [field]: effectiveFrom }));
    setSalaryRevisionPanel(null);
  };

  const renderSalaryFieldWithHistory = (field: SalaryHistoryFieldKey, label: string, theme: 'salary' | 'extended' = 'salary') => {
    const inputCls =
      theme === 'extended'
        ? 'w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50'
        : 'w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50';
    const dateCls =
      theme === 'extended'
        ? 'w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500/50'
        : 'w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50';
    const panelBorder = theme === 'extended' ? 'border-purple-900/50' : 'border-emerald-900/50';
    const panelTitle = theme === 'extended' ? 'text-purple-400/90' : 'text-emerald-400/90';
    const panelBtn =
      theme === 'extended' ? 'rounded bg-purple-600/80 px-2 py-1 text-[11px] text-white hover:bg-purple-600' : 'rounded bg-emerald-600/80 px-2 py-1 text-[11px] text-white hover:bg-emerald-600';

    const histAll = sortSalaryHistoryDesc((formData as any)?.fieldHistories?.[field]);
    const historyOpen = Boolean(salaryHistoryExpanded[field]);
    const historyCount = histAll.length;

    return (
      <div key={field}>
        <button
          type="button"
          onClick={() =>
            setSalaryHistoryExpanded((prev) => ({
              ...prev,
              [field]: !prev[field],
            }))
          }
          className="mb-2 flex w-full items-center justify-between gap-2 rounded border border-slate-700 bg-slate-900/80 px-2.5 py-2 text-left text-[11px] text-slate-300 hover:border-slate-600 hover:bg-slate-900"
          aria-expanded={historyOpen}
        >
          <span className="flex items-center gap-2">
            {historyOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
            <span>
              Salary history
              {historyCount > 0 ? (
                <span className="ml-1.5 text-slate-500">({historyCount})</span>
              ) : null}
            </span>
          </span>
          <span className="text-[10px] text-slate-500 shrink-0">Effective from · End date</span>
        </button>
        {historyOpen && (
          <div className="mb-3 rounded border border-slate-800 bg-slate-950/90 p-2">
            {historyCount === 0 ? (
              <p className="text-[11px] text-slate-500 py-1">No saved history for this field yet. After you add a new salary and save, previous amounts appear here with start and end dates.</p>
            ) : (
              <ul className="max-h-56 space-y-0 overflow-y-auto text-[11px] divide-y divide-slate-800/80">
                {histAll.map((row, idx) => {
                  const isOpenEnded = row.effectiveTo == null || row.effectiveTo === '';
                  const currentCls =
                    theme === 'extended' ? 'text-purple-400/90' : 'text-emerald-500/90';
                  return (
                    <li key={`${String(row.effectiveFrom)}-${idx}`} className="flex flex-col gap-0.5 py-2 first:pt-0">
                      <div className="font-medium text-slate-200">{row.value ?? '—'}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-400">
                        <span>
                          <span className="text-slate-500">From </span>
                          {formatSalaryHistoryRowDate(row.effectiveFrom)}
                        </span>
                        <span>
                          <span className="text-slate-500">End </span>
                          {isOpenEnded ? <span className={currentCls}>Current (no end date)</span> : formatSalaryHistoryRowDate(row.effectiveTo)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        <label className="block text-xs text-slate-400 mb-1">{label}</label>
        <input
          type="text"
          value={(formData as any)[field] || ''}
          onChange={(e) => handleInputChange(field as keyof User, e.target.value)}
          className={inputCls}
        />
        <div className="mt-2">
          <label className="block text-[11px] text-slate-500 mb-1">Effective from (current amount)</label>
          <input
            type="date"
            value={managedFieldsEffectiveFromByField[field]}
            onChange={(e) =>
              setManagedFieldsEffectiveFromByField((prev) => ({
                ...prev,
                [field]: e.target.value,
              }))
            }
            className={dateCls}
          />
        </div>
        <button
          type="button"
          onClick={() => openSalaryRevisionPanel(field)}
          className="mt-2 inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-600 hover:text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          Add new salary
        </button>
        {salaryRevisionPanel?.field === field && (
          <div className={`mt-2 space-y-2 rounded border ${panelBorder} bg-slate-950 p-2`}>
            <div className={`text-[11px] ${panelTitle}`}>New amount (applies to the form; save employee to persist)</div>
            <input
              type="text"
              value={salaryRevisionPanel.value}
              onChange={(e) =>
                setSalaryRevisionPanel((p) => (p && p.field === field ? { ...p, value: e.target.value } : p))
              }
              placeholder="Amount"
              className={inputCls}
            />
            <input
              type="date"
              value={salaryRevisionPanel.effectiveFrom}
              onChange={(e) =>
                setSalaryRevisionPanel((p) => (p && p.field === field ? { ...p, effectiveFrom: e.target.value } : p))
              }
              className={dateCls}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={applySalaryRevision} className={panelBtn}>
                Apply to current row
              </button>
              <button
                type="button"
                onClick={() => setSalaryRevisionPanel(null)}
                className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============== EDIT FORM VIEW =================
  if (editingUser) {
    return (
      <div className="employee-edit-date-inputs bg-slate-900/50 rounded-lg border border-slate-800 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-emerald-400">Edit Employee</h2>
          <button onClick={handleCancelEdit} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 text-rose-300 px-4 py-3 rounded-md mb-6 border border-rose-500/20">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tab Navigation */}
          <div className="md:col-span-2 mb-4">
            <div className="flex space-x-1 bg-slate-950/50 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveTab('basic')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'basic'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Basic Info
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'schedule'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Schedule
              </button>
              <button
                onClick={() => setActiveTab('extended')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'extended'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Extended
              </button>
              <button
                onClick={() => setActiveTab('bank')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'bank'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Bank Details
              </button>
              <button
                onClick={() => setActiveTab('salary')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'salary'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Salary & Leave
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'history'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                History
              </button>
            </div>
          </div>

          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <>
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2">Basic Information</h3>
                
                <div>
                  <label className="block text-xs text-slate-400 mb-1">OD ID</label>
                  <input
                    type="text"
                    value={formData.odId || ''}
                    onChange={(e) => handleInputChange('odId', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Attendance Email</label>
                  <input
                    type="email"
                    value={formData.attendanceEmail || ''}
                    onChange={(e) => handleInputChange('attendanceEmail', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                {formData.category === 'Article' && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Credits for Articles (as on 1st Jan 26)</label>
                    <input
                      type="number"
                      value={formData.articleCreditsAsOnJan26 ?? ''}
                      onChange={(e) => handleInputChange('articleCreditsAsOnJan26', e.target.value === '' ? undefined : Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                      min="0"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Designation</label>
                  <select
                    value={formData.designation || ''}
                    onChange={(e) => handleInputChange('designation', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="">Select designation</option>
                    {predefinedValues.designations.map((designation) => (
                      <option key={designation} value={designation}>{designation}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Work Partner</label>
                  <select
                    value={formData.workingUnderPartner || ''}
                    onChange={(e) => {
                      handleInputChange('workingUnderPartner', e.target.value);
                      handleInputChange('team', e.target.value); // Auto-fill team from work partner
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="">Select work partner</option>
                    {predefinedValues.teams.map((team) => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                  {hasManagedFieldValue('workingUnderPartner') && (
                    <div className="mt-2">
                      <label className="block text-[11px] text-slate-500 mb-1">Work Partner Effective From</label>
                      <input
                        type="date"
                        value={managedFieldsEffectiveFromByField.workingUnderPartner}
                        onChange={(e) =>
                          setManagedFieldsEffectiveFromByField((prev) => ({
                            ...prev,
                            workingUnderPartner: e.target.value,
                          }))
                        }
                        className="w-full min-h-9 rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Team <span className="text-slate-500">(auto-filled from Work Partner)</span></label>
                  <input
                    type="text"
                    value={formData.team || ''}
                    disabled
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
                    title="Team automatically matches Work Partner"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Employment Type History</label>
                  <div className="space-y-2 mb-2">
                      {Array.isArray(formData.employmentTypeHistory)
                        ? formData.employmentTypeHistory.map((entry: { employmentType: string; effectiveFrom: string | number | Date }, idx: number) => (
                            <div key={String(idx)} className="flex items-center gap-2 text-xs">
                            <span className="px-2 py-1 bg-slate-700 rounded text-slate-200">{entry.employmentType}</span>
                            <span className="px-2 py-1 bg-slate-800 rounded text-slate-400">From: {new Date(entry.effectiveFrom).toLocaleDateString()}</span>
                            <button
                              type="button"
                              className="px-2 py-1 bg-red-600 text-white rounded"
                              title="Delete this entry"
                              onClick={() => handleDeleteEmploymentTypeHistory(idx)}
                            >
                              Delete
                            </button>
                          </div>
                        ))
                      : null}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <select
                      value={newEmploymentType}
                      onChange={e => setNewEmploymentType(e.target.value)}
                      className="px-2 py-1 rounded bg-slate-700 text-slate-200"
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
                        className="min-h-9 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 [color-scheme:light]"
                      />
                    <button
                      type="button"
                      onClick={handleAddEmploymentTypeHistory}
                      className="px-3 py-1 bg-emerald-600 text-white rounded"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Joining Date</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.joiningDate)}
                    onChange={(e) => handleInputChange('joiningDate', e.target.value)}
                    className="w-full min-h-10 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                  />
                </div>
                
                 <div className="flex flex-col gap-3 mt-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive !== false}
                      onChange={(e) => handleIsActiveChange(e.target.checked)}
                      className="w-4 h-4 bg-slate-950 border-slate-800 rounded text-emerald-500 focus:ring-0"
                    />
                    <label htmlFor="isActive" className="text-sm text-slate-300">Active Employee</label>
                  </div>
                  {formData.isActive === false && (
                    <div>
                      <label htmlFor="inactiveAsOf" className="block text-xs text-slate-400 mb-1">
                        Inactive as of (first day excluded from attendance &amp; summaries)
                      </label>
                      <input
                        id="inactiveAsOf"
                        type="date"
                        value={toDateInputValue(formData.inactiveAsOf)}
                        onChange={(e) => handleInputChange('inactiveAsOf', e.target.value)}
                        className="w-full max-w-xs min-h-10 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
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
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-sm font-medium text-slate-300">Work Schedule Entries</h3>
                <button
                  onClick={handleAddScheduleEntry}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded"
                >
                  Add New Schedule Entry
                </button>
              </div>

              {(formData.schedules || []).map((entry, index) => (
                <div key={index} className="border border-slate-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-300">Effective From:</label>
                      <input
                        type="date"
                        value={toDateInputValue(entry.effectiveFrom)}
                        onChange={(e) => handleEffectiveFromChange(index, e.target.value)}
                        className="min-h-9 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 [color-scheme:light]"
                      />
                    </div>
                    <button
                      onClick={() => handleRemoveScheduleEntry(index)}
                      className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-sm rounded"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {/* Monday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-emerald-400">Monday</label>
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
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm "
                            disabled={entry.daily?.monday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.monday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'monday', 'outTime', e.target.value)}
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm "
                            disabled={entry.daily?.monday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Tuesday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-emerald-400">Tuesday</label>
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
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm "
                            disabled={entry.daily?.tuesday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.tuesday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'tuesday', 'outTime', e.target.value)}
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm "
                            disabled={entry.daily?.tuesday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Wednesday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-emerald-400">Wednesday</label>
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
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm "
                            disabled={entry.daily?.wednesday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.wednesday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'wednesday', 'outTime', e.target.value)}
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm"
                            disabled={entry.daily?.wednesday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Thursday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-emerald-400">Thursday</label>
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
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm"
                            disabled={entry.daily?.thursday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.thursday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'thursday', 'outTime', e.target.value)}
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm"
                            disabled={entry.daily?.thursday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Friday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-emerald-400">Friday</label>
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
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm"
                            disabled={entry.daily?.friday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.friday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'friday', 'outTime', e.target.value)}
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm"
                            disabled={entry.daily?.friday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Saturday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-emerald-400">Saturday</label>
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
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm"
                            disabled={entry.daily?.saturday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.saturday?.outTime || '13:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'saturday', 'outTime', e.target.value)}
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm"
                            disabled={entry.daily?.saturday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Sunday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-emerald-400">Sunday</label>
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
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm"
                            disabled={entry.daily?.sunday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.sunday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'sunday', 'outTime', e.target.value)}
                            className="w-full text-black bg-zinc-300 border border-slate-800 rounded px-2 py-1.5 text-sm"
                            disabled={entry.daily?.sunday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Extended Tab */}
          {activeTab === 'extended' && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2 mb-4">Extended Details</h3>
              
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
                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
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
                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
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
                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
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
                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                        <input
                          type="text"
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                    );
                  }
                })}

                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs text-slate-400 mb-1">Address Line 1</label>
                        <input
                          type="text"
                          value={formData.address1 || ''}
                          onChange={(e) => handleInputChange('address1', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Address Line 2</label>
                        <input
                          type="text"
                          value={formData.address2 || ''}
                          onChange={(e) => handleInputChange('address2', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                </div>

                {/* Emergency Contact & Banking */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Emergency Contact No.</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactNo || ''}
                      onChange={(e) => handleInputChange('emergencyContactNo' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Relation</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactRelation || ''}
                      onChange={(e) => handleInputChange('emergencyContactRelation' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Anniversary Date</label>
                    <input
                      type="date"
                      value={toDateInputValue((formData as any).anniversaryDate)}
                      onChange={(e) => handleInputChange('anniversaryDate' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Aadhar No.</label>
                    <input
                      type="text"
                      value={(formData as any).aadhaarNumber || ''}
                      onChange={(e) => handleInputChange('aadhaarNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">PAN</label>
                    <input
                      type="text"
                      value={(formData as any).panNumber || ''}
                      onChange={(e) => handleInputChange('panNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                </div>

                {/* Salary Information */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                </div>

                {/* Articleship & Professional */}
                {[
                  { label: 'Transfer Case', key: 'transferCase' },
                  { label: '1st Year Art.', key: 'firstYearArticleship' },
                  { label: '2nd Year Art.', key: 'secondYearArticleship' },
                  { label: '3rd Year Art.', key: 'thirdYearArticleship' },
                  { label: 'Filled Scholarship', key: 'filledScholarship' },
                  { label: 'Qualification', key: 'qualificationLevel' },
                  { label: 'Reg. Partner', key: 'registeredUnderPartner' },
                  { label: 'Work. Partner', key: 'workingUnderPartner' },
                  { label: 'Work Timing (Text)', key: 'workingTiming' },
                ].map((field) => (
                  <div key={field.key}>
                     <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                    <input
                      type="text"
                      value={(formData as any)[field.key] || ''}
                      onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                ))}

                {hasManagedFieldValue('registeredUnderPartner') && (
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Registered Under Partner Effective From</label>
                    <input
                      type="date"
                      value={managedFieldsEffectiveFromByField.registeredUnderPartner}
                      onChange={(e) =>
                        setManagedFieldsEffectiveFromByField((prev) => ({
                          ...prev,
                          registeredUnderPartner: e.target.value,
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                )}

                {/* Dates */}
                 <div>
                  <label className="block text-xs text-slate-400 mb-1">Articleship Start</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.articleshipStartDate)}
                    onChange={(e) => handleInputChange('articleshipStartDate', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                 <div>
                  <label className="block text-xs text-slate-400 mb-1">Next Attempt Due</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.nextAttemptDueDate)}
                    onChange={(e) => handleInputChange('nextAttemptDueDate', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

              </div>

              {/* Flexible Additional Info */}
              <div className="mt-6 md:col-span-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Additional Info (PAN, Aadhaar, etc.)</h4>
                  <p className="text-[11px] text-slate-500">Fields are managed from the main page.</p>
                </div>
                <div className="space-y-2">
                  {(formData.extraInfo || []).map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={item.label}
                        disabled
                        className="col-span-4 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={item.value}
                        onChange={(e) => handleExtraInfoChange(idx, 'value', e.target.value)}
                        className="col-span-8 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
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
              <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2 mb-4">Bank Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={(formData as any).bankName || ''}
                    onChange={(e) => handleInputChange('bankName' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Branch Name</label>
                  <input
                    type="text"
                    value={(formData as any).branchName || ''}
                    onChange={(e) => handleInputChange('branchName' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={(formData as any).accountNumber || ''}
                    onChange={(e) => handleInputChange('accountNumber' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={(formData as any).ifscCode || ''}
                    onChange={(e) => handleInputChange('ifscCode' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Account Type</label>
                  <input
                    type="text"
                    value={(formData as any).accountType || ''}
                    onChange={(e) => handleInputChange('accountType' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Account Holder Name</label>
                  <input
                    type="text"
                    value={(formData as any).accountHolderName || ''}
                    onChange={(e) => handleInputChange('accountHolderName' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Salary & Leave Tab */}
          {activeTab === 'salary' && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2 mb-4">Salary & Leave Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Salary Details */}
                <div className="md:col-span-3">
                  <h4 className="text-sm font-medium text-slate-400 mb-3 border-b border-slate-700 pb-1">Salary Details</h4>
                </div>
                
                {renderSalaryFieldWithHistory('basicSalary', 'Basic Salary', 'salary')}
                {renderSalaryFieldWithHistory('laptopAllowance', 'Laptop Allowance', 'salary')}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Other Allowance</label>
                  <input
                    type="text"
                    value={(formData as any).otherAllowance || ''}
                    onChange={(e) => handleInputChange('otherAllowance' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Bonus</label>
                  <input
                    type="text"
                    value={(formData as any).bonus || ''}
                    onChange={(e) => handleInputChange('bonus' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Incentive</label>
                  <input
                    type="text"
                    value={(formData as any).incentive || ''}
                    onChange={(e) => handleInputChange('incentive' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                {renderSalaryFieldWithHistory('totalSalaryPerMonth', 'Total Salary (P/M)', 'salary')}
                {renderSalaryFieldWithHistory('totalSalaryPerAnnum', 'Per Annum', 'salary')}
                
                {/* Deductions */}
                <div className="md:col-span-3">
                  <h4 className="text-sm font-medium text-slate-400 mb-3 border-b border-slate-700 pb-1">Deductions</h4>
                </div>
                
                <div>
                  <label className="block text-xs text-slate-400 mb-1">PF (Provident Fund)</label>
                  <input
                    type="text"
                    value={(formData as any).pf || ''}
                    onChange={(e) => handleInputChange('pf' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">ESI</label>
                  <input
                    type="text"
                    value={(formData as any).esi || ''}
                    onChange={(e) => handleInputChange('esi' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Gratuity</label>
                  <input
                    type="text"
                    value={(formData as any).gratuity || ''}
                    onChange={(e) => handleInputChange('gratuity' as keyof User, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                
                {/* Leave Information */}
                <div className="md:col-span-3">
                  <h4 className="text-sm font-medium text-slate-400 mb-3 border-b border-slate-700 pb-1">Leave Information</h4>
                </div>
                
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Total Earned</label>
                  <div className="text-sm text-slate-200 font-medium bg-slate-950 border border-slate-800 rounded px-3 py-2">
                    {(formData as any).leaveBalance?.earned || 0} days
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Total Used</label>
                  <div className="text-sm text-slate-200 font-medium bg-slate-950 border border-slate-800 rounded px-3 py-2">
                    {(formData as any).leaveBalance?.used || 0} days
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Balance Available</label>
                  <div className={`text-sm font-medium bg-slate-950 border border-slate-800 rounded px-3 py-2 ${
                    ((formData as any).leaveBalance?.remaining || 0) > 0 ? 'text-sky-400' : 'text-slate-400'
                  }`}>
                    {(formData as any).leaveBalance?.remaining || 0} days
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Monthly Earned Rate</label>
                  <div className="text-sm text-slate-200 font-medium bg-slate-950 border border-slate-800 rounded px-3 py-2">
                    {(formData as any).leaveBalance?.monthlyEarned || 2} days/month
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Last Updated</label>
                  <div className="text-sm text-slate-200 font-medium bg-slate-950 border border-slate-800 rounded px-3 py-2">
                    {(formData as any).leaveBalance?.lastUpdated 
                      ? new Date((formData as any).leaveBalance.lastUpdated).toLocaleDateString()
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
              <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2 mb-4">Extended Details (Optional)</h3>
              
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
                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
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
                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
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
                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                        <input
                          type="text"
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                    );
                  }
                })}

                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs text-slate-400 mb-1">Address Line 1</label>
                        <input
                          type="text"
                          value={formData.address1 || ''}
                          onChange={(e) => handleInputChange('address1', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Address Line 2</label>
                        <input
                          type="text"
                          value={formData.address2 || ''}
                          onChange={(e) => handleInputChange('address2', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                </div>

                {/* Emergency Contact & Banking */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Emergency Contact No.</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactNo || ''}
                      onChange={(e) => handleInputChange('emergencyContactNo' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Relation</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactRelation || ''}
                      onChange={(e) => handleInputChange('emergencyContactRelation' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Anniversary Date</label>
                    <input
                      type="date"
                      value={toDateInputValue((formData as any).anniversaryDate)}
                      onChange={(e) => handleInputChange('anniversaryDate' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={(formData as any).bankName || ''}
                      onChange={(e) => handleInputChange('bankName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={(formData as any).branchName || ''}
                      onChange={(e) => handleInputChange('branchName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Account No.</label>
                    <input
                      type="text"
                      value={(formData as any).accountNumber || ''}
                      onChange={(e) => handleInputChange('accountNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">IFSC</label>
                    <input
                      type="text"
                      value={(formData as any).ifscCode || ''}
                      onChange={(e) => handleInputChange('ifscCode' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Type of Account</label>
                    <input
                      type="text"
                      value={(formData as any).accountType || ''}
                      onChange={(e) => handleInputChange('accountType' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Name of Account Holder</label>
                    <input
                      type="text"
                      value={(formData as any).accountHolderName || ''}
                      onChange={(e) => handleInputChange('accountHolderName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Aadhar No.</label>
                    <input
                      type="text"
                      value={(formData as any).aadhaarNumber || ''}
                      onChange={(e) => handleInputChange('aadhaarNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">PAN</label>
                    <input
                      type="text"
                      value={(formData as any).panNumber || ''}
                      onChange={(e) => handleInputChange('panNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
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
                {[
                  { label: 'Transfer Case', key: 'transferCase' },
                  { label: '1st Year Art.', key: 'firstYearArticleship' },
                  { label: '2nd Year Art.', key: 'secondYearArticleship' },
                  { label: '3rd Year Art.', key: 'thirdYearArticleship' },
                  { label: 'Filled Scholarship', key: 'filledScholarship' },
                  { label: 'Qualification', key: 'qualificationLevel' },
                  { label: 'Reg. Partner', key: 'registeredUnderPartner' },
                  { label: 'Work. Partner', key: 'workingUnderPartner' },
                  { label: 'Work Timing (Text)', key: 'workingTiming' },
                ].map((field) => (
                  <div key={field.key}>
                     <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                    <input
                      type="text"
                      value={(formData as any)[field.key] || ''}
                      onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                ))}

                {/* Dates */}
                 <div>
                  <label className="block text-xs text-slate-400 mb-1">Articleship Start</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.articleshipStartDate)}
                    onChange={(e) => handleInputChange('articleshipStartDate', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                 <div>
                  <label className="block text-xs text-slate-400 mb-1">Next Attempt Due</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.nextAttemptDueDate)}
                    onChange={(e) => handleInputChange('nextAttemptDueDate', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="md:col-span-2">
              <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-4">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Change History</h3>

                {/* Change Reason Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Reason for Changes (Optional)
                  </label>
                  <textarea
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="Enter reason for the changes being made..."
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    rows={3}
                  />
                </div>

                {/* History Table */}
                {historyLoading ? (
                  <div className="text-center py-8">
                    <div className="text-slate-400">Loading history...</div>
                  </div>
                ) : employeeHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-slate-400">No change history found</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-950/50 text-slate-400 font-medium border-b border-slate-800">
                        <tr>
                          <th className="px-4 py-3">Field</th>
                          <th className="px-4 py-3">Old Value</th>
                          <th className="px-4 py-3">New Value</th>
                          <th className="px-4 py-3">Changed By</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {employeeHistory.map((entry, index) => (
                          <tr key={index} className="hover:bg-slate-800/30">
                            <td className="px-4 py-3">
                              <span className="text-slate-200 font-medium">
                                {entry.fieldName === 'workingUnderPartner' ? 'Work Partner' :
                                 entry.fieldName === 'designation' ? 'Designation' :
                                 entry.fieldName === 'paidFrom' ? 'Paid From' :
                                 entry.fieldName === 'category' ? 'Category' :
                                 entry.fieldName === 'qualificationLevel' ? 'Qualification' :
                                 entry.fieldName === 'registeredUnderPartner' ? 'Reg. Partner' :
                                 entry.fieldName}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-slate-400 line-through">{entry.oldValue || 'N/A'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-emerald-400 font-medium">{entry.newValue || 'N/A'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-slate-300">{entry.changedBy}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-slate-400 text-xs">
                                {new Date(entry.changedAt).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-slate-400 text-xs">{entry.changeReason || 'N/A'}</span>
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

        <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={handleCancelEdit}
            className="px-4 py-2 rounded text-sm text-slate-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saveLoading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saveLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  // ============== ADD NEW EMPLOYEE FORM VIEW =================
  if (isAddingNew) {
    return (
      <div className="employee-edit-date-inputs bg-slate-900/50 rounded-lg border border-slate-800 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-purple-400">Add New Employee</h2>
          <button onClick={() => setIsAddingNew(false)} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 text-rose-300 px-4 py-3 rounded-md mb-6 border border-rose-500/20">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tab Navigation */}
          <div className="md:col-span-2 mb-4">
            <div className="flex space-x-1 bg-slate-950/50 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveTab('basic')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'basic'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Basic Info
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'schedule'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Schedule
              </button>
              <button
                onClick={() => setActiveTab('extended')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'extended'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Extended
              </button>
            </div>
          </div>

          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <>
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2">Basic Information</h3>
                
                <div>
                  <label className="block text-xs text-slate-400 mb-1">OD ID *</label>
                  <input
                    type="text"
                    value={formData.odId || ''}
                    onChange={(e) => handleInputChange('odId', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Designation</label>
                  <select
                    value={formData.designation || ''}
                    onChange={(e) => handleInputChange('designation', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="">Select designation</option>
                    {predefinedValues.designations.map((designation) => (
                      <option key={designation} value={designation}>{designation}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Work Partner</label>
                  <select
                    value={formData.workingUnderPartner || ''}
                    onChange={(e) => {
                      handleInputChange('workingUnderPartner', e.target.value);
                      handleInputChange('team', e.target.value); // Auto-fill team from work partner
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="">Select work partner</option>
                    {predefinedValues.teams.map((team) => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Team <span className="text-slate-500">(auto-filled from Work Partner)</span></label>
                  <input
                    type="text"
                    value={formData.team || ''}
                    disabled
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
                    title="Team automatically matches Work Partner"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Joining Date *</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.joiningDate)}
                    onChange={(e) => handleInputChange('joiningDate', e.target.value)}
                    className="w-full min-h-10 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500"
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
                      className="w-4 h-4 bg-slate-950 border-slate-800 rounded text-purple-500 focus:ring-0"
                    />
                    <label htmlFor="isActiveNew" className="text-sm text-slate-300">Active Employee</label>
                  </div>
                  {formData.isActive === false && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Inactive as of (first day excluded from attendance &amp; summaries) *
                      </label>
                      <input
                        type="date"
                        value={toDateInputValue(formData.inactiveAsOf)}
                        onChange={(e) => handleInputChange('inactiveAsOf', e.target.value)}
                        className="w-full max-w-xs min-h-10 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500"
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
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-sm font-medium text-slate-300">Work Schedule Entries</h3>
                <button
                  onClick={handleAddScheduleEntry}
                  className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded"
                >
                  Add New Schedule Entry
                </button>
              </div>

              {(formData.schedules || []).map((entry, index) => (
                <div key={index} className="border border-slate-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-300">Effective From:</label>
                      <input
                        type="date"
                        value={toDateInputValue(entry.effectiveFrom)}
                        onChange={(e) => handleEffectiveFromChange(index, e.target.value)}
                        className="min-h-9 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 [color-scheme:light]"
                      />
                    </div>
                    <button
                      onClick={() => handleRemoveScheduleEntry(index)}
                      className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-sm rounded"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {/* Monday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-purple-400">Monday</label>
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
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.monday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.monday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'monday', 'outTime', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.monday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Tuesday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-purple-400">Tuesday</label>
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
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.tuesday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.tuesday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'tuesday', 'outTime', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.tuesday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Wednesday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-purple-400">Wednesday</label>
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
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.wednesday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.wednesday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'wednesday', 'outTime', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.wednesday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Thursday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-purple-400">Thursday</label>
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
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.thursday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.thursday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'thursday', 'outTime', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.thursday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Friday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-purple-400">Friday</label>
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
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.friday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.friday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'friday', 'outTime', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.friday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Saturday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-purple-400">Saturday</label>
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
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.saturday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.saturday?.outTime || '13:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'saturday', 'outTime', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.saturday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Sunday */}
                    <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-purple-400">Sunday</label>
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
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.sunday?.isHoliday}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Out Time</label>
                          <input
                            type="time"
                            value={entry.daily?.sunday?.outTime || '19:45'}
                            onChange={(e) => handleScheduleEntryChange(index, 'sunday', 'outTime', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                            disabled={entry.daily?.sunday?.isHoliday}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Extended Tab */}
          {activeTab === 'extended' && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2 mb-4">Extended Details (Optional)</h3>
              
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
                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
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
                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                        <select
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
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
                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                        <input
                          type="text"
                          value={(formData as any)[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                    );
                  }
                })}

                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs text-slate-400 mb-1">Address Line 1</label>
                        <input
                          type="text"
                          value={formData.address1 || ''}
                          onChange={(e) => handleInputChange('address1', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Address Line 2</label>
                        <input
                          type="text"
                          value={formData.address2 || ''}
                          onChange={(e) => handleInputChange('address2', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                </div>

                {/* Emergency Contact & Banking */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Emergency Contact No.</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactNo || ''}
                      onChange={(e) => handleInputChange('emergencyContactNo' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Relation</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactRelation || ''}
                      onChange={(e) => handleInputChange('emergencyContactRelation' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Anniversary Date</label>
                    <input
                      type="date"
                      value={toDateInputValue((formData as any).anniversaryDate)}
                      onChange={(e) => handleInputChange('anniversaryDate' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={(formData as any).bankName || ''}
                      onChange={(e) => handleInputChange('bankName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={(formData as any).branchName || ''}
                      onChange={(e) => handleInputChange('branchName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Account No.</label>
                    <input
                      type="text"
                      value={(formData as any).accountNumber || ''}
                      onChange={(e) => handleInputChange('accountNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">IFSC</label>
                    <input
                      type="text"
                      value={(formData as any).ifscCode || ''}
                      onChange={(e) => handleInputChange('ifscCode' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Type of Account</label>
                    <input
                      type="text"
                      value={(formData as any).accountType || ''}
                      onChange={(e) => handleInputChange('accountType' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Name of Account Holder</label>
                    <input
                      type="text"
                      value={(formData as any).accountHolderName || ''}
                      onChange={(e) => handleInputChange('accountHolderName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Aadhar No.</label>
                    <input
                      type="text"
                      value={(formData as any).aadhaarNumber || ''}
                      onChange={(e) => handleInputChange('aadhaarNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">PAN</label>
                    <input
                      type="text"
                      value={(formData as any).panNumber || ''}
                      onChange={(e) => handleInputChange('panNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
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
                {[
                  { label: 'Transfer Case', key: 'transferCase' },
                  { label: '1st Year Art.', key: 'firstYearArticleship' },
                  { label: '2nd Year Art.', key: 'secondYearArticleship' },
                  { label: '3rd Year Art.', key: 'thirdYearArticleship' },
                  { label: 'Filled Scholarship', key: 'filledScholarship' },
                  { label: 'Qualification', key: 'qualificationLevel' },
                  { label: 'Reg. Partner', key: 'registeredUnderPartner' },
                  { label: 'Work. Partner', key: 'workingUnderPartner' },
                  { label: 'Work Timing (Text)', key: 'workingTiming' },
                ].map((field) => (
                  <div key={field.key}>
                     <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                    <input
                      type="text"
                      value={(formData as any)[field.key] || ''}
                      onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                ))}

                {/* Dates */}
                 <div>
                  <label className="block text-xs text-slate-400 mb-1">Articleship Start</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.articleshipStartDate)}
                    onChange={(e) => handleInputChange('articleshipStartDate', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                 <div>
                  <label className="block text-xs text-slate-400 mb-1">Next Attempt Due</label>
                  <input
                    type="date"
                    value={toDateInputValue(formData.nextAttemptDueDate)}
                    onChange={(e) => handleInputChange('nextAttemptDueDate', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={() => setIsAddingNew(false)}
            className="px-4 py-2 rounded text-sm text-slate-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateNew}
            disabled={saveLoading || !formData.name || !formData.email || !formData.odId || !formData.joiningDate}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {saveLoading ? 'Creating...' : 'Create Employee'}
          </button>
        </div>
      </div>
    );
  }

  // ============== LIST VIEW =================
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header Section */}
      <div className="bg-linear-to-r from-slate-900 via-slate-900 to-slate-800 border-b border-slate-800">
        <div className="px-6 py-6">
          {/* Title Row */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <div className="w-10 h-10 bg-linear-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                Employee Management
              </h1>
              <p className="text-slate-400 text-sm mt-1">Manage employee information, schedules, and records</p>
              {!showInactiveEmployees && inactiveUserCount > 0 && (
                <p className="text-xs text-amber-400/90 mt-2">
                  Inactive employees are hidden from the table. Use &quot;Show inactive&quot; in the toolbar to list them (e.g. to re-activate).
                </p>
              )}
            </div>

            {/* Quick Stats */}
            {loading ? (
              <div className="flex items-center gap-3 animate-pulse" aria-hidden>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5 flex items-center gap-3 w-[9.5rem]">
                  <div className="w-8 h-8 bg-slate-700/60 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="h-6 bg-slate-700/60 rounded w-10" />
                    <div className="h-2.5 bg-slate-800 rounded w-24" />
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5 flex items-center gap-3 w-[9.5rem]">
                  <div className="w-8 h-8 bg-slate-700/60 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="h-6 bg-slate-700/60 rounded w-10" />
                    <div className="h-2.5 bg-slate-800 rounded w-28" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    <Users className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white">{users.length}</p>
                    <p className="text-xs text-slate-400">Total Employees</p>
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white">{uniqueDesignations.length}</p>
                    <p className="text-xs text-slate-400">Designations</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Search and Actions Row */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
            {/* Search and Filter */}
            <div className="flex flex-1 items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search by name, email, code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 text-slate-200 text-sm rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 placeholder-slate-500 transition-all"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Multi-select Designation Filter */}
              {/* Designation Dropdown Filter */}
              <div className="relative min-w-45">
                <button
                  type="button"
                  className="w-full bg-slate-800/50 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-2.5 flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50"
                  onClick={() => setShowDesignationDropdown(v => !v)}
                >
                  <span>{filterDesignations.length > 0 ? `${filterDesignations.length} selected` : 'Designations'}</span>
                  <ChevronDown className="w-4 h-4 ml-2 text-slate-400" />
                </button>
                {showDesignationDropdown && (
                  <div className="absolute z-20 mt-2 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    <div className="p-2">
                      <label className="flex items-center gap-2 text-slate-300 text-sm mb-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterDesignations.length === 0}
                          onChange={() => setFilterDesignations([])}
                        />
                        All
                      </label>
                      {uniqueDesignations.map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-slate-200 text-sm mb-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filterDesignations.includes(opt)}
                            onChange={() => {
                              setFilterDesignations(prev => prev.includes(opt)
                                ? prev.filter(d => d !== opt)
                                : [...prev, opt]);
                            }}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Team Dropdown Filter */}
              <div className="relative min-w-45">
                <button
                  type="button"
                  className="w-full bg-slate-800/50 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-2.5 flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                  onClick={() => setShowTeamDropdown(v => !v)}
                >
                  <span>{filterTeams.length > 0 ? `${filterTeams.length} selected` : 'Teams'}</span>
                  <ChevronDown className="w-4 h-4 ml-2 text-slate-400" />
                </button>
                {showTeamDropdown && (
                  <div className="absolute z-20 mt-2 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    <div className="p-2">
                      <label className="flex items-center gap-2 text-slate-300 text-sm mb-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterTeams.length === 0}
                          onChange={() => setFilterTeams([])}
                        />
                        All
                      </label>
                      {uniqueTeams.map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-slate-200 text-sm mb-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filterTeams.includes(opt)}
                            onChange={() => {
                              setFilterTeams(prev => prev.includes(opt)
                                ? prev.filter(t => t !== opt)
                                : [...prev, opt]);
                            }}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* User Dropdown Filter */}
              <div className="relative min-w-45">
                <button
                  type="button"
                  className="w-full bg-slate-800/50 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-2.5 flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                  onClick={() => setShowUserDropdown(v => !v)}
                >
                  <span>{filterUsers.length > 0 ? `${filterUsers.length} selected` : 'Users'}</span>
                  <ChevronDown className="w-4 h-4 ml-2 text-slate-400" />
                </button>
                {showUserDropdown && (
                  <div className="absolute z-20 mt-2 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    <div className="p-2">
                      <label className="flex items-center gap-2 text-slate-300 text-sm mb-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterUsers.length === 0}
                          onChange={() => setFilterUsers([])}
                        />
                        All
                      </label>
                      {uniqueUserNames.map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-slate-200 text-sm mb-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filterUsers.includes(opt)}
                            onChange={() => {
                              setFilterUsers(prev => prev.includes(opt)
                                ? prev.filter(u => u !== opt)
                                : [...prev, opt]);
                            }}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFormData({ isActive: true, inactiveAsOf: undefined });
                  setIsAddingNew(true);
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-purple-500/20"
              >
                <Plus className="w-4 h-4" />
                Add Employee
              </button>

              <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-300 bg-slate-800/50 border border-slate-700/50 cursor-pointer shrink-0 select-none">
                <input
                  type="checkbox"
                  checked={showInactiveEmployees}
                  onChange={(e) => setShowInactiveEmployees(e.target.checked)}
                  className="rounded border-slate-600"
                />
                <span>
                  Show inactive
                  {inactiveUserCount > 0 ? ` (${inactiveUserCount})` : ''}
                </span>
              </label>

              <div className="h-8 w-px bg-slate-700 mx-1" />

              <button
                type="button"
                onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                className={`p-2.5 rounded-xl text-sm transition-all ${
                  showSettingsPanel
                    ? 'bg-slate-700 text-white ring-2 ring-slate-600'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800 bg-slate-800/50'
                }`}
                title="Settings: Custom Fields, Predefined Values, Excel Format"
              >
                <Settings className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleExportToExcel}
                className="p-2.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 bg-slate-800/50 rounded-xl text-sm transition-all"
                title="Export to Excel"
              >
                <Download className="w-4 h-4" />
              </button>

              <label
                className={`p-2.5 rounded-xl text-sm transition-all cursor-pointer ${
                  isUploading
                    ? 'text-slate-500 cursor-not-allowed bg-slate-800/30'
                    : 'text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 bg-slate-800/50'
                }`}
                title={isUploading ? 'Uploading...' : 'Bulk Upload from Excel'}
              >
                <Upload className="w-4 h-4" />
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleBulkUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tags */}
      {(searchTerm || filterDesignations.length > 0 || filterTeams.length > 0 || filterUsers.length > 0) && (
        <div className="px-6 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center gap-2">
          <span className="text-xs text-slate-500">Active filters:</span>
          {searchTerm && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/10 text-purple-400 text-xs rounded-lg border border-purple-500/20">
              Search: "{searchTerm}"
              <button onClick={() => setSearchTerm('')} className="hover:text-purple-300">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filterDesignations.map(designation => (
            <span key={designation} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-lg border border-blue-500/20">
              {designation}
              <button onClick={() => setFilterDesignations(filterDesignations.filter(d => d !== designation))} className="hover:text-blue-300">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filterTeams.map(team => (
            <span key={team} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-lg border border-emerald-500/20">
              {team}
              <button onClick={() => setFilterTeams(filterTeams.filter(t => t !== team))} className="hover:text-emerald-300">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filterUsers.map(user => (
            <span key={user} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-pink-500/10 text-pink-400 text-xs rounded-lg border border-pink-500/20">
              {user}
              <button onClick={() => setFilterUsers(filterUsers.filter(u => u !== user))} className="hover:text-pink-300">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            onClick={() => { setSearchTerm(''); setFilterDesignations([]); setFilterTeams([]); setFilterUsers([]); }}
            className="text-xs text-slate-500 hover:text-slate-300 ml-2"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Settings Panel - Only visible when Settings button is clicked */}
      {showSettingsPanel && (
        <div className="bg-slate-900/30 border-b border-slate-800">
          {/* Panel Header */}
          <div className="px-6 py-3 bg-slate-800/30 border-b border-slate-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Settings & Configuration</span>
            </div>
            <button
              onClick={() => setShowSettingsPanel(false)}
              className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Additional Info Fields - Collapsible */}
          <div className="border-b border-slate-800/50">
          <button
            onClick={() => setShowAdditionalFields(!showAdditionalFields)}
            className="w-full px-6 py-3 flex items-center justify-between text-left hover:bg-slate-800/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
                <Tag className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-200">Custom Fields</div>
                <div className="text-xs text-slate-500">
                  {allExtraLabels.length} additional fields configured
                </div>
              </div>
            </div>
            <div className={`p-1 rounded-lg transition-transform ${showAdditionalFields ? 'rotate-180' : ''}`}>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
          </button>
          
          {showAdditionalFields && (
            <div className="px-6 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1">
                {allExtraLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allExtraLabels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 text-xs text-slate-200 border border-slate-700/50 group"
                      >
                        <span>{label}</span>
                        <button
                          type="button"
                          className="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={async () => {
                            if (!window.confirm(`Remove field "${label}" from all employees?`)) return;
                            try {
                              const res = await fetch('/api/users/extra-info', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ label }),
                              });
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
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No custom fields configured. Add one to get started.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="New field name..."
                  value={newExtraLabel}
                  onChange={(e) => setNewExtraLabel(e.target.value)}
                  className="bg-slate-800/50 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 min-w-40"
                />
                <button
                  type="button"
                  onClick={handleAddGlobalExtraLabel}
                  disabled={isSavingExtraLabel || !newExtraLabel.trim()}
                  className="px-4 py-2.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isSavingExtraLabel ? 'Adding...' : 'Add Field'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Predefined Values Management - Collapsible */}
        <div className="border-b border-slate-800/50">
          <button
            onClick={() => setShowPredefinedValues(!showPredefinedValues)}
            className="w-full px-6 py-3 flex items-center justify-between text-left hover:bg-slate-800/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
                <Settings className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-200">Predefined Values</div>
                <div className="text-xs text-slate-500">
                  Manage dropdown options for Team, Designation, Paid From, and Category
                </div>
              </div>
            </div>
            <div className={`p-1 rounded-lg transition-transform ${showPredefinedValues ? 'rotate-180' : ''}`}>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
          </button>

          {showPredefinedValues && (
            <div className="px-6 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Teams */}
                <button
                  onClick={() => setPredefinedModal({ type: 'team', isOpen: true })}
                  className="flex items-center justify-between p-4 bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-slate-200">Teams</div>
                      <div className="text-xs text-slate-500">{predefinedValues.teams.length} values</div>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 -rotate-90" />
                </button>

                {/* Designations */}
                <button
                  onClick={() => setPredefinedModal({ type: 'designation', isOpen: true })}
                  className="flex items-center justify-between p-4 bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-slate-200">Designations</div>
                      <div className="text-xs text-slate-500">{predefinedValues.designations.length} values</div>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 -rotate-90" />
                </button>

                {/* Paid From */}
                <button
                  onClick={() => setPredefinedModal({ type: 'paidFrom', isOpen: true })}
                  className="flex items-center justify-between p-4 bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-slate-200">Paid From</div>
                      <div className="text-xs text-slate-500">{predefinedValues.paidFrom.length} values</div>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 -rotate-90" />
                </button>

                {/* Categories */}
                <button
                  onClick={() => setPredefinedModal({ type: 'category', isOpen: true })}
                  className="flex items-center justify-between p-4 bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                      <Tag className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-slate-200">Categories</div>
                      <div className="text-xs text-slate-500">{predefinedValues.categories.length} values</div>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 -rotate-90" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bulk Upload Format - Collapsible */}
        <div className="border-b border-slate-800/50">
          <button
            onClick={() => setShowBulkUploadFormat(!showBulkUploadFormat)}
            className="w-full px-6 py-3 flex items-center justify-between text-left hover:bg-slate-800/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-200">Excel Upload Format</div>
                <div className="text-xs text-slate-500">
                  View expected column headers for bulk import
                </div>
              </div>
            </div>
            <div className={`p-1 rounded-lg transition-transform ${showBulkUploadFormat ? 'rotate-180' : ''}`}>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
          </button>

          {showBulkUploadFormat && (
            <div className="px-6 pb-4">
              <div className="bg-slate-800/30 rounded-xl p-4 mb-3 border border-slate-700/30">
                <h4 className="text-sm font-medium text-slate-200 mb-3">Expected Column Headers</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
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
                    'Work Timings'
                  ].map((column, index) => (
                    <div
                      key={index}
                      className={`text-xs px-3 py-2 rounded-lg border ${
                        column === 'Name' 
                          ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' 
                          : 'text-slate-300 bg-slate-800/40 border-slate-700/50'
                      }`}
                    >
                      {column}
                      {column === 'Name' && <span className="ml-1 text-emerald-400">*</span>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  <span className="text-emerald-400">*</span> Required field. All other columns are optional.
                </p>
              </div>
              <div className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/20">
                <p className="text-sm text-blue-300">
                  <strong className="text-blue-400">💡 Pro Tip:</strong> Use the Export button to download a template with all current employees, then modify it and upload the updated data.
                </p>
              </div>

              {/* Leave Balance Upload Section */}
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <h4 className="text-sm font-medium text-slate-200 mb-3">Leave Balance Upload</h4>
                <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
                  <p className="text-xs text-slate-400 mb-3">
                    Upload an Excel file with leave balance data. Required columns:
                  </p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="text-xs px-3 py-2 rounded-lg text-emerald-300 bg-emerald-500/10 border border-emerald-500/30">
                      Name <span className="text-emerald-400">*</span>
                    </span>
                    <span className="text-xs px-3 py-2 rounded-lg text-emerald-300 bg-emerald-500/10 border border-emerald-500/30">
                      Leaves Allowed <span className="text-emerald-400">*</span>
                    </span>
                    <span className="text-xs px-3 py-2 rounded-lg text-emerald-300 bg-emerald-500/10 border border-emerald-500/30">
                      Total Leaves Taken (Current+Previous Years) <span className="text-emerald-400">*</span>
                    </span>
                  </div>
                  <label
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm cursor-pointer transition-all ${
                      isUploading
                        ? 'text-slate-500 cursor-not-allowed bg-slate-800/30'
                        : 'text-white bg-amber-600 hover:bg-amber-500'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    {isUploading ? 'Uploading...' : 'Upload Leave Balance Excel'}
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
      )}

      {/* Error/Success Messages */}
      {error && (
        <div className="mx-6 mt-4 bg-rose-500/10 text-rose-300 px-4 py-3 rounded-xl border border-rose-500/20 flex items-center gap-3">
          <div className="w-8 h-8 bg-rose-500/20 rounded-lg flex items-center justify-center shrink-0">
            <X className="w-4 h-4 text-rose-400" />
          </div>
          <span className="text-sm">{error}</span>
        </div>
      )}

      {uploadStats && (
        <div className="mx-6 mt-4">
          <div className="bg-emerald-500/10 text-emerald-300 px-4 py-3 rounded-xl border border-emerald-500/20 flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Upload className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-sm">
              <strong>Upload Complete:</strong> {uploadStats.updated} updated, {uploadStats.created} created
              {uploadStats.failed > 0 && <span className="text-rose-400 ml-2">, {uploadStats.failed} failed</span>}
              {uploadStats.message && (
                <div className="text-xs text-emerald-400/80 mt-1 italic">
                  {uploadStats.message}
                </div>
              )}
            </div>
          </div>
          {uploadStats.errors && uploadStats.errors.length > 0 && (
            <div className="mt-2 bg-rose-950/20 border border-rose-900/30 rounded-xl p-4 max-h-40 overflow-y-auto">
              <p className="text-xs font-semibold text-rose-300 mb-2">Error Details:</p>
              <ul className="text-xs text-rose-400/80 space-y-1">
                {uploadStats.errors.map((err: string | number | bigint | boolean | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | React.ReactPortal | Promise<string | number | bigint | boolean | React.ReactPortal | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | null | undefined> | null | undefined, idx: React.Key | null | undefined) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Employee Table */}
      <div className="p-6">
        <div className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden">
          {/* Table Header */}
          <div className="px-4 py-3 bg-slate-800/30 border-b border-slate-800 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">
              {filteredUsers.length === users.length 
                ? `${users.length} employees` 
                : `Showing ${filteredUsers.length} of ${users.length} employees`}
            </span>
          </div>

          {loading ? (
            <EmployeeManagementTableSkeleton />
          ) : filteredUsers.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-600" />
              </div>
              <p className="text-slate-400 text-sm">
                {users.length === 0 
                  ? 'No employees found. Add an employee or upload from Excel to get started.' 
                  : 'No employees match your search criteria.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/50 text-slate-400 font-medium text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3.5">Employee</th>
                    <th className="px-4 py-3.5 hidden md:table-cell">Email</th>
                    <th className="px-4 py-3.5 hidden lg:table-cell">Team</th>
                    <th className="px-4 py-3.5 hidden sm:table-cell">Designation</th>
                    <th className="px-4 py-3.5 hidden xl:table-cell">Joined</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredUsers.map((user, index) => (
                    <tr 
                      key={user._id} 
                      className={`hover:bg-slate-800/30 transition-colors ${index % 2 === 0 ? 'bg-slate-900/20' : ''}`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-linear-to-br from-purple-500/20 to-purple-700/20 rounded-xl flex items-center justify-center border border-purple-500/20">
                            <span className="text-sm font-semibold text-purple-400">
                              {user.name?.charAt(0).toUpperCase() || '?'}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-slate-200">{user.name}</p>
                              {isUserMarkedInactive(user) && (
                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
                                  Inactive
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 font-mono">{user.odId || user.employeeCode || '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-slate-400">{user.email || '-'}</span>
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <span className="text-slate-400">{user.workingUnderPartner || user.team || '-'}</span>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        {user.designation ? (
                          <span className="inline-flex px-2.5 py-1 bg-slate-800/50 text-slate-300 text-xs rounded-lg border border-slate-700/50">
                            {user.designation}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 hidden xl:table-cell">
                        <span className="text-slate-400">
                          {user.joiningDate ? new Date(user.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditClick(user)}
                            className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all"
                            title="Edit Employee"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user)}
                            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                            title="Deactivate employee"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Predefined Values Modal */}
      {predefinedModal.isOpen && predefinedModal.type && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-700/50 bg-slate-800/30">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  predefinedModal.type === 'team' ? 'bg-blue-500/10' :
                  predefinedModal.type === 'designation' ? 'bg-purple-500/10' :
                  predefinedModal.type === 'paidFrom' ? 'bg-emerald-500/10' : 'bg-amber-500/10'
                }`}>
                  {predefinedModal.type === 'team' && <Users className="w-5 h-5 text-blue-400" />}
                  {predefinedModal.type === 'designation' && <Briefcase className="w-5 h-5 text-purple-400" />}
                  {predefinedModal.type === 'paidFrom' && <CreditCard className="w-5 h-5 text-emerald-400" />}
                  {predefinedModal.type === 'category' && <Tag className="w-5 h-5 text-amber-400" />}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-200">
                    {predefinedModal.type === 'team' ? 'Teams' :
                     predefinedModal.type === 'designation' ? 'Designations' :
                     predefinedModal.type === 'paidFrom' ? 'Paid From' : 'Categories'}
                  </h3>
                  <p className="text-xs text-slate-500">Manage dropdown options</p>
                </div>
              </div>
              <button
                onClick={() => setPredefinedModal({ type: null, isOpen: false })}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-80 overflow-y-auto">
              <div className="space-y-2">
                {(() => {
                  const values = predefinedModal.type === 'team' ? predefinedValues.teams :
                                predefinedModal.type === 'designation' ? predefinedValues.designations :
                                predefinedModal.type === 'paidFrom' ? predefinedValues.paidFrom :
                                predefinedValues.categories;

                  return values.length > 0 ? (
                    values.map((value) => (
                      <div
                        key={value}
                        className="flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 group transition-colors"
                      >
                        <span className="text-sm text-slate-200">{value}</span>
                        <button
                          type="button"
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                          onClick={() => handleRemovePredefinedValue(
                            predefinedModal.type === 'team' ? 'teams' :
                            predefinedModal.type === 'designation' ? 'designations' :
                            predefinedModal.type === 'paidFrom' ? 'paidFrom' : 'categories',
                            value
                          )}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                        {predefinedModal.type === 'team' && <Users className="w-6 h-6 text-slate-600" />}
                        {predefinedModal.type === 'designation' && <Briefcase className="w-6 h-6 text-slate-600" />}
                        {predefinedModal.type === 'paidFrom' && <CreditCard className="w-6 h-6 text-slate-600" />}
                        {predefinedModal.type === 'category' && <Tag className="w-6 h-6 text-slate-600" />}
                      </div>
                      <p className="text-sm text-slate-500">
                        No {predefinedModal.type === 'team' ? 'teams' :
                            predefinedModal.type === 'designation' ? 'designations' :
                            predefinedModal.type === 'paidFrom' ? 'paid from values' : 'categories'} yet
                      </p>
                      <p className="text-xs text-slate-600 mt-1">Add one below to get started</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="p-5 border-t border-slate-700/50 bg-slate-800/20">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Add ${predefinedModal.type === 'team' ? 'team' :
                                      predefinedModal.type === 'designation' ? 'designation' :
                                      predefinedModal.type === 'paidFrom' ? 'paid from' : 'category'}...`}
                  value={newPredefinedValue.type === predefinedModal.type ? newPredefinedValue.value : ''}
                  onChange={(e) => setNewPredefinedValue({
                    type: predefinedModal.type!,
                    value: e.target.value
                  })}
                  className="flex-1 bg-slate-800/50 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddPredefinedValue()}
                />
                <button
                  onClick={() => {
                    setNewPredefinedValue({
                      type: predefinedModal.type!,
                      value: newPredefinedValue.type === predefinedModal.type ? newPredefinedValue.value : ''
                    });
                    handleAddPredefinedValue();
                  }}
                  disabled={isSavingPredefinedValue || (newPredefinedValue.type === predefinedModal.type && !newPredefinedValue.value.trim())}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSavingPredefinedValue ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
