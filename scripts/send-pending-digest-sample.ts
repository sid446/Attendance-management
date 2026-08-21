import dbConnect from '@/lib/mongodb';
import { sendPendingRequestDigestEmails } from '@/lib/pendingRequestDigest';
import { transporter, mailOptions, warmSmtpPool } from '@/lib/mailer';
import { getServiceAdminEmail } from '@/lib/hrServiceEmail';

async function main() {
  const sampleTo = (process.argv[2] || process.env.ADMIN_EMAIL || getServiceAdminEmail()).trim();
  console.log('from=', mailOptions.from);
  console.log('sampleTo=', sampleTo);
  console.log('EMAIL_USER set=', Boolean(process.env.EMAIL_USER));
  console.log('EMAIL_PASS set=', Boolean(process.env.EMAIL_PASS));
  console.log('SMTP_HOST=', process.env.SMTP_HOST || 'smtp.mail.yahoo.com (default)');

  await warmSmtpPool();
  try {
    await transporter.verify();
    console.log('SMTP verify: OK');
  } catch (e) {
    console.error('SMTP verify FAILED:', e);
  }

  // Tiny ping email first so delivery is obvious
  const ping = await transporter.sendMail({
    ...mailOptions,
    to: sampleTo,
    subject: `[PING] Attendance digest test ${new Date().toISOString()}`,
    text: 'If you see this, SMTP delivery to this inbox works.',
    html: `<p>If you see this, SMTP delivery to <strong>${sampleTo}</strong> works.</p><p>Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>`,
  });
  console.log('ping messageId=', ping.messageId);
  console.log('ping accepted=', ping.accepted);
  console.log('ping rejected=', ping.rejected);
  console.log('ping response=', ping.response);

  await dbConnect();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://attendance.asija.in';
  const result = await sendPendingRequestDigestEmails({ baseUrl, sampleTo });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
