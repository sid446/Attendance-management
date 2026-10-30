import React from 'react';
import { Edit2, Save, X, Plus, Upload, Trash2, Search, Download, ChevronDown, FileSpreadsheet, Settings, Users, UserCheck, Briefcase, CreditCard, Tag } from 'lucide-react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { confirmMajorAction } from '@/lib/confirmMajorAction';
import { ScheduleTemplateToolbar } from '@/components/schedule-template-toolbar';
import type { EmployeeManagementSectionProps, User } from './types';
import { EDIT_EMPLOYEE_WORKFLOW_STEPS, ADD_EMPLOYEE_WORKFLOW_STEPS } from './constants';
import { toDateInputValue, isUserMarkedInactive, formatInactiveSinceDate } from './utils';
import { EmployeeManagementTableSkeleton } from './components';
import { useEmployeeManagementSectionLogic } from './hooks';

export type { EmployeeManagementSectionProps } from './types';

export const EmployeeManagementSection: React.FC<EmployeeManagementSectionProps> = ({ selectedUserId, onRefreshUsers, employeesSectionAccess = 'edit', employeeTabAccess: employeeTabAccessProp }) => {
  const {
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
  } = useEmployeeManagementSectionLogic({
    selectedUserId,
    onRefreshUsers,
    employeesSectionAccess,
    employeeTabAccess: employeeTabAccessProp,
  });

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
                  selectOptions: workPartnerSelectOptions,
                  selectEmptyLabel: 'Select work partner',
                })}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Team <span className="text-slate-500">(matches Work Partner)</span></label>
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
                      {editingUser && isUserMarkedInactive(editingUser) && (
                        <button
                          type="button"
                          onClick={() => handlePermanentDeleteUser(editingUser)}
                          disabled={!employeesCanEdit || tabAccess.basic !== 'edit'}
                          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Delete this employee forever
                        </button>
                      )}
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={toDateInputValue((formData as any).dateOfBirth)}
                      onChange={(e) => handleInputChange('dateOfBirth' as keyof User, e.target.value)}
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

                <div className="md:col-span-3">
                  <h4 className="mb-3 border-b border-slate-200 pb-1 text-sm font-semibold text-slate-800">Vertical Transfers</h4>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">1st Vertical Transfer from</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer1From || ''}
                    onChange={(e) => handleInputChange('verticalTransfer1From' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">1st Vertical Transfer to</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer1To || ''}
                    onChange={(e) => handleInputChange('verticalTransfer1To' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">1st Vertical Transfer from (date)</label>
                  <input
                    type="date"
                    value={toDateInputValue((formData as any).verticalTransfer1FromDate)}
                    onChange={(e) => handleInputChange('verticalTransfer1FromDate' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">2nd Vertical Transfer from</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer2From || ''}
                    onChange={(e) => handleInputChange('verticalTransfer2From' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">2nd Vertical Transfer to</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer2To || ''}
                    onChange={(e) => handleInputChange('verticalTransfer2To' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">2nd Vertical Transfer from (date)</label>
                  <input
                    type="date"
                    value={toDateInputValue((formData as any).verticalTransfer2FromDate)}
                    onChange={(e) => handleInputChange('verticalTransfer2FromDate' as keyof User, e.target.value)}
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
                  <label className="block text-xs font-medium text-slate-600 mb-1">Mobile Allowance</label>
                  <input
                    type="text"
                    value={(formData as any).mobileAllowance || ''}
                    onChange={(e) => handleInputChange('mobileAllowance' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={toDateInputValue((formData as any).dateOfBirth)}
                      onChange={(e) => handleInputChange('dateOfBirth' as keyof User, e.target.value)}
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
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Mobile Allowance</label>
                    <input
                      type="text"
                      value={(formData as any).mobileAllowance || ''}
                      onChange={(e) => handleInputChange('mobileAllowance' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
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

                <div className="md:col-span-3">
                  <h4 className="mb-3 border-b border-slate-200 pb-1 text-sm font-semibold text-slate-800">Vertical Transfers</h4>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">1st Vertical Transfer from</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer1From || ''}
                    onChange={(e) => handleInputChange('verticalTransfer1From' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">1st Vertical Transfer to</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer1To || ''}
                    onChange={(e) => handleInputChange('verticalTransfer1To' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">1st Vertical Transfer from (date)</label>
                  <input
                    type="date"
                    value={toDateInputValue((formData as any).verticalTransfer1FromDate)}
                    onChange={(e) => handleInputChange('verticalTransfer1FromDate' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">2nd Vertical Transfer from</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer2From || ''}
                    onChange={(e) => handleInputChange('verticalTransfer2From' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">2nd Vertical Transfer to</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer2To || ''}
                    onChange={(e) => handleInputChange('verticalTransfer2To' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">2nd Vertical Transfer from (date)</label>
                  <input
                    type="date"
                    value={toDateInputValue((formData as any).verticalTransfer2FromDate)}
                    onChange={(e) => handleInputChange('verticalTransfer2FromDate' as keyof User, e.target.value)}
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
                  selectOptions: workPartnerSelectOptions,
                  selectEmptyLabel: 'Select work partner',
                })}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Team <span className="text-slate-500">(matches Work Partner)</span></label>
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={toDateInputValue((formData as any).dateOfBirth)}
                      onChange={(e) => handleInputChange('dateOfBirth' as keyof User, e.target.value)}
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
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Mobile Allowance</label>
                    <input
                      type="text"
                      value={(formData as any).mobileAllowance || ''}
                      onChange={(e) => handleInputChange('mobileAllowance' as keyof User, e.target.value)}
                      className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
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

                <div className="md:col-span-3">
                  <h4 className="mb-3 border-b border-slate-200 pb-1 text-sm font-semibold text-slate-800">Vertical Transfers</h4>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">1st Vertical Transfer from</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer1From || ''}
                    onChange={(e) => handleInputChange('verticalTransfer1From' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">1st Vertical Transfer to</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer1To || ''}
                    onChange={(e) => handleInputChange('verticalTransfer1To' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">1st Vertical Transfer from (date)</label>
                  <input
                    type="date"
                    value={toDateInputValue((formData as any).verticalTransfer1FromDate)}
                    onChange={(e) => handleInputChange('verticalTransfer1FromDate' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">2nd Vertical Transfer from</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer2From || ''}
                    onChange={(e) => handleInputChange('verticalTransfer2From' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">2nd Vertical Transfer to</label>
                  <input
                    type="text"
                    value={(formData as any).verticalTransfer2To || ''}
                    onChange={(e) => handleInputChange('verticalTransfer2To' as keyof User, e.target.value)}
                    className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">2nd Vertical Transfer from (date)</label>
                  <input
                    type="date"
                    value={toDateInputValue((formData as any).verticalTransfer2FromDate)}
                    onChange={(e) => handleInputChange('verticalTransfer2FromDate' as keyof User, e.target.value)}
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                    <UserCheck className="h-4 w-4 text-emerald-800" aria-hidden />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">{users.length - inactiveUserCount}</p>
                    <p className="text-xs text-slate-600">Active employees</p>
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
                  Search employees by name, email, attendance email, or code
                </label>
                <input
                  id="employee-list-search"
                  type="text"
                  role="searchbox"
                  autoComplete="off"
                  placeholder="Search name, @asija.in email, attendance email, code…"
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
                  onClick={() => setShowCompanyDropdown((v) => !v)}
                  aria-expanded={showCompanyDropdown}
                  aria-haspopup="listbox"
                >
                  <span>{filterCompanies.length > 0 ? `${filterCompanies.length} companies` : 'Company'}</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                </button>
                {showCompanyDropdown && (
                  <div
                    className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-blue-200/65 bg-panel py-1 shadow-lg"
                    role="listbox"
                    aria-label="Filter by company (paid from)"
                  >
                    <div className="p-2">
                      <label className="mb-1 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={filterCompanies.length === 0}
                          onChange={() => setFilterCompanies([])}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
                        />
                        All companies
                      </label>
                      {uniqueCompanies.map((opt) => (
                        <label key={opt} className="mb-1 flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            checked={filterCompanies.includes(opt)}
                            onChange={() => {
                              setFilterCompanies((prev) =>
                                prev.includes(opt) ? prev.filter((c) => c !== opt) : [...prev, opt]
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
      {(searchTerm || filterDesignations.length > 0 || filterTeams.length > 0 || filterCompanies.length > 0 || filterUsers.length > 0) && (
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
          {filterCompanies.map((company) => (
            <span
              key={company}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200/65 bg-panel px-2.5 py-1 text-xs text-slate-800"
            >
              {company}
              <button
                type="button"
                onClick={() => setFilterCompanies(filterCompanies.filter((c) => c !== company))}
                className="rounded p-0.5 text-slate-600 hover:bg-slate-100"
                aria-label={`Remove company ${company}`}
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
              setFilterCompanies([]);
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
                          Leave Adj/LWP <span className="text-emerald-800">*</span>
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
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" aria-hidden />
                        </button>
                        {inactive ? (
                          <button
                            type="button"
                            onClick={() => handlePermanentDeleteUser(user)}
                            disabled={!employeesCanEdit || tabAccess.basic !== 'edit'}
                            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-800 transition-colors hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Permanently delete ${user.name ?? 'employee'}`}
                            title="Permanently delete"
                          >
                            Delete forever
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user)}
                            disabled={!employeesCanEdit || tabAccess.basic !== 'edit'}
                            className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Deactivate ${user.name ?? 'employee'}`}
                            title="Mark inactive"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        )}
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
