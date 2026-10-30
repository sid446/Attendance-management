import { useState, useEffect, ChangeEvent, useMemo, useCallback, useRef } from 'react';
import { Edit2, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ScheduleTime, DailySchedule } from '@/types/ui';
import { fullEditDefaults, type EmployeeManagementTabId } from '@/lib/hrConsolePermissionUtils';
import { pickEditableUserPutBody, pickEditableFieldHistories, stripStaleManagedFieldHistories } from '@/lib/hrEmployeeSaveFilter';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { confirmMajorAction } from '@/lib/confirmMajorAction';
import { getActiveFieldHistoryEntry } from '@/lib/userFieldHistory';
import { createDefaultDailySchedule, cloneDailySchedule } from '@/lib/defaultDailySchedule';
import { isArticleEmployee } from '@/lib/isArticleEmployee';
import { ScheduleTemplateModal, type ScheduleTemplateRecord } from '@/components/schedule-template-modal';
import type { EmployeeManagementSectionProps, User, ManagedFieldKey, FieldHistoryKey, SalaryHistoryFieldKey } from '../types';
import { USERS_LIST_ENDPOINT } from '../constants';
import { getDefaultManagedEffectiveDates, isUserMarkedInactive, toDateInputValue, getManagedEffectiveDatesFromUser, normalizeMongoId, employeeMatchesSearchTerm, sortSalaryHistoryDesc, formatSalaryHistoryRowDate } from '../utils/employeeManagementUtils';

