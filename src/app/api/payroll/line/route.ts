import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PayrollMonth from '@/models/PayrollMonth';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { applyPayrollLineOverrides, mergePayrollOverrides, plainPayrollOverrides } from '@/lib/payrollGenerate';
import { normalizePayrollExtraFields, type PayrollOverrides } from '@/lib/salaryCalculation';

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
    const userId = String(body?.userId || '').trim();
    const overrides = (body?.overrides || {}) as PayrollOverrides;

    if (!/^\d{4}-\d{2}$/.test(monthYear) || !userId) {
      return NextResponse.json({ success: false, error: 'monthYear and userId are required' }, { status: 400 });
    }

    const doc = await PayrollMonth.findOne({ monthYear });
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Payroll not generated for this month' }, { status: 404 });
    }
    if (doc.status === 'finalized') {
      return NextResponse.json({ success: false, error: 'Month is finalized. Re-open it to edit.' }, { status: 409 });
    }

    const idx = doc.lines.findIndex((l) => String(l.userId) === userId);
    if (idx < 0) {
      return NextResponse.json({ success: false, error: 'Employee not in this payroll' }, { status: 404 });
    }

    const current = doc.lines[idx];
    const extraFields = normalizePayrollExtraFields(doc.extraFields);
    const existing = plainPayrollOverrides(current.overrides);
    const merged = mergePayrollOverrides(existing, overrides);
    applyPayrollLineOverrides(current, merged, doc.calendar, monthYear, extraFields);
    doc.markModified('lines');
    await doc.save();

    return NextResponse.json({ success: true, data: doc.lines[idx] });
  } catch (err) {
    console.error('PATCH /api/payroll/line', err);
    return NextResponse.json({ success: false, error: 'Failed to update line' }, { status: 500 });
  }
}
