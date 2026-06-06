import nodemailer from 'nodemailer';
import { getServiceAdminEmail } from '@/lib/hrServiceEmail';

const email = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS?.replace(/\s+/g, '');

const smtpHost = process.env.SMTP_HOST || 'smtp.mail.yahoo.com';
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpSecure =
  process.env.SMTP_SECURE === 'true' ||
  (process.env.SMTP_SECURE !== 'false' && smtpPort === 465);

export const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  ...(smtpPort === 587 ? { requireTLS: true } : {}),
  pool: true,
  maxConnections: 5,
  maxMessages: 200,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  auth: email && pass ? { user: email, pass } : undefined,
});

/** Warm SMTP pool so the first OTP send does not wait on TLS handshake. */
let smtpWarmup: Promise<void> | null = null;

export function warmSmtpPool(): Promise<void> {
  if (!email || !pass) return Promise.resolve();
  if (!smtpWarmup) {
    smtpWarmup = transporter
      .verify()
      .then(() => undefined)
      .catch((err) => {
        console.warn('SMTP warmup verify failed (will retry on send):', err);
        smtpWarmup = null;
      });
  }
  return smtpWarmup;
}

void warmSmtpPool();

export const mailOptions = {
  from: email || 'service@asija.in',
};

// Send OTP email
export async function sendOTPEmail(
  otp: string,
  recipientEmail?: string,
  options?: { subject?: string; heading?: string; validMinutes?: number }
): Promise<void> {
  const adminEmail = getServiceAdminEmail();
  const toEmail = recipientEmail || adminEmail;
  const subject = options?.subject || 'Attendance Console - Login OTP';
  const heading = options?.heading || 'Attendance Console';
  const validMinutes = options?.validMinutes ?? 5;

  await warmSmtpPool();

  const text = [
    heading,
    '',
    'Your one-time password (OTP) is:',
    '',
    otp,
    '',
    `This OTP is valid for ${validMinutes} minutes. Do not share it with anyone.`,
  ].join('\n');

  await transporter.sendMail({
    ...mailOptions,
    to: toEmail,
    subject,
    priority: 'high',
    headers: {
      'X-Priority': '1',
      Importance: 'high',
    },
    text,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 400px;">
        <h2 style="color: #10b981;">${heading}</h2>
        <p>Your one-time password (OTP) is:</p>
        <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This OTP is valid for ${validMinutes} minutes. Do not share it with anyone.</p>
      </div>
    `,
  });
}
