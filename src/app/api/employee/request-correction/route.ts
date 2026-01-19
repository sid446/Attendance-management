import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const partnerName = searchParams.get('partnerName');
    const status = searchParams.get('status');

    let query: any = {};

    if (userId) {
      query.userId = userId;
    }

    if (partnerName) {
      query.partnerName = partnerName;
    }

    if (status) {
      query.status = status;
    }

    const requests = await AttendanceRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email designation')
      .lean();

    return NextResponse.json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('Fetch Requests Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { userId, date, requestedStatus, reason, startTime, endTime } = await request.json();

    if (!userId || !date || !requestedStatus) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, error: 'Invalid date format. Expected YYYY-MM-DD' }, { status: 400 });
    }

    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    if (!user.workingUnderPartner) {
      return NextResponse.json({ success: false, error: 'No Partner assigned to this employee' }, { status: 400 });
    }

    // Determine partner email
    let partnerEmail = '';
    const partnerName = user.workingUnderPartner;
    
    const cleanName = partnerName.trim();
    const dottedName = cleanName.replace(/\s+/g, '.');
    
    const partnerUser = await User.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${cleanName}$`, 'i') } },
        { name: { $regex: new RegExp(`^${dottedName}$`, 'i') } }
      ]
    });

    if (partnerUser && partnerUser.email) {
      partnerEmail = partnerUser.email;
    } else {
      return NextResponse.json({ success: false, error: `Partner "${partnerName}" email not found in system` }, { status: 400 });
    }

    const monthYear = date.substring(0, 7); // YYYY-MM

    const existingForDate = await AttendanceRequest.find({ userId: user._id, date });
    const hasActiveForDate = existingForDate.some((r: any) => r.status !== 'Rejected');
    
    if (hasActiveForDate) {
      return NextResponse.json(
        { success: false, error: 'You already have a correction request for this date which is not rejected yet.' },
        { status: 400 }
      );
    }

    if (existingForDate.length > 0) {
      await AttendanceRequest.deleteMany({ userId: user._id, date, status: 'Rejected' });
    }

    await AttendanceRequest.create({
      userId: user._id,
      userName: user.name,
      partnerName: partnerName,
      date,
      monthYear,
      requestedStatus,
      reason,
      startTime,
      endTime,
      originalStatus: 'Absent',
      status: 'Pending'
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';

    // Fetch all pending requests assigned to this partner (across all employees)
    const pendingRequests = await AttendanceRequest.find({ partnerName: partnerName, status: 'Pending' }).sort({ createdAt: 1 });

    // Desktop table rows
    const rowsHtml = pendingRequests.map((req: any, index: number) => {
      const reviewLinkRow = `${baseUrl}/partner/review?id=${req._id}`;
      const timeRange = req.startTime && req.endTime ? `${req.startTime} - ${req.endTime}` : '-';
      const reasonText = req.reason || '-';

      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 8px; text-align: center; font-size: 14px; color: #6b7280;">${index + 1}</td>
          <td style="padding: 12px 8px; font-size: 14px; color: #111827; font-weight: 500; white-space: nowrap;">${req.userName}</td>
          <td style="padding: 12px 8px; font-size: 14px; color: #374151; white-space: nowrap;">${req.date}</td>
          <td style="padding: 12px 8px; font-size: 14px; color: #374151;">
            <span style="display: inline-block; padding: 4px 8px; background-color: #dbeafe; color: #1e40af; border-radius: 4px; font-size: 13px;">${req.requestedStatus}</span>
          </td>
          <td style="padding: 12px 8px; font-size: 14px; color: #374151; white-space: nowrap;">${timeRange}</td>
          <td style="padding: 12px 8px; font-size: 14px; color: #374151; max-width: 200px; word-wrap: break-word;">${reasonText}</td>
          <td style="padding: 12px 8px; text-align: center;">
            <a href="${reviewLinkRow}" style="display: inline-block; margin: 4px; padding: 8px 16px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">Review</a>
          </td>
        </tr>
      `;
    }).join('');

    // Mobile card view
    const mobileCardsHtml = pendingRequests.map((req: any, index: number) => {
      const reviewLinkRow = `${baseUrl}/partner/review?id=${req._id}`;
      const timeRange = req.startTime && req.endTime ? `${req.startTime} - ${req.endTime}` : '-';
      const reasonText = req.reason || '-';

      return `
        <div style="background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f3f4f6;">
            <div>
              <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Request #${index + 1}</div>
              <div style="font-size: 14px; color: #111827; font-weight: 600; margin-top: 2px;">${req.userName}</div>
            </div>
            <span style="display: inline-block; padding: 4px 10px; background-color: #dbeafe; color: #1e40af; border-radius: 4px; font-size: 12px; font-weight: 500;">${req.requestedStatus}</span>
          </div>
          <div style="margin-bottom: 8px;">
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Date</div>
            <div style="font-size: 14px; color: #1f2937; font-weight: 500;">${req.date}</div>
          </div>
          <div style="margin-bottom: 8px;">
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Time Range</div>
            <div style="font-size: 14px; color: #1f2937;">${timeRange}</div>
          </div>
          <div style="margin-bottom: 16px;">
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Reason</div>
            <div style="font-size: 14px; color: #1f2937; line-height: 1.5;">${reasonText}</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <a href="${reviewLinkRow}" style="flex: 1; display: block; padding: 10px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; text-align: center;">Review</a>
          </div>
        </div>
      `;
    }).join('');

    // Mobile-optimized email template
    await transporter.sendMail({
      ...mailOptions,
      to: partnerEmail,
      subject: `Attendance Correction Requests: ${user.name}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Attendance Correction Request</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        padding: 12px !important;
      }
      .content-wrapper {
        padding: 16px !important;
      }
      .email-header h1 {
        font-size: 20px !important;
      }
      .info-box {
        font-size: 14px !important;
      }
      /* Hide desktop table on mobile */
      .desktop-table {
        display: none !important;
      }
      /* Show mobile cards only on mobile */
      .mobile-cards {
        display: block !important;
      }
    }
    @media only screen and (min-width: 601px) {
      /* Hide mobile cards on desktop */
      .mobile-cards {
        display: none !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div class="email-container" style="max-width: 800px; margin: 0 auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
      
      <!-- Header -->
      <div class="email-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">Attendance Correction Requests</h1>
      </div>

      <!-- Content -->
      <div class="content-wrapper" style="padding: 24px;">
        
        <!-- Info Box -->
        <div class="info-box" style="background-color: #f9fafb; border-left: 4px solid #667eea; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
          <p style="margin: 0; font-size: 15px; color: #374151; line-height:1.5;">
            <strong style="color: #1f2937;">New request submitted by:</strong> ${user.name}<br/>
            <span style="font-size: 13px; color:#6b7280;">Below are all pending correction requests currently assigned to you.</span>
          </p>
        </div>

        <!-- Description -->
        <p style="margin: 0 0 20px 0; font-size: 15px; color: #4b5563; line-height: 1.6;">
          The following pending attendance correction request(s) are waiting for your action. Click "Review" for each request to approve or reject with optional remarks.
        </p>

        <!-- Desktop Table -->
        <div class="desktop-table" style="overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse; background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; min-width: 600px;">
            <thead>
              <tr style="background-color: #f9fafb;">
                <th style="padding: 12px 8px; text-align: center; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">#</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Employee</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Date</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Time</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Reason</th>
                <th style="padding: 12px 8px; text-align: center; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Review</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        <!-- Mobile Cards (Hidden on Desktop) -->
        <div class="mobile-cards" style="display: none;">
          ${mobileCardsHtml}
        </div>

        <!-- Footer Note -->
        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 16px; margin-top: 24px;">
          <p style="margin: 0; font-size: 14px; color: #1e40af; line-height: 1.5;">
            <strong>📌 Note:</strong> Click "Review" for each request to approve or reject with optional remarks. Once you submit your decision, the corresponding attendance record will be updated immediately.
          </p>
        </div>

      </div>

      <!-- Footer -->
      <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 13px; color: #6b7280;">
          This is an automated email. Please do not reply to this message.
        </p>
      </div>

    </div>
  </div>
</body>
</html>
      `
    });

    return NextResponse.json({ success: true, message: 'Request sent to partner', sentTo: partnerEmail });
  } catch (error) {
    console.error('Request Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to submit request' }, { status: 500 });
  }
}