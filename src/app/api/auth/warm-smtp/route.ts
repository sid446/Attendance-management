import { NextResponse } from 'next/server';
import { warmSmtpPool } from '@/lib/mailer';

export async function GET() {
  await warmSmtpPool();
  return NextResponse.json({ success: true });
}
