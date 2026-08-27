import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Fine from '@/models/Fine';
import { transporter, mailOptions } from '@/lib/mailer';
import { escapeHtml } from '@/lib/attendanceRequestEmail';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function buildEmployeeDashboardLink(baseUrl: string, monthYear: string): string {
  const destination = `/employee/dashboard?tab=attendance&monthYear=${encodeURIComponent(monthYear)}`;
  return `${baseUrl}/employee/login?next=${encodeURIComponent(destination)}`;
}

function formatMonthLabel(monthYear: string): string {
  const [year, month] = monthYear.split('-');
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  if (Number.isNaN(d.getTime())) return monthYear;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type PendingItem = {
  date: string;
  serialNo: string;
  reason: string;
  isWarning: boolean;
  fineAmount: number;
};

function buildFineNoticeEmailHtml(opts: {
  employeeName: string;
  monthLabel: string;
  items: PendingItem[];
  totalPendingAmount: number;
  dashboardLink: string;
}): string {
  const { employeeName, monthLabel, items, totalPendingAmount, dashboardLink } = opts;
  const name = escapeHtml(employeeName);
  const month = escapeHtml(monthLabel);
  const link = escapeHtml(dashboardLink);

  const tableRows = items
    .map((item, index) => {
      const amountCell = item.isWarning
        ? `<span style="display:inline-block;padding:4px 8px;background-color:#fef3c7;color:#b45309;border-radius:4px;font-size:12px;font-weight:600;">Warning</span>`
        : `<span style="font-weight:700;color:#be123c;">₹${escapeHtml(String(item.fineAmount))}</span>`;
      return `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:12px 8px;text-align:center;font-size:14px;color:#6b7280;">${index + 1}</td>
        <td style="padding:12px 8px;font-size:14px;color:#111827;font-weight:500;white-space:nowrap;">${escapeHtml(formatDisplayDate(item.date))}</td>
        <td style="padding:12px 8px;font-size:13px;color:#374151;font-family:ui-monospace,monospace;">${escapeHtml(item.serialNo || '—')}</td>
        <td style="padding:12px 8px;font-size:14px;color:#374151;word-break:break-word;">${escapeHtml(item.reason || '—')}</td>
        <td style="padding:12px 8px;text-align:right;">${amountCell}</td>
      </tr>`;
    })
    .join('');

  const mobileCards = items
    .map((item) => {
      const amountLabel = item.isWarning
        ? `<span style="color:#b45309;font-weight:600;">Warning</span>`
        : `<span style="color:#be123c;font-weight:700;">₹${escapeHtml(String(item.fineAmount))}</span>`;
      return `
      <div style="background-color:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">
          <div style="font-size:14px;color:#111827;font-weight:600;">${escapeHtml(formatDisplayDate(item.date))}</div>
          ${amountLabel}
        </div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Serial: ${escapeHtml(item.serialNo || '—')}</div>
        <div style="font-size:14px;color:#374151;">${escapeHtml(item.reason || '—')}</div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pending Fine Notice</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; padding: 12px !important; }
      .desktop-table { display: none !important; }
      .mobile-cards { display: block !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f5f5f5;">
  <div class="email-container" style="max-width:600px;margin:20px auto;padding:20px;">
    <div style="background-color:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#be123c 0%,#9f1239 100%);padding:28px 24px;color:white;">
        <div style="font-size:13px;opacity:0.9;margin-bottom:6px;">Asija &amp; Associates</div>
        <h1 style="margin:0;font-size:22px;font-weight:700;line-height:1.3;">Pending fine notice</h1>
        <p style="margin:8px 0 0;font-size:14px;opacity:0.95;">${month}</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.5;">
          Dear <strong>${name}</strong>,
        </p>
        <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.55;">
          You have <strong>${items.length}</strong> pending fine/warning record(s) for <strong>${month}</strong>.
          Total pending amount: <strong style="color:#be123c;">₹${escapeHtml(String(totalPendingAmount))}</strong>.
        </p>

        <div class="desktop-table" style="overflow-x:auto;margin-bottom:20px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background-color:#f8fafc;border-bottom:2px solid #e2e8f0;">
                <th style="padding:10px 8px;text-align:center;font-size:12px;color:#64748b;font-weight:600;">#</th>
                <th style="padding:10px 8px;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Date</th>
                <th style="padding:10px 8px;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Serial</th>
                <th style="padding:10px 8px;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Reason</th>
                <th style="padding:10px 8px;text-align:right;font-size:12px;color:#64748b;font-weight:600;">Amount</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>

        <div class="mobile-cards" style="display:none;margin-bottom:20px;">
          ${mobileCards}
        </div>

        <div style="text-align:center;margin:24px 0 8px;">
          <a href="${link}" style="display:inline-block;padding:12px 22px;background-color:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;">
            Open employee portal
          </a>
        </div>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;text-align:center;">
          This is an automated notice from HR. Please contact HR if you have questions about any fine.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    if (effective.sections.fines !== 'edit') {
      return NextResponse.json(
        { success: false, error: 'Not allowed to email fine notices' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const employeeIds: string[] = Array.isArray(body?.employeeIds) ? body.employeeIds.map(String) : [];
    const monthYear = String(body?.monthYear || '').trim();

    if (employeeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'employeeIds array is required' },
        { status: 400 }
      );
    }
    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json(
        { success: false, error: 'monthYear (YYYY-MM) is required' },
        { status: 400 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';
    const monthLabel = formatMonthLabel(monthYear);
    const dashboardLink = buildEmployeeDashboardLink(baseUrl, monthYear);

    let sentCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const employeeId of employeeIds) {
      try {
        const user = await User.findById(employeeId).select('name email odId').lean();
        if (!user) {
          skippedCount += 1;
          errors.push(`User ${employeeId} not found`);
          continue;
        }

        const toEmail = String(user.email || '').trim();
        if (!toEmail) {
          skippedCount += 1;
          errors.push(`${user.name || employeeId}: no email`);
          continue;
        }

        const fineDoc = await Fine.findOne({ userId: employeeId, monthYear }).lean();
        if (!fineDoc) {
          skippedCount += 1;
          errors.push(`${user.name}: no fine record for ${monthYear}`);
          continue;
        }

        const pending = (fineDoc.fineRecords || []).filter((r) => r.status === 'pending');
        if (pending.length === 0) {
          skippedCount += 1;
          errors.push(`${user.name}: no pending fines/warnings`);
          continue;
        }

        const items: PendingItem[] = pending
          .slice()
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .map((r) => ({
            date: String(r.date || ''),
            serialNo: String(r.serialNo || ''),
            reason: String(r.reason || ''),
            isWarning: Boolean(r.isWarning),
            fineAmount: Number(r.fineAmount || 0),
          }));

        const totalPendingAmount = items
          .filter((i) => !i.isWarning)
          .reduce((sum, i) => sum + i.fineAmount, 0);

        await transporter.sendMail({
          ...mailOptions,
          to: toEmail,
          subject: `Pending fine notice — ${monthLabel}`,
          html: buildFineNoticeEmailHtml({
            employeeName: String(user.name || 'Employee'),
            monthLabel,
            items,
            totalPendingAmount: Number(totalPendingAmount.toFixed(2)),
            dashboardLink,
          }),
        });

        sentCount += 1;
      } catch (err) {
        skippedCount += 1;
        const msg = err instanceof Error ? err.message : 'Unknown send error';
        errors.push(`Employee ${employeeId}: ${msg}`);
        console.error('[fines/notify] send failed', employeeId, err);
      }
    }

    return NextResponse.json({
      success: true,
      sentCount,
      skippedCount,
      errors: errors.slice(0, 25),
    });
  } catch (error) {
    console.error('Fine notify error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send fine notices',
      },
      { status: 500 }
    );
  }
}
