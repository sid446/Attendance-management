import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { sendOTPEmail } from '@/lib/mailer';

const EMAIL_DOMAIN = '@asija.in';

// In-memory OTP store for employee login
const employeeOtpStore = new Map<
  string,
  {
    otp: string;
    expiresAt: number;
    email: string;
    userId: string;
  }
>();

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const body = await request.json();
    const rawEmail = String(body?.email || '').trim().toLowerCase();

    if (!rawEmail) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    if (!rawEmail.endsWith(EMAIL_DOMAIN)) {
      return NextResponse.json(
        { success: false, error: `Only ${EMAIL_DOMAIN} emails are allowed` },
        { status: 400 }
      );
    }

    // Case insensitive search
    const user = await User.findOne({ email: { $regex: new RegExp(`^${rawEmail}$`, 'i') } });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found with this email' }, { status: 404 });
    }

    if (!user.isActive) {
        return NextResponse.json({ success: false, error: 'User account is inactive' }, { status: 403 });
    }

    const otp = generateOTP();
    const sessionId = generateSessionId();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    employeeOtpStore.set(sessionId, {
      otp,
      expiresAt,
      email: String(user.email || rawEmail).trim().toLowerCase(),
      userId: String(user._id),
    });

    for (const [key, value] of employeeOtpStore.entries()) {
      if (value.expiresAt < Date.now()) {
        employeeOtpStore.delete(key);
      }
    }

    try {
      await sendOTPEmail(otp, String(user.email || rawEmail).trim());
    } catch (emailError) {
      employeeOtpStore.delete(sessionId);
      console.error('Employee OTP email send error:', emailError);
      return NextResponse.json(
        { success: false, error: 'Failed to send OTP email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        message: 'OTP sent to your email',
      }
    });

  } catch (error) {
    console.error('Employee Login Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export { employeeOtpStore };
