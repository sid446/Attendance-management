import mongoose from 'mongoose';
import User, { IUser } from '@/models/User';
import Attendance from '@/models/Attendance';
import AttendanceRequest from '@/models/AttendanceRequest';

export interface LeaveBalance {
  earned: number;
  used: number;
  remaining: number;
  lastUpdated: Date;
  monthlyEarned: number;
}

export interface LeaveTransaction {
  userId: mongoose.Types.ObjectId;
  date: Date;
  type: 'earned' | 'used';
  amount: number;
  reason: string;
  reference?: string; // Could be attendance record ID or request ID
}

/**
 * Initialize leave balance for a new user
 */
export async function initializeLeaveBalance(userId: mongoose.Types.ObjectId): Promise<void> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Start fresh - no earned leave initially, only earn when attendance is uploaded
    const initialEarned = 0; // Will earn 2 days per month when attendance is uploaded

    await User.findByIdAndUpdate(userId, {
      'leaveBalance.earned': initialEarned,
      'leaveBalance.remaining': initialEarned,
      'leaveBalance.lastUpdated': new Date(),
    });
  } catch (error) {
    console.error('Error initializing leave balance:', error);
    throw error;
  }
}

/**
 * Increment monthly earned leave for all active users
 * @param monthYear Optional month-year string (YYYY-MM) to increment for a specific month
 */
export async function incrementMonthlyLeave(monthYear?: string): Promise<void> {
  try {
    const now = new Date();
    const targetMonth = monthYear || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Import Attendance model here to avoid circular imports
    const Attendance = (await import('@/models/Attendance')).default;

    // Find all users who have attendance records for this month
    const usersWithAttendance = await Attendance.distinct('userId', { monthYear: targetMonth });
    console.log(`Found ${usersWithAttendance.length} users with attendance for ${targetMonth}`);

    for (const userId of usersWithAttendance) {
      // Get the user
      const user = await User.findById(userId);
      if (!user || !user.isActive) continue;

      const monthlyEarned = user.leaveBalance?.monthlyEarned || 2;

      // Check if leave was already incremented for this month
      // Skip only if user has earned leave AND it was updated this month
      const lastUpdated = user.leaveBalance?.lastUpdated;
      const currentEarned = user.leaveBalance?.earned || 0;
      if (lastUpdated && currentEarned > 0) {
        const lastUpdatedMonth = `${lastUpdated.getFullYear()}-${String(lastUpdated.getMonth() + 1).padStart(2, '0')}`;
        if (lastUpdatedMonth === targetMonth) {
          continue; // Already incremented for this month
        }
      }

      // Increment earned leave
      const newEarned = currentEarned + monthlyEarned;
      const currentUsed = user.leaveBalance?.used || 0;
      const newRemaining = newEarned - currentUsed;

      await User.findByIdAndUpdate(user._id, {
        'leaveBalance.earned': newEarned,
        'leaveBalance.remaining': Math.max(0, newRemaining),
        'leaveBalance.lastUpdated': now,
      });
    }

    console.log(`Monthly leave incremented for ${usersWithAttendance.length} users for month ${targetMonth}`);
  } catch (error) {
    console.error('Error incrementing monthly leave:', error);
    throw error;
  }
}

/**
 * Calculate leave usage for multiple days
 */
export async function calculateLeaveUsageForMultipleDays(
  userId: mongoose.Types.ObjectId,
  dates: string[],
  requestedStatus: string
): Promise<{ leaveDetails: Array<{ date: string; isPaidLeave: boolean; value: number }> }> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get current leave balance
    const currentBalance = user.leaveBalance?.remaining || 0;

    // Check if this is a leave request
    const isLeaveRequest = requestedStatus.toLowerCase().includes('leave') ||
                          requestedStatus.toLowerCase().includes('absent') ||
                          requestedStatus === 'On leave';

    if (!isLeaveRequest) {
      // Not a leave request, all dates get full value
      const leaveDetails = dates.map(date => ({
        date,
        isPaidLeave: false,
        value: 1
      }));
      return { leaveDetails };
    }

    // For leave requests, calculate how many can be paid vs unpaid
    const leaveDetails = [];
    let remainingBalance = currentBalance;

    for (const date of dates) {
      if (remainingBalance >= 1) {
        // Has enough balance for paid leave
        leaveDetails.push({
          date,
          isPaidLeave: true,
          value: 1
        });
        remainingBalance -= 1;
      } else {
        // No balance remaining, unpaid leave
        leaveDetails.push({
          date,
          isPaidLeave: false,
          value: 0
        });
      }
    }

    return { leaveDetails };
  } catch (error) {
    console.error('Error calculating leave usage for multiple days:', error);
    // Return all as unpaid leave on error
    const leaveDetails = dates.map(date => ({
      date,
      isPaidLeave: false,
      value: 0
    }));
    return { leaveDetails };
  }
}

