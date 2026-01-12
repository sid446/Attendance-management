import React from 'react';
import { FileSpreadsheet, Upload, CheckCircle, Clock, Users, LogOut } from 'lucide-react';

interface SidebarProps {
  activeSection: 'upload' | 'summary' | 'employee' | 'employees';
  setActiveSection: (section: 'upload' | 'summary' | 'employee' | 'employees') => void;
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
    <aside className="w-64 border-r border-slate-800 bg-slate-900/60 flex flex-col">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2">
        <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
        <div>
          <div className="text-sm font-semibold tracking-wide text-slate-100">Attendance Console</div>
          <div className="text-xs text-slate-400">Excel import & analytics</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
        <button
          type="button"
          onClick={() => setActiveSection('upload')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'upload'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Attendance Upload</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('summary')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'summary'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-300 hover:bg-slate-800/60'
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
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Employee Month View</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('employees')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
            activeSection === 'employees'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Employees</span>
        </button>
      </nav>

      {uploadTotal > 0 && (
        <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex justify-between mb-1">
            <span>Last upload</span>
            <span>
              {uploadSaved}/{uploadTotal} saved
              {uploadFailed > 0 && `, ${uploadFailed} failed`}
            </span>
          </div>
          {currentMonthYear && <div className="text-slate-500">Month: {currentMonthYear}</div>}
        </div>
      )}

      {/* Logout button */}
      <div className="px-3 py-3 border-t border-slate-800">
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm text-slate-400 hover:bg-slate-800/60 hover:text-rose-300 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
