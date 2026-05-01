import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import UploadErrorLog from '@/models/UploadErrorLog';

export async function GET() {
  await dbConnect();
  try {
    const logs = await UploadErrorLog.find().sort({ uploadDate: -1 }).limit(100);
    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  await dbConnect();
  try {
    const body = await req.json();
    const log = await UploadErrorLog.create({
      fileName: body.fileName,
      errorDetails: body.errorDetails
    });
    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}
