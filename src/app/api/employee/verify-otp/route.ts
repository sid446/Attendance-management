import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { employeeOtpStore } from '../login/route';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const body = await request.json();
    const sessionId = String(body?.sessionId || '').trim();
    const otp = String(body?.otp || '').trim();

    if (!sessionId || !otp) {
      return NextResponse.json(
        { success: false, error: 'Session ID and OTP are required' },
        { status: 400 }
      );
    }

    const stored = employeeOtpStore.get(sessionId);

    if (!stored) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired session. Please login again.' },
        { status: 401 }
      );
    }

    if (stored.expiresAt < Date.now()) {
      employeeOtpStore.delete(sessionId);
      return NextResponse.json(
        { success: false, error: 'OTP has expired. Please login again.' },
        { status: 401 }
      );
    }

    if (stored.otp !== otp) {
      return NextResponse.json({ success: false, error: 'Invalid OTP' }, { status: 401 });
    }

    const user = await User.findById(stored.userId).lean();
    if (!user) {
      employeeOtpStore.delete(sessionId);
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (user.isActive === false) {
      employeeOtpStore.delete(sessionId);
      return NextResponse.json({ success: false, error: 'User account is inactive' }, { status: 403 });
    }

    employeeOtpStore.delete(sessionId);

    return NextResponse.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        odId: user.odId,
        team: user.team,
        workingUnderPartner: user.workingUnderPartner,
      },
    });
  } catch (error) {
    console.error('Employee OTP verification error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during verification' },
      { status: 500 }
    );
  }
}
