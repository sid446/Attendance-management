import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { restoreDatabaseFromBackup } from '@/lib/backup';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { backupId } = body;

    if (!backupId) {
      return NextResponse.json({
        success: false,
        error: 'backupId is required'
      }, { status: 400 });
    }

    // Restore from backup
    const result = await restoreDatabaseFromBackup(backupId);

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Backup restore error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}