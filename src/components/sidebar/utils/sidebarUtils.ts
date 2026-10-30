import type { HrAccessLevel, HrConsoleSectionId } from '@/lib/hrConsolePermissionUtils';
import { NAV_CATEGORIES } from '../constants';

export function showSection(
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

export function categoryForSection(section: HrConsoleSectionId): string | null {
  for (const cat of NAV_CATEGORIES) {
    if (cat.items.some((item) => item.id === section)) return cat.key;
  }
  return null;
}
