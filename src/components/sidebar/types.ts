import type { LucideIcon } from 'lucide-react';
import type { HrAccessLevel, HrConsoleSectionId } from '@/lib/hrConsolePermissionUtils';

export interface SidebarProps {
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

export type NavItem = {
  id: HrConsoleSectionId;
  label: string;
  icon: LucideIcon;
};

export type NavCategory = {
  key: string;
  label: string;
  items: NavItem[];
};
