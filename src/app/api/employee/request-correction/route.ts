import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';

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
    
    // 1. Try to find user by name (case-insensitive) - supporting "Rohit Singh" and "Rohit.Singh"
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

    // Create Request
    const reqRecord = await AttendanceRequest.create({
        userId: user._id,
        userName: user.name,
        partnerName: partnerName,
        date,
        monthYear,
        requestedStatus,
        reason,
        startTime,
        endTime,
        originalStatus: 'Absent', // Assuming they click on Absent/Late/Etc
        status: 'Pending'
    });

    // Approval/Reject Links
    // In dev: localhost:3000. In prod: domain.
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';
    
    const approveLink = `${baseUrl}/api/attendance/request-action?id=${reqRecord._id}&action=approve`;
    const rejectLink = `${baseUrl}/api/attendance/request-action?id=${reqRecord._id}&action=reject`;

    // Send Email
    await transporter.sendMail({
        ...mailOptions,
        to: partnerEmail,
        subject: `Attendance Correction Request: ${user.name}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0f172a;">Attendance Correction Request</h2>
                <p><strong>Employee:</strong> ${user.name}</p>
                 <p><strong>Date:</strong> ${date}</p>
                <p><strong>Requested Status:</strong> <span style="color: #2563eb; font-weight: bold;">${requestedStatus}</span></p>
                ${(startTime && endTime) ? `<p><strong>Time:</strong> ${startTime} - ${endTime}</p>` : ''}
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                
                <div style="margin-top: 24px;">
                    <a href="${approveLink}" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 12px;">Approve</a>
                    <a href="${rejectLink}" style="background-color: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reject</a>
                </div>
                
                <p style="margin-top: 30px; font-size: 12px; color: #64748b;">
                    If you approve, the attendance status will satisfy the requested change immediately.
                </p>
            </div>
        `
    });

    return NextResponse.json({ success: true, message: 'Request sent to partner', sentTo: partnerEmail });

  } catch (error) {
    console.error('Request Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to submit request' }, { status: 500 });
  }
}
