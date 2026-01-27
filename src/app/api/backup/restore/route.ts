import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { restoreDatabaseFromBackup } from '@/lib/backup';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { fileName } = body;

    if (!fileName) {
      return NextResponse.json({
        success: false,
        error: 'fileName is required'
      }, { status: 400 });
    }

    // Validate file path to prevent directory traversal
    const backupPath = path.join(process.cwd(), 'backups');
    const filePath = path.join(backupPath, fileName);

    // Ensure the file is within the backups directory
    const resolvedPath = path.resolve(filePath);
    const resolvedBackupPath = path.resolve(backupPath);

    if (!resolvedPath.startsWith(resolvedBackupPath)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid file path'
      }, { status: 400 });
    }

    // Restore from backup
    const result = await restoreDatabaseFromBackup(filePath);

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