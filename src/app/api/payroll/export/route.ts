import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PayrollMonth from '@/models/PayrollMonth';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { buildPayrollWorkbook } from '@/lib/payrollExport';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    const denied = assertHrSection(effective, 'salaryPayroll', 'view');
    if (denied) return denied;

    const monthYear = new URL(request.url).searchParams.get('monthYear') || '';
    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json({ success: false, error: 'monthYear is required' }, { status: 400 });
    }

    const doc = await PayrollMonth.findOne({ monthYear }).lean();
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Generate payroll first' }, { status: 404 });
    }

    const buffer = await buildPayrollWorkbook(doc as never);
    const fileName = `Salary-Sheet-${monthYear}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error('GET /api/payroll/export', err);
    return NextResponse.json({ success: false, error: 'Failed to export payroll' }, { status: 500 });
  }
}
