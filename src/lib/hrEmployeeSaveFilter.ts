import {
  EMPLOYEE_MANAGEMENT_TAB_IDS,
  USER_PUT_KEY_TO_EMPLOYEE_TABS,
  type EmployeeManagementTabId,
} from '@/lib/hrConsolePermissionUtils';

export type EmployeeTabAccess = Record<EmployeeManagementTabId, 'none' | 'view' | 'edit'>;

/** Build PUT body: only keys the operator may edit based on per-tab access. */
export function pickEditableUserPutBody(
  formData: Record<string, unknown>,
  employeeTabs: EmployeeTabAccess,
  meta: { changedBy?: string; changeReason?: string; managedEffectiveFromByField?: unknown }
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(formData)) {
    const tabs = USER_PUT_KEY_TO_EMPLOYEE_TABS[key];
    if (!tabs) continue;
    if (!tabs.some((t) => employeeTabs[t] === 'edit')) continue;
    out[key] = formData[key];
  }
  const anyField = Object.keys(out).length > 0;
  const canSendManagedDates =
    meta.managedEffectiveFromByField !== undefined &&
    (employeeTabs.salary === 'edit' ||
      employeeTabs.basic === 'edit' ||
      employeeTabs.extended === 'edit');
  if (anyField || canSendManagedDates) {
    if (meta.changedBy !== undefined) out.changedBy = meta.changedBy;
    if (meta.changeReason !== undefined) out.changeReason = meta.changeReason;
    if (canSendManagedDates) {
      out.managedEffectiveFromByField = meta.managedEffectiveFromByField;
    }
  }
  return out;
}

export function canEditAnyEmployeeTab(employeeTabs: EmployeeTabAccess): boolean {
  return EMPLOYEE_MANAGEMENT_TAB_IDS.some((t) => employeeTabs[t] === 'edit');
}
