import { NextRequest, NextResponse } from 'next/server';
import { requireBackupAccess } from '@/lib/backupAuth';
import { restoreSnapshot } from '@/lib/backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const access = await requireBackupAccess(request, 'edit');
  if (!access.ok) return access.response;

  try {
    const body = await request.json();
    const dbName = String(body?.dbName || '').trim();
    const confirmText = String(body?.confirmText || '');
    if (!dbName) {
      return NextResponse.json({ success: false, error: 'dbName is required' }, { status: 400 });
    }

    const result = await restoreSnapshot({ dbName, confirmText, actor: access.email });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'Restore failed' }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Backup restore error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
