import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { userId, startDate, endDate, requestType, reason, startTime, endTime } = await request.json();

    if (!userId || !startDate || !endDate || !requestType) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Partner Email Logic
    if (!user.workingUnderPartner) {
        return NextResponse.json({ success: false, error: 'No Partner assigned to this employee' }, { status: 400 });
    }

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
      // Fallback or Error? 
      // Current correction route errors out. Let's error out to be consistent and clear why email isn't sent.
      return NextResponse.json({ success: false, error: `Partner "${partnerName}" email not found in system` }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return NextResponse.json({ success: false, error: 'Invalid dates' }, { status: 400 });
    }
    
    if (end < start) {
        return NextResponse.json({ success: false, error: 'End date must be after start date' }, { status: 400 });
    }

    const datesToProcess = [];
    let currentDate = new Date(start);
    
    while (currentDate <= end) {
        datesToProcess.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Process requests
    const createdRequests = [];

    for (const d of datesToProcess) {
        // Skip Sundays (getDay() === 0)
        if (d.getDay() === 0) continue;
        
        const dateStr = d.toISOString().split('T')[0];
        const monthYear = dateStr.substring(0, 7); // YYYY-MM
        
        // Check if request already exists for this date? 
        // We probably should overwrite or fail. For now, let's create dynamic checking or just upsert logic if we want to valid duplicates
        // But schema doesn't enforce unique date per user. 
        // We will create a fresh request.
        
        // Calculate times for Present - outstation requests
        let finalStartTime = startTime;
        let finalEndTime = endTime;
        
        if (requestType === 'Present - outstation') {
            // Determine scheduled times based on day of week and user schedule
            const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            const month = d.getMonth() + 1; // 1-12
            
            let scheduleToUse;
            if (month === 12 || month === 1) {
                // December or January - use monthly schedule
                scheduleToUse = user.scheduleInOutTimeMonth;
            } else if (dayOfWeek === 6) {
                // Saturday - use saturday schedule
                scheduleToUse = user.scheduleInOutTimeSat;
            } else if (dayOfWeek !== 0) {
                // Monday to Friday - use regular schedule
                scheduleToUse = user.scheduleInOutTime;
            }
            
            if (scheduleToUse) {
                finalStartTime = scheduleToUse.inTime;
                finalEndTime = scheduleToUse.outTime;
            }
        }
        
        const newRequest = new AttendanceRequest({
            userId: user._id,
            userName: user.name,
            partnerName: user.workingUnderPartner || 'Admin',
            date: dateStr,
            monthYear: monthYear,
            requestedStatus: requestType,
            originalStatus: 'Future Request', // Placeholder
            reason: reason,
            status: 'Pending',
            startTime: finalStartTime || undefined,
            endTime: finalEndTime || undefined
        });

        await newRequest.save();
        createdRequests.push(newRequest);
    }

    // Send Email Notification to Partner
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';

    // Fetch all pending requests assigned to this partner (across all employees)
    const pendingRequests = await AttendanceRequest.find({ partnerName: partnerName, status: 'Pending' }).sort({ createdAt: 1 });

    // Desktop table rows - group by user and request type
    const userTypeGroups: { [key: string]: any[] } = pendingRequests.reduce((acc: { [key: string]: any[] }, req: any) => {
      const key = `${req.userName}-${req.requestedStatus}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(req);
      return acc;
    }, {});

    let rowIndex = 0;
    const rowsHtml = Object.entries(userTypeGroups).map(([key, requests]) => {
      const userName = requests[0].userName;
      const requestedStatus = requests[0].requestedStatus;

      // Sort dates and group into ranges
      const dates = requests.map((r: any) => r.date).sort();
      const ranges: string[] = [];
      let start = dates[0];
      let prev = dates[0];
      for (let i = 1; i < dates.length; i++) {
        const current = dates[i];
        const prevDate = new Date(prev);
        const currDate = new Date(current);
        const diff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diff > 1) {
          // Gap, end previous range
          if (start === prev) {
            ranges.push(start);
          } else {
            ranges.push(`${start} to ${prev}`);
          }
          start = current;
        }
        prev = current;
      }
      if (start === prev) {
        ranges.push(start);
      } else {
        ranges.push(`${start} to ${prev}`);
      }
      const datesDisplay = ranges.join(', ');

      const firstReq = requests[0];
      const timeRange = firstReq.startTime && firstReq.endTime ? `${firstReq.startTime} - ${firstReq.endTime}` : '-';
      const reasonText = firstReq.reason || '-';

      rowIndex++;
      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 8px; text-align: center; font-size: 14px; color: #6b7280;">${rowIndex}</td>
          <td style="padding: 12px 8px; font-size: 14px; color: #111827; font-weight: 500; white-space: nowrap;">${userName}</td>
          <td style="padding: 12px 8px; font-size: 14px; color: #374151;">${datesDisplay}</td>
          <td style="padding: 12px 8px; font-size: 14px; color: #374151;">
            <span style="display: inline-block; padding: 4px 8px; background-color: #dbeafe; color: #1e40af; border-radius: 4px; font-size: 13px;">${requestedStatus}</span>
          </td>
          <td style="padding: 12px 8px; font-size: 14px; color: #374151; white-space: nowrap;">${timeRange}</td>
          <td style="padding: 12px 8px; font-size: 14px; color: #374151; max-width: 200px; word-wrap: break-word;">${reasonText}</td>
        </tr>
      `;
    }).join('');

    // Mobile card view - group by user and request type
    const mobileUserTypeGroups: { [key: string]: any[] } = pendingRequests.reduce((acc: { [key: string]: any[] }, req: any) => {
      const key = `${req.userName}-${req.requestedStatus}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(req);
      return acc;
    }, {});

    const mobileCardsHtml = Object.entries(mobileUserTypeGroups).map(([key, requests]) => {
      const userName = requests[0].userName;
      const requestedStatus = requests[0].requestedStatus;

      // Sort dates and group into ranges
      const dates = requests.map((r: any) => r.date).sort();
      const ranges: string[] = [];
      let start = dates[0];
      let prev = dates[0];
      for (let i = 1; i < dates.length; i++) {
        const current = dates[i];
        const prevDate = new Date(prev);
        const currDate = new Date(current);
        const diff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diff > 1) {
          // Gap, end previous range
          if (start === prev) {
            ranges.push(start);
          } else {
            ranges.push(`${start} to ${prev}`);
          }
          start = current;
        }
        prev = current;
      }
      if (start === prev) {
        ranges.push(start);
      } else {
        ranges.push(`${start} to ${prev}`);
      }
      const datesDisplay = ranges.join(', ');

      const firstReq = requests[0];
      const timeRange = firstReq.startTime && firstReq.endTime ? `${firstReq.startTime} - ${firstReq.endTime}` : '-';
      const reasonText = firstReq.reason || '-';

      return `
        <div style="background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f3f4f6;">
            <div>
              <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Request</div>
              <div style="font-size: 14px; color: #111827; font-weight: 600; margin-top: 2px;">${userName}</div>
            </div>
            <span style="display: inline-block; padding: 4px 10px; background-color: #dbeafe; color: #1e40af; border-radius: 4px; font-size: 12px; font-weight: 500;">${requestedStatus}</span>
          </div>
          <div style="margin-bottom: 8px;">
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Dates</div>
            <div style="font-size: 14px; color: #1f2937; font-weight: 500;">${datesDisplay}</div>
          </div>
          <div style="margin-bottom: 8px;">
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Time Range</div>
            <div style="font-size: 14px; color: #1f2937;">${timeRange}</div>
          </div>
          <div style="margin-bottom: 16px;">
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Reason</div>
            <div style="font-size: 14px; color: #1f2937; line-height: 1.5;">${reasonText}</div>
          </div>
        </div>
      `;
    }).join('');

    // Generate Bulk Approve Link
    const newRequestIds = createdRequests.map(r => r._id).join(',');

    try {
        await transporter.sendMail({
            ...mailOptions,
            to: partnerEmail, 
            subject: `Future Leave Requests: ${user.name}`,
            html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Future Leave Request</title>
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
        <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">Future Leave Requests</h1>
      </div>

      <!-- Review All Button -->
      <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-bottom: 1px solid #e5e7eb;">
        <a href="${baseUrl}/partner/review-all?partnerName=${encodeURIComponent(partnerName)}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">Review All Pending Requests</a>
      </div>

      <!-- Content -->
      <div class="content-wrapper" style="padding: 24px;">
        
        <!-- Info Box -->
        <div class="info-box" style="background-color: #f9fafb; border-left: 4px solid #667eea; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
          <p style="margin: 0; font-size: 15px; color: #374151; line-height:1.5;">
            <strong style="color: #1f2937;">New requests submitted by:</strong> ${user.name}<br/>
            <span style="font-size: 13px; color:#6b7280;">Dates: ${startDate} to ${endDate}</span>
          </p>
        </div>

        <!-- Description -->
        <p style="margin: 0 0 20px 0; font-size: 15px; color: #4b5563; line-height: 1.6;">
          The following pending requests (including new ones) are waiting for your action.
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
            <strong>📌 Note:</strong> Click "Review" for each request to approve or reject.
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
            `,
        });
    } catch (emailError) {
        console.error('Failed to send email:', emailError);
        // Don't fail the request just because email failed? 
        // If partner doesn't get email, they might not review it.
        // But preventing data creation might be annoying.
        // Let's keep it as warning.
    }

    return NextResponse.json({ success: true, count: createdRequests.length, sentTo: partnerEmail });

  } catch (error) {
    console.error('Future request error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
