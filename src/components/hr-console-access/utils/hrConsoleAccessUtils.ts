import { EMPLOYEE_MANAGEMENT_TAB_IDS, HR_CONSOLE_SECTION_IDS, type EmployeeManagementTabId, type HrAccessLevel, type HrConsoleSectionId, fullEditDefaults } from '@/lib/hrConsolePermissionUtils';

export function mapsFromRow(row: Record<string, unknown> | null | undefined): {
  sections: Record<HrConsoleSectionId, HrAccessLevel>;
  employeeTabs: Record<EmployeeManagementTabId, HrAccessLevel>;
} {
  const base = fullEditDefaults();
  if (!row) return base;
  const secRaw = row.sections as Record<string, unknown> | undefined;
  const tabRaw = row.employeeTabs as Record<string, unknown> | undefined;
  const sections = { ...base.sections };
  const employeeTabs = { ...base.employeeTabs };
  if (secRaw && typeof secRaw === 'object') {
    for (const id of HR_CONSOLE_SECTION_IDS) {
      if (Object.prototype.hasOwnProperty.call(secRaw, id)) {
        const v = secRaw[id];
        if (v === 'none' || v === 'view' || v === 'edit') sections[id] = v;
      }
    }
  }
  if (tabRaw && typeof tabRaw === 'object') {
    for (const id of EMPLOYEE_MANAGEMENT_TAB_IDS) {
      if (Object.prototype.hasOwnProperty.call(tabRaw, id)) {
        const v = tabRaw[id];
        if (v === 'none' || v === 'view' || v === 'edit') employeeTabs[id] = v;
      }
    }
  }
  return { sections, employeeTabs };
}
