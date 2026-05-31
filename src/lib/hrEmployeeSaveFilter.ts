import { MANAGED_EFFECTIVE_FIELDS, type ManagedEffectiveField } from '@/lib/userFieldHistory';
import {
  EMPLOYEE_MANAGEMENT_TAB_IDS,
  USER_PUT_KEY_TO_EMPLOYEE_TABS,
  type EmployeeManagementTabId,
} from '@/lib/hrConsolePermissionUtils';

export type EmployeeTabAccess = Record<EmployeeManagementTabId, 'none' | 'view' | 'edit'>;

/** Include only history segments the operator may edit (by underlying managed field). */
export function pickEditableFieldHistories(
  fieldHistories: unknown,
  employeeTabs: EmployeeTabAccess
): Record<string, unknown[]> | undefined {
  if (!fieldHistories || typeof fieldHistories !== 'object') return undefined;

  const source = fieldHistories as Record<string, unknown>;
  const out: Record<string, unknown[]> = {};

  for (const field of MANAGED_EFFECTIVE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const history = source[field];
    if (!Array.isArray(history)) continue;

    const tabs = USER_PUT_KEY_TO_EMPLOYEE_TABS[field as ManagedEffectiveField];
    if (!tabs?.some((t) => employeeTabs[t] === 'edit')) continue;

    out[field] = history;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

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
