import { transporter, mailOptions } from '@/lib/mailer';
import {
  buildAttendanceRequestEmailHtml,
  buildCorrectionMobileCards,
  buildCorrectionTableRows,
  escapeHtml,
  type CorrectionRequestEmailRow,
} from '@/lib/attendanceRequestEmail';
import { createPartnerReviewAllLink } from '@/lib/partnerReviewToken';
import {
  buildPendingDigestBuckets,
  loadPendingDigestRows,
  type DigestPendingRow,
  type DigestRecipientBucket,
} from '@/lib/pendingRequestDigest';

const IST = 'Asia/Kolkata';

function ymdInIst(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function istMidnightUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+05:30`);
}

function formatIstDayLabel(ymd: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${ymd}T12:00:00+05:30`));
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/** Previous Asia/Kolkata calendar day, as UTC instants [from, to). */
export function previousIstDayRange(now = new Date()): {
  from: Date;
  to: Date;
  ymd: string;
} {
  const todayYmd = ymdInIst(now);
  const to = istMidnightUtc(todayYmd);
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from, to, ymd: ymdInIst(from) };
}

function toEmailRows(rows: DigestPendingRow[]): CorrectionRequestEmailRow[] {
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date) || a.userName.localeCompare(b.userName))
    .map((row) => ({
      id: row.id,
      userName: row.userName,
      date: row.date,
      requestedStatus: row.requestedStatus,
      startTime: row.startTime,
      endTime: row.endTime,
      reason: row.reason,
    }));
}

function employeeCount(rows: DigestPendingRow[]): number {
  return new Set(rows.map((r) => r.userName)).size;
}

function buildDailyInfoHtml(bucket: DigestRecipientBucket, dayLabel: string): string {
  const people = employeeCount(bucket.rows);
  return `
    <strong style="color:#0f172a;">Yesterday's attendance requests — ${escapeHtml(dayLabel)}</strong><br/>
    <span style="font-size:14px;color:#475569;line-height:1.6;">
      <strong>${bucket.rows.length}</strong> request${bucket.rows.length === 1 ? '' : 's'}
      from <strong>${people}</strong> employee${people === 1 ? '' : 's'}
      submitted on ${escapeHtml(dayLabel)} and still pending.
    </span>`;
}

function subjectForBucket(bucket: DigestRecipientBucket, dayLabel: string, sample?: boolean): string {
  const people = employeeCount(bucket.rows);
  const prefix = sample ? '[SAMPLE] ' : '';
  return `${prefix}Yesterday's attendance requests: ${bucket.rows.length} from ${people} employee${
    people === 1 ? '' : 's'
  } (${dayLabel})`;
}

export async function sendDailyRequestDigestEmails(opts: {
  baseUrl: string;
  dryRun?: boolean;
  sampleTo?: string;
}): Promise<{
  dayYmd: string;
  pendingCount: number;
  recipientCount: number;
  sentCount: number;
  skipped: number;
  errors: string[];
  recipients: Array<{ email: string; count: number }>;
  sampleTo?: string;
}> {
  const { from, to, ymd } = previousIstDayRange();
  const dayLabel = formatIstDayLabel(ymd);
  const rows = await loadPendingDigestRows({ createdAtFrom: from, createdAtTo: to });
  const buckets = await buildPendingDigestBuckets(rows);
  const errors: string[] = [];
  let sentCount = 0;
  const recipients: Array<{ email: string; count: number }> = [];
  const sampleTo = normalizeEmail(opts.sampleTo);

  for (const bucket of buckets) {
    recipients.push({ email: bucket.email, count: bucket.rows.length });
  }

  if (sampleTo) {
    if (opts.dryRun) {
      return {
        dayYmd: ymd,
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

    const emailRows = toEmailRows(source.rows);
    const reviewAllLink = createPartnerReviewAllLink(
      opts.baseUrl,
      source.partnerNameForLink || 'Partner',
      source.email || sampleTo
    );
    const html = buildAttendanceRequestEmailHtml({
      title: "[SAMPLE] Yesterday's attendance requests",
      reviewAllLink,
      infoHtml: `${buildDailyInfoHtml(source, dayLabel)}<br/><br/><span style="font-size:13px;color:#b45309;"><strong>Sample only</strong> — sent to ${escapeHtml(sampleTo)} for preview. The real daily digest goes to each partner.</span>`,
      description:
        'These requests were submitted yesterday and are still pending. Open <strong>Review all</strong> to approve or reject.',
      tableBodyHtml: buildCorrectionTableRows(emailRows, opts.baseUrl),
      mobileCardsHtml: buildCorrectionMobileCards(emailRows, opts.baseUrl),
      showReviewColumn: true,
    });

    try {
      await transporter.sendMail({
        ...mailOptions,
        to: sampleTo,
        subject: subjectForBucket(source, dayLabel, true),
        html,
      });
      sentCount = 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${sampleTo}: ${msg}`);
      console.error('Daily digest sample email failed:', sampleTo, err);
    }

    return {
      dayYmd: ymd,
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

    const emailRows = toEmailRows(bucket.rows);
    const reviewAllLink = createPartnerReviewAllLink(
      opts.baseUrl,
      bucket.partnerNameForLink || 'Partner',
      bucket.email
    );

    const html = buildAttendanceRequestEmailHtml({
      title: "Yesterday's attendance requests",
      reviewAllLink,
      infoHtml: buildDailyInfoHtml(bucket, dayLabel),
      description:
        'These requests were submitted yesterday and are still pending. Open <strong>Review all</strong> to approve or reject.',
      tableBodyHtml: buildCorrectionTableRows(emailRows, opts.baseUrl),
      mobileCardsHtml: buildCorrectionMobileCards(emailRows, opts.baseUrl),
      showReviewColumn: true,
    });

    try {
      await transporter.sendMail({
        ...mailOptions,
        to: bucket.email,
        subject: subjectForBucket(bucket, dayLabel),
        html,
      });
      sentCount += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${bucket.email}: ${msg}`);
      console.error('Daily digest email failed:', bucket.email, err);
    }
  }

  return {
    dayYmd: ymd,
    pendingCount: rows.length,
    recipientCount: buckets.length,
    sentCount,
    skipped: opts.dryRun ? buckets.length : 0,
    errors,
    recipients,
  };
}