export function useEmployeeManagementSectionLogic({
  selectedUserId,
  onRefreshUsers,
  employeesSectionAccess = 'edit',
  employeeTabAccess: employeeTabAccessProp,
}: EmployeeManagementSectionProps) {
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
  const [filterCompanies, setFilterCompanies] = useState<string[]>([]);
  const [filterUsers, setFilterUsers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  /** When false, deactivated employees are hidden from the table (still in data for export / re-activate). */
  const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);
  // Dropdown visibility state
  const [showDesignationDropdown, setShowDesignationDropdown] = useState(false);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
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
  // Company = Paid From (AAACA, AAAFC, ATC, AFS, …)
  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    for (const value of predefinedValues.paidFrom) {
      const trimmed = String(value || '').trim();
      if (trimmed) set.add(trimmed);
    }
    for (const user of users) {
      const trimmed = String(user.paidFrom || '').trim();
      if (trimmed) set.add(trimmed);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [users, predefinedValues.paidFrom]);

  /** Work partner dropdown: predefined teams + partners already used in the org + current form value. */
  const workPartnerSelectOptions = useMemo(() => {
    const options = new Set<string>();
    for (const value of predefinedValues.teams) {
      const trimmed = String(value || '').trim();
      if (trimmed) options.add(trimmed);
    }
    for (const value of uniqueTeams) {
      const trimmed = String(value || '').trim();
      if (trimmed) options.add(trimmed);
    }
    const current = String(formData.workingUnderPartner || formData.team || '').trim();
    if (current) options.add(current);
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [predefinedValues.teams, uniqueTeams, formData.workingUnderPartner, formData.team]);
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
    const activePartner = getActiveFieldHistoryEntry((user as any).fieldHistories?.workingUnderPartner);
    const resolvedPartner = String(
      activePartner?.value || user.workingUnderPartner || user.team || ''
    ).trim();

    const formDataCopy: Partial<User> = {
      ...user,
      joiningDate: toDateInputValue(user.joiningDate),
      inactiveAsOf: toDateInputValue(user.inactiveAsOf) || undefined,
      anniversaryDate: toDateInputValue(user.anniversaryDate) || undefined,
      dateOfBirth: toDateInputValue(user.dateOfBirth) || undefined,
      articleshipStartDate: toDateInputValue(user.articleshipStartDate) || undefined,
      nextAttemptDueDate: toDateInputValue(user.nextAttemptDueDate) || undefined,
      verticalTransfer1FromDate: toDateInputValue(user.verticalTransfer1FromDate) || undefined,
      verticalTransfer2FromDate: toDateInputValue(user.verticalTransfer2FromDate) || undefined,
      workingUnderPartner: resolvedPartner || user.workingUnderPartner,
      team: resolvedPartner || user.workingUnderPartner || user.team || '',
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
    if (isUserMarkedInactive(user)) {
      alert('This employee is already inactive. Use permanent delete if you want to remove them.');
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

  const handlePermanentDeleteUser = async (user: User) => {
    if (!employeesCanEdit || tabAccess.basic !== 'edit') {
      alert('You do not have permission to delete employees.');
      return;
    }
    if (!isUserMarkedInactive(user)) {
      alert('Mark the employee inactive first, then you can delete them permanently.');
      return;
    }
    if (
      !confirmMajorAction(`Permanently delete employee "${user.name}"`, [
        'This cannot be undone.',
        'Their account and related attendance data will be removed forever.',
      ])
    ) {
      return;
    }
    if (
      !window.confirm(
        `Are you really sure you want to permanently delete "${user.name}"?\n\nThis action cannot be undone.`
      )
    ) {
      return;
    }

    const id = normalizeMongoId(user._id);
    if (!id) {
      alert('Missing employee id. Please refresh the page and try again.');
      return;
    }

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(id)}?permanent=true`,
        hrCredentialsInit({ method: 'DELETE' })
      );

      const text = await response.text();
      let result: { success?: boolean; error?: string } = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        alert(`Permanent delete failed (bad response). HTTP ${response.status}.`);
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to permanently delete user');
      }

      setUsers((prev) => prev.filter((u) => normalizeMongoId(u._id) !== id));
      if (editingUser && normalizeMongoId(editingUser._id) === id) {
        handleCancelEdit();
      }
      if (onRefreshUsers) {
        onRefreshUsers();
      }
      await fetchUsers({ soft: true });
      alert(`"${user.name}" was permanently deleted.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to permanently delete user');
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
      const rawPrepared = { ...formData } as Record<string, unknown>;
      if (rawPrepared.workingUnderPartner !== undefined) {
        rawPrepared.team = rawPrepared.workingUnderPartner;
      }
      stripStaleManagedFieldHistories(rawPrepared, (editingUser as User).fieldHistories);
      const prepared = prepareFormDataForSave(rawPrepared) as Record<string, unknown>;
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
        dateOfBirth: findCol(['Date of Birth', 'DOB', 'Birth Date']),
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
        mobileAllowance: findCol(['Mobile Allowance']),
        totalSalaryPerMonth: findCol(['Total Salary (P/M)', 'Total Salary Per Month']),
        totalSalaryPerAnnum: findCol(['Per Annum', 'Total Salary Per Annum', 'Per Annum FY 26-27']),
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
        vt1From: findCol(['1st Vertical Transfer from', '1st Vertical Transfer\nfrom']),
        vt1To: findCol(['1st Vertical Transfer to', '1st Vertical Transfer\nto']),
        vt1FromDate: findCol(['1st Vertical Transfer from (date)', '1st Vertical Transfer\nfrom (date)']),
        vt2From: findCol(['2nd Vertical Transfer from', '2nd Vertical Transfer\nfrom']),
        vt2To: findCol(['2nd Vertical Transfer to', '2nd Vertical Transfer\nto']),
        vt2FromDate: findCol(['2nd Vertical Transfer from (date)', '2nd Vertical Transfer\nfrom (date)']),
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
          const isArticle = isArticleEmployee({
            designation: getVal(idx.designation),
            employmentType: getVal(idx.employmentType),
          });
          leaveBalance = {
            balanceAsOfJan26: bf,
            earned: 0,
            used: 0,
            leaveAdjLwp: 0,
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
          dateOfBirth: formatExcelDate(row[idx.dateOfBirth]),
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
          mobileAllowance: getVal(idx.mobileAllowance),
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
          verticalTransfer1From: getVal(idx.vt1From),
          verticalTransfer1To: getVal(idx.vt1To),
          verticalTransfer1FromDate: formatExcelDate(row[idx.vt1FromDate]),
          verticalTransfer2From: getVal(idx.vt2From),
          verticalTransfer2To: getVal(idx.vt2To),
          verticalTransfer2FromDate: formatExcelDate(row[idx.vt2FromDate]),
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
      // Leave Adj/LWP (preferred) or legacy "Total Leaves Taken"
      const takenIdx = headers.findIndex(
        (h) =>
          h &&
          (h.includes('adj') ||
            h.includes('lwp') ||
            (h.includes('total') && h.includes('taken')))
      );

      if (nameIdx === -1) {
        throw new Error('Could not find "Name" column');
      }
      if (allowedIdx === -1) {
        throw new Error('Could not find "Leaves Allowed" column');
      }
      if (takenIdx === -1) {
        throw new Error(
          'Could not find "Leave Adj/LWP" (or legacy "Total Leaves Taken") column.'
        );
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

  const filteredUsers = users
    .filter((user) => {
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
      if (filterCompanies.length > 0 && !filterCompanies.includes(String(user.paidFrom || '').trim())) {
        return false;
      }
      // Multi-select User filter
      if (filterUsers.length > 0 && !filterUsers.includes(user.name || '')) {
        return false;
      }
      // Search term filter (name, login email, attendance email, codes, team, …)
      if (searchTerm && !employeeMatchesSearchTerm(user, searchTerm)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aTime = a.joiningDate ? new Date(a.joiningDate).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.joiningDate ? new Date(b.joiningDate).getTime() : Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base',
      });
    });

  const handleExportToExcel = async () => {
    if (!filteredUsers.length) {
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

    // Column order + headings match Master headings.xlsx exactly.
    const baseColumns = [
      { key: 'srNo', header: 'Sr No', width: 8 },
      { key: 'employeeCode', header: 'Employee Code', width: 15 },
      { key: 'name', header: 'Name', width: 22 },
      { key: 'joiningDate', header: 'Date of Joining -in Asija', width: 22 },
      { key: 'registrationNo', header: 'Registration / Membership No.', width: 25 },
      { key: 'designation', header: 'Designation', width: 18 },
      { key: 'category', header: 'Category', width: 12 },
      { key: 'registeredUnderPartner', header: 'Registered Under Partner', width: 22 },
      { key: 'workingUnderPartner', header: 'Working Under Partner', width: 20 },
      { key: 'attendanceEmail', header: 'Attendance Email', width: 28 },
      { key: 'gender', header: 'Gender', width: 10 },
      { key: 'dateOfBirth', header: 'Date of Birth', width: 15 },
      { key: 'email', header: 'Asija Mail ID', width: 28 },
      { key: 'alternateEmail', header: 'Alternate Mail Id', width: 25 },
      { key: 'aadhaarNumber', header: 'Aadhar No.', width: 15 },
      { key: 'panNumber', header: 'PAN', width: 12 },
      { key: 'mobileNumber', header: 'Cell No.', width: 15 },
      { key: 'alternateMobileNumber', header: 'Alternate No.', width: 15 },
      { key: 'address1', header: 'Address 1', width: 35 },
      { key: 'address2', header: 'Address 2', width: 35 },
      { key: 'qualificationLevel', header: 'Qualification Level', width: 18 },
      { key: 'parentName', header: 'Parents/Guardians Names', width: 25 },
      { key: 'parentOccupation', header: 'Parents/Guardians Occupation', width: 25 },
      { key: 'emergencyContactNo', header: 'Emergency Contact No.', width: 18 },
      { key: 'emergencyContactRelation', header: 'Relation', width: 12 },
      { key: 'articleshipStartDate', header: 'CA Articleship Start Date', width: 20 },
      { key: 'transferCase', header: 'Transfer Case', width: 14 },
      { key: 'firstYearArticleship', header: '1st Yr of CA Articleship', width: 18 },
      { key: 'secondYearArticleship', header: '2nd Yr of CA Articleship', width: 18 },
      { key: 'thirdYearArticleship', header: '3rd Yr of CA Articleship', width: 18 },
      { key: 'nextAttemptDueDate', header: 'Next Attempt Due Date', width: 20 },
      { key: 'filledScholarship', header: 'Filled Scholarship', width: 16 },
      { key: 'paidFrom', header: 'Paid From', width: 12 },
      { key: 'tallyName', header: 'Tally Name', width: 18 },
      { key: 'bankName', header: 'Bank Name', width: 20 },
      { key: 'branchName', header: 'Branch Name', width: 18 },
      { key: 'accountNumber', header: 'Account No.', width: 18 },
      { key: 'ifscCode', header: 'IFSC', width: 12 },
      { key: 'accountType', header: 'Type of Account', width: 15 },
      { key: 'accountHolderName', header: 'Name of Account Holder', width: 22 },
      { key: 'basicSalary', header: 'Basic Salary/Stipend/Fees', width: 22 },
      { key: 'laptopAllowance', header: 'Laptop Allowance', width: 16 },
      { key: 'mobileAllowance', header: 'Mobile Allowance', width: 16 },
      { key: 'otherAllowance', header: 'Other Allowance', width: 16 },
      {
        key: 'totalSalaryPerMonth',
        header: 'Total Salary (P/M)\n(Changed on 01.04.26)',
        width: 18,
      },
      { key: 'perAnnumFy2627', header: 'Per Annum FY 26-27', width: 16 },
      { key: 'perAnnumFy2526', header: 'Per Annum FY 25-26', width: 16 },
      { key: 'pf', header: 'PF', width: 10 },
      { key: 'esi', header: 'ESI', width: 10 },
      { key: 'verticalTransfer1From', header: '1st Vertical Transfer\nfrom', width: 16 },
      { key: 'verticalTransfer1To', header: '1st Vertical Transfer\nto', width: 16 },
      { key: 'verticalTransfer1FromDate', header: '1st Vertical Transfer\nfrom (date)', width: 16 },
      { key: 'verticalTransfer2From', header: '2nd Vertical Transfer\nfrom', width: 16 },
      { key: 'verticalTransfer2To', header: '2nd Vertical Transfer\nto', width: 16 },
      { key: 'verticalTransfer2FromDate', header: '2nd Vertical Transfer\nfrom (date)', width: 16 },
      { key: 'status', header: 'Status', width: 12 },
      { key: 'dateOfLeaving', header: 'Date of Leaving', width: 16 },
    ];

    worksheet.columns = baseColumns;

    // Helper to format date (accepts string or Date from inactiveAsOf / joiningDate / etc.)
    const toDateString = (value?: string | Date | null) => {
      if (value == null || value === '') return '';
      const d = value instanceof Date ? value : new Date(value);
      if (isNaN(d.getTime())) return '';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    // Add data rows (same filtered list shown in the table)
    filteredUsers.forEach((u, index) => {
      const inactive = isUserMarkedInactive(u);
      const rowData: { [key: string]: any } = {
        srNo: index + 1,
        employeeCode: u.employeeCode || '',
        name: u.name || '',
        joiningDate: toDateString(u.joiningDate),
        registrationNo: u.registrationNo || '',
        designation: u.designation || '',
        category: u.category || '',
        registeredUnderPartner: u.registeredUnderPartner || '',
        workingUnderPartner: u.workingUnderPartner || '',
        attendanceEmail: u.attendanceEmail || '',
        gender: u.gender || '',
        dateOfBirth: toDateString(u.dateOfBirth),
        email: u.email || '',
        alternateEmail: u.alternateEmail || '',
        aadhaarNumber: u.aadhaarNumber || '',
        panNumber: u.panNumber || '',
        mobileNumber: u.mobileNumber || '',
        alternateMobileNumber: u.alternateMobileNumber || '',
        address1: u.address1 || '',
        address2: u.address2 || '',
        qualificationLevel: u.qualificationLevel || '',
        parentName: u.parentName || '',
        parentOccupation: u.parentOccupation || '',
        emergencyContactNo: u.emergencyContactNo || '',
        emergencyContactRelation: u.emergencyContactRelation || '',
        articleshipStartDate: toDateString(u.articleshipStartDate),
        transferCase: u.transferCase || '',
        firstYearArticleship: u.firstYearArticleship || '',
        secondYearArticleship: u.secondYearArticleship || '',
        thirdYearArticleship: u.thirdYearArticleship || '',
        nextAttemptDueDate: toDateString(u.nextAttemptDueDate),
        filledScholarship: u.filledScholarship || '',
        paidFrom: u.paidFrom || '',
        tallyName: u.tallyName || '',
        bankName: u.bankName || '',
        branchName: u.branchName || '',
        accountNumber: u.accountNumber || '',
        ifscCode: u.ifscCode || '',
        accountType: u.accountType || '',
        accountHolderName: u.accountHolderName || '',
        basicSalary: u.basicSalary || '',
        laptopAllowance: u.laptopAllowance || '',
        mobileAllowance: u.mobileAllowance || '',
        otherAllowance: u.otherAllowance || '',
        totalSalaryPerMonth: u.totalSalaryPerMonth || '',
        perAnnumFy2627: u.totalSalaryPerAnnum || '',
        perAnnumFy2526: '', // Historical FY column — not stored separately; Per Annum stays as totalSalaryPerAnnum
        pf: u.pf || '',
        esi: u.esi || '',
        verticalTransfer1From: u.verticalTransfer1From || '',
        verticalTransfer1To: u.verticalTransfer1To || '',
        verticalTransfer1FromDate: toDateString(u.verticalTransfer1FromDate),
        verticalTransfer2From: u.verticalTransfer2From || '',
        verticalTransfer2To: u.verticalTransfer2To || '',
        verticalTransfer2FromDate: toDateString(u.verticalTransfer2FromDate),
        status: inactive ? 'Inactive' : 'Active',
        dateOfLeaving: inactive ? toDateString(u.inactiveAsOf) : '',
      };

      worksheet.addRow(rowData);
    });

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 42;

    // Color groups aligned to Master headings.xlsx column order
    const colorGroups = {
      identity: { start: 1, end: 10, color: 'FF283593' }, // Sr–Attendance Email
      personal: { start: 11, end: 16, color: 'FF2E7D32' }, // Gender–PAN
      contact: { start: 17, end: 25, color: 'FF1565C0' }, // Cell–Relation
      articleship: { start: 26, end: 32, color: 'FF00838F' }, // CA articleship block
      payrollMeta: { start: 33, end: 34, color: 'FF4527A0' }, // Paid From / Tally
      bank: { start: 35, end: 40, color: 'FF00695C' }, // Bank
      salary: { start: 41, end: 49, color: 'FFC62828' }, // Salary / PF / ESI
      transfers: { start: 50, end: 55, color: 'FFD84315' }, // Vertical transfers
      status: { start: 56, end: 57, color: 'FF37474F' }, // Status + Date of Leaving
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

        // Left-align longer text columns (Name, emails, addresses, partners)
        const textColumns = [3, 8, 9, 10, 13, 14, 19, 20, 22, 23, 34, 40];
        cell.alignment = {
          vertical: 'middle',
          horizontal: textColumns.includes(colNumber) ? 'left' : 'center',
          wrapText: colNumber === 19 || colNumber === 20,
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

      const next = {
        ...prev,
        fieldHistories: histories,
        [field]: active?.value ?? '',
      } as Partial<User>;

      if (field === 'workingUnderPartner') {
        next.team = active?.value ?? '';
      }

      return next;
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

      if (field === 'workingUnderPartner') {
        next.team = active?.value ?? '';
      }

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
    if (denyEdits) return;

    if (field === 'workingUnderPartner') {
      setFormData((prev) => {
        const newData: Partial<User> = { ...prev, workingUnderPartner: value, team: value };
        if (value) {
          const partnerName = value.trim().toLowerCase();
          const partnerUser = users.find(
            (u) =>
              u.name?.toLowerCase().trim() === partnerName ||
              u.name?.toLowerCase().trim().replace(/\s+/g, '.') === partnerName ||
              u.name?.toLowerCase().trim().replace(/\./g, ' ') === partnerName
          );
          if (partnerUser) {
            newData.attendanceEmail = partnerUser.attendanceEmail || partnerUser.email || '';
          }
        }
        return newData;
      });
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
    const resolvedSelectOptions =
      inputType === 'select'
        ? Array.from(
            new Set([
              ...selectOptions,
              ...(currentValue.trim() ? [currentValue.trim()] : []),
            ])
          ).sort((a, b) => a.localeCompare(b))
        : selectOptions;

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
                            {resolvedSelectOptions.map((opt) => (
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
            disabled={denyEdits}
            className={`${inputCls} ${denyEdits ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <option value="">{selectEmptyLabel}</option>
            {resolvedSelectOptions.map((opt) => (
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
            disabled={denyEdits}
            className={`${inputCls} ${denyEdits ? 'cursor-not-allowed opacity-60' : ''}`}
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
                disabled={denyEdits}
                className={`${inputCls} ${denyEdits ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <option value="">{selectEmptyLabel}</option>
                {resolvedSelectOptions.map((opt) => (
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

  return {
    users,
    loading,
    error,
    editingUser,
    formData,
    setFormData,
    saveLoading,
    isAddingNew,
    setIsAddingNew,
    filterDesignations,
    setFilterDesignations,
    filterTeams,
    setFilterTeams,
    filterCompanies,
    setFilterCompanies,
    filterUsers,
    setFilterUsers,
    searchTerm,
    setSearchTerm,
    showInactiveEmployees,
    setShowInactiveEmployees,
    showDesignationDropdown,
    setShowDesignationDropdown,
    showTeamDropdown,
    setShowTeamDropdown,
    showCompanyDropdown,
    setShowCompanyDropdown,
    showUserDropdown,
    setShowUserDropdown,
    isUploading,
    uploadStats,
    showAdditionalFields,
    setShowAdditionalFields,
    activeTab,
    setActiveTab,
    showBulkUploadFormat,
    setShowBulkUploadFormat,
    showSettingsPanel,
    setShowSettingsPanel,
    tabAccess,
    employeesCanEdit,
    denyEdits,
    showPredefinedValues,
    setShowPredefinedValues,
    predefinedModal,
    setPredefinedModal,
    predefinedValues,
    predefinedValueInputRef,
    isSavingPredefinedValue,
    scheduleTemplates,
    setScheduleTemplateModal,
    employeeHistory,
    historyLoading,
    changeReason,
    setChangeReason,
    newExtraLabel,
    setNewExtraLabel,
    isSavingExtraLabel,
    uniqueDesignations,
    uniqueTeams,
    uniqueCompanies,
    workPartnerSelectOptions,
    uniqueUserNames,
    inactiveUserCount,
    fetchUsers,
    handleDeleteUser,
    handlePermanentDeleteUser,
    handleEditClick,
    handleCancelEdit,
    newEmploymentType,
    setNewEmploymentType,
    newEmploymentTypeDate,
    setNewEmploymentTypeDate,
    employmentTypeEditIdx,
    setEmploymentTypeEditIdx,
    employmentTypeEditValue,
    setEmploymentTypeEditValue,
    employmentTypeEditDate,
    setEmploymentTypeEditDate,
    handleInputChange,
    handleDeleteEmploymentTypeHistory,
    handleStartEditEmploymentTypeHistory,
    handleSaveEmploymentTypeHistoryEdit,
    handleAddEmploymentTypeHistory,
    handleExtraInfoChange,
    allExtraLabels,
    handleAddGlobalExtraLabel,
    handleAddPredefinedValue,
    handleRemovePredefinedValue,
    handleScheduleEntryChange,
    handleEffectiveFromChange,
    handleAddScheduleEntry,
    handleApplyScheduleTemplate,
    handleRemoveScheduleEntry,
    handleAddSeasonalSchedule,
    handleRemoveSeasonalSchedule,
    handleSeasonalScheduleFieldChange,
    handleSeasonalScheduleTimeChange,
    handleIsActiveChange,
    handleSave,
    handleCreateNew,
    handleBulkUpload,
    handleLeaveBalanceUpload,
    filteredUsers,
    handleExportToExcel,
    renderFieldWithHistory,
    renderSalaryFieldWithHistory,
    scheduleTemplateModalEl,
  } as const;
}
