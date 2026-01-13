import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    // Case insensitive search
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found with this email' }, { status: 404 });
    }

    if (!user.isActive) {
        return NextResponse.json({ success: false, error: 'User account is inactive' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        odId: user.odId,
        team: user.team,
        workingUnderPartner: user.workingUnderPartner
      }
    });

  } catch (error) {
    console.error('Employee Login Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
