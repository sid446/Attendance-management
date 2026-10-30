"use client";

import { X } from 'lucide-react';
import { DailySchedule } from '@/types/ui';
import dynamic from 'next/dynamic';
import { LoginView } from '@/components/login-view';
import { Sidebar } from '@/components/sidebar';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { useAttendanceUploadLogic } from './hooks';

const ArticleCreditsManager = dynamic(() => import('@/components/article-credits-manager').then((m) => m.ArticleCreditsManager));

const UploadSection = dynamic(() => import('@/components/upload').then((m) => m.UploadSection));

const SummarySection = dynamic(() => import('@/components/summary').then((m) => m.SummarySection));

const EmployeeMonthView = dynamic(() => import('@/components/employee-month-view').then((m) => m.EmployeeMonthView));

const EmployeeManagementSection = dynamic(() => import('@/components/employee-management').then((m) => m.EmployeeManagementSection));

const EmployeeMasterUploadSection = dynamic(() => import('@/components/employee-master-upload').then((m) => m.EmployeeMasterUploadSection));

const TeamAttendanceAccessSection = dynamic(() => import('@/components/team-attendance-access').then((m) => m.TeamAttendanceAccessSection));

const AttendanceRequestsSection = dynamic(() => import('@/components/attendance-requests').then((m) => m.AttendanceRequestsSection));

const HolidayManagement = dynamic(() => import('@/components/holiday-management').then((m) => m.HolidayManagement));

const BackupManagementSection = dynamic(() => import('@/components/backup-management').then((m) => m.BackupManagementSection));

const LeaveManagementSection = dynamic(() => import('@/components/leave-management').then((m) => m.LeaveManagementSection));

const FineManagementSection = dynamic(() => import('@/components/fine-management').then((m) => m.FineManagementSection));

const SalarySection = dynamic(() => import('@/components/salary').then((m) => m.SalarySection));

const InvalidAttendanceSection = dynamic(() => import('@/components/invalid-attendance').then((m) => m.InvalidAttendanceSection));

const EmployeeMisExceptionsSection = dynamic(() => import('@/components/employee-mis-exceptions').then((m) => m.EmployeeMisExceptionsSection));

const DaywiseCompareSection = dynamic(() => import('@/components/daywise-compare').then((m) => m.DaywiseCompareSection));

const ClientPlaceManagement = dynamic(() => import('@/components/client-place-management').then((m) => m.ClientPlaceManagement));

const HrConsoleAccessSection = dynamic(() => import('@/components/hr-console-access').then((m) => m.HrConsoleAccessSection));

const HrConsoleSettingsSection = dynamic(() => import('@/components/hr-console-settings').then((m) => m.HrConsoleSettingsSection));

