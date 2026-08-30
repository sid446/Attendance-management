import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PayrollMonth from '@/models/PayrollMonth';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { transporter, mailOptions } from '@/lib/mailer';
import { getServiceAdminEmail } from '@/lib/hrServiceEmail';
import User from '@/models/User';
import { buildPayslipHtml, buildPayslipPdf, payslipFileName, payslipRecipient } from '@/lib/payrollPayslip';
import { formatMonthLabel, parseMoney } from '@/lib/salaryCalculation';
import { payrollLinePlain } from '@/lib/payrollGenerate';
import type { IPayrollLine } from '@/models/PayrollMonth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
    const employeeIds: string[] = Array.isArray(body?.employeeIds) ? body.employeeIds.map(String) : [];
    if (!/^\d{4}-\d{2}$/.test(monthYear) || employeeIds.length === 0) {
      return NextResponse.json({ success: false, error: 'monthYear and employeeIds are required' }, { status: 400 });
    }

    const doc = await PayrollMonth.findOne({ monthYear });
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Generate payroll first' }, { status: 404 });
    }

    const period = formatMonthLabel(monthYear);
    const bcc = getServiceAdminEmail();
    const sent: string[] = [];
    const failed: { name: string; error: string }[] = [];
    const users = await User.find({ _id: { $in: employeeIds } })
      .select('esi otherAllowance')
      .lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    for (const id of employeeIds) {
      const idx = doc.lines.findIndex((l) => String(l.userId) === id);
      if (idx < 0) {
        failed.push({ name: id, error: 'Not in payroll' });
        continue;
      }
      const line = doc.lines[idx];
      const to = payslipRecipient(line);
      if (!to) {
        failed.push({ name: line.name, error: 'No email on file' });
        continue;
      }
      try {
        const master = userById.get(String(line.userId));
        const hydrated: IPayrollLine = {
          ...payrollLinePlain(line),
          esiNumber: line.esiNumber || String(master?.esi || ''),
          otherAllowance: line.otherAllowance || parseMoney(master?.otherAllowance),
        };
        const pdf = buildPayslipPdf(hydrated, monthYear, doc.calendar);
        await transporter.sendMail({
          ...mailOptions,
          to,
          bcc: operatorEmail || bcc,
          subject: `Salary Slip — ${period}`,
          html: buildPayslipHtml(hydrated, monthYear, doc.calendar),
          attachments: [
            {
              filename: payslipFileName(hydrated, monthYear),
              content: pdf,
              contentType: 'application/pdf',
            },
          ],
        });
        doc.lines[idx].payslipSentAt = new Date();
        doc.lines[idx].payslipSentTo = to;
        sent.push(line.name);
      } catch (e) {
        failed.push({ name: line.name, error: e instanceof Error ? e.message : 'Send failed' });
      }
    }

    doc.markModified('lines');
    await doc.save();

    return NextResponse.json({
      success: true,
      sent: sent.length,
      failed,
      names: sent,
    });
  } catch (err) {
    console.error('POST /api/payroll/payslip', err);
    return NextResponse.json({ success: false, error: 'Failed to send payslips' }, { status: 500 });
  }
}
