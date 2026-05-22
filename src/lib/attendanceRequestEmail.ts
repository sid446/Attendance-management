/**
 * Mobile-first HTML emails for employee attendance requests (partner / attendance inbox).
 * Defaults to stacked cards; wide screens get a table via media query.
 */

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const C = {
  pageBg: '#e2e8f0',
  card: '#ffffff',
  headerBg: '#0f172a',
  headerText: '#ffffff',
  headerSub: '#cbd5e1',
  body: '#1e293b',
  muted: '#475569',
  label: '#64748b',
  border: '#cbd5e1',
  rowBorder: '#e2e8f0',
  badgeBg: '#e0f2fe',
  badgeText: '#0c4a6e',
  badgeBorder: '#7dd3fc',
  primaryBtn: '#0284c7',
  primaryBtnText: '#ffffff',
  reviewBtn: '#047857',
  reviewBtnText: '#ffffff',
  infoBg: '#f8fafc',
  infoAccent: '#0284c7',
  noteBg: '#ecfdf5',
  noteBorder: '#6ee7b7',
  noteText: '#14532d',
  tableHeadBg: '#f1f5f9',
  tableHeadText: '#334155',
};

function statusBadge(status: string): string {
  const s = escapeHtml(status);
  return `<span style="display:inline-block;padding:6px 10px;background-color:${C.badgeBg};color:${C.badgeText};border:1px solid ${C.badgeBorder};border-radius:6px;font-size:13px;font-weight:600;line-height:1.3;">${s}</span>`;
}

function reviewButton(href: string, label = 'Review'): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;background-color:${C.reviewBtn};color:${C.reviewBtnText};text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;line-height:1.2;mso-padding-alt:0;text-align:center;">${escapeHtml(label)}</a>`;
}

export type CorrectionRequestEmailRow = {
  id: string;
  userName: string;
  date: string;
  requestedStatus: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
};

export function buildCorrectionTableRows(
  requests: CorrectionRequestEmailRow[],
  baseUrl: string
): string {
  return requests
    .map((req, index) => {
      const reviewLink = `${baseUrl}/partner/review?id=${req.id}`;
      const timeRange =
        req.startTime && req.endTime ? `${req.startTime} - ${req.endTime}` : '—';
      return `
        <tr>
          <td style="padding:14px 10px;text-align:center;font-size:14px;color:${C.muted};border-bottom:1px solid ${C.rowBorder};">${index + 1}</td>
          <td style="padding:14px 10px;font-size:15px;color:${C.body};font-weight:600;border-bottom:1px solid ${C.rowBorder};">${escapeHtml(req.userName)}</td>
          <td style="padding:14px 10px;font-size:15px;color:${C.body};border-bottom:1px solid ${C.rowBorder};">${escapeHtml(req.date)}</td>
          <td style="padding:14px 10px;border-bottom:1px solid ${C.rowBorder};">${statusBadge(req.requestedStatus)}</td>
          <td style="padding:14px 10px;font-size:15px;color:${C.body};border-bottom:1px solid ${C.rowBorder};">${escapeHtml(timeRange)}</td>
          <td style="padding:14px 10px;font-size:14px;color:${C.body};line-height:1.5;border-bottom:1px solid ${C.rowBorder};word-break:break-word;">${escapeHtml(req.reason || '—')}</td>
          <td style="padding:14px 10px;text-align:center;border-bottom:1px solid ${C.rowBorder};">${reviewButton(reviewLink)}</td>
        </tr>`;
    })
    .join('');
}

