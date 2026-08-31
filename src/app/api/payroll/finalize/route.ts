import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PayrollMonth from '@/models/PayrollMonth';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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
    const action = String(body?.action || 'finalize').toLowerCase();
    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json({ success: false, error: 'monthYear is required' }, { status: 400 });
    }

    const doc = await PayrollMonth.findOne({ monthYear });
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Payroll not generated for this month' }, { status: 404 });
    }

    const userIds = Array.isArray(body?.userIds)
      ? body.userIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : body?.userId
        ? [String(body.userId).trim()]
        : [];

    if (userIds.length > 0) {
      if (action === 'reopen' && doc.status === 'finalized') {
        return NextResponse.json(
          { success: false, error: 'Re-open the month before unfreezing an employee.' },
          { status: 409 }
        );
      }

      const wanted = new Set(userIds);
      let updated = 0;
      for (const line of doc.lines || []) {
        if (!wanted.has(String(line.userId))) continue;
        if (action === 'reopen') {
          line.frozen = false;
          line.frozenAt = null;
          line.frozenBy = '';
        } else {
          line.frozen = true;
          line.frozenAt = new Date();
          line.frozenBy = operatorEmail;
        }
        updated += 1;
      }
      if (updated === 0) {
        return NextResponse.json({ success: false, error: 'Employee not in this payroll' }, { status: 404 });
      }
      doc.markModified('lines');
      await doc.save();
      return NextResponse.json({
        success: true,
        updated,
        data: doc,
      });
    }

    if (action === 'reopen') {
      doc.status = 'draft';
      doc.finalizedAt = null;
      doc.finalizedBy = '';
    } else {
      doc.status = 'finalized';
      doc.finalizedAt = new Date();
      doc.finalizedBy = operatorEmail;
    }
    await doc.save();
    return NextResponse.json({ success: true, data: { status: doc.status, finalizedAt: doc.finalizedAt } });
  } catch (err) {
    console.error('POST /api/payroll/finalize', err);
    return NextResponse.json({ success: false, error: 'Failed to update status' }, { status: 500 });
  }
}
