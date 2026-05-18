import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import UploadErrorLog, { UploadLogType } from '@/models/UploadErrorLog';

const LOG_TYPES: UploadLogType[] = ['attendance', 'employee-master', 'employee-schedule'];

function parseLogType(value: string | null): UploadLogType | undefined {
  if (!value) return undefined;
  return LOG_TYPES.includes(value as UploadLogType) ? (value as UploadLogType) : undefined;
}

export async function GET(request: NextRequest) {
  await dbConnect();
  try {
    const logType = parseLogType(request.nextUrl.searchParams.get('type'));
    const filter =
      logType === 'attendance'
        ? { $or: [{ logType: 'attendance' }, { logType: { $exists: false } }] }
        : logType
          ? { logType }
          : {};
    const logs = await UploadErrorLog.find(filter).sort({ uploadDate: -1 }).limit(100);
    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  await dbConnect();
  try {
    const body = await req.json();
    const logType = parseLogType(body.logType) || 'attendance';
    const log = await UploadErrorLog.create({
      fileName: body.fileName,
      errorDetails: body.errorDetails,
      logType,
    });
    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}
