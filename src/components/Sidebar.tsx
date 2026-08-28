'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  ClipboardList,
  Settings,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
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
  sectionAccess: Record<HrConsoleSectionId, HrAccessLevel> | null;
  permissionsLoaded: boolean;
  userRole: string;
  userEmail?: string;
}

type NavItem = {
  id: HrConsoleSectionId;
  label: string;
  icon: LucideIcon;
};

type NavCategory = {
  key: string;
  label: string;
  items: NavItem[];
};

/** Sidebar groups preserve the original flat nav order. */
const NAV_CATEGORIES: NavCategory[] = [
  {
    key: 'employees',
    label: 'Employees',
    items: [
      { id: 'employees', label: 'Employees', icon: Users },
      { id: 'employeeMasterUpload', label: 'Employee Master Upload', icon: FileSpreadsheet },
      { id: 'teamAccess', label: 'Team Access', icon: ShieldCheck },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    items: [
      { id: 'summary', label: 'Attendance Summary', icon: CheckCircle },
      { id: 'employee', label: 'Employee Month View', icon: Clock },
      { id: 'daywiseCompare', label: 'Daywise Compare', icon: FileSpreadsheet },
      { id: 'requests', label: 'Requests', icon: Clock },
      { id: 'invalid', label: 'Invalid Attendance', icon: AlertTriangle },
      { id: 'misExceptions', label: 'MIS Exceptions', icon: ClipboardList },
    ],
  },
  {
    key: 'leave-payroll',
    label: 'Leave & payroll',
    items: [
      { id: 'leave', label: 'Leave Management', icon: TrendingUp },
      { id: 'salaryPayroll', label: 'Salary', icon: IndianRupee },
      { id: 'articleCredits', label: 'Article Credits', icon: FileSpreadsheet },
      { id: 'fines', label: 'Fine Management', icon: IndianRupee },
      { id: 'holidays', label: 'Holiday Management', icon: Calendar },
    ],
  },
  {
    key: 'settings-data',
    label: 'Settings & data',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings },
      { id: 'clientPlaces', label: 'Client Places', icon: MapPin },
      { id: 'accessControl', label: 'Access control', icon: Lock },
      { id: 'upload', label: 'Attendance Upload', icon: Upload },
      { id: 'backup', label: 'Database Backup', icon: Database },
    ],
  },
];

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

function categoryForSection(section: HrConsoleSectionId): string | null {
  for (const cat of NAV_CATEGORIES) {
    if (cat.items.some((item) => item.id === section)) return cat.key;
  }
  return null;
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
  userEmail = '',
}) => {
  const nav = (id: HrConsoleSectionId) => showSection(id, sectionAccess, permissionsLoaded, userRole);

  const visibleCategories = useMemo(
    () =>
      NAV_CATEGORIES.map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => nav(item.id)),
      })).filter((cat) => cat.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nav depends on props above
    [sectionAccess, permissionsLoaded, userRole]
  );

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const activeCat = categoryForSection(activeSection);
    const initial: Record<string, boolean> = {};
    for (const cat of NAV_CATEGORIES) {
      initial[cat.key] = cat.key === activeCat;
    }
    return initial;
  });

  useEffect(() => {
    const activeCat = categoryForSection(activeSection);
    if (!activeCat) return;
    setExpanded((prev) => (prev[activeCat] ? prev : { ...prev, [activeCat]: true }));
  }, [activeSection]);

  const toggleCategory = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const navBtnClass = (isActive: boolean) =>
    `flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
      isActive
        ? 'border border-blue-200 bg-blue-50 text-blue-900'
        : 'text-slate-600 hover:bg-blue-100/75'
    }`;

  return (
    <aside className="flex h-full w-64 min-h-0 flex-col border-r border-blue-300/80 bg-sky-200/70 shadow-[1px_0_0_0_rgb(96_165_250_/_0.45)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-blue-200/85 px-4 py-3">
        <img src="/lg.png" alt="Logo" className="h-12 w-12 shrink-0 object-contain" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-wide text-slate-800">
            Asija and Associates LLP
          </div>
          <div className="text-xs text-slate-500">Attendance Console</div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm" aria-label="HR console sections">
        <div className="space-y-2">
          {visibleCategories.map((cat) => {
            const isOpen = expanded[cat.key] ?? false;
            const hasActiveChild = cat.items.some((item) => item.id === activeSection);

            return (
              <div key={cat.key} className="rounded-lg border border-blue-200/50 bg-white/40">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.key)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide transition-colors ${
                    hasActiveChild ? 'text-blue-900' : 'text-slate-700 hover:bg-blue-50/80'
                  }`}
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">{cat.label}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium normal-case text-slate-600">
                    {cat.items.length}
                  </span>
                </button>

                {isOpen && (
                  <ul className="space-y-0.5 px-2 pb-2 pt-0.5">
                    {cat.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeSection === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setActiveSection(item.id)}
                            className={navBtnClass(isActive)}
                            title={item.label}
                          >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="min-w-0 truncate">{item.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {uploadTotal > 0 && (
        <div className="shrink-0 border-t border-blue-200/85 px-4 py-3 text-xs text-slate-500">
          <div className="mb-1 flex justify-between gap-2">
            <span className="shrink-0">Last upload</span>
            <span className="min-w-0 truncate text-right">
              {uploadSaved}/{uploadTotal} saved
              {uploadFailed > 0 ? `, ${uploadFailed} failed` : ''}
            </span>
          </div>
          {currentMonthYear && <div className="truncate text-slate-600">Month: {currentMonthYear}</div>}
        </div>
      )}

      <div className="shrink-0 border-t border-blue-200/85 px-3 py-3">
        {userEmail ? (
          <div className="mb-2 min-w-0 px-3 py-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Signed in as</p>
            <p className="truncate text-xs font-medium text-slate-800" title={userEmail}>
              {userEmail}
            </p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
