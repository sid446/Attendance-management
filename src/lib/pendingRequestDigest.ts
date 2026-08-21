import AttendanceRequest from '@/models/AttendanceRequest';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';
import {
  buildAttendanceRequestEmailHtml,
  buildCorrectionMobileCards,
  buildCorrectionTableRows,
  escapeHtml,
  type CorrectionRequestEmailRow,
} from '@/lib/attendanceRequestEmail';
import { resolvePartnerNotificationEmail } from '@/lib/attendanceRequestNotifications';
import { createPartnerReviewAllLink } from '@/lib/partnerReviewToken';
import { isSelfApproverUser } from '@/lib/selfApproveAttendanceRequests';

export type DigestPendingRow = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  requestedStatus: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  partnerName: string;
  createdAt?: Date | string | null;
  attendanceEmail?: string;
};

type DigestRecipientBucket = {
  email: string;
  partnerNameForLink: string;
  rows: DigestPendingRow[];
};

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function daysBetween(fromYmdOrDate: string | Date, toYmd: string): number {
  const from =
    typeof fromYmdOrDate === 'string'
      ? new Date(`${String(fromYmdOrDate).slice(0, 10)}T00:00:00`)
      : new Date(fromYmdOrDate);
  const to = new Date(`${toYmd}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

function todayYmdIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function ageLabel(row: DigestPendingRow, todayYmd: string): string {
  const createdAge = row.createdAt ? daysBetween(new Date(row.createdAt), todayYmd) : 0;
  const dateAge = daysBetween(row.date, todayYmd);
  const age = Math.max(createdAge, dateAge);
  if (age <= 0) return 'today';
  if (age === 1) return '1 day';
  return `${age} days`;
}

function isOverdue(row: DigestPendingRow, todayYmd: string): boolean {
  const createdAge = row.createdAt ? daysBetween(new Date(row.createdAt), todayYmd) : 0;
  const dateAge = daysBetween(row.date, todayYmd);
  return Math.max(createdAge, dateAge) >= 3;
}

function addRowToBucket(
  buckets: Map<string, DigestRecipientBucket>,
  email: string,
  partnerNameForLink: string,
  row: DigestPendingRow
) {
  const key = normalizeEmail(email);
  if (!key || !key.includes('@')) return;
  const existing = buckets.get(key);
  if (!existing) {
    buckets.set(key, { email: key, partnerNameForLink, rows: [row] });
    return;
  }
  if (!existing.rows.some((r) => r.id === row.id)) {
    existing.rows.push(row);
  }
  if (!existing.partnerNameForLink && partnerNameForLink) {
    existing.partnerNameForLink = partnerNameForLink;
  }
}

/** Load Pending attendance requests (partner-actionable only). */
export async function loadPendingDigestRows(): Promise<DigestPendingRow[]> {
  const pending = await AttendanceRequest.find({ status: 'Pending' })
    .sort({ createdAt: 1 })
    .select(
      '_id userId userName date requestedStatus startTime endTime reason partnerName createdAt requestType'
    )
    .lean();

  const userIds = [
    ...new Set(
      pending
        .map((r) => String(r.userId || ''))
        .filter((id) => id && id !== 'undefined')
    ),
  ];

  const users = await User.find({ _id: { $in: userIds } })
    .select('name email attendanceEmail')
    .lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const rows: DigestPendingRow[] = [];
  for (const req of pending) {
    const user = userById.get(String(req.userId));
    // Skip self-approvers — they auto-clear on open and shouldn't clutter digests.
    if (user && isSelfApproverUser(user)) continue;

    rows.push({
      id: String(req._id),
      userId: String(req.userId),
      userName: String(req.userName || user?.name || 'Employee'),
      date: String(req.date || '').slice(0, 10),
      requestedStatus: String(req.requestedStatus || ''),
      startTime: req.startTime || undefined,
      endTime: req.endTime || undefined,
      reason: req.reason || undefined,
      partnerName: String(req.partnerName || '').trim(),
      createdAt: (req as { createdAt?: Date }).createdAt || null,
      attendanceEmail: normalizeEmail(user?.attendanceEmail) || undefined,
    });
  }
  return rows;
}

export async function buildPendingDigestBuckets(
  rows: DigestPendingRow[]
): Promise<DigestRecipientBucket[]> {
  const buckets = new Map<string, DigestRecipientBucket>();
  const partnerEmailCache = new Map<string, string | null>();

  for (const row of rows) {
    let partnerEmail: string | null = null;
    if (row.partnerName) {
      if (partnerEmailCache.has(row.partnerName)) {
        partnerEmail = partnerEmailCache.get(row.partnerName) ?? null;
      } else {
        partnerEmail = await resolvePartnerNotificationEmail(row.partnerName, {
          attendanceEmail: row.attendanceEmail,
        });
        partnerEmailCache.set(row.partnerName, partnerEmail);
      }
    }

    if (partnerEmail) {
      addRowToBucket(buckets, partnerEmail, row.partnerName, row);
    }

    // Attendance email is also responsible for approval — notify when different.
    if (row.attendanceEmail && normalizeEmail(row.attendanceEmail) !== normalizeEmail(partnerEmail)) {
      addRowToBucket(
        buckets,
        row.attendanceEmail,
        row.partnerName || 'Attendance Approver',
        row
      );
    }
  }

  return Array.from(buckets.values()).filter((b) => b.rows.length > 0);
}

function buildDigestInfoHtml(bucket: DigestRecipientBucket, todayYmd: string): string {
  const overdueCount = bucket.rows.filter((r) => isOverdue(r, todayYmd)).length;
  const oldest = bucket.rows.reduce((best, row) => {
    const age = Math.max(
      row.createdAt ? daysBetween(new Date(row.createdAt), todayYmd) : 0,
      daysBetween(row.date, todayYmd)
    );
    return age > best ? age : best;
  }, 0);

  const employeeCount = new Set(bucket.rows.map((r) => r.userName)).size;

  return `
    <strong style="color:#0f172a;">Weekly reminder — pending attendance approvals</strong><br/>
    <span style="font-size:14px;color:#475569;line-height:1.6;">
      You have <strong>${bucket.rows.length}</strong> pending request${bucket.rows.length === 1 ? '' : 's'}
      for <strong>${employeeCount}</strong> employee${employeeCount === 1 ? '' : 's'}.
      ${
        overdueCount > 0
          ? `<br/><strong style="color:#b91c1c;">${overdueCount} waiting 3+ days</strong> — please approve or reject as soon as possible.`
          : '<br/>Please review and approve or reject as soon as possible.'
      }
      ${oldest > 0 ? `<br/>Oldest item waiting: <strong>${oldest} day${oldest === 1 ? '' : 's'}</strong>.` : ''}
    </span>`;
}

function annotateRowsWithAge(
  rows: DigestPendingRow[],
  todayYmd: string
): CorrectionRequestEmailRow[] {
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date) || a.userName.localeCompare(b.userName))
    .map((row) => {
      const overdue = isOverdue(row, todayYmd);
      const age = ageLabel(row, todayYmd);
      const reasonParts = [
        row.reason || '',
        overdue ? `[Waiting ${age} — overdue]` : `[Waiting ${age}]`,
      ].filter(Boolean);
      return {
        id: row.id,
        userName: row.userName,
        date: row.date,
        requestedStatus: row.requestedStatus,
        startTime: row.startTime,
        endTime: row.endTime,
        reason: reasonParts.join(' '),
      };
    });
}

export async function sendPendingRequestDigestEmails(opts: {
  baseUrl: string;
  dryRun?: boolean;
  /** Send one sample email to this address instead of all recipients. */
  sampleTo?: string;
}): Promise<{
  pendingCount: number;
  recipientCount: number;
  sentCount: number;
  skipped: number;
  errors: string[];
  recipients: Array<{ email: string; count: number }>;
  sampleTo?: string;
}> {
  const todayYmd = todayYmdIst();
  const rows = await loadPendingDigestRows();
  const buckets = await buildPendingDigestBuckets(rows);
  const errors: string[] = [];
  let sentCount = 0;
  const recipients: Array<{ email: string; count: number }> = [];
  const sampleTo = normalizeEmail(opts.sampleTo);

  for (const bucket of buckets) {
    recipients.push({ email: bucket.email, count: bucket.rows.length });
  }

  // Sample mode: one email only, using the largest pending bucket as content.
  if (sampleTo) {
    if (opts.dryRun) {
      return {
        pendingCount: rows.length,
        recipientCount: buckets.length,
        sentCount: 0,
        skipped: buckets.length,
        errors,
        recipients,
        sampleTo,
      };
    }

    const source =
      [...buckets].sort((a, b) => b.rows.length - a.rows.length)[0] ||
      ({
        email: sampleTo,
        partnerNameForLink: 'Partner',
        rows: rows.slice(0, 15),
      } satisfies DigestRecipientBucket);

    const emailRows = annotateRowsWithAge(source.rows, todayYmd);
    const reviewAllLink = createPartnerReviewAllLink(
      opts.baseUrl,
      source.partnerNameForLink || 'Partner',
      source.email || sampleTo
    );
    const html = buildAttendanceRequestEmailHtml({
      title: '[SAMPLE] Pending attendance requests — weekly reminder',
      reviewAllLink,
      infoHtml: `${buildDigestInfoHtml(source, todayYmd)}<br/><br/><span style="font-size:13px;color:#b45309;"><strong>Sample only</strong> — sent to ${escapeHtml(sampleTo)} for preview. Real Saturday digests go to each approver.</span>`,
      description:
        'Please open <strong>Review all</strong> and clear pending items. Overdue rows (3+ days) are marked in the list below.',
      tableBodyHtml: buildCorrectionTableRows(emailRows, opts.baseUrl),
      mobileCardsHtml: buildCorrectionMobileCards(emailRows, opts.baseUrl),
      showReviewColumn: true,
    });

    try {
      await transporter.sendMail({
        ...mailOptions,
        to: sampleTo,
        subject: `[SAMPLE] Action required: ${source.rows.length} pending attendance request${
          source.rows.length === 1 ? '' : 's'
        }`,
        html,
      });
      sentCount = 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${sampleTo}: ${msg}`);
      console.error('Pending digest sample email failed:', sampleTo, err);
    }

    return {
      pendingCount: rows.length,
      recipientCount: buckets.length,
      sentCount,
      skipped: buckets.length,
      errors,
      recipients,
      sampleTo,
    };
  }

  for (const bucket of buckets) {
    if (opts.dryRun) continue;

    const emailRows = annotateRowsWithAge(bucket.rows, todayYmd);
    const reviewAllLink = createPartnerReviewAllLink(
      opts.baseUrl,
      bucket.partnerNameForLink || 'Partner',
      bucket.email
    );

    const html = buildAttendanceRequestEmailHtml({
      title: 'Pending attendance requests — weekly reminder',
      reviewAllLink,
      infoHtml: buildDigestInfoHtml(bucket, todayYmd),
      description:
        'Please open <strong>Review all</strong> and clear pending items. Overdue rows (3+ days) are marked in the list below.',
      tableBodyHtml: buildCorrectionTableRows(emailRows, opts.baseUrl),
      mobileCardsHtml: buildCorrectionMobileCards(emailRows, opts.baseUrl),
      showReviewColumn: true,
    });

    try {
      await transporter.sendMail({
        ...mailOptions,
        to: bucket.email,
        subject: `Action required: ${bucket.rows.length} pending attendance request${
          bucket.rows.length === 1 ? '' : 's'
        }`,
        html,
      });
      sentCount += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${bucket.email}: ${msg}`);
      console.error('Pending digest email failed:', bucket.email, err);
    }
  }

  return {
    pendingCount: rows.length,
    recipientCount: buckets.length,
    sentCount,
    skipped: opts.dryRun ? buckets.length : 0,
    errors,
    recipients,
  };
}

/** Optional helper for UI copy. */
export function formatPendingDigestBanner(count: number): string {
  if (count <= 0) return '';
  return `${count} request${count === 1 ? '' : 's'} pending with you — please approve or reject ASAP.`;
}

export function digestBannerHtmlSnippet(count: number): string {
  return escapeHtml(formatPendingDigestBanner(count));
}
