import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import EmployeeOtpPending from '@/models/EmployeeOtpPending';
import { sendOTPEmail } from '@/lib/mailer';
import { hrOtpExpiresAt } from '@/lib/hrOtpConstants';

const EMAIL_DOMAIN = '@asija.in';

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export type IssueEmployeeOtpResult =
  | { ok: true; sessionId: string; expiresAt: Date; email: string }
  | { ok: false; status: number; error: string };

/** Create a fresh employee login OTP and queue email delivery (API returns before SMTP finishes). */
export async function issueEmployeeLoginOtp(rawEmailInput: string): Promise<IssueEmployeeOtpResult> {
  const rawEmail = String(rawEmailInput || '').trim().toLowerCase();

  if (!rawEmail) {
    return { ok: false, status: 400, error: 'Email is required' };
  }

  if (!rawEmail.endsWith(EMAIL_DOMAIN)) {
    return { ok: false, status: 400, error: `Only ${EMAIL_DOMAIN} emails are allowed` };
  }

  await dbConnect();

  const user = await User.findOne({ email: rawEmail }).select('_id email isActive').lean();

  if (!user) {
    return { ok: false, status: 404, error: 'User not found with this email' };
  }

  if (user.isActive === false) {
    return { ok: false, status: 403, error: 'User account is inactive' };
  }

  const otp = generateOTP();
  const sessionId = generateSessionId();
  const expiresAt = hrOtpExpiresAt();
  const deliverTo = String(user.email || rawEmail).trim();

  await EmployeeOtpPending.deleteMany({ email: rawEmail });
  await EmployeeOtpPending.create({
    sessionId,
    otp,
    email: rawEmail,
    userId: user._id,
    expiresAt,
  });

  void sendOTPEmail(otp, deliverTo, {
    subject: 'Employee Portal - Login OTP',
    heading: 'Employee Portal',
  }).catch(async (emailError) => {
    console.error('Employee OTP email send error:', emailError);
    try {
      await EmployeeOtpPending.deleteOne({ sessionId });
    } catch {
      // ignore cleanup errors
    }
  });

  return { ok: true, sessionId, expiresAt, email: rawEmail };
}

export async function findValidEmployeeOtpSession(sessionId: string) {
  await dbConnect();
  const sid = String(sessionId || '').trim();
  if (!sid) return null;

  const pending = await EmployeeOtpPending.findOne({ sessionId: sid }).lean();
  if (!pending) return null;

  if (new Date(pending.expiresAt).getTime() < Date.now()) {
    await EmployeeOtpPending.deleteOne({ sessionId: sid });
    return null;
  }

  return pending;
}

export async function deleteEmployeeOtpSession(sessionId: string): Promise<void> {
  await dbConnect();
  await EmployeeOtpPending.deleteOne({ sessionId: String(sessionId || '').trim() });
}
