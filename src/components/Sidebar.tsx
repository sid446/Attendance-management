import React from 'react';
import { FileSpreadsheet, Upload, CheckCircle, Clock, Users, LogOut, Calendar, Database, TrendingUp, IndianRupee, AlertTriangle, MapPin } from 'lucide-react';

interface SidebarProps {
  activeSection: 'upload' | 'summary' | 'employee' | 'employees' | 'employeeMasterUpload' | 'requests' | 'holidays' | 'backup' | 'leave' | 'fines' | 'articleCredits' | 'invalid' | 'clientPlaces';
  setActiveSection: (section: 'upload' | 'summary' | 'employee' | 'employees' | 'employeeMasterUpload' | 'requests' | 'holidays' | 'backup' | 'leave' | 'fines' | 'articleCredits' | 'invalid' | 'clientPlaces') => void;
  uploadTotal: number;
  uploadSaved: number;
  uploadFailed: number;
  currentMonthYear: string | null;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  setActiveSection,
  uploadTotal,
  uploadSaved,
  uploadFailed,
  currentMonthYear,
  onLogout
}) => {
  return (
    <aside className="flex w-64 flex-col border-r border-blue-300/80 bg-sky-200/70 shadow-[1px_0_0_0_rgb(96_165_250_/_0.45)]">
      <div className="flex items-center gap-2 border-b border-blue-200/85 px-4 py-3">
        <img src="/lg.png" alt="Logo" className="w-12 h-12 object-contain flex-shrink-0" />
        <div>
          <div className="text-sm font-semibold tracking-wide text-slate-800">Asija and Associates LLP</div>
          <div className="text-xs text-slate-500">Attendance Console</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
        <button
          type="button"
          onClick={() => setActiveSection('employees')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'employees'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Employees</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('employeeMasterUpload')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'employeeMasterUpload'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Employee Master Upload</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('summary')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'summary'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          <span>Attendance Summary</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('employee')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'employee'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Employee Month View</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('requests')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'requests'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Requests</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('invalid')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'invalid'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Invalid Attendance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('leave')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'leave'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Leave Management</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('articleCredits')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'articleCredits'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Article Credits</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('fines')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'fines'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <IndianRupee className="w-4 h-4" />
          <span>Fine Management</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('holidays')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'holidays'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Holiday Management</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('clientPlaces')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'clientPlaces'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Client Places</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('upload')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'upload'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Attendance Upload</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('backup')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'backup'
              ? 'border border-blue-200 bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-blue-100/75'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Database Backup</span>
        </button>
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

      {/* Logout button */}
      <div className="border-t border-blue-200/85 px-3 py-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
