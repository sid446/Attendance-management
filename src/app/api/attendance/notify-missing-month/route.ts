import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import InvalidAttendanceNotification from '@/models/InvalidAttendanceNotification';
import { transporter, mailOptions } from '@/lib/mailer';
import {
  attendanceRecordsFromDoc,
  collectDatesWithAnyAttendance,
  findMissingAttendanceDates,
  isAttendanceMissingForMonth,
  localTodayYmd,
} from '@/lib/employeeMisExceptions';

function buildEmployeeAttendanceLink(baseUrl: string, monthYear: string): string {
  const destination = `/employee/dashboard?tab=attendance&monthYear=${encodeURIComponent(monthYear)}`;
  return `${baseUrl}/employee/login?next=${encodeURIComponent(destination)}`;
}

function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { employeeIds, monthYear } = await request.json();

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'employeeIds array is required' },
        { status: 400 }
      );
    }

    if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json(
        { success: false, error: 'monthYear is required (YYYY-MM)' },
        { status: 400 }
      );
    }

    const todayYmd = localTodayYmd();
    const attendanceDocs = await Attendance.find({ monthYear }).select('userId records').lean();
    const recordsByUserId = new Map<string, Record<string, unknown>>();
    const hasAttendanceDocByUserId = new Set<string>();
    for (const doc of attendanceDocs) {
      const uid = String(doc.userId);
      hasAttendanceDocByUserId.add(uid);
      recordsByUserId.set(uid, attendanceRecordsFromDoc(doc));
    }
    const datesWithAnyAttendance = collectDatesWithAnyAttendance(recordsByUserId.values());

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';
    let sentCount = 0;
    const errors: string[] = [];
    const [year, month] = monthYear.split('-');
    const monthName = new Date(parseInt(year, 10), parseInt(month, 10) - 1).toLocaleDateString(
      'en-US',
      { month: 'long', year: 'numeric' }
    );

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

        const records = recordsByUserId.get(String(employeeId)) || {};
        const wholeMonthMissing = isAttendanceMissingForMonth(
          hasAttendanceDocByUserId.has(String(employeeId)),
          records
        );
        const missingDates = findMissingAttendanceDates({
          user,
          records,
          datesWithAnyAttendance,
          monthYear,
          todayYmd,
          wholeMonthMissing,
        });

        if (missingDates.length === 0) continue;

        const fixLink = buildEmployeeAttendanceLink(baseUrl, monthYear);
        const dateRows = missingDates
          .map(
            (date, index) => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 8px; text-align: center; font-size: 14px; color: #6b7280;">${index + 1}</td>
            <td style="padding: 12px 8px; font-size: 14px; color: #111827; font-weight: 500;">${formatDateLabel(date)}</td>
            <td style="padding: 12px 8px; font-size: 14px; color: #b91c1c;">Not recorded</td>
          </tr>`
          )
          .join('');

        const intro = wholeMonthMissing
          ? `We do not have attendance recorded for you for <strong>${monthName}</strong>. The days below are already present for other employees.`
          : `Some of your attendance days for <strong>${monthName}</strong> are missing, even though other employees already have records for those dates.`;

        await transporter.sendMail({
          ...mailOptions,
          to: user.email,
          subject: `Action Required: Attendance not recorded - ${monthName}`,
          html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Attendance Not Recorded</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 20px auto; padding: 20px;">
    <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">Attendance Not Recorded</h1>
      </div>
      <div style="padding: 24px;">
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151;">
          Dear <strong>${user.name}</strong>,
        </p>
        <p style="margin: 0 0 24px 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
          ${intro}
          Please punch in using the attendance machine (or location punch where applicable), or contact HR if you believe this is a mistake.
        </p>
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 14px; color: #991b1b;">
            <strong>${missingDates.length}</strong> day${missingDates.length === 1 ? '' : 's'} not recorded
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f9fafb;">
              <th style="padding: 12px 8px; text-align: center; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">#</th>
              <th style="padding: 12px 8px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Date</th>
              <th style="padding: 12px 8px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase;">Issue</th>
            </tr>
          </thead>
          <tbody>
            ${dateRows}
          </tbody>
        </table>
        <div style="text-align: center; margin-top: 32px;">
          <a href="${fixLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
            View My Attendance
          </a>
        </div>
        <p style="margin: 24px 0 0 0; font-size: 12px; color: #9ca3af; text-align: center; line-height: 1.5;">
          If you already punched, your records may not have been uploaded yet. Please follow up with your work partner or HR.
        </p>
      </div>
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

        const sentAt = new Date();
        await InvalidAttendanceNotification.insertMany(
          missingDates.map((date) => ({
            userId: employeeId,
            monthYear,
            date,
            kind: 'missing-month',
            sentAt,
          }))
        );

        sentCount++;
      } catch (emailError) {
        console.error(`Error sending missing-month email to ${employeeId}:`, emailError);
        errors.push(`Failed to send email for employee ${employeeId}`);
      }
    }

    return NextResponse.json({
      success: true,
      sentCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error sending missing-month notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send notifications' },
      { status: 500 }
    );
  }
}
