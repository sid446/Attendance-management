import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Fetch single user by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const { id } = await params;
    const user = await User.findById(id);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PUT - Update user
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const { id } = await params;
    const body = await request.json();
    const { 
      odId, 
      name, 
      email, 
      designation,
      team,
      joiningDate,
      scheduleInOutTime,
      scheduleInOutTimeSat,
      scheduleInOutTimeMonth,
      isActive,
      extraInfo,
    } = body;

    const user = await User.findByIdAndUpdate(
      id,
      {
        ...(odId && { odId }),
        ...(name && { name }),
        ...(email && { email }),
        ...(designation && { designation }),
        ...(team && { team }),
        ...(joiningDate && { joiningDate: new Date(joiningDate) }),
        ...(scheduleInOutTime && { scheduleInOutTime }),
        ...(scheduleInOutTimeSat && { scheduleInOutTimeSat }),
        ...(scheduleInOutTimeMonth && { scheduleInOutTimeMonth }),
        ...(isActive !== undefined && { isActive }),
        ...(Array.isArray(extraInfo) && { extraInfo }),
      },
      { new: true, runValidators: true }
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // If extraInfo labels were updated for this user, propagate those labels
    // to all other users so every employee shares the same set of fields.
    if (Array.isArray(extraInfo) && extraInfo.length > 0) {
      try {
        await syncExtraInfoLabelsFromUser(user._id.toString());
      } catch (syncError) {
        console.error('Error syncing extraInfo labels to all users:', syncError);
        // Do not fail the main request because of sync issues; just log.
      }
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

async function syncExtraInfoLabelsFromUser(sourceUserId: string) {
  const sourceUser = await User.findById(sourceUserId).select('extraInfo');

  if (!sourceUser || !Array.isArray((sourceUser as any).extraInfo)) {
    return;
  }

  const sourceExtraInfo = (sourceUser as any).extraInfo as Array<{ label?: string; value?: string }>;

  const labelSet = new Set(
    sourceExtraInfo
      .map((item) => (typeof item.label === 'string' ? item.label.trim() : ''))
      .filter((label) => label)
  );

  if (labelSet.size === 0) {
    return;
  }

  const otherUsers = await User.find({ _id: { $ne: sourceUserId } }).select('extraInfo');

  const bulkOps: any[] = [];

  for (const other of otherUsers) {
    const otherExtraInfo = (other as any).extraInfo as Array<{ label?: string; value?: string }> | undefined;
    const existingLabels = new Set(
      (otherExtraInfo || [])
        .map((item) => (typeof item.label === 'string' ? item.label.trim() : ''))
        .filter((label) => label)
    );

    const newItems: { label: string; value: string }[] = [];

    for (const label of labelSet) {
      if (!existingLabels.has(label)) {
        newItems.push({ label, value: '' });
      }
    }

    if (newItems.length > 0) {
      bulkOps.push({
        updateOne: {
          filter: { _id: (other as any)._id },
          update: { $push: { extraInfo: { $each: newItems } } },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    await (User as any).bulkWrite(bulkOps);
  }
}

// DELETE - Delete user (soft delete by setting isActive to false)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const { id } = await params;
    const user = await User.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User deactivated successfully',
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
