import { NextResponse } from 'next/server';

export type HrAccessLevel = 'none' | 'view' | 'edit';

export const HR_CONSOLE_SECTION_IDS = [
  'upload',
  'summary',
  'employee',
  'employees',
  'employeeMasterUpload',
  'teamAccess',
  'requests',
  'holidays',
  'backup',
  'leave',
  'fines',
  'articleCredits',
  'invalid',
  'misExceptions',
  'clientPlaces',
  'accessControl',
  'settings',
] as const;

export type HrConsoleSectionId = (typeof HR_CONSOLE_SECTION_IDS)[number];

export const EMPLOYEE_MANAGEMENT_TAB_IDS = [
  'basic',
  'schedule',
  'extended',
  'bank',
  'salary',
  'history',
] as const;

export type EmployeeManagementTabId = (typeof EMPLOYEE_MANAGEMENT_TAB_IDS)[number];

function isHrAccessLevel(v: unknown): v is HrAccessLevel {
  return v === 'none' || v === 'view' || v === 'edit';
}

function normalizeLevel(v: unknown, fallback: HrAccessLevel): HrAccessLevel {
  if (isHrAccessLevel(v)) return v;
  return fallback;
}

function mapToObject(map: Map<string, string> | undefined | null): Record<string, string> {
  if (!map || typeof (map as Map<string, string>).forEach !== 'function') return {};
  const out: Record<string, string> = {};
  (map as Map<string, string>).forEach((val, key) => {
    out[key] = val;
  });
  return out;
}

/** Default when no DB row: full HR access (non–it@ emails). */
export function fullEditDefaults(): {
  sections: Record<HrConsoleSectionId, HrAccessLevel>;
  employeeTabs: Record<EmployeeManagementTabId, HrAccessLevel>;
} {
  const sections = {} as Record<HrConsoleSectionId, HrAccessLevel>;
  for (const id of HR_CONSOLE_SECTION_IDS) {
    sections[id] = 'edit';
  }
  const employeeTabs = {} as Record<EmployeeManagementTabId, HrAccessLevel>;
  for (const id of EMPLOYEE_MANAGEMENT_TAB_IDS) {
    employeeTabs[id] = 'edit';
  }
  return { sections, employeeTabs };
}

/** Legacy it@ behaviour when no permission document exists. */
export function restrictedItDefaults(): {
  sections: Record<HrConsoleSectionId, HrAccessLevel>;
  employeeTabs: Record<EmployeeManagementTabId, HrAccessLevel>;
} {
  const { sections: fullS, employeeTabs: fullE } = fullEditDefaults();
  const sections = { ...fullS };
  for (const id of HR_CONSOLE_SECTION_IDS) {
    sections[id] = id === 'upload' ? 'edit' : 'none';
  }
  const employeeTabs = { ...fullE };
  for (const id of EMPLOYEE_MANAGEMENT_TAB_IDS) {
    employeeTabs[id] = 'none';
  }
  return { sections, employeeTabs };
}

export function mergeWithDefaults(
  partialSections: Record<string, unknown> | undefined,
  partialTabs: Record<string, unknown> | undefined,
  base: { sections: Record<HrConsoleSectionId, HrAccessLevel>; employeeTabs: Record<EmployeeManagementTabId, HrAccessLevel> }
): { sections: Record<HrConsoleSectionId, HrAccessLevel>; employeeTabs: Record<EmployeeManagementTabId, HrAccessLevel> } {
  const sections = { ...base.sections };
  const employeeTabs = { ...base.employeeTabs };

  if (partialSections && typeof partialSections === 'object') {
    for (const id of HR_CONSOLE_SECTION_IDS) {
      if (Object.prototype.hasOwnProperty.call(partialSections, id)) {
        sections[id] = normalizeLevel((partialSections as Record<string, unknown>)[id], sections[id]);
      }
    }
  }
  if (partialTabs && typeof partialTabs === 'object') {
    for (const id of EMPLOYEE_MANAGEMENT_TAB_IDS) {
      if (Object.prototype.hasOwnProperty.call(partialTabs, id)) {
        employeeTabs[id] = normalizeLevel((partialTabs as Record<string, unknown>)[id], employeeTabs[id]);
      }
    }
  }
  return { sections, employeeTabs };
}

export function effectiveFromDoc(
  operatorEmail: string,
  doc: { sections?: Map<string, string> | Record<string, string>; employeeTabs?: Map<string, string> | Record<string, string> } | null
): { sections: Record<HrConsoleSectionId, HrAccessLevel>; employeeTabs: Record<EmployeeManagementTabId, HrAccessLevel> } {
  const normalized = String(operatorEmail || '').trim().toLowerCase();
  const base =
    normalized === 'it@asija.in' && !doc ? restrictedItDefaults() : fullEditDefaults();

  let secObj: Record<string, unknown> = {};
  let tabObj: Record<string, unknown> = {};
  if (doc) {
    if (doc.sections instanceof Map) {
      secObj = mapToObject(doc.sections);
    } else if (doc.sections && typeof doc.sections === 'object') {
      secObj = doc.sections as Record<string, unknown>;
    }
    if (doc.employeeTabs instanceof Map) {
      tabObj = mapToObject(doc.employeeTabs);
    } else if (doc.employeeTabs && typeof doc.employeeTabs === 'object') {
      tabObj = doc.employeeTabs as Record<string, unknown>;
    }
  }

  return mergeWithDefaults(secObj, tabObj, base);
}

