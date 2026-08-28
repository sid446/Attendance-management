import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PayrollMonth from '@/models/PayrollMonth';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { generatePayrollMonth } from '@/lib/payrollGenerate';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function requirePayrollAccess(request: NextRequest, need: 'view' | 'edit'): Promise<
  { error: NextResponse } | { operatorEmail: string }
> {
  const operatorEmail = await getHrOperatorEmailFromRequest(request);
  if (!operatorEmail) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
  const effective = effectiveFromDoc(operatorEmail, permDoc);
  const denied = assertHrSection(effective, 'salaryPayroll', need);
  if (denied) return { error: denied };
  return { operatorEmail };
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const auth = await requirePayrollAccess(request, 'view');
    if ('error' in auth) return auth.error;

    const monthYear = new URL(request.url).searchParams.get('monthYear') || '';
    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json({ success: false, error: 'monthYear (YYYY-MM) is required' }, { status: 400 });
    }

    const doc = await PayrollMonth.findOne({ monthYear }).lean();
    return NextResponse.json({ success: true, data: doc });
  } catch (err) {
    console.error('GET /api/payroll', err);
    return NextResponse.json({ success: false, error: 'Failed to load payroll' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const auth = await requirePayrollAccess(request, 'edit');
    if ('error' in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const monthYear = String(body?.monthYear || '').trim();
    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json({ success: false, error: 'monthYear (YYYY-MM) is required' }, { status: 400 });
    }

    const doc = await generatePayrollMonth(monthYear, auth.operatorEmail);
    return NextResponse.json({ success: true, data: doc });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate payroll';
    const status = message.includes('finalized') ? 409 : 500;
    console.error('POST /api/payroll', err);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
