import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    // Fetch all users with their leave balance information
    const users = await User.find({ isActive: true })
      .select('name employeeCode team workingUnderPartner leaveBalance joiningDate')
      .sort({ name: 1 });

    // Transform the data to include user information with leave balances
    const leaveBalances = users.map(user => ({
      userId: user._id.toString(),
      userName: user.name,
      employeeCode: user.employeeCode,
      team: user.workingUnderPartner || user.team, // Use workingUnderPartner as team, fallback to team
      earned: user.leaveBalance?.earned || 0,
      used: user.leaveBalance?.used || 0,
      remaining: user.leaveBalance?.remaining || 0,
      lastUpdated: user.leaveBalance?.lastUpdated || user.joiningDate || new Date(),
      monthlyEarned: user.leaveBalance?.monthlyEarned || 2,
    }));

    return NextResponse.json({
      success: true,
      data: leaveBalances,
    });
  } catch (error) {
    console.error('Error fetching leave balances:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leave balances' },
      { status: 500 }
    );
  }
}