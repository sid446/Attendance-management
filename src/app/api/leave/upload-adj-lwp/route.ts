import { NextRequest, NextResponse } from 'next/server';
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
import {
  ADJ_FROM_MONTH,
  getAdjLwpByUserThroughMonth,
  rebuildSnapshotsFromMonth,
  setAdjThisMonth,
  syncUserLeaveAdjLwpFromLedger,
} from '@/lib/leaveAdjLwp';

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

function parseMonthYear(raw: unknown): string | null {
  const value = String(raw || '').trim();
  if (!value) return currentMonthKey();
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  return value < ADJ_FROM_MONTH ? ADJ_FROM_MONTH : value;
}

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
    const monthYear = parseMonthYear(body?.monthYear);

    if (!monthYear) {
      return NextResponse.json(
        { success: false, error: 'monthYear must be YYYY-MM' },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No rows found in the uploaded file' },
        { status: 400 }
      );
    }

    const users = await User.find({})
      .select('_id name employeeCode leaveBalance')
      .lean();

    const adjByUser = await getAdjLwpByUserThroughMonth(monthYear);

    const byNameKey = new Map<string, Array<{ id: string; name: string; adj: number }>>();
    for (const u of users) {
      const key = normalizeForMatch(String(u.name || ''));
      if (!key) continue;
      if (!byNameKey.has(key)) byNameKey.set(key, []);
      const uid = String(u._id);
      const adjRow = adjByUser.get(uid);
      byNameKey.get(key)!.push({
        id: uid,
        name: String(u.name || ''),
        adj: adjRow?.thisMonth ?? 0,
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
        invalid.push({ excelName, reason: 'Adj this month is not a valid number' });
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
        data: { matched, notFound, ambiguous, invalid, duplicateNames, monthYear },
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
        leaveAdjLwpOverrideMonth: monthYear,
      });

      return NextResponse.json({
        success: true,
        data: {
          mode,
          monthYear,
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
      await setAdjThisMonth(m.userId, monthYear, m.newLeaveAdjLwp);
    }

    const applied = await reconcileLeaveFromAttendance({
      fromMonth: EARN_FROM_MONTH,
      toMonth,
      userIds,
      dryRun: false,
    });

    for (const m of matched) {
      await syncUserLeaveAdjLwpFromLedger(m.userId);
    }

    await rebuildSnapshotsFromMonth(monthYear);

    return NextResponse.json({
      success: true,
      data: {
        mode,
        monthYear,
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
