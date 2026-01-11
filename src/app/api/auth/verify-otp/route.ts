import { NextRequest, NextResponse } from 'next/server';
import { otpStore } from '../login/route';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, otp } = body;

    if (!sessionId || !otp) {
      return NextResponse.json(
        { success: false, error: 'Session ID and OTP are required' },
        { status: 400 }
      );
    }

    const stored = otpStore.get(sessionId);

    if (!stored) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired session. Please login again.' },
        { status: 401 }
      );
    }

    // Check expiration
    if (stored.expiresAt < Date.now()) {
      otpStore.delete(sessionId);
      return NextResponse.json(
        { success: false, error: 'OTP has expired. Please login again.' },
        { status: 401 }
      );
    }

    // Verify OTP
    if (stored.otp !== otp) {
      return NextResponse.json(
        { success: false, error: 'Invalid OTP' },
        { status: 401 }
      );
    }

    // OTP verified - remove from store
    otpStore.delete(sessionId);

    // Generate auth token (simple approach - in production use JWT)
    const authToken = Math.random().toString(36).substring(2) + Date.now().toString(36) + Math.random().toString(36).substring(2);

    return NextResponse.json({
      success: true,
      data: {
        authToken,
        message: 'Login successful',
      },
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during verification' },
      { status: 500 }
    );
  }
}
