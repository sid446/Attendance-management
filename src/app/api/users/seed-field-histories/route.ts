import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertCanReadEmployees, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import {
  LEGACY_BASELINE_EFFECTIVE_FROM,
  LEGACY_SEED_FIELDS,
  seedFieldHistoryIfMissing,
} from '@/lib/userFieldHistory';

/** One-time / maintenance: seed open-ended fieldHistories for existing values (effective from 12 Dec 2025). */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    const readDenied = assertCanReadEmployees(effective);
    if (readDenied) return readDenied;

    const users = await User.find({}).lean();
    let usersUpdated = 0;
    let segmentsSeeded = 0;

    for (const row of users) {
      const user = await User.findById(row._id);
      if (!user) continue;

      let changed = false;
      for (const field of LEGACY_SEED_FIELDS) {
        if (seedFieldHistoryIfMissing(user as any, field, LEGACY_BASELINE_EFFECTIVE_FROM)) {
          changed = true;
          segmentsSeeded += 1;
        }
      }

      if (changed) {
        user.markModified('fieldHistories');
        await user.save();
        usersUpdated += 1;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        usersScanned: users.length,
        usersUpdated,
        segmentsSeeded,
        effectiveFrom: LEGACY_BASELINE_EFFECTIVE_FROM.toISOString(),
        fields: LEGACY_SEED_FIELDS,
      },
    });
  } catch (error) {
    console.error('seed-field-histories error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to seed field histories' },
      { status: 500 }
    );
  }
}
