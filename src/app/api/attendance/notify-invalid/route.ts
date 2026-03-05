import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';

interface InvalidRecord {
  date: string;
  checkin: string;
  checkout: string;
  issue: 'missing-checkin' | 'missing-checkout';
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { employeeIds, monthYear } = await request.json();

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'employeeIds array is required'
      }, { status: 400 });
    }

    if (!monthYear) {
      return NextResponse.json({
        success: false,
        error: 'monthYear is required'
      }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';
    let sentCount = 0;
    const errors: string[] = [];

    for (const employeeId of employeeIds) {
      try {
        const user = await User.findById(employeeId);
        if (!user) {
          errors.push(`User ${employeeId} not found`);
          continue;
        }

        if (!user.email) {
          errors.push(`User ${user.name} has no email`);
          continue;
        }

        // Get attendance for this employee
        const attendance = await Attendance.findOne({ userId: employeeId, monthYear });
        if (!attendance) {
          errors.push(`No attendance record for ${user.name}`);
          continue;
        }

        // Find invalid records
        const invalidRecords: InvalidRecord[] = [];
        let records: Record<string, any> = {};
        
        if (attendance.records instanceof Map) {
          for (const [k, v] of attendance.records.entries()) {
            records[k] = v;
          }
        } else if (attendance.records) {
          records = attendance.records as Record<string, any>;
        }

        for (const [date, record] of Object.entries(records)) {
          if (!record) continue;

          // Use editedCheckin/editedCheckout if available, otherwise fall back to original values
          const checkin = record.editedCheckin || record.checkin || '';
          const checkout = record.editedCheckout || record.checkout || '';
          const typeOfPresence = record.typeOfPresence || '';

          // Skip holidays and leave
          if (typeOfPresence === 'Holiday' || typeOfPresence === 'On leave' || typeOfPresence === 'Leave') {
            continue;
          }

          // Skip Sundays
          const recordDate = new Date(date);
          if (recordDate.getDay() === 0) continue;

          const isCheckinInvalid = !checkin || checkin === '00:00' || checkin === '';
          const isCheckoutInvalid = !checkout || checkout === '00:00' || checkout === '';

          if (!isCheckinInvalid && !isCheckoutInvalid) continue;

          // Both times missing means absent, not invalid - skip
          if (isCheckinInvalid && isCheckoutInvalid) continue;

          let issue: InvalidRecord['issue'];
          if (isCheckinInvalid) {
            issue = 'missing-checkin';
          } else {
            issue = 'missing-checkout';
          }

          invalidRecords.push({ date, checkin, checkout, issue });
        }

        if (invalidRecords.length === 0) {
          continue; // No invalid records for this employee
        }

        // Sort by date
        invalidRecords.sort((a, b) => a.date.localeCompare(b.date));

        // Generate fix link
        const fixLink = `${baseUrl}/employee/fix-attendance?userId=${employeeId}&monthYear=${monthYear}`;

        // Build email content
        const getIssueLabel = (issue: InvalidRecord['issue']) => {
          switch (issue) {
            case 'missing-checkin': return 'Missing Check-in';
            case 'missing-checkout': return 'Missing Check-out';
          }
        };

        const getIssueColor = (issue: InvalidRecord['issue']) => {
          switch (issue) {
            case 'missing-checkin': return '#f59e0b';
            case 'missing-checkout': return '#f97316';
          }
        };

        const formatDate = (dateStr: string) => {
          const date = new Date(dateStr);
          return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        };

        // Desktop table rows
        const tableRows = invalidRecords.map((rec, index) => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 8px; text-align: center; font-size: 14px; color: #6b7280;">${index + 1}</td>
            <td style="padding: 12px 8px; font-size: 14px; color: #111827; font-weight: 500; white-space: nowrap;">${formatDate(rec.date)}</td>
            <td style="padding: 12px 8px; font-size: 14px; color: ${rec.issue === 'missing-checkin' ? '#ef4444' : '#10b981'};">${rec.checkin || '—'}</td>
            <td style="padding: 12px 8px; font-size: 14px; color: ${rec.issue === 'missing-checkout' ? '#ef4444' : '#10b981'};">${rec.checkout || '—'}</td>
            <td style="padding: 12px 8px;">
              <span style="display: inline-block; padding: 4px 8px; background-color: ${getIssueColor(rec.issue)}20; color: ${getIssueColor(rec.issue)}; border-radius: 4px; font-size: 12px;">${getIssueLabel(rec.issue)}</span>
            </td>
          </tr>
        `).join('');

        // Mobile cards
        const mobileCards = invalidRecords.map((rec, index) => `
          <div style="background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-size: 14px; color: #111827; font-weight: 600;">${formatDate(rec.date)}</div>
              <span style="display: inline-block; padding: 4px 10px; background-color: ${getIssueColor(rec.issue)}20; color: ${getIssueColor(rec.issue)}; border-radius: 4px; font-size: 12px; font-weight: 500;">${getIssueLabel(rec.issue)}</span>
            </div>
            <div style="display: flex; gap: 16px;">
              <div>
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Check-in</div>
                <div style="font-size: 14px; color: ${rec.issue === 'missing-checkin' ? '#ef4444' : '#10b981'}; font-weight: 500;">${rec.checkin || '—'}</div>
              </div>
              <div>
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Check-out</div>
                <div style="font-size: 14px; color: ${rec.issue === 'missing-checkout' ? '#ef4444' : '#10b981'}; font-weight: 500;">${rec.checkout || '—'}</div>
              </div>
            </div>
          </div>
        `).join('');

        const [year, month] = monthYear.split('-');
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        await transporter.sendMail({
          ...mailOptions,
          to: user.email,
          subject: `Action Required: Fix Your Attendance Records - ${monthName}`,
          html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Fix Attendance Records</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; padding: 12px !important; }
      .desktop-table { display: none !important; }
      .mobile-cards { display: block !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <div class="email-container" style="max-width: 600px; margin: 20px auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">Attendance Correction Required</h1>
      </div>
      
      <!-- Content -->
      <div style="padding: 24px;">
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151;">
          Dear <strong>${user.name}</strong>,
        </p>
        <p style="margin: 0 0 24px 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
          We noticed that your attendance records for <strong>${monthName}</strong> have some missing check-in or check-out times. 
          Please review and correct the following records at your earliest convenience.
        </p>

        <!-- Summary Box -->
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 14px; color: #92400e;">
            <strong>${invalidRecords.length}</strong> record${invalidRecords.length > 1 ? 's' : ''} need${invalidRecords.length === 1 ? 's' : ''} your attention
          </div>
        </div>

        <!-- Desktop Table -->
        <div class="desktop-table" style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <thead>
              <tr style="background-color: #f9fafb;">
                <th style="padding: 12px 8px; text-align: center; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">#</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Date</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Check-in</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Check-out</th>
                <th style="padding: 12px 8px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Issue</th>
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

        <!-- CTA Button -->
        <div style="text-align: center; margin-top: 32px;">
          <a href="${fixLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
            Fix My Attendance
          </a>
        </div>

        <p style="margin: 24px 0 0 0; font-size: 12px; color: #9ca3af; text-align: center; line-height: 1.5;">
          When you submit corrections, they will be sent to your work partner for approval.
          Once approved, your attendance records will be updated automatically.
        </p>
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

        sentCount++;
      } catch (emailError) {
        console.error(`Error sending email to ${employeeId}:`, emailError);
        errors.push(`Failed to send email for employee ${employeeId}`);
      }
    }

    return NextResponse.json({
      success: true,
      sentCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error sending notifications:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to send notifications'
    }, { status: 500 });
  }
}
