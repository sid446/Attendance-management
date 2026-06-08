import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import {
  fetchDayApprovalsForUsersMonth,
  fetchExcessAllowanceLookup,
  fetchExcessDisplayLookup,
} from '@/lib/excessHourAllowanceDb';
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
    const monthYears = [...new Set(pairs.map((p) => p.monthYear))];
    const displayExcess: Record<string, number> = {};
    const dayAllowances: Record<string, number> = {};
    for (const monthYear of monthYears) {
      const idsForMonth = pairs.filter((p) => p.monthYear === monthYear).map((p) => p.userId);
      const [displayMap, dayMap] = await Promise.all([
        fetchExcessDisplayLookup(idsForMonth, monthYear),
        fetchDayApprovalsForUsersMonth(idsForMonth, monthYear),
      ]);
      Object.assign(displayExcess, displayMap);
      Object.assign(dayAllowances, dayMap);
    }

    return NextResponse.json({ success: true, data, displayExcess, dayAllowances });
  } catch (error) {
    console.error('Excess hour allowance batch GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load excess hour allowances' },
      { status: 500 }
    );
  }
}