export function buildCorrectionMobileCards(
  requests: CorrectionRequestEmailRow[],
  baseUrl: string
): string {
  return requests
    .map((req, index) => {
      const reviewLink = `${baseUrl}/partner/review?id=${req.id}`;
      const timeRange =
        req.startTime && req.endTime ? `${req.startTime} - ${req.endTime}` : '—';
      return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;border:1px solid ${C.border};border-radius:10px;background-color:${C.card};">
          <tr>
            <td style="padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom:12px;border-bottom:1px solid ${C.rowBorder};">
                    <div style="font-size:11px;font-weight:700;color:${C.label};text-transform:uppercase;letter-spacing:0.06em;">Request #${index + 1}</div>
                    <div style="font-size:17px;font-weight:700;color:${C.body};margin-top:4px;line-height:1.3;">${escapeHtml(req.userName)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0 8px;">${statusBadge(req.requestedStatus)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <div style="font-size:12px;font-weight:600;color:${C.label};margin-bottom:4px;">Date</div>
                    <div style="font-size:16px;font-weight:600;color:${C.body};">${escapeHtml(req.date)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <div style="font-size:12px;font-weight:600;color:${C.label};margin-bottom:4px;">Time</div>
                    <div style="font-size:16px;color:${C.body};">${escapeHtml(timeRange)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0 14px;">
                    <div style="font-size:12px;font-weight:600;color:${C.label};margin-bottom:4px;">Reason</div>
                    <div style="font-size:15px;color:${C.body};line-height:1.55;word-break:break-word;">${escapeHtml(req.reason || '—')}</div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <a href="${escapeHtml(reviewLink)}" style="display:block;width:100%;box-sizing:border-box;padding:14px 16px;background-color:${C.reviewBtn};color:${C.reviewBtnText};text-decoration:none;border-radius:8px;font-size:16px;font-weight:700;text-align:center;line-height:1.3;">Review request</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`;
    })
    .join('');
}

export type GroupedRequestEmailRow = {
  userName: string;
  requestedStatus: string;
  datesDisplay: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
};

export function buildGroupedTableRows(rows: GroupedRequestEmailRow[]): string {
  return rows
    .map((row, index) => {
      const timeRange =
        row.startTime && row.endTime ? `${row.startTime} - ${row.endTime}` : '—';
      return `
        <tr>
          <td style="padding:14px 10px;text-align:center;font-size:14px;color:${C.muted};border-bottom:1px solid ${C.rowBorder};">${index + 1}</td>
          <td style="padding:14px 10px;font-size:15px;color:${C.body};font-weight:600;border-bottom:1px solid ${C.rowBorder};">${escapeHtml(row.userName)}</td>
          <td style="padding:14px 10px;font-size:15px;color:${C.body};line-height:1.4;border-bottom:1px solid ${C.rowBorder};word-break:break-word;">${escapeHtml(row.datesDisplay)}</td>
          <td style="padding:14px 10px;border-bottom:1px solid ${C.rowBorder};">${statusBadge(row.requestedStatus)}</td>
          <td style="padding:14px 10px;font-size:15px;color:${C.body};border-bottom:1px solid ${C.rowBorder};">${escapeHtml(timeRange)}</td>
          <td style="padding:14px 10px;font-size:14px;color:${C.body};line-height:1.5;border-bottom:1px solid ${C.rowBorder};word-break:break-word;">${escapeHtml(row.reason || '—')}</td>
        </tr>`;
    })
    .join('');
}

export function buildGroupedMobileCards(rows: GroupedRequestEmailRow[]): string {
  return rows
    .map((row, index) => {
      const timeRange =
        row.startTime && row.endTime ? `${row.startTime} - ${row.endTime}` : '—';
      return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;border:1px solid ${C.border};border-radius:10px;background-color:${C.card};">
          <tr>
            <td style="padding:16px;">
              <div style="font-size:11px;font-weight:700;color:${C.label};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Request #${index + 1}</div>
              <div style="font-size:17px;font-weight:700;color:${C.body};margin-bottom:12px;line-height:1.3;">${escapeHtml(row.userName)}</div>
              <div style="margin-bottom:12px;">${statusBadge(row.requestedStatus)}</div>
              <div style="margin-bottom:10px;">
                <div style="font-size:12px;font-weight:600;color:${C.label};margin-bottom:4px;">Dates</div>
                <div style="font-size:16px;font-weight:600;color:${C.body};line-height:1.4;word-break:break-word;">${escapeHtml(row.datesDisplay)}</div>
              </div>
              <div style="margin-bottom:10px;">
                <div style="font-size:12px;font-weight:600;color:${C.label};margin-bottom:4px;">Time</div>
                <div style="font-size:16px;color:${C.body};">${escapeHtml(timeRange)}</div>
              </div>
              <div>
                <div style="font-size:12px;font-weight:600;color:${C.label};margin-bottom:4px;">Reason</div>
                <div style="font-size:15px;color:${C.body};line-height:1.55;word-break:break-word;">${escapeHtml(row.reason || '—')}</div>
              </div>
            </td>
          </tr>
        </table>`;
    })
    .join('');
}

export type AttendanceRequestEmailOptions = {
  title: string;
  reviewAllLink: string;
  infoHtml: string;
  description: string;
  tableBodyHtml: string;
  mobileCardsHtml: string;
  noteHtml?: string;
  showReviewColumn?: boolean;
};

export function buildAttendanceRequestEmailHtml(opts: AttendanceRequestEmailOptions): string {
  const reviewCol = opts.showReviewColumn !== false;
  const noteBlock =
    opts.noteHtml ??
    `<strong style="color:${C.noteText};">Note:</strong> Open each request to approve or reject. Your decision updates attendance immediately.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(opts.title)}</title>
  <style type="text/css">
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; }
    table { border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { color: ${C.primaryBtn}; }
    .desktop-table { display: none !important; max-height: 0 !important; overflow: hidden !important; }
    .mobile-cards { display: block !important; width: 100% !important; }
    @media only screen and (min-width: 600px) {
      .desktop-table { display: block !important; max-height: none !important; overflow: visible !important; }
      .mobile-cards { display: none !important; max-height: 0 !important; overflow: hidden !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${C.pageBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.pageBg};">
    <tr>
      <td align="center" style="padding:16px 12px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">
          <tr>
            <td style="background-color:${C.card};border-radius:12px;overflow:hidden;border:1px solid ${C.border};box-shadow:0 4px 14px rgba(15,23,42,0.08);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:${C.headerBg};padding:28px 20px;text-align:center;">
                    <h1 style="margin:0;font-size:22px;font-weight:700;color:${C.headerText};line-height:1.35;">${escapeHtml(opts.title)}</h1>
                    <p style="margin:10px 0 0;font-size:14px;color:${C.headerSub};line-height:1.5;">Asija &amp; Associates · Attendance</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 16px;text-align:center;background-color:#f8fafc;border-bottom:1px solid ${C.rowBorder};">
                    <a href="${escapeHtml(opts.reviewAllLink)}" style="display:inline-block;padding:14px 24px;background-color:${C.primaryBtn};color:${C.primaryBtnText};text-decoration:none;border-radius:8px;font-size:16px;font-weight:700;line-height:1.3;">Review all pending</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 16px 8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.infoBg};border-left:4px solid ${C.infoAccent};border-radius:8px;">
                      <tr>
                        <td style="padding:16px;font-size:15px;color:${C.body};line-height:1.55;">${opts.infoHtml}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 16px 16px;font-size:15px;color:${C.muted};line-height:1.6;">${opts.description}</td>
                </tr>
                <tr>
                  <td style="padding:0 12px 16px;" class="mobile-cards">${opts.mobileCardsHtml}</td>
                </tr>
                <tr>
                  <td style="padding:0 12px 16px;" class="desktop-table">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:8px;overflow:hidden;">
                      <thead>
                        <tr style="background-color:${C.tableHeadBg};">
                          <th style="padding:12px 8px;text-align:center;font-size:12px;font-weight:700;color:${C.tableHeadText};text-transform:uppercase;letter-spacing:0.04em;">#</th>
                          <th style="padding:12px 8px;text-align:left;font-size:12px;font-weight:700;color:${C.tableHeadText};text-transform:uppercase;letter-spacing:0.04em;">Employee</th>
                          <th style="padding:12px 8px;text-align:left;font-size:12px;font-weight:700;color:${C.tableHeadText};text-transform:uppercase;letter-spacing:0.04em;">Date</th>
                          <th style="padding:12px 8px;text-align:left;font-size:12px;font-weight:700;color:${C.tableHeadText};text-transform:uppercase;letter-spacing:0.04em;">Status</th>
                          <th style="padding:12px 8px;text-align:left;font-size:12px;font-weight:700;color:${C.tableHeadText};text-transform:uppercase;letter-spacing:0.04em;">Time</th>
                          <th style="padding:12px 8px;text-align:left;font-size:12px;font-weight:700;color:${C.tableHeadText};text-transform:uppercase;letter-spacing:0.04em;">Reason</th>
                          ${reviewCol ? `<th style="padding:12px 8px;text-align:center;font-size:12px;font-weight:700;color:${C.tableHeadText};text-transform:uppercase;letter-spacing:0.04em;">Action</th>` : ''}
                        </tr>
                      </thead>
                      <tbody>${opts.tableBodyHtml}</tbody>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.noteBg};border:1px solid ${C.noteBorder};border-radius:8px;">
                      <tr>
                        <td style="padding:14px 16px;font-size:14px;color:${C.noteText};line-height:1.55;">${noteBlock}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px;text-align:center;background-color:#f8fafc;border-top:1px solid ${C.rowBorder};font-size:13px;color:${C.muted};line-height:1.5;">
                    Automated message — please do not reply to this email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Group pending requests by employee + status for leave-style emails. */
export function groupPendingRequestsForEmail(
  pendingRequests: Array<{
    userName: string;
    requestedStatus: string;
    date: string;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }>
): GroupedRequestEmailRow[] {
  const groups = new Map<string, typeof pendingRequests>();
  for (const req of pendingRequests) {
    const key = `${req.userName}-${req.requestedStatus}`;
    const list = groups.get(key) ?? [];
    list.push(req);
    groups.set(key, list);
  }

  const rows: GroupedRequestEmailRow[] = [];
  for (const requests of groups.values()) {
    const dates = requests.map((r) => r.date).sort();
    const ranges: string[] = [];
    let start = dates[0];
    let prev = dates[0];
    for (let i = 1; i < dates.length; i++) {
      const current = dates[i];
      const prevDate = new Date(prev);
      const currDate = new Date(current);
      const diff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diff > 1) {
        ranges.push(start === prev ? start : `${start} to ${prev}`);
        start = current;
      }
      prev = current;
    }
    ranges.push(start === prev ? start : `${start} to ${prev}`);

    const first = requests[0];
    rows.push({
      userName: first.userName,
      requestedStatus: first.requestedStatus,
      datesDisplay: ranges.join(', '),
      startTime: first.startTime,
      endTime: first.endTime,
      reason: first.reason,
    });
  }
  return rows;
}
