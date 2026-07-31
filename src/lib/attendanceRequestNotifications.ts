import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';
import { escapeHtml } from '@/lib/attendanceRequestEmail';
import { getWorkingUnderPartnerForDate } from '@/lib/userFieldHistory';

export type RequestDecisionOutcome = 'approved' | 'rejected' | 'partner_approved_hr_pending';

export interface RequestDecisionRow {
  employeeName: string;
  date: string;
  requestedStatus: string;
  /** Final request status after this action (Approved, Rejected, PendingHr, …). */
  requestState: string;
  reason?: string;
}

export type RequestRouting = {
  partnerName: string;
  notificationEmail: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Partner inbox used for new-request mails; also fallback when partner user row is missing. */
export async function resolvePartnerNotificationEmail(
  partnerName: string | undefined | null,
  employeeUser?: { attendanceEmail?: string | null; email?: string | null } | null
): Promise<string | null> {
  const pn = String(partnerName || '').trim();
  if (pn) {
    const dottedName = pn.replace(/\s+/g, '.');
    const partnerUser = await User.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${escapeRegex(pn)}$`, 'i') } },
        { name: { $regex: new RegExp(`^${escapeRegex(dottedName)}$`, 'i') } },
      ],
    })
      .select('attendanceEmail email')
      .lean();

    if (partnerUser) {
      // Partner's login email is their request inbox; attendanceEmail is who approves them.
      const em = String(partnerUser.email || partnerUser.attendanceEmail || '').trim();
      if (em) return em;
    }
  }

  const fallback = String(employeeUser?.attendanceEmail || employeeUser?.email || '').trim();
  return fallback || null;
}

/**
 * Route an attendance request to the work partner who covered the request date
 * (from fieldHistories), not necessarily the employee's current partner.
 */
export async function resolveRequestRoutingForDate(
  user: {
    workingUnderPartner?: string | null;
    attendanceEmail?: string | null;
    email?: string | null;
    team?: string | null;
    fieldHistories?: unknown;
  },
  date: string | Date
): Promise<RequestRouting | { error: string }> {
  const partnerName = String(
    getWorkingUnderPartnerForDate(user as Parameters<typeof getWorkingUnderPartnerForDate>[0], date) ||
      user.workingUnderPartner ||
      ''
  ).trim();

  if (!partnerName) {
    return {
      error: 'No work partner was assigned for this date. Please contact admin.',
    };
  }

  const notificationEmail = await resolvePartnerNotificationEmail(partnerName, user);
  if (!notificationEmail) {
    return {
      error: `No email found for work partner "${partnerName}". Please contact admin.`,
    };
  }

  return { partnerName, notificationEmail };
}

export function resolveDecisionOutcome(
  action: 'approve' | 'reject',
  rows: RequestDecisionRow[]
): RequestDecisionOutcome {
  if (action === 'reject') return 'rejected';
  if (rows.some((r) => r.requestState === 'PendingHr')) return 'partner_approved_hr_pending';
  return 'approved';
}

function outcomeHeading(outcome: RequestDecisionOutcome): string {
  switch (outcome) {
    case 'rejected':
      return 'Rejected';
    case 'partner_approved_hr_pending':
      return 'Partner approved — HR pending';
    default:
      return 'Approved';
  }
}

function outcomeIntro(outcome: RequestDecisionOutcome, employeeNames: string[]): string {
  const who =
    employeeNames.length === 1
      ? escapeHtml(employeeNames[0])
      : `${employeeNames.length} team members`;
  switch (outcome) {
    case 'rejected':
      return `Attendance request(s) for <strong>${who}</strong> have been <strong>rejected</strong>.`;
    case 'partner_approved_hr_pending':
      return `Request(s) for <strong>${who}</strong> were approved at partner level and are <strong>awaiting HR final approval</strong> before attendance is updated.`;
    default:
      return `Attendance request(s) for <strong>${who}</strong> have been <strong>approved</strong>.`;
  }
}

function outcomeColors(outcome: RequestDecisionOutcome): { bg: string; text: string } {
  switch (outcome) {
    case 'rejected':
      return { bg: '#fce8e6', text: '#d21a0c' };
    case 'partner_approved_hr_pending':
      return { bg: '#fef3c7', text: '#92400e' };
    default:
      return { bg: '#e6f4ea', text: '#008040' };
  }
}

export function buildPartnerDecisionEmailHtml(opts: {
  partnerGreetingName: string;
  outcome: RequestDecisionOutcome;
  rows: RequestDecisionRow[];
  processedBy: string;
  remarks?: string;
  processingTime: string;
}): string {
  const { partnerGreetingName, outcome, rows, processedBy, remarks, processingTime } = opts;
  const colors = outcomeColors(outcome);
  const employeeNames = [...new Set(rows.map((r) => r.employeeName))];

  const tableRows = rows
    .map(
      (row) => `
    <tr style="border-bottom: 1px solid #e5e5e7;">
      <td style="padding: 12px 0; font-size: 14px; color: #1d1d1f;">${escapeHtml(row.employeeName)}</td>
      <td style="padding: 12px 0; font-size: 14px; color: #1d1d1f;">${escapeHtml(
        new Date(row.date).toLocaleDateString('en-GB')
      )}</td>
      <td style="padding: 12px 0; font-size: 14px; color: #1d1d1f; text-align: center;">${escapeHtml(
        row.requestedStatus
      )}</td>
      <td style="padding: 12px 0; font-size: 14px; color: #1d1d1f; text-align: center;">${
        row.requestState === 'PendingHr' ? 'Awaiting HR' : escapeHtml(row.requestState)
      }</td>
      <td style="padding: 12px 0; font-size: 14px; color: #1d1d1f; text-align: right;">${escapeHtml(
        row.reason || '—'
      )}</td>
    </tr>`
    )
    .join('');

  return `
    <div style="background-color: #f5f5f7; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1d1d1f; line-height: 1.5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
        <div style="padding: 40px 40px 20px; text-align: center;">
          <img src="https://attendance.asija.in/lg.png" alt="Asija Logo" style="width: 56px; height: 56px; margin-bottom: 24px;">
          <h1 style="font-size: 26px; font-weight: 600; margin: 0; letter-spacing: -0.02em;">Team request update</h1>
          <div style="margin-top: 16px; display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; background-color: ${colors.bg}; color: ${colors.text}; text-transform: uppercase; letter-spacing: 0.05em;">
            ${escapeHtml(outcomeHeading(outcome))}
          </div>
        </div>
        <div style="padding: 0 40px 40px;">
          <p style="font-size: 17px; color: #424245; margin-bottom: 32px; text-align: center;">
            Hello ${escapeHtml(partnerGreetingName)},<br>${outcomeIntro(outcome, employeeNames)}
          </p>
          <div style="background-color: #fbfbfd; border-radius: 14px; padding: 24px; border: 1px solid #d2d2d7;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1px solid #d2d2d7;">
                  <th style="padding-bottom: 12px; font-size: 12px; color: #86868b; text-align: left; font-weight: 500;">EMPLOYEE</th>
                  <th style="padding-bottom: 12px; font-size: 12px; color: #86868b; text-align: left; font-weight: 500;">DATE</th>
                  <th style="padding-bottom: 12px; font-size: 12px; color: #86868b; text-align: center; font-weight: 500;">REQUESTED</th>
                  <th style="padding-bottom: 12px; font-size: 12px; color: #86868b; text-align: center; font-weight: 500;">STATE</th>
                  <th style="padding-bottom: 12px; font-size: 12px; color: #86868b; text-align: right; font-weight: 500;">REASON</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
            ${
              remarks
                ? `<div style="margin-top: 20px;">
              <p style="font-size: 14px; color: #86868b; margin-bottom: 4px;">Approver remarks</p>
              <p style="font-size: 14px; font-weight: 600; color: ${colors.text}; margin: 0;">${escapeHtml(remarks)}</p>
            </div>`
                : ''
            }
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e5e7;">
              <p style="font-size: 12px; color: #86868b; margin: 0;">Processed by: <strong>${escapeHtml(processedBy)}</strong></p>
              <p style="font-size: 12px; color: #86868b; margin: 4px 0 0;">Processed on: <strong>${escapeHtml(processingTime)}</strong></p>
            </div>
          </div>
          <div style="margin-top: 40px; text-align: center;">
            <a href="https://attendance.asija.in/employee/dashboard" style="display: inline-block; background-color: #0071e3; color: #ffffff; padding: 12px 32px; border-radius: 980px; font-size: 17px; font-weight: 500; text-decoration: none;">Open attendance console</a>
          </div>
        </div>
        <div style="background-color: #f5f5f7; padding: 32px 40px; text-align: center; border-top: 1px solid #d2d2d7;">
          <p style="font-size: 12px; color: #86868b; margin: 0;">Automated notification from Asija and Associates LLP Attendance System.</p>
        </div>
      </div>
    </div>`;
}

function istProcessingTime(): string {
  const now = new Date();
  const istDate = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
  const istTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: true });
  return `${istDate} ${istTime} (IST)`;
}

export async function sendPartnerRequestDecisionEmail(params: {
  partnerName?: string | null;
  employeeUser?: { attendanceEmail?: string; email?: string } | null;
  action: 'approve' | 'reject';
  rows: RequestDecisionRow[];
  processedBy: string;
  remarks?: string;
  /** Avoid duplicate mail when employee notification uses the same inbox. */
  skipIfSameAs?: string | null;
}): Promise<void> {
  if (!params.rows.length) return;

  const to = await resolvePartnerNotificationEmail(params.partnerName, params.employeeUser);
  if (!to) return;
  if (params.skipIfSameAs && to.trim().toLowerCase() === params.skipIfSameAs.trim().toLowerCase()) {
    return;
  }

  const outcome = resolveDecisionOutcome(params.action, params.rows);
  const subject =
    outcome === 'partner_approved_hr_pending'
      ? 'Team attendance requests — awaiting HR approval'
      : `Team attendance request ${outcome === 'approved' ? 'approved' : 'rejected'}`;

  const partnerGreetingName = String(params.partnerName || 'Partner').trim() || 'Partner';
  const html = buildPartnerDecisionEmailHtml({
    partnerGreetingName,
    outcome,
    rows: params.rows,
    processedBy: params.processedBy,
    remarks: params.remarks,
    processingTime: istProcessingTime(),
  });

  await transporter.sendMail({
    ...mailOptions,
    to,
    subject,
    html,
  });
}
