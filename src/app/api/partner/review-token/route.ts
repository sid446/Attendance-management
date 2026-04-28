import { NextRequest, NextResponse } from 'next/server';
import { createPartnerReviewToken } from '@/lib/partnerReviewToken';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const partnerName = String(body?.partnerName || '').trim();
    const partnerEmail = String(body?.partnerEmail || '').trim();

    if (!partnerName || !partnerEmail) {
      return NextResponse.json(
        { success: false, error: 'partnerName and partnerEmail are required' },
        { status: 400 }
      );
    }

    const token = createPartnerReviewToken({ partnerName, partnerEmail });

    return NextResponse.json({
      success: true,
      data: {
        token,
      },
    });
  } catch (error) {
    console.error('Create partner review token error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create review access token' },
      { status: 500 }
    );
  }
}
