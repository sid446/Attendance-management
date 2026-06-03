import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { fetchExcessAllowanceLookup } from '@/lib/excessHourAllowanceDb';
import type { ExcessAllowancePair } from '@/lib/excessHourAllowanceDb';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const pairsParam = request.nextUrl.searchParams.get('pairs')?.trim();
    const userIdsParam = request.nextUrl.searchParams.get('userIds')?.trim();
    const monthYear = request.nextUrl.searchParams.get('monthYear')?.trim();

    let pairs: ExcessAllowancePair[] = [];

    if (pairsParam) {
      pairs = pairsParam
        .split(',')
        .map((segment) => {
          const [userId, my] = segment.split(':');
          return { userId: String(userId || '').trim(), monthYear: String(my || '').trim() };
        })
        .filter((p) => p.userId && p.monthYear);
    } else if (userIdsParam && monthYear) {
      pairs = userIdsParam
        .split(',')
        .map((id) => ({ userId: id.trim(), monthYear }))
        .filter((p) => p.userId);
    } else {
      return NextResponse.json(
        { success: false, error: 'Provide pairs=userId:YYYY-MM,... or userIds and monthYear' },
        { status: 400 }
      );
    }

    const data = await fetchExcessAllowanceLookup(pairs);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Excess hour allowance batch GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load excess hour allowances' },
      { status: 500 }
    );
  }
}
