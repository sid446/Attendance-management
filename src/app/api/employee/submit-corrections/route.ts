import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';
import { createPartnerReviewAllLink } from '@/lib/partnerReviewToken';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';

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

    if (!user.workingUnderPartner) {
      return NextResponse.json({
        success: false,
        error: 'No partner assigned to this employee'
      }, { status: 400 });
    }

    const partnerName = user.workingUnderPartner;
    const approverNotificationEmail = String((user as any).attendanceEmail || user.email || '').trim();

    if (!approverNotificationEmail) {
      return NextResponse.json({
        success: false,
        error: 'No attendance email configured for this employee. Please contact admin.'
      }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';
    let successCount = 0;
    let failedCount = 0;
    const createdRequests: any[] = [];

    for (const correction of corrections as CorrectionData[]) {
      try {
        const { date, originalCheckin, originalCheckout, newCheckin, newCheckout, reason } = correction;

        if (!date) {
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
        const newRequest = await AttendanceRequest.create({
          userId: user._id,
          userName: user.name,
          partnerName,
          date,
          monthYear,
          requestedStatus: 'Manual', // Time correction is treated as Manual entry
          originalStatus: 'ThumbMachine',
          reason: reason || 'Time correction for missing punch',
          status: 'Pending',
          startTime: newCheckin || originalCheckin,
          endTime: newCheckout || originalCheckout
        });

        createdRequests.push(newRequest);
        successCount++;
      } catch (err) {
        console.error('Error creating correction request:', err);
        failedCount++;
      }
    }

    // Send email notification to partner if any requests were created
    if (createdRequests.length > 0) {
      try {
        // Fetch all pending requests for this partner
        const pendingRequests = await AttendanceRequest.find({
          partnerName,
          status: 'Pending'
        }).sort({ createdAt: 1 });

        const formatDate = (dateStr: string) => {
          const date = new Date(dateStr);
          return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
        };

        // Desktop table rows
        const tableRows = pendingRequests.map((req: any, index: number) => {
          const reviewLink = `${baseUrl}/partner/review?id=${req._id}`;
          const timeRange = req.startTime && req.endTime ? `${req.startTime} - ${req.endTime}` : '—';

          return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 8px; text-align: center; font-size: 14px; color: #6b7280;">${index + 1}</td>
              <td style="padding: 12px 8px; font-size: 14px; color: #111827; font-weight: 500; white-space: nowrap;">${req.userName}</td>
              <td style="padding: 12px 8px; font-size: 14px; color: #374151; white-space: nowrap;">${formatDate(req.date)}</td>
              <td style="padding: 12px 8px; font-size: 14px; color: #374151; white-space: nowrap;">${timeRange}</td>
              <td style="padding: 12px 8px; font-size: 14px; color: #374151; max-width: 150px; word-wrap: break-word;">${req.reason || '—'}</td>
              <td style="padding: 12px 8px; text-align: center;">
                <a href="${reviewLink}" style="display: inline-block; padding: 8px 16px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">Review</a>
              </td>
            </tr>
          `;
        }).join('');

        // Mobile cards
        const mobileCards = pendingRequests.map((req: any, index: number) => {
          const reviewLink = `${baseUrl}/partner/review?id=${req._id}`;
          const timeRange = req.startTime && req.endTime ? `${req.startTime} - ${req.endTime}` : '—';

          return `
            <div style="background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="font-size: 14px; color: #111827; font-weight: 600;">${req.userName}</div>
                <span style="display: inline-block; padding: 4px 10px; background-color: #fef3c7; color: #92400e; border-radius: 4px; font-size: 12px; font-weight: 500;">Time Correction</span>
              </div>
              <div style="display: flex; gap: 16px; margin-bottom: 12px;">
                <div>
                  <div style="font-size: 12px; color: #6b7280;">Date</div>
                  <div style="font-size: 14px; color: #1f2937; font-weight: 500;">${formatDate(req.date)}</div>
                </div>
                <div>
                  <div style="font-size: 12px; color: #6b7280;">Time</div>
                  <div style="font-size: 14px; color: #1f2937;">${timeRange}</div>
                </div>
              </div>
              <div style="margin-bottom: 16px;">
                <div style="font-size: 12px; color: #6b7280;">Reason</div>
                <div style="font-size: 14px; color: #1f2937;">${req.reason || '—'}</div>
              </div>
              <a href="${reviewLink}" style="display: block; padding: 10px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; text-align: center;">Review</a>
            </div>
          `;
        }).join('');

        // Review all link
        const reviewAllLink = createPartnerReviewAllLink(baseUrl, partnerName, approverNotificationEmail);

        await transporter.sendMail({
          ...mailOptions,
          to: approverNotificationEmail,
          subject: `Time Correction Request from ${user.name}`,
          html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Time Correction Request</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; padding: 12px !important; }
      .desktop-table { display: none !important; }
      .mobile-cards { display: block !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <div class="email-container" style="max-width: 650px; margin: 20px auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 22px; font-weight: 600;">Time Correction Request</h1>
      </div>
      
      <!-- Content -->
      <div style="padding: 24px;">
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151;">
          Dear <strong>${partnerName}</strong>,
        </p>
        <p style="margin: 0 0 24px 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
          <strong>${user.name}</strong> has submitted ${createdRequests.length} time correction request${createdRequests.length > 1 ? 's' : ''} for your approval.
          These corrections are for missing check-in/check-out times.
        </p>

        <!-- Summary Box -->
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 14px; color: #92400e;">
            You have <strong>${pendingRequests.length}</strong> total pending request${pendingRequests.length > 1 ? 's' : ''} to review
          </div>
        </div>

        <!-- Desktop Table -->
        <div class="desktop-table" style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <thead>
              <tr style="background-color: #f9fafb;">
                <th style="padding: 12px 8px; text-align: center; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">#</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Employee</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Date</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Time</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Reason</th>
                <th style="padding: 12px 8px; text-align: center; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>

        <!-- Mobile Cards -->
        <div class="mobile-cards" style="display: none;">
          ${mobileCards}
        </div>

        <!-- Review All Button -->
        <div style="text-align: center; margin-top: 32px;">
          <a href="${reviewAllLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
            Review All Requests
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #6b7280;">
          Asija and Associates LLP - Attendance Management System
        </p>
      </div>
    </div>
  </div>
</body>
</html>
          `,
        });
      } catch (emailError) {
        console.error('Error sending email to partner:', emailError);
        // Don't fail the entire request if email fails
      }
    }

    return NextResponse.json({
      success: true,
      successCount,
      failedCount,
      message: `${successCount} correction${successCount !== 1 ? 's' : ''} submitted for approval`
    });
  } catch (error) {
    console.error('Error submitting corrections:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to submit corrections'
    }, { status: 500 });
  }
}
