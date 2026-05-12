import React from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle,
  Clock,
  Users,
  LogOut,
  Calendar,
  Database,
  TrendingUp,
  IndianRupee,
  AlertTriangle,
  MapPin,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import type { HrAccessLevel, HrConsoleSectionId } from '@/lib/hrConsolePermissionUtils';

interface SidebarProps {
  activeSection: HrConsoleSectionId;
  setActiveSection: (section: HrConsoleSectionId) => void;
  uploadTotal: number;
  uploadSaved: number;
  uploadFailed: number;
  currentMonthYear: string | null;
  onLogout: () => void;
  /** Effective section access; null = permissions not loaded yet (use userRole fallback). */
  sectionAccess: Record<HrConsoleSectionId, HrAccessLevel> | null;
  permissionsLoaded: boolean;
  userRole: string;
}

function showSection(
  id: HrConsoleSectionId,
  sectionAccess: Record<HrConsoleSectionId, HrAccessLevel> | null,
  permissionsLoaded: boolean,
  userRole: string
): boolean {
  if (!permissionsLoaded) {
    return userRole === 'restricted_admin' ? id === 'upload' : true;
  }
  const level = sectionAccess?.[id] ?? 'edit';
  return level !== 'none';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  setActiveSection,
  uploadTotal,
  uploadSaved,
  uploadFailed,
  currentMonthYear,
  onLogout,
  sectionAccess,
  permissionsLoaded,
  userRole,
}) => {
  const nav = (id: HrConsoleSectionId) => showSection(id, sectionAccess, permissionsLoaded, userRole);

  return (
    <aside className="flex w-64 flex-col border-r border-blue-300/80 bg-sky-200/70 shadow-[1px_0_0_0_rgb(96_165_250_/_0.45)]">
      <div className="flex items-center gap-2 border-b border-blue-200/85 px-4 py-3">
        <img src="/lg.png" alt="Logo" className="w-12 h-12 object-contain flex-shrink-0" />
        <div>
          <div className="text-sm font-semibold tracking-wide text-slate-800">Asija and Associates LLP</div>
          <div className="text-xs text-slate-500">Attendance Console</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
        {nav('employees') && (
          <button
            type="button"
            onClick={() => setActiveSection('employees')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'employees'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Employees</span>
          </button>
        )}

        {nav('employeeMasterUpload') && (
          <button
            type="button"
            onClick={() => setActiveSection('employeeMasterUpload')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'employeeMasterUpload'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Employee Master Upload</span>
          </button>
        )}

        {nav('teamAccess') && (
          <button
            type="button"
            onClick={() => setActiveSection('teamAccess')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'teamAccess'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Team Access</span>
          </button>
        )}

        {nav('summary') && (
          <button
            type="button"
            onClick={() => setActiveSection('summary')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'summary'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <CheckCircle className="h-4 w-4" />
            <span>Attendance Summary</span>
          </button>
        )}

        {nav('employee') && (
          <button
            type="button"
            onClick={() => setActiveSection('employee')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'employee'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Employee Month View</span>
          </button>
        )}

        {nav('requests') && (
          <button
            type="button"
            onClick={() => setActiveSection('requests')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'requests'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Requests</span>
          </button>
        )}

        {nav('invalid') && (
          <button
            type="button"
            onClick={() => setActiveSection('invalid')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'invalid'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            <span>Invalid Attendance</span>
          </button>
        )}

        {nav('leave') && (
          <button
            type="button"
            onClick={() => setActiveSection('leave')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'leave'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>Leave Management</span>
          </button>
        )}

        {nav('articleCredits') && (
          <button
            type="button"
            onClick={() => setActiveSection('articleCredits')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'articleCredits'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Article Credits</span>
          </button>
        )}

        {nav('fines') && (
          <button
            type="button"
            onClick={() => setActiveSection('fines')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'fines'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <IndianRupee className="h-4 w-4" />
            <span>Fine Management</span>
          </button>
        )}

        {nav('holidays') && (
          <button
            type="button"
            onClick={() => setActiveSection('holidays')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'holidays'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Holiday Management</span>
          </button>
        )}

        {nav('clientPlaces') && (
          <button
            type="button"
            onClick={() => setActiveSection('clientPlaces')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'clientPlaces'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <MapPin className="h-4 w-4" />
            <span>Client Places</span>
          </button>
        )}

        {nav('accessControl') && (
          <button
            type="button"
            onClick={() => setActiveSection('accessControl')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'accessControl'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <Lock className="h-4 w-4" />
            <span>Access control</span>
          </button>
        )}

        {nav('upload') && (
          <button
            type="button"
            onClick={() => setActiveSection('upload')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'upload'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <Upload className="h-4 w-4" />
            <span>Attendance Upload</span>
          </button>
        )}

        {nav('backup') && (
          <button
            type="button"
            onClick={() => setActiveSection('backup')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
              activeSection === 'backup'
                ? 'border border-blue-200 bg-blue-50 text-blue-900'
                : 'text-slate-600 hover:bg-blue-100/75'
            }`}
          >
            <Database className="h-4 w-4" />
            <span>Database Backup</span>
          </button>
        )}
      </nav>

      {uploadTotal > 0 && (
        <div className="border-t border-blue-200/85 px-4 py-3 text-xs text-slate-500">
          <div className="mb-1 flex justify-between">
            <span>Last upload</span>
            <span>
              {uploadSaved}/{uploadTotal} saved
              {uploadFailed > 0 && `, ${uploadFailed} failed`}
            </span>
          </div>
          {currentMonthYear && <div className="text-slate-600">Month: {currentMonthYear}</div>}
        </div>
      )}

      <div className="border-t border-blue-200/85 px-3 py-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
