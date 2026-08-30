import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PayrollMonth from '@/models/PayrollMonth';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { applyPayrollLineOverrides, plainPayrollOverrides } from '@/lib/payrollGenerate';
import {
  newPayrollExtraId,
  normalizePayrollExtraFields,
  extraFieldsForStore,
  type PayrollExtraKind,
} from '@/lib/salaryCalculation';

export const dynamic = 'force-dynamic';

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
    const action = String(body?.action || '').trim();
    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json({ success: false, error: 'monthYear (YYYY-MM) is required' }, { status: 400 });
    }

    const doc = await PayrollMonth.findOne({ monthYear });
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Payroll not generated for this month' }, { status: 404 });
    }
    if (doc.status === 'finalized') {
      return NextResponse.json({ success: false, error: 'Month is finalized. Re-open it to edit.' }, { status: 409 });
    }

    const extraFields = normalizePayrollExtraFields(doc.extraFields);

    if (action === 'add') {
      const label = String(body?.label || '').trim();
      const kind: PayrollExtraKind = body?.kind === 'deduction' ? 'deduction' : 'earning';
      if (!label) {
        return NextResponse.json({ success: false, error: 'Label is required' }, { status: 400 });
      }
      if (extraFields.some((f) => f.label.toLowerCase() === label.toLowerCase())) {
        return NextResponse.json({ success: false, error: 'An extra with that name already exists' }, { status: 409 });
      }
      const extra = { extraId: newPayrollExtraId(), label, kind };
      await PayrollMonth.updateOne({ monthYear }, { $push: { extraFields: extra } });
      const saved = await PayrollMonth.findOne({ monthYear }).lean();
      return NextResponse.json({ success: true, data: saved });
    }

    if (action === 'remove') {
      const extraId = String(body?.extraId || '').trim();
      if (!extraId) {
        return NextResponse.json({ success: false, error: 'extraId is required' }, { status: 400 });
      }
      const nextFields = extraFields.filter((f) => f.id !== extraId);
      if (nextFields.length === extraFields.length) {
        return NextResponse.json({ success: false, error: 'Extra not found' }, { status: 404 });
      }
      const stored = extraFieldsForStore(nextFields);
      for (const line of doc.lines || []) {
        const overrides = plainPayrollOverrides(line.overrides);
        if (overrides.customAmounts && extraId in overrides.customAmounts) {
          const { [extraId]: _removed, ...rest } = overrides.customAmounts;
          overrides.customAmounts = rest;
        }
        applyPayrollLineOverrides(line, overrides, doc.calendar, monthYear, nextFields);
      }
      doc.markModified('lines');
      await doc.save();
      await PayrollMonth.updateOne({ monthYear }, { $set: { extraFields: stored } });
      const saved = await PayrollMonth.findOne({ monthYear }).lean();
      return NextResponse.json({ success: true, data: saved });
    }

    return NextResponse.json({ success: false, error: 'action must be add or remove' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/payroll/extras', err);
    return NextResponse.json({ success: false, error: 'Failed to update extras' }, { status: 500 });
  }
}
