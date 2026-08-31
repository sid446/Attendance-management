import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import User from '@/models/User';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';
import { resolveRequestRoutingForDate } from '@/lib/attendanceRequestNotifications';

interface CorrectionData {
  date: string;
  originalCheckin: string;
  originalCheckout: string;
  newCheckin: string;
  newCheckout: string;
  reason: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const { userId, monthYear, corrections } = await request.json();

    if (!userId || !monthYear || !corrections || !Array.isArray(corrections) || corrections.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'userId, monthYear, and corrections array are required'
      }, { status: 400 });
    }

    const forbidden = forbidUnlessSelf(auth.userId, userId);
    if (forbidden) return forbidden;

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }

    let successCount = 0;
    let failedCount = 0;

    for (const correction of corrections as CorrectionData[]) {
      try {
        const { date, originalCheckin, originalCheckout, newCheckin, newCheckout, reason } = correction;

        if (!date) {
          failedCount++;
          continue;
        }

        const routing = await resolveRequestRoutingForDate(user, date);
        if ('error' in routing) {
          failedCount++;
          continue;
        }
        // Check for existing pending request for this date
        const existingRequest = await AttendanceRequest.findOne({
          userId: user._id,
          date,
          status: { $in: ['Pending', 'PendingHr'] },
        });

        if (existingRequest) {
          failedCount++;
          continue; // Already has a pending request
        }

        // Delete any rejected request for this date
        await AttendanceRequest.deleteMany({
          userId: user._id,
          date,
          status: 'Rejected'
        });

        // Create new attendance request
        await AttendanceRequest.create({
          userId: user._id,
          userName: user.name,
          partnerName: routing.partnerName,
          date,
          monthYear,
          requestedStatus: 'Manual', // Time correction is treated as Manual entry
          originalStatus: 'ThumbMachine',
          reason: reason || 'Time correction for missing punch',
          status: 'Pending',
          startTime: newCheckin || originalCheckin,
          endTime: newCheckout || originalCheckout
        });

        successCount++;
      } catch (err) {
        console.error('Error creating correction request:', err);
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      successCount,
      failedCount,
      message: `${successCount} correction${successCount !== 1 ? 's' : ''} submitted. Your partner will be notified in the next morning digest.`,
    });
  } catch (error) {
    console.error('Error submitting corrections:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to submit corrections'
    }, { status: 500 });
  }
}
