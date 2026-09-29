import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import {
  ADJ_FROM_MONTH,
  currentLeaveMonthYear,
  rebuildSnapshotsFromMonth,
  setAdjThisMonth,
  syncUserLeaveAdjLwpFromLedger,
} from '@/lib/leaveAdjLwp';
import {
  reconcileLeaveFromAttendance,
  EARN_FROM_MONTH,
} from '@/lib/leaveReconciliation';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function parseMonthYear(raw: unknown): string | null {
  const value = String(raw || '').trim();
  if (!value) return currentLeaveMonthYear();
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  return value < ADJ_FROM_MONTH ? ADJ_FROM_MONTH : value;
}

/**
 * Save a single employee's Adj/LWP change for a month.
 * The posted number is that month's delta. Adj till this month is derived
 * (sum of monthly deltas) and is not typed.
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    if (effective.sections.leave !== 'edit') {
      return NextResponse.json(
        { success: false, error: 'Not allowed to update leave balances' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const userId = String(body?.userId || '').trim();
    const thisMonthRaw =
      body?.leaveAdjLwpThisMonth !== undefined && body?.leaveAdjLwpThisMonth !== null
        ? body.leaveAdjLwpThisMonth
        : body?.leaveAdjLwp;
    const leaveAdjLwpThisMonth = Number(thisMonthRaw);
    const monthYear = parseMonthYear(body?.monthYear);

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ success: false, error: 'Invalid userId' }, { status: 400 });
    }
    if (!Number.isFinite(leaveAdjLwpThisMonth)) {
      return NextResponse.json(
        { success: false, error: 'Adj this month must be a number' },
        { status: 400 }
      );
    }
    if (!monthYear) {
      return NextResponse.json(
        { success: false, error: 'monthYear must be YYYY-MM' },
        { status: 400 }
      );
    }

    const roundedAdj = Number(leaveAdjLwpThisMonth.toFixed(3));
    const _id = new mongoose.Types.ObjectId(userId);

    const existing = await User.collection.findOne(
      { _id },
      { projection: { leaveBalance: 1 } }
    );
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }

    const { thisMonth, tillMonth } = await setAdjThisMonth(_id, monthYear, roundedAdj);

    await reconcileLeaveFromAttendance({
      fromMonth: EARN_FROM_MONTH,
      toMonth: currentLeaveMonthYear(),
      userIds: [userId],
      dryRun: false,
    });

    const synced = await syncUserLeaveAdjLwpFromLedger(_id);
    const monthsRebuilt = await rebuildSnapshotsFromMonth(monthYear);

    console.log(
      `[leave-adj-lwp] userId=${userId} monthYear=${monthYear} till=${tillMonth} thisMonth=${thisMonth} remaining=${synced.remaining} months=${monthsRebuilt.join(',')}`
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          userId,
          monthYear,
          leaveAdjLwp: tillMonth,
          leaveAdjLwpThisMonth: thisMonth,
          remaining: synced.remaining,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Leave Adj/LWP POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update Leave Adj/LWP',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  return POST(request);
}
