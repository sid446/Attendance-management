import { jsPDF } from 'jspdf';
import type { IPayrollLine } from '@/models/PayrollMonth';
import { escapeHtml } from '@/lib/attendanceRequestEmail';
import { formatMonthLabel, inr } from '@/lib/salaryCalculation';

function money(n: number): string {
  if (!n) return '—';
  return inr(n);
}

export function buildPayslipHtml(line: IPayrollLine, monthYear: string): string {
  const period = formatMonthLabel(monthYear);
  const name = escapeHtml(line.name);
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#e2e8f0;font-family:Arial,sans-serif;">
  <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #cbd5e1;">
    <div style="background:#0f172a;color:#fff;padding:20px 24px;">
      <h1 style="margin:0;font-size:20px;">Salary Slip</h1>
      <p style="margin:6px 0 0;color:#cbd5e1;font-size:13px;">${escapeHtml(period)}</p>
    </div>
    <div style="padding:20px 24px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
        <tr>
          <td style="color:#64748b;padding:4px 0;">Employee Name</td>
          <td style="font-weight:700;color:#0f172a;">${name}</td>
          <td style="color:#64748b;padding:4px 0;">Total Office Working Days</td>
          <td style="font-weight:600;text-align:right;">${line.officeWorkingDays}</td>
        </tr>
        <tr>
          <td style="color:#64748b;padding:4px 0;">Team</td>
          <td>${escapeHtml(line.verticalHead || line.team || '—')}</td>
          <td style="color:#64748b;">Staff net working days</td>
          <td style="font-weight:600;text-align:right;">${line.netWorkingDays}</td>
        </tr>
        <tr>
          <td style="color:#64748b;padding:4px 0;">Designation</td>
          <td>${escapeHtml(line.designation || '—')}</td>
          <td style="color:#64748b;">Leaves Earned (this month)</td>
          <td style="text-align:right;">${line.isArticle ? '—' : line.leavesEarned}</td>
        </tr>
        <tr>
          <td style="color:#64748b;padding:4px 0;">Period</td>
          <td>${escapeHtml(period)}</td>
          <td style="color:#64748b;">Leaves Consumed / Balance</td>
          <td style="text-align:right;">${line.isArticle ? '—' : `${line.leavesConsumed} / ${line.leavesCf}`}</td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f1f5f9;">
          <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;">Income</th>
          <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Amount</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;">Deductions</th>
          <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Amount</th>
        </tr>
        <tr>
          <td style="padding:8px;">Basic Salary</td>
          <td style="padding:8px;text-align:right;">${money(line.payableBasic)}</td>
          <td style="padding:8px;">Penalty</td>
          <td style="padding:8px;text-align:right;">${money(line.penalty)}</td>
        </tr>
        <tr>
          <td style="padding:8px;">Laptop Reimbursement</td>
          <td style="padding:8px;text-align:right;">${money(line.payableLaptop)}</td>
          <td style="padding:8px;">Advance Adjust.</td>
          <td style="padding:8px;text-align:right;">${money(line.advances)}</td>
        </tr>
        <tr>
          <td style="padding:8px;">TA Reimbursement</td>
          <td style="padding:8px;text-align:right;">${money(line.taReimbursement)}</td>
          <td style="padding:8px;">Laptop adjustment</td>
          <td style="padding:8px;text-align:right;">${money(line.laptopAdjustment)}</td>
        </tr>
        <tr>
          <td style="padding:8px;">LC Reimbursement</td>
          <td style="padding:8px;text-align:right;">${money(line.lcReimbursement)}</td>
          <td style="padding:8px;">(Less): Net Absent Days</td>
          <td style="padding:8px;text-align:right;">${line.leavesTaken > line.leavesConsumed && !line.isArticle ? (line.leavesTaken - line.leavesConsumed).toFixed(2) : '—'}</td>
        </tr>
        <tr style="font-weight:700;">
          <td style="padding:8px;border-top:1px solid #e2e8f0;">Total</td>
          <td style="padding:8px;text-align:right;border-top:1px solid #e2e8f0;">${money(line.payableBasic + line.payableLaptop + line.taReimbursement + line.lcReimbursement)}</td>
          <td style="padding:8px;border-top:1px solid #e2e8f0;">Total</td>
          <td style="padding:8px;text-align:right;border-top:1px solid #e2e8f0;">${money(line.penalty + line.advances + line.laptopAdjustment)}</td>
        </tr>
        <tr>
          <td colspan="3" style="padding:12px 8px;font-size:15px;font-weight:700;">Net Salary</td>
          <td style="padding:12px 8px;text-align:right;font-size:15px;font-weight:700;">${money(line.netSalary)}</td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">This is an automated payslip from HR. Bank payment this month: ${money(line.bankPayment)}.</p>
    </div>
  </div>
</body>
</html>`;
}

export function buildPayslipPdf(line: IPayrollLine, monthYear: string): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const period = formatMonthLabel(monthYear);
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Salary Slip', 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(period, 14, 22);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(line.name || 'Employee', 14, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`${line.designation || '—'}  ·  ${line.verticalHead || line.team || '—'}`, 14, 46);

  const rows: [string, string][] = [
    ['Total office working days', String(line.officeWorkingDays)],
    ['Net working days', String(line.netWorkingDays)],
    ['Leaves earned / consumed / C/F', line.isArticle ? '—' : `${line.leavesEarned} / ${line.leavesConsumed} / ${line.leavesCf}`],
    ['Basic (payable)', inr(line.payableBasic)],
    ['Laptop reimbursement', inr(line.payableLaptop)],
    ['TA / LC reimbursement', `${inr(line.taReimbursement)} / ${inr(line.lcReimbursement)}`],
    ['Penalty', inr(line.penalty)],
    ['Advance / Laptop adj.', `${inr(line.advances)} / ${inr(line.laptopAdjustment)}`],
    ['Net salary', inr(line.netSalary)],
    ['Bank payment', inr(line.bankPayment)],
  ];

  let y = 58;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y - 6, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Particulars', 16, y);
  doc.text('Amount', 160, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  for (const [label, value] of rows) {
    doc.setTextColor(51, 65, 85);
    doc.text(label, 16, y);
    doc.text(value, 160, y);
    y += 8;
  }

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Generated from Attendance Console. Contact HR for any discrepancy.', 14, 285);
  const buf = Buffer.from(doc.output('arraybuffer'));
  return buf;
}

export function payslipRecipient(line: IPayrollLine): string | null {
  const email = String(line.email || '').trim().toLowerCase();
  const att = String(line.attendanceEmail || '').trim().toLowerCase();
  if (email && email.includes('@')) return email;
  if (att && att.includes('@')) return att;
  return null;
}
