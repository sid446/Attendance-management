import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

// POST - Add a global extraInfo label to all users
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { label } = await request.json();

    if (!label || typeof label !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Label is required' },
        { status: 400 }
      );
    }

    const trimmedLabel = label.trim();

    if (!trimmedLabel) {
      return NextResponse.json(
        { success: false, error: 'Label cannot be empty' },
        { status: 400 }
      );
    }

    // Add this label with empty value to all users that do not yet have it
    const result = await User.updateMany(
      { 'extraInfo.label': { $ne: trimmedLabel } },
      {
        $push: {
          extraInfo: {
            label: trimmedLabel,
            value: '',
          },
        },
      }
    );

    return NextResponse.json({
      success: true,
      data: { matched: result.matchedCount, modified: result.modifiedCount },
    });
  } catch (error) {
    console.error('Error adding global extraInfo label:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add extra info field' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a global extraInfo label from all users
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const { label } = await request.json();

    if (!label || typeof label !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Label is required' },
        { status: 400 }
      );
    }

    const trimmedLabel = label.trim();

    if (!trimmedLabel) {
      return NextResponse.json(
        { success: false, error: 'Label cannot be empty' },
        { status: 400 }
      );
    }

    const result = await User.updateMany(
      { 'extraInfo.label': trimmedLabel },
      {
        $pull: {
          extraInfo: { label: trimmedLabel },
        },
      }
    );

    return NextResponse.json({
      success: true,
      data: { matched: result.matchedCount, modified: result.modifiedCount },
    });
  } catch (error) {
    console.error('Error removing global extraInfo label:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove extra info field' },
      { status: 500 }
    );
  }
}
