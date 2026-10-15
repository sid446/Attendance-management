import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';

export async function requireBackupAccess(request: NextRequest, need: 'view' | 'edit') {
  await dbConnect();
  const operatorEmail = await getHrOperatorEmailFromRequest(request);
  if (!operatorEmail) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
  const effective = effectiveFromDoc(operatorEmail, permDoc);
  const denied = assertHrSection(effective, 'backup', need);
  if (denied) return { ok: false as const, response: denied };
  return { ok: true as const, email: operatorEmail };
}
