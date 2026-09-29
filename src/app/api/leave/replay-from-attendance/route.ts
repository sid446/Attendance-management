import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { currentLeaveMonthYear } from '@/lib/leaveAdjLwp';
import {
  reconcileLeaveFromAttendance,
  EARN_FROM_MONTH,
} from '@/lib/leaveReconciliation';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Replay paid/unpaid leave from a month through now for the given employees.
 * Used after an attendance upload that refunded or consumed leave credit.
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
    if (effective.sections.leave !== 'edit' && effective.sections.upload !== 'edit') {
      return NextResponse.json(
        { success: false, error: 'Not allowed to replay leave' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const userIds = Array.isArray(body?.userIds)
      ? body.userIds.map((id: unknown) => String(id)).filter((id: string) => mongoose.Types.ObjectId.isValid(id))
      : [];
    const fromMonth = EARN_FROM_MONTH;

    if (userIds.length === 0) {
      return NextResponse.json({ success: true, data: { usersProcessed: 0 } });
    }

    const result = await reconcileLeaveFromAttendance({
      fromMonth,
      toMonth: currentLeaveMonthYear(),
      userIds,
      dryRun: false,
    });

    return NextResponse.json({
      success: true,
      data: {
        fromMonth: result.fromMonth,
        toMonth: result.toMonth,
        usersProcessed: result.usersProcessed,
        recordsUpdated: result.recordsUpdated,
        monthsRebuilt: result.monthsRebuilt,
      },
    });
  } catch (error) {
    console.error('Leave replay from attendance error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to replay leave',
      },
      { status: 500 }
    );
  }
}
