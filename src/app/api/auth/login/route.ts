import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { sendOTPEmail } from '@/lib/mailer';
import { isAllowedHrAdminEmail } from '@/lib/hrAdminAllowlistServer';
import { verifyHrConsolePassword } from '@/lib/hrConsolePassword';
import HrOtpPending from '@/models/HrOtpPending';
import { hrOtpExpiresAt, hrOtpExpiresAtMs } from '@/lib/hrOtpConstants';

const EMAIL_DOMAIN = '@asija.in';

// In-memory OTP store for employee/partner flow via this route only (HR OTP uses Mongo: HrOtpPending).
const employeeOtpStore = new Map<
  string,
  {
    otp: string;
    expiresAt: number;
    email: string;
    userId: string;
  }
>();

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate session ID
function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password, email, role } = body;

    // HR/Admin login with password
    if (!role || role === 'hr') {
      const rawEmail = String(email || '').trim().toLowerCase();

      if (!rawEmail) {
        return NextResponse.json(
          { success: false, error: 'Admin email is required' },
          { status: 400 }
        );
      }

      if (!rawEmail.endsWith(EMAIL_DOMAIN)) {
        return NextResponse.json(
          { success: false, error: `Only ${EMAIL_DOMAIN} emails are allowed for HR login` },
          { status: 400 }
        );
      }

      // Must be on the Access Control allowlist before password / OTP
      if (!(await isAllowedHrAdminEmail(rawEmail))) {
        return NextResponse.json(
          {
            success: false,
            error:
              'This email is not authorized for HR access. Ask an admin to add it under Access control.',
          },
          { status: 403 }
        );
      }

      if (!password) {
        return NextResponse.json(
          { success: false, error: 'Password is required' },
          { status: 400 }
        );
      }

      if (!(await verifyHrConsolePassword(password))) {
        return NextResponse.json(
          { success: false, error: 'Invalid password' },
          { status: 401 }
        );
      }

      const otp = generateOTP();
      const sessionId = generateSessionId();
      const expiresAt = hrOtpExpiresAt();

      await dbConnect();
      await HrOtpPending.findOneAndUpdate(
        { sessionId },
        {
          $set: {
            otp,
            email: rawEmail,
            expiresAt,
          },
        },
        { upsert: true }
      );

      try {
        await sendOTPEmail(otp, rawEmail);
      } catch (emailError) {
        console.error('Failed to send OTP email:', emailError);
        return NextResponse.json(
          { success: false, error: 'Failed to send OTP email. Please try again.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          sessionId,
          email: rawEmail,
          expiresAt: expiresAt.toISOString(),
          message: `OTP sent to ${rawEmail}`,
        },
      });
    }

    // Employee/Partner login with email + OTP
    if (role === 'employee' || role === 'partner') {
      const rawEmail = String(email || '').trim().toLowerCase();

      if (!rawEmail) {
        return NextResponse.json(
          { success: false, error: 'Email is required' },
          { status: 400 }
        );
      }

      if (!rawEmail.endsWith(EMAIL_DOMAIN)) {
        return NextResponse.json(
          { success: false, error: `Only ${EMAIL_DOMAIN} emails are allowed` },
          { status: 400 }
        );
      }

      await dbConnect();

      // For employee role, check User collection
      if (role === 'employee') {
        const user = await User.findOne({ email: { $regex: new RegExp(`^${rawEmail}$`, 'i') } });

        if (!user) {
          return NextResponse.json(
            { success: false, error: 'User not found with this email' },
            { status: 404 }
          );
        }

        if (!user.isActive) {
          return NextResponse.json(
            { success: false, error: 'User account is inactive' },
            { status: 403 }
          );
        }

        const otp = generateOTP();
        const sessionId = generateSessionId();
        const expiresAt = hrOtpExpiresAtMs();

        employeeOtpStore.set(sessionId, {
          otp,
          expiresAt,
          email: String(user.email || rawEmail).trim().toLowerCase(),
          userId: String(user._id),
        });

        // Clean up expired OTPs
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
            expiresAt: new Date(expiresAt).toISOString(),
            message: 'OTP sent to your email',
          },
        });
      }

      // Partner role handling can be added here in future
      return NextResponse.json(
        { success: false, error: 'Unsupported role' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Invalid request parameters' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}

// Export for use by verify-otp route (employee/partner branch only)
export { employeeOtpStore };

