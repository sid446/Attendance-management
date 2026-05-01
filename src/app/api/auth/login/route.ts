import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { sendOTPEmail } from '@/lib/mailer';

// Fixed HR password
const HR_PASSWORD = 'Asija@2026';
const EMAIL_DOMAIN = '@asija.in';

// In-memory OTP stores
// For HR/Partner: Map<sessionId, { otp: string, expiresAt: number, email: string }>
// For Employee: Map<sessionId, { otp: string, expiresAt: number, email: string, userId: string }>
const hrOtpStore = new Map<string, { otp: string; expiresAt: number; email: string }>();
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
      if (!password) {
        return NextResponse.json(
          { success: false, error: 'Password is required' },
          { status: 400 }
        );
      }

      // Verify fixed password
      if (password !== HR_PASSWORD) {
        return NextResponse.json(
          { success: false, error: 'Invalid password' },
          { status: 401 }
        );
      }

      // Validate admin email
      const rawEmail = String(email || '').trim().toLowerCase();
      const ALLOWED_ADMIN_EMAILS = ['it@asija.in', 'hr@asija.in', 'service@asija.in']; // Add authorized emails here
      
      if (!rawEmail || !ALLOWED_ADMIN_EMAILS.includes(rawEmail)) {
        return NextResponse.json(
          { success: false, error: 'This email is not authorized for HR access' },
          { status: 403 }
        );
      }

      // Generate OTP and session
      const otp = generateOTP();
      const sessionId = generateSessionId();
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

      // Store OTP
      hrOtpStore.set(sessionId, { otp, expiresAt, email: String(email || '').trim().toLowerCase() });

      // Clean up expired OTPs
      for (const [key, value] of hrOtpStore.entries()) {
        if (value.expiresAt < Date.now()) {
          hrOtpStore.delete(key);
        }
      }

      // Send OTP email
      try {
        await sendOTPEmail(otp);
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
          message: 'OTP sent to admin email',
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
        const expiresAt = Date.now() + 5 * 60 * 1000;

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

// Export for use by verify-otp route
export { hrOtpStore, employeeOtpStore };

