import { after } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import EmployeeOtpPending, { EmployeeOtpPurpose } from '@/models/EmployeeOtpPending';
import { sendOTPEmail } from '@/lib/mailer';
import { employeeOtpExpiresAt, EMPLOYEE_OTP_TTL_MINUTES } from '@/lib/hrOtpConstants';
import { userHasEmployeePassword } from '@/lib/employeePassword';

const EMAIL_DOMAIN = '@asija.in';

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export type IssueEmployeeOtpResult =
  | { ok: true; sessionId: string; expiresAt: Date; email: string; purpose: EmployeeOtpPurpose }
  | { ok: false; status: number; error: string };

/** Create a fresh employee OTP for password setup or reset; email is sent asynchronously. */
export async function issueEmployeeOtp(
  rawEmailInput: string,
  purpose: EmployeeOtpPurpose
): Promise<IssueEmployeeOtpResult> {
  const rawEmail = String(rawEmailInput || '').trim().toLowerCase();

  if (!rawEmail) {
    return { ok: false, status: 400, error: 'Email is required' };
  }

  if (!rawEmail.endsWith(EMAIL_DOMAIN)) {
    return { ok: false, status: 400, error: `Only ${EMAIL_DOMAIN} emails are allowed` };
  }

  await dbConnect();

  const user = await User.findOne({ email: rawEmail })
    .select('_id email isActive employeePasswordHash')
    .lean();

  if (!user) {
    return { ok: false, status: 404, error: 'User not found with this email' };
  }

  if (user.isActive === false) {
    return { ok: false, status: 403, error: 'User account is inactive' };
  }

  const hasPassword = userHasEmployeePassword(user);

  if (purpose === 'setup' && hasPassword) {
    return {
      ok: false,
      status: 400,
      error: 'Password is already set. Sign in with your password or use Forgot password.',
    };
  }

  if (purpose === 'reset' && !hasPassword) {
    return {
      ok: false,
      status: 400,
      error: 'No password is set yet. Complete first-time setup with the OTP sent to your email.',
    };
  }

  const otp = generateOTP();
  const sessionId = generateSessionId();
  const expiresAt = employeeOtpExpiresAt();
  const deliverTo = String(user.email || rawEmail).trim();

  const emailSubject =
    purpose === 'setup'
      ? 'Employee Portal - Set your password'
      : 'Employee Portal - Reset password OTP';
  const emailHeading = purpose === 'setup' ? 'Set your password' : 'Reset your password';

  await EmployeeOtpPending.findOneAndUpdate(
    { email: rawEmail },
    {
      $set: {
        sessionId,
        otp,
        email: rawEmail,
        userId: user._id,
        purpose,
        expiresAt,
      },
    },
    { upsert: true, new: true }
  );

  after(async () => {
    try {
      await sendOTPEmail(otp, deliverTo, {
        subject: emailSubject,
        heading: emailHeading,
        validMinutes: EMPLOYEE_OTP_TTL_MINUTES,
      });
    } catch (emailError) {
      console.error('Employee OTP email send error:', emailError);
      try {
        await EmployeeOtpPending.deleteOne({ sessionId });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  return { ok: true, sessionId, expiresAt, email: rawEmail, purpose };
}

/** @deprecated Use issueEmployeeOtp with an explicit purpose instead. */
export async function issueEmployeeLoginOtp(rawEmailInput: string): Promise<IssueEmployeeOtpResult> {
  return issueEmployeeOtp(rawEmailInput, 'setup');
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