export default function AttendanceUpload() {
  const {
    isAuthenticated,
    loginStep,
    setLoginStep,
    password,
    setPassword,
    otp,
    setOtp,
    setSessionId,
    setOtpExpiresAt,
    otpSecondsLeft,
    loginLoading,
    loginError,
    setLoginError,
    userEmail,
    userRole,
    loginEmail,
    setLoginEmail,
    file,
    files,
    fixedFile,
    fixedFiles,
    processing,
    error,
    setError,
    uploadErrors,
    saveMessage,
    summaries,
    allUsers,
    currentMonthYear,
    uploadTotal,
    uploadSaved,
    uploadFailed,
    activeSection,
    setActiveSection,
    backupPreviewDb,
    hrPermState,
    setHrPermState,
    selectedEmployeeId,
    setSelectedEmployeeId,
    selectedEmployeeMonth,
    setSelectedEmployeeMonth,
    employeeMonthModal,
    setEmployeeMonthModal,
    employeeManagementModal,
    setEmployeeManagementModal,
    employeeDays,
    employeeApprovedRequests,
    employeeLoading,
    employeeError,
    loadingSummaries,
    machineFormat,
    setMachineFormat,
    showAffectedModal,
    setShowAffectedModal,
    holidays,
    handlePasswordSubmit,
    processMultipleFiles,
    processMultipleFixedFiles,
    handleOTPSubmit,
    handleLogout,
    handleFileChange,
    handleFilesChange,
    handleFixedFileChange,
    handleFixedFilesChange,
    processFixedDataFile,
    processMachine2File,
    processMachine1File,
    fetchUsers,
    fetchSummaries,
    fetchEmployeeMonthly,
  } = useAttendanceUploadLogic();

  // Login UI (when not authenticated)
  if (!isAuthenticated) {
    return (
      <LoginView
        loginStep={loginStep}
        password={password}
        onPasswordChange={setPassword}
        onPasswordSubmit={handlePasswordSubmit}
        email={loginEmail}
        onEmailChange={setLoginEmail}
        otp={otp}
        onOtpChange={(val) => setOtp(val.replace(/\D/g, '').slice(0, 6))}
        onOtpSubmit={handleOTPSubmit}
        onBackToPassword={() => {
          setLoginStep('password');
          setOtp('');
          setSessionId(null);
          setOtpExpiresAt(null);
          setLoginError(null);
        }}
        otpSecondsLeft={loginStep === 'otp' ? otpSecondsLeft : null}
        isLoading={loginLoading}
        error={loginError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex h-screen max-h-screen">
        <Sidebar
          activeSection={activeSection}
          setActiveSection={(section) => {
            if (hrPermState) {
              if (hrPermState.sections[section] === 'none') return;
            } else if (userRole === 'restricted_admin' && section !== 'upload') {
              return;
            }
            if (section !== 'summary') {
              setEmployeeManagementModal({ open: false, userId: null });
            }
            setActiveSection(section);
          }}
          uploadTotal={uploadTotal}
          uploadSaved={uploadSaved}
          uploadFailed={uploadFailed}
          currentMonthYear={currentMonthYear}
          onLogout={handleLogout}
          sectionAccess={hrPermState?.sections ?? null}
          permissionsLoaded={hrPermState !== null}
          userRole={userRole}
          userEmail={userEmail}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto min-h-full max-w-6xl space-y-6 bg-surface px-8 py-6 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.35)]">
            {backupPreviewDb && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Viewing backup <span className="font-semibold">{backupPreviewDb.replace('asija_copy_', '').replace('asija_prerestore_', 'safety ')}</span>.
                This is the saved copy, not live data. Editing is turned off.
              </div>
            )}
            {/* Upload Section */}
            

                
            {activeSection === 'employee' && (
              <EmployeeMonthView
                summaries={summaries}
                users={allUsers}
                selectedEmployeeId={selectedEmployeeId}
                setSelectedEmployeeId={setSelectedEmployeeId}
                selectedMonthYear={selectedEmployeeMonth}
                onMonthYearChange={(val) => {
                  setSelectedEmployeeMonth(val);
                  if (selectedEmployeeId && val) fetchEmployeeMonthly(selectedEmployeeId, val);
                }}
                employeeDays={employeeDays}
                isLoading={employeeLoading}
                error={employeeError}
                onLoadAttendance={fetchEmployeeMonthly}
                showEmployeeSelector={true}
                approvedRequests={employeeApprovedRequests}
                holidays={holidays}
              />
            )}
            {/* Article Credits Manager Section */}
            {activeSection === 'articleCredits' && (
              <ArticleCreditsManager />
            )}
               {/* Upload Section */}
                      {activeSection === 'upload' && (
                        <UploadSection
                          file={file}
                          files={files}
                          fixedFile={fixedFile}
                          fixedFiles={fixedFiles}
                          onFileChange={handleFileChange}
                          onFilesChange={handleFilesChange}
                          onFixedFileChange={handleFixedFileChange}
                          onFixedFilesChange={handleFixedFilesChange}
                          onProcessMultiple={processMultipleFiles}
                          onProcessMultipleFixed={processMultipleFixedFiles}
                          onProcessFixedFile={() => {
                            processFixedDataFile();
                          }}
                          onProcessFile={() => {
                            if (machineFormat === 'machine1') {
                              processMachine1File();
                            } else if (machineFormat === 'machine2' || machineFormat === 'machine3') {
                              processMachine2File();
                            } else {
                              setError('Unknown machine format selected');
                            }
                          }}
                          processing={processing}
                          error={error}
                          saveMessage={saveMessage}
                          uploadErrors={uploadErrors}
                          machineFormat={machineFormat}
                          onMachineFormatChange={setMachineFormat}
                        />
                      )}
                      
             {/* Employee Management Section */}
            {activeSection === 'employees' && (
              <EmployeeManagementSection
                onRefreshUsers={fetchUsers}
                employeesSectionAccess={hrPermState?.sections.employees ?? 'edit'}
                employeeTabAccess={hrPermState?.employeeTabs}
              />
            )}

            {activeSection === 'employeeMasterUpload' && (
              <EmployeeMasterUploadSection onRefreshUsers={fetchUsers} />
            )}

            {activeSection === 'teamAccess' && (
              <TeamAttendanceAccessSection allUsers={allUsers} />
            )}
            {/* Summary Section */}
            {activeSection === 'summary' && (
              <SummarySection
                summaries={summaries}
                allUsers={allUsers}
                holidays={holidays}
                uploadTotal={uploadTotal}
                uploadSaved={uploadSaved}
                uploadFailed={uploadFailed}
                isLoading={loadingSummaries}
                onFilterChange={fetchSummaries}
                onRefreshUsers={fetchUsers}
                onEmployeeClick={(userId, monthYear) => {
                  setEmployeeMonthModal({ open: true, userId, monthYear });
                  setSelectedEmployeeId(userId);
                  setSelectedEmployeeMonth(monthYear);
                  fetchEmployeeMonthly(userId, monthYear);
                }}
                onEmployeeDetailClick={(userId) => {
                  setEmployeeManagementModal({ open: true, userId });
                }}
              />
            )}
                
            {/* Modal for "Affected Info" Only */}
            {selectedEmployeeId && showAffectedModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
                    <h3 className="text-lg font-semibold text-white">
                        Exceptions & Attendance Issues
                        <span className="ml-2 text-sm font-normal text-slate-400">
                           {allUsers.find(u => u._id === selectedEmployeeId)?.name || selectedEmployeeId}
                        </span>
                    </h3>
                    <button
                        onClick={() => {
                            setShowAffectedModal(false);
                            setSelectedEmployeeId(null);
                        }}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="p-0 max-h-[60vh] overflow-y-auto">
                    {employeeLoading ? (
                        <div className="p-8 text-center text-slate-500">Loading details...</div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-950 text-slate-400 font-medium">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Times</th>
                                    <th className="px-4 py-3">Note</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {(() => {
                                    // 1. Get filtered list of issues
                                    const summary = summaries.find(s => s.userId === selectedEmployeeId);
                                    
                                    const issues = employeeDays.filter(rec => {
                                        const status = rec.status;
                                        // A. Status is NOT standard 'Present'
                                        if (['Absent', 'Leave', 'Holiday', 'HalfDay'].includes(status)) return true;
                                        
                                        // B. Check Late
                                        if (status === 'Present' && summary?.schedules && rec.inTime) {
                                            const parseMin = (t: string) => {
                                                const [h, m] = t.split(':').map(Number);
                                                return h * 60 + m;
                                            };
                                            const actual = parseMin(rec.inTime);
                                            const d = new Date(rec.date);
                                            const dow = d.getDay();
                                            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                                            const dayName = dayNames[dow] as keyof DailySchedule;
                                            const daySchedule = summary.schedules?.daily?.[dayName];
                                            let schedStr = daySchedule?.inTime;
                                            
                                            // Sunday/Holiday skipped
                                            if (dow === 0) return false;

                                            if (schedStr) {
                                                const sched = parseMin(schedStr);
                                                if (actual > sched) return true; // Late
                                            }
                                        }
                                        return false;
                                    });

                                    if (issues.length === 0) {
                                        return (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">
                                                    No attendance issues or exceptions found for this month. Good job!
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return issues.map(rec => {
                                        const d = new Date(rec.date);
                                        const dateLabel = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', weekday: 'short' });
                                        
                                        // Re-check Late for display
                                        let isLate = false;
                                        if (rec.status === 'Present' && summary?.schedules) {
                                             const parseMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h*60+m; };
                                             const actual = rec.inTime ? parseMin(rec.inTime) : 0;
                                             const dow = d.getDay();
                                             const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                                             const dayName = dayNames[dow];
                                             const daySchedule = summary.schedules?.daily?.[dayName as keyof DailySchedule];
                                             const schedStr = daySchedule?.inTime;
                                             if (dow !== 0 && !daySchedule?.isHoliday && schedStr && actual > parseMin(schedStr)) isLate = true;
                                        }

                                        let statusColor = 'text-slate-300';
                                        if (rec.status === 'Absent') statusColor = 'text-rose-400 bg-rose-400/10';
                                        if (isLate) statusColor = 'text-amber-400 bg-amber-400/10';
                                        if (rec.status === 'Leave' || rec.status === 'On leave') statusColor = 'text-sky-400 bg-sky-400/10';
                                        if (rec.status === 'Holiday') statusColor = 'text-amber-200 bg-amber-500/10';
                                        if (rec.status === 'HalfDay') statusColor = 'text-orange-400 bg-orange-400/10';

                                        return (
                                            <tr key={rec.date} className="hover:bg-slate-800/30">
                                                <td className="px-4 py-3 font-mono text-slate-300">{dateLabel}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded textxs font-medium ${statusColor}`}>
                                                        {isLate ? 'Late Arrival' : rec.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-slate-400">
                                                    {rec.inTime || '--:--'} - {rec.outTime || '--:--'}
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 italic text-xs">
                                                    {rec.typeOfPresence || (isLate ? 'Checked in late' : '-')}
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Employee Month View Modal Popup */}
            {employeeMonthModal.open && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
                    <h3 className="text-lg font-semibold text-white">
                      Employee Month View
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        {allUsers.find(u => u._id === employeeMonthModal.userId)?.name || employeeMonthModal.userId}
                      </span>
                    </h3>
                    <button
                      onClick={() => setEmployeeMonthModal({ open: false, userId: null, monthYear: '' })}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-0 max-h-[90vh] overflow-y-auto">
                    <EmployeeMonthView
                      summaries={summaries}
                      users={allUsers}
                      selectedEmployeeId={employeeMonthModal.userId}
                      setSelectedEmployeeId={setSelectedEmployeeId}
                      selectedMonthYear={employeeMonthModal.monthYear}
                      onMonthYearChange={(val) => {
                        setSelectedEmployeeMonth(val);
                        setEmployeeMonthModal(modal => ({ ...modal, monthYear: val }));
                        if (employeeMonthModal.userId && val) fetchEmployeeMonthly(employeeMonthModal.userId, val);
                      }}
                      employeeDays={employeeDays}
                      isLoading={employeeLoading}
                      error={employeeError}
                      onLoadAttendance={fetchEmployeeMonthly}
                      showEmployeeSelector={false}
                      approvedRequests={employeeApprovedRequests}
                      holidays={holidays}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Employee Management Section Modal Popup */}
            {employeeManagementModal.open && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
                    <h3 className="text-lg font-semibold text-white">
                      Employee Details
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        {allUsers.find(u => u._id === employeeManagementModal.userId)?.name || employeeManagementModal.userId}
                      </span>
                    </h3>
                    <button
                      onClick={() => setEmployeeManagementModal({ open: false, userId: null })}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-0 max-h-[90vh] overflow-y-auto">
                    <EmployeeManagementSection
                      selectedUserId={employeeManagementModal.userId}
                      onRefreshUsers={fetchUsers}
                      employeesSectionAccess={hrPermState?.sections.employees ?? 'edit'}
                      employeeTabAccess={hrPermState?.employeeTabs}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Attendance Requests Section */}
            {activeSection === 'requests' && (
              <AttendanceRequestsSection 
                isAdminView={true}
                userRole="HR"
              />
            )}

            {/* Holiday Management Section */}
            {activeSection === 'holidays' && (
              <HolidayManagement />
            )}

            {/* Database Backup Section */}
            {activeSection === 'backup' && (
              <BackupManagementSection />
            )}

            {/* Leave Management Section */}
            {activeSection === 'leave' && (
              <LeaveManagementSection
                isLoading={false}
                error={null}
                onRefresh={() => {}}
              />
            )}

            {activeSection === 'salaryPayroll' && <SalarySection />}

            {/* Fine Management Section */}
            {activeSection === 'fines' && (
              <FineManagementSection />
            )}

            {/* Invalid Attendance Section */}
            {activeSection === 'invalid' && (
              <InvalidAttendanceSection onRefresh={fetchUsers} />
            )}

            {activeSection === 'misExceptions' && <EmployeeMisExceptionsSection />}

            {activeSection === 'daywiseCompare' && (
              <DaywiseCompareSection allUsers={allUsers} holidays={holidays} />
            )}

            {/* Client Places Section */}
            {activeSection === 'clientPlaces' && (
              <ClientPlaceManagement allUsers={allUsers} />
            )}

            {activeSection === 'accessControl' && (
              <HrConsoleAccessSection
                onSaved={async () => {
                  const res = await fetch('/api/hr-console-permissions?me=1', hrCredentialsInit());
                  const j = await res.json();
                  if (res.ok && j.success && j.data) {
                    setHrPermState({
                      sections: j.data.sections,
                      employeeTabs: j.data.employeeTabs,
                    });
                  }
                }}
              />
            )}

            {activeSection === 'settings' && <HrConsoleSettingsSection />}
          </div>
        </main>
      </div>
    </div>
  );
}