/** Which employee tabs must allow edit if this body key is present on PUT (OR across listed tabs). */
export const USER_PUT_KEY_TO_EMPLOYEE_TABS: Record<string, EmployeeManagementTabId[]> = {
  odId: ['basic'],
  name: ['basic'],
  email: ['basic'],
  attendanceEmail: ['basic'],
  designation: ['basic'],
  team: ['basic'],
  joiningDate: ['basic'],
  isActive: ['basic'],
  inactiveAsOf: ['basic'],
  changedBy: ['basic'],
  changeReason: ['basic'],
  employmentType: ['basic'],
  employmentTypeHistory: ['basic'],
  workingTiming: ['basic'],
  workingUnderPartner: ['basic', 'extended', 'salary'],
  registeredUnderPartner: ['basic', 'extended', 'salary'],
  schedules: ['schedule'],
  seasonalSchedules: ['schedule'],
  scheduleInOutTime: ['schedule'],
  scheduleInOutTimeSat: ['schedule'],
  scheduleInOutTimeMonth: ['schedule'],
  registrationNo: ['extended'],
  employeeCode: ['extended'],
  paidFrom: ['extended'],
  category: ['extended'],
  tallyName: ['extended'],
  gender: ['extended'],
  parentName: ['extended'],
  parentOccupation: ['extended'],
  mobileNumber: ['extended'],
  alternateMobileNumber: ['extended'],
  alternateEmail: ['extended'],
  address1: ['extended'],
  address2: ['extended'],
  emergencyContactNo: ['extended'],
  emergencyContactRelation: ['extended'],
  anniversaryDate: ['extended'],
  extraInfo: ['extended'],
  articleshipStartDate: ['extended'],
  transferCase: ['extended'],
  firstYearArticleship: ['extended'],
  secondYearArticleship: ['extended'],
  thirdYearArticleship: ['extended'],
  filledScholarship: ['extended'],
  qualificationLevel: ['extended'],
  nextAttemptDueDate: ['extended'],
  bankName: ['bank'],
  branchName: ['bank'],
  accountNumber: ['bank'],
  ifscCode: ['bank'],
  accountType: ['bank'],
  accountHolderName: ['bank'],
  aadhaarNumber: ['bank'],
  panNumber: ['bank'],
  basicSalary: ['salary'],
  laptopAllowance: ['salary'],
  otherAllowance: ['salary'],
  bonus: ['salary'],
  incentive: ['salary'],
  totalSalaryPerMonth: ['salary'],
  totalSalaryPerAnnum: ['salary'],
  pf: ['salary'],
  esi: ['salary'],
  gratuity: ['salary'],
  managedEffectiveFrom: ['salary'],
  managedEffectiveFromByField: ['basic', 'extended', 'salary'],
  fieldHistories: ['basic', 'extended', 'salary'],
  articleCreditsAsOnJan26: ['salary'],
  leaveBalance: ['salary'],
};

/** Union of user-field keys present in bulk employee rows (for permission checks). */
export function collectUserFieldKeysFromEmployeeRecords(records: unknown[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const emp of records) {
    if (!emp || typeof emp !== 'object') continue;
    const e = emp as Record<string, unknown>;
    for (const key of Object.keys(e)) {
      if (!USER_PUT_KEY_TO_EMPLOYEE_TABS[key]) continue;
      const v = e[key];
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && !String(v).trim()) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
      body[key] = v;
    }
  }
  return body;
}

const IGNORE_USER_PUT_KEYS = new Set(['_id', '__v']);

export function assertCanApplyUserPutBody(
  body: Record<string, unknown>,
  effective: { sections: Record<HrConsoleSectionId, HrAccessLevel>; employeeTabs: Record<EmployeeManagementTabId, HrAccessLevel> }
): NextResponse | null {
  if (effective.sections.employees !== 'edit') {
    return NextResponse.json({ success: false, error: 'Not allowed to modify employees' }, { status: 403 });
  }

  for (const key of Object.keys(body)) {
    if (IGNORE_USER_PUT_KEYS.has(key)) continue;
    const val = body[key];
    if (val === undefined) continue;

    const tabs = USER_PUT_KEY_TO_EMPLOYEE_TABS[key];
    if (!tabs || tabs.length === 0) {
      return NextResponse.json({ success: false, error: `Field not permitted: ${key}` }, { status: 403 });
    }
    const canAny = tabs.some((t) => effective.employeeTabs[t] === 'edit');
    if (!canAny) {
      return NextResponse.json(
        { success: false, error: `Not allowed to edit field "${key}" (employee tab access)` },
        { status: 403 }
      );
    }
  }
  return null;
}

export function assertHrSection(
  effective: { sections: Record<HrConsoleSectionId, HrAccessLevel> },
  section: HrConsoleSectionId,
  need: 'view' | 'edit'
): NextResponse | null {
  const level = effective.sections[section];
  if (need === 'view') {
    if (level === 'none') {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    return null;
  }
  if (level !== 'edit') {
    return NextResponse.json({ success: false, error: 'Edit access denied' }, { status: 403 });
  }
  return null;
}

export function assertCanReadEmployees(
  effective: { sections: Record<HrConsoleSectionId, HrAccessLevel> }
): NextResponse | null {
  const level = effective.sections.employees;
  if (level === 'none') {
    return NextResponse.json({ success: false, error: 'Not allowed to view employees' }, { status: 403 });
  }
  return null;
}

export function normalizePermissionPayload(body: {
  operatorEmail?: string;
  sections?: Record<string, unknown>;
  employeeTabs?: Record<string, unknown>;
}): { operatorEmail: string; sections: Record<HrConsoleSectionId, HrAccessLevel>; employeeTabs: Record<EmployeeManagementTabId, HrAccessLevel> } | null {
  const operatorEmail = String(body?.operatorEmail || '').trim().toLowerCase();
  if (!operatorEmail) {
    return null;
  }
  const base = fullEditDefaults();
  const merged = mergeWithDefaults(body?.sections, body?.employeeTabs, base);
  return { operatorEmail, ...merged };
}
