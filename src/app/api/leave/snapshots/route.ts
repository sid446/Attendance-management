import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import LeaveSnapshot from '@/models/LeaveSnapshot';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const monthYear = searchParams.get('monthYear');
    const userIds = searchParams.get('userIds'); // optional comma-separated

    if (!monthYear) {
      return NextResponse.json({ success: false, error: 'monthYear is required' }, { status: 400 });
    }

    const query: any = { monthYear };
    if (userIds) {
      const arr = userIds.split(',').map(s => s.trim()).filter(Boolean);
      if (arr.length > 0) query.userId = { $in: arr };
    }

    const snaps = await LeaveSnapshot.find(query).lean();
    return NextResponse.json({ success: true, data: snaps });
  } catch (error) {
    console.error('Error fetching leave snapshots:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
