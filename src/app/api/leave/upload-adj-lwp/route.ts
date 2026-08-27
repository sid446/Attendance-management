import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { normalizeForMatch } from '@/lib/attendanceNameMatch';
import {
  reconcileLeaveFromAttendance,
  currentMonthKey,
  EARN_FROM_MONTH,
} from '@/lib/leaveReconciliation';

export const maxDuration = 300;

type UploadRow = {
  name?: string;
  leaveAdjLwp?: number | string;
};

type MatchedRow = {
  excelName: string;
  userId: string;
  userName: string;
  currentLeaveAdjLwp: number;
  newLeaveAdjLwp: number;
};

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
    const rows: UploadRow[] = Array.isArray(body?.rows) ? body.rows : [];
    const mode: 'preview' | 'apply' = body?.mode === 'apply' ? 'apply' : 'preview';

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No rows found in the uploaded file' },
        { status: 400 }
      );
    }

    const users = await User.find({})
      .select('_id name employeeCode leaveBalance')
      .lean();

    const byNameKey = new Map<string, Array<{ id: string; name: string; adj: number }>>();
    for (const u of users) {
      const key = normalizeForMatch(String(u.name || ''));
      if (!key) continue;
      if (!byNameKey.has(key)) byNameKey.set(key, []);
      byNameKey.get(key)!.push({
        id: String(u._id),
        name: String(u.name || ''),
        adj: Number(u.leaveBalance?.leaveAdjLwp || 0),
      });
    }

    const matched: MatchedRow[] = [];
    const notFound: string[] = [];
    const ambiguous: Array<{ excelName: string; candidates: string[] }> = [];
    const invalid: Array<{ excelName: string; reason: string }> = [];
    const seenUserIds = new Set<string>();
    const duplicateNames: string[] = [];

    for (const row of rows) {
      const excelName = String(row?.name || '').trim();
      if (!excelName) continue;

      const leaveAdjLwp = Number(row?.leaveAdjLwp);
      if (!Number.isFinite(leaveAdjLwp)) {
        invalid.push({ excelName, reason: 'Leave Adj/LWP is not a valid number' });
        continue;
      }

      const candidates = byNameKey.get(normalizeForMatch(excelName)) || [];
      if (candidates.length === 0) {
        notFound.push(excelName);
        continue;
      }
      if (candidates.length > 1) {
        ambiguous.push({ excelName, candidates: candidates.map((c) => c.name) });
        continue;
      }

      const target = candidates[0];
      if (seenUserIds.has(target.id)) {
        duplicateNames.push(excelName);
        continue;
      }
      seenUserIds.add(target.id);

      matched.push({
        excelName,
        userId: target.id,
        userName: target.name,
        currentLeaveAdjLwp: target.adj,
        newLeaveAdjLwp: Number(leaveAdjLwp.toFixed(3)),
      });
    }

    if (matched.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No employee in the file could be matched by name',
        data: { matched, notFound, ambiguous, invalid, duplicateNames },
      });
    }

    const userIds = matched.map((m) => m.userId);
    const leaveAdjLwpOverrides = Object.fromEntries(
      matched.map((m) => [m.userId, m.newLeaveAdjLwp])
    );
    const toMonth = currentMonthKey();

    if (mode === 'preview') {
      const preview = await reconcileLeaveFromAttendance({
        fromMonth: EARN_FROM_MONTH,
        toMonth,
        userIds,
        dryRun: true,
        leaveAdjLwpOverrides,
      });

      return NextResponse.json({
        success: true,
        data: {
          mode,
          matched,
          notFound,
          ambiguous,
          invalid,
          duplicateNames,
          reconcile: preview,
        },
      });
    }

    for (const m of matched) {
      await User.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(m.userId) },
        {
          $set: {
            'leaveBalance.leaveAdjLwp': m.newLeaveAdjLwp,
            'leaveBalance.lastUpdated': new Date(),
          },
        }
      );
    }

    const applied = await reconcileLeaveFromAttendance({
      fromMonth: EARN_FROM_MONTH,
      toMonth,
      userIds,
      dryRun: false,
    });

    return NextResponse.json({
      success: true,
      data: {
        mode,
        matched,
        notFound,
        ambiguous,
        invalid,
        duplicateNames,
        reconcile: applied,
      },
    });
  } catch (error) {
    console.error('Leave Adj/LWP upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process the upload',
      },
      { status: 500 }
    );
  }
}
