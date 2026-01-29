import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { incrementMonthlyLeave } from '@/lib/leaveManagement';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json().catch(() => ({}));
    const { monthYear } = body;

    // Optional: Add authentication check here if needed
    // For now, allow anyone to call it (could be scheduled via cron)

    await incrementMonthlyLeave(monthYear);

    return NextResponse.json({
      success: true,
      message: `Monthly leave incremented successfully${monthYear ? ` for ${monthYear}` : ''}`
    });
  } catch (error) {
    console.error('Error incrementing monthly leave:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to increment monthly leave' },
      { status: 500 }
    );
  }
}