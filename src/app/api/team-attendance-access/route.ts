import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import TeamAttendanceAccess from '@/models/TeamAttendanceAccess';

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
}

function normalizeObjectIdArray(value: unknown): mongoose.Types.ObjectId[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )
  ).map((id) => new mongoose.Types.ObjectId(id));
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const viewerUserId = searchParams.get('viewerUserId');
    const query: Record<string, unknown> = {};

    if (viewerUserId) {
      if (!mongoose.Types.ObjectId.isValid(viewerUserId)) {
        return NextResponse.json({ success: false, error: 'Invalid viewer user id' }, { status: 400 });
      }
      query.viewerUserId = viewerUserId;
    }

    const rules = await TeamAttendanceAccess.find(query)
      .sort({ updatedAt: -1 })
      .populate('viewerUserId', 'name email employeeCode odId workingUnderPartner')
      .populate('extraUserIds', 'name email employeeCode odId workingUnderPartner')
      .lean();

    return NextResponse.json({ success: true, data: rules });
  } catch (error) {
    console.error('Team attendance access fetch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch team attendance access rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const viewerUserId = String(body?.viewerUserId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(viewerUserId)) {
      return NextResponse.json({ success: false, error: 'Valid viewerUserId is required' }, { status: 400 });
    }

    const update = {
      includeOwnTeam: body?.includeOwnTeam !== false,
      extraUserIds: normalizeObjectIdArray(body?.extraUserIds),
      extraPartnerNames: normalizeStringArray(body?.extraPartnerNames),
      isActive: body?.isActive !== false,
    };

    const rule = await TeamAttendanceAccess.findOneAndUpdate(
      { viewerUserId },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    )
      .populate('viewerUserId', 'name email employeeCode odId workingUnderPartner')
      .populate('extraUserIds', 'name email employeeCode odId workingUnderPartner')
      .lean();

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error('Team attendance access save error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save team attendance access rule' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const { viewerUserId } = await request.json();
    const id = String(viewerUserId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Valid viewerUserId is required' }, { status: 400 });
    }

    await TeamAttendanceAccess.deleteOne({ viewerUserId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Team attendance access delete error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete team attendance access rule' }, { status: 500 });
  }
}
