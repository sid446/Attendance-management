import { NextRequest, NextResponse } from 'next/server';
import { sendOTPEmail } from '@/lib/mailer';

// Fixed HR password
const HR_PASSWORD = 'Asija@2026';

// In-memory OTP store (in production, use Redis or DB)
// Map<sessionId, { otp: string, expiresAt: number }>
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

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
    const { password } = body;

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

    // Generate OTP and session
    const otp = generateOTP();
    const sessionId = generateSessionId();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Store OTP
    otpStore.set(sessionId, { otp, expiresAt });

    // Clean up expired OTPs
    for (const [key, value] of otpStore.entries()) {
      if (value.expiresAt < Date.now()) {
        otpStore.delete(key);
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
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}

// Export for use by verify-otp route
export { otpStore };
