import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { computeLeaveRemaining } from '@/lib/leaveManagement';

export const dynamic = 'force-dynamic';

/**
 * Save a single employee's Leave Adj/LWP.
 * Writes via the native Mongo collection (bypasses Mongoose schema cache) and
 * verifies the value is present in DB before returning success.
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
    const leaveAdjLwp = Number(body?.leaveAdjLwp);

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ success: false, error: 'Invalid userId' }, { status: 400 });
    }
    if (!Number.isFinite(leaveAdjLwp)) {
      return NextResponse.json(
        { success: false, error: 'Leave Adj/LWP must be a number' },
        { status: 400 }
      );
    }

    const roundedAdj = Number(leaveAdjLwp.toFixed(3));
    const _id = new mongoose.Types.ObjectId(userId);

    const existing = await User.collection.findOne(
      { _id },
      { projection: { leaveBalance: 1 } }
    );
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }

    const lb = (existing.leaveBalance || {}) as Record<string, unknown>;
    const remaining = computeLeaveRemaining({
      balanceAsOfJan26: Number(lb.balanceAsOfJan26 || 0),
      earned: Number(lb.earned || 0),
      usedAfterJan26: Number(lb.usedAfterJan26 || 0),
      leaveAdjLwp: roundedAdj,
    });

    const now = new Date();
    const writeResult = await User.collection.updateOne(
      { _id },
      {
        $set: {
          'leaveBalance.leaveAdjLwp': roundedAdj,
          'leaveBalance.remaining': remaining,
          'leaveBalance.lastUpdated': now,
        },
      }
    );

    if (writeResult.matchedCount !== 1) {
      return NextResponse.json(
        { success: false, error: 'Employee not found while saving' },
        { status: 404 }
      );
    }

    // Verify from Mongo directly — never report success from the request body alone.
    const verified = await User.collection.findOne(
      { _id },
      { projection: { leaveBalance: 1 } }
    );
    const savedAdj = Number(verified?.leaveBalance?.leaveAdjLwp);
    if (!Number.isFinite(savedAdj) || savedAdj !== roundedAdj) {
      console.error('[leave-adj-lwp] verify failed', {
        userId,
        roundedAdj,
        savedAdj,
        leaveBalance: verified?.leaveBalance,
        writeResult,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Leave Adj/LWP did not persist in the database. Restart the server and try again.',
        },
        { status: 500 }
      );
    }

    console.log(
      `[leave-adj-lwp] verified userId=${userId} leaveAdjLwp=${savedAdj} remaining=${verified?.leaveBalance?.remaining}`
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          userId,
          leaveAdjLwp: savedAdj,
          remaining: Number(verified?.leaveBalance?.remaining ?? remaining),
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
