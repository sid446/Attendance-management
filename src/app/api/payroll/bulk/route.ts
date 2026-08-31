import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PayrollMonth from '@/models/PayrollMonth';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { applyPayrollLineOverrides, mergePayrollOverrides, plainPayrollOverrides } from '@/lib/payrollGenerate';
import {
  PAYROLL_BULK_BUILTIN_FIELDS,
  normalizePayrollExtraFields,
  type PayrollBulkBuiltinField,
  type PayrollOverrides,
} from '@/lib/salaryCalculation';

export const dynamic = 'force-dynamic';

const BUILTIN = new Set<string>(PAYROLL_BULK_BUILTIN_FIELDS);

export async function PATCH(request: NextRequest) {
  try {
    await dbConnect();
    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    const denied = assertHrSection(effective, 'salaryPayroll', 'edit');
    if (denied) return denied;

    const body = await request.json();
    const monthYear = String(body?.monthYear || '').trim();
    const field = String(body?.field || '').trim();
    const clear = Boolean(body?.clear);
    const amount = clear ? 0 : Number(body?.amount);
    const scope = String(body?.scope || 'all').trim();
    const designation = String(body?.designation || '').trim();
    const userIds = Array.isArray(body?.userIds) ? body.userIds.map((id: unknown) => String(id)) : [];

    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json({ success: false, error: 'monthYear (YYYY-MM) is required' }, { status: 400 });
    }
    if (!field) {
      return NextResponse.json({ success: false, error: 'field is required' }, { status: 400 });
    }
    if (!clear && !Number.isFinite(amount)) {
      return NextResponse.json({ success: false, error: 'field and a numeric amount are required' }, { status: 400 });
    }
    if (scope === 'selected' && userIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Select at least one employee' }, { status: 400 });
    }
    if (scope === 'designation' && !designation) {
      return NextResponse.json({ success: false, error: 'Designation is required' }, { status: 400 });
    }

    const doc = await PayrollMonth.findOne({ monthYear });
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Payroll not generated for this month' }, { status: 404 });
    }
    if (doc.status === 'finalized') {
      return NextResponse.json({ success: false, error: 'Month is finalized. Re-open it to edit.' }, { status: 409 });
    }

    const extraFields = normalizePayrollExtraFields(doc.extraFields);
    const isBuiltin = BUILTIN.has(field);
    const custom = extraFields.find((f) => f.id === field);
    if (!isBuiltin && !custom) {
      return NextResponse.json({ success: false, error: 'Unknown extra field' }, { status: 400 });
    }

    const selected = new Set(userIds);
    const designationLower = designation.toLowerCase();
    let updated = 0;

    for (const line of doc.lines || []) {
      const matches =
        scope === 'all'
          ? true
          : scope === 'selected'
            ? selected.has(String(line.userId))
            : String(line.designation || '').trim().toLowerCase() === designationLower;
      if (!matches) continue;
      if (line.frozen) continue;

      const existing = plainPayrollOverrides(line.overrides);
      const value = clear ? null : amount;
      const patch: PayrollOverrides = isBuiltin
        ? { [field as PayrollBulkBuiltinField]: value }
        : { customAmounts: { [field]: value } };
      const merged = mergePayrollOverrides(existing, patch);
      applyPayrollLineOverrides(line, merged, doc.calendar, monthYear, extraFields);
      updated += 1;
    }

    doc.markModified('lines');
    await doc.save();

    return NextResponse.json({ success: true, data: doc, updated });
  } catch (err) {
    console.error('PATCH /api/payroll/bulk', err);
    return NextResponse.json({ success: false, error: 'Failed to apply extra' }, { status: 500 });
  }
}
