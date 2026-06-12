import {
  getActiveFieldHistoryEntry,
  MANAGED_EFFECTIVE_FIELDS,
  normalizeManagedFieldValue,
  type ManagedEffectiveField,
} from '@/lib/userFieldHistory';
import {
  EMPLOYEE_MANAGEMENT_TAB_IDS,
  USER_PUT_KEY_TO_EMPLOYEE_TABS,
  type EmployeeManagementTabId,
} from '@/lib/hrConsolePermissionUtils';

export type EmployeeTabAccess = Record<EmployeeManagementTabId, 'none' | 'view' | 'edit'>;

type HistoryCompareEntry = {
  value: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

function toHistoryCompareKey(entries: unknown): string {
  if (!Array.isArray(entries)) return '[]';
  const normalized: HistoryCompareEntry[] = entries.map((entry) => {
    const row = entry as { value?: unknown; effectiveFrom?: unknown; effectiveTo?: unknown };
    const effectiveTo =
      row.effectiveTo == null || row.effectiveTo === '' ? null : String(row.effectiveTo).slice(0, 10);
    const effectiveFrom = row.effectiveFrom == null ? '' : String(row.effectiveFrom).slice(0, 10);
    return {
      value: normalizeManagedFieldValue(row.value),
      effectiveFrom,
      effectiveTo,
    };
  });
  normalized.sort((a, b) => {
    const byFrom = a.effectiveFrom.localeCompare(b.effectiveFrom);
    if (byFrom !== 0) return byFrom;
    return a.value.localeCompare(b.value);
  });
  return JSON.stringify(normalized);
}

/**
 * Drop managed-field history that would revert an in-form dropdown edit on save.
 * Skips fields whose history rows were edited (delete/add/edit) so removals persist.
 */
export function stripStaleManagedFieldHistories(
  formData: Record<string, unknown>,
  originalFieldHistories?: unknown
): void {
  const histories = formData.fieldHistories;
  if (!histories || typeof histories !== 'object' || Array.isArray(histories)) return;

  const original =
    originalFieldHistories && typeof originalFieldHistories === 'object' && !Array.isArray(originalFieldHistories)
      ? (originalFieldHistories as Record<string, unknown>)
      : {};

  const source = histories as Record<string, unknown[]>;
  for (const field of MANAGED_EFFECTIVE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(formData, field)) continue;
    const rows = source[field];
    if (!Array.isArray(rows)) continue;

    const historyWasEdited = toHistoryCompareKey(rows) !== toHistoryCompareKey(original[field]);
    if (historyWasEdited) continue;

    if (rows.length === 0) continue;

    const formValue = normalizeManagedFieldValue(formData[field]);
    const active = getActiveFieldHistoryEntry(rows as Parameters<typeof getActiveFieldHistoryEntry>[0]);
    const historyValue = normalizeManagedFieldValue(active?.value);
    if (formValue !== historyValue) {
      delete source[field];
    }
  }

  if (Object.keys(source).length === 0) {
    delete formData.fieldHistories;
  }
}

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
