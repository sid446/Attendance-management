'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HrConsoleSectionId } from '@/lib/hrConsolePermissionUtils';
import type { SidebarProps } from '../types';
import { NAV_CATEGORIES } from '../constants';
import { showSection, categoryForSection } from '../utils/sidebarUtils';

export function useSidebarLogic({
  activeSection,
  sectionAccess,
  permissionsLoaded,
  userRole,
}: Pick<SidebarProps, 'activeSection' | 'sectionAccess' | 'permissionsLoaded' | 'userRole'>) {
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

  return { visibleCategories, expanded, toggleCategory, navBtnClass } as const;
}