/**
 * Calculate leave usage for a specific attendance record
 */
export async function calculateLeaveUsage(
  userId: mongoose.Types.ObjectId,
  date: string,
  requestedStatus: string
): Promise<{ isPaidLeave: boolean; value: number }> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const remainingLeave = user.leaveBalance?.remaining || 0;

    // Check if this is a leave request
    const isLeaveRequest = requestedStatus.toLowerCase().includes('leave') ||
                          requestedStatus.toLowerCase().includes('absent') ||
                          requestedStatus === 'On leave';

    if (!isLeaveRequest) {
      return { isPaidLeave: false, value: 1 }; // Not a leave, full attendance value
    }

    // For leave requests, determine if it's paid or unpaid
    if (remainingLeave >= 1) {
      // Has enough leave balance for paid leave
      return { isPaidLeave: true, value: 1 };
    } else {
      // No leave balance remaining, unpaid leave
      return { isPaidLeave: false, value: 0 };
    }
  } catch (error) {
    console.error('Error calculating leave usage:', error);
    return { isPaidLeave: false, value: 0 };
  }
}

/**
 * Update leave balance when leave is approved
 */
export async function updateLeaveBalanceOnApproval(
  userId: mongoose.Types.ObjectId,
  dateOrDetails: string | Array<{ date: string; isPaidLeave: boolean; value: number }>,
  isPaidLeave?: boolean
): Promise<void> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Handle single date (backward compatibility)
    if (typeof dateOrDetails === 'string') {
      if (!isPaidLeave) {
        return; // No balance update needed for unpaid leave
      }

      const currentUsed = user.leaveBalance?.used || 0;
      const currentRemaining = user.leaveBalance?.remaining || 0;

      await User.findByIdAndUpdate(userId, {
        'leaveBalance.used': currentUsed + 1,
        'leaveBalance.remaining': Math.max(0, currentRemaining - 1),
      });

      return;
    }

    // Handle multiple dates
    const leaveDetails = dateOrDetails as Array<{ date: string; isPaidLeave: boolean; value: number }>;
    const paidLeaves = leaveDetails.filter(detail => detail.isPaidLeave);

    if (paidLeaves.length === 0) {
      return; // No paid leaves to update
    }

    const currentUsed = user.leaveBalance?.used || 0;
    const currentRemaining = user.leaveBalance?.remaining || 0;

    await User.findByIdAndUpdate(userId, {
      'leaveBalance.used': currentUsed + paidLeaves.length,
      'leaveBalance.remaining': Math.max(0, currentRemaining - paidLeaves.length),
    });

  } catch (error) {
    console.error('Error updating leave balance on approval:', error);
    throw error;
  }
}

/**
 * Get leave balance for a user
 */
export async function getLeaveBalance(userId: mongoose.Types.ObjectId): Promise<LeaveBalance | null> {
  try {
    const user = await User.findById(userId).select('leaveBalance');
    return user?.leaveBalance || null;
  } catch (error) {
    console.error('Error getting leave balance:', error);
    return null;
  }
}

/**
 * Reset leave balance (for testing or admin purposes)
 */
export async function resetLeaveBalance(userId: mongoose.Types.ObjectId): Promise<void> {
  try {
    await User.findByIdAndUpdate(userId, {
      'leaveBalance.earned': 0,
      'leaveBalance.used': 0,
      'leaveBalance.remaining': 0,
      'leaveBalance.lastUpdated': new Date(),
    });
  } catch (error) {
    console.error('Error resetting leave balance:', error);
    throw error;
  }
}

/**
 * Get leave summary for a user in a specific month
 */
export async function getMonthlyLeaveSummary(
  userId: mongoose.Types.ObjectId,
  monthYear: string
): Promise<{
  earned: number;
  used: number;
  remaining: number;
  leaveRequests: Array<{
    date: string;
    status: string;
    isPaidLeave: boolean;
    value: number;
  }>;
}> {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get attendance record for the month
    const attendance = await Attendance.findOne({ userId, monthYear });

    // Get leave requests for the month
    const leaveRequests = await AttendanceRequest.find({
      userId,
      monthYear,
      status: 'Approved',
      requestedStatus: { $regex: /leave|absent/i }
    });

    const leaveSummary = leaveRequests.map(request => {
      const record = attendance?.records?.get(request.date);
      const isPaidLeave = (record?.value || 0) > 0;

      return {
        date: request.date,
        status: request.requestedStatus,
        isPaidLeave,
        value: record?.value || 0,
      };
    });

    return {
      earned: user.leaveBalance?.earned || 0,
      used: user.leaveBalance?.used || 0,
      remaining: user.leaveBalance?.remaining || 0,
      leaveRequests: leaveSummary,
    };
  } catch (error) {
    console.error('Error getting monthly leave summary:', error);
    return {
      earned: 0,
      used: 0,
      remaining: 0,
      leaveRequests: [],
    };
  }
}