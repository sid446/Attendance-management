'use client';

import React from 'react';
import { LogOut, ChevronDown, ChevronRight } from 'lucide-react';
import type { SidebarProps } from './types';
import { useSidebarLogic } from './hooks';

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
  const { visibleCategories, expanded, toggleCategory, navBtnClass } = useSidebarLogic({
    activeSection,
    sectionAccess,
    permissionsLoaded,
    userRole,
  });

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
