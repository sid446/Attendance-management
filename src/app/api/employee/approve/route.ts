import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { transporter, mailOptions } from '@/lib/mailer';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { requestId, action, remarks, value, approvedBy } = await request.json();

    if (!requestId || !action || !approvedBy) {
      return NextResponse.json({
        success: false,
        error: 'Request ID, action, and approver are required'
      }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({
        success: false,
        error: 'Action must be either "approve" or "reject"'
      }, { status: 400 });
    }

    // Find the request
    const attendanceRequest = await AttendanceRequest.findById(requestId);
    if (!attendanceRequest) {
      return NextResponse.json({
        success: false,
        error: 'Request not found'
      }, { status: 404 });
    }

    // Update the request
    const updateData: any = {
      status: action === 'approve' ? 'Approved' : 'Rejected',
      updatedAt: new Date()
    };

    if (action === 'approve') {
      updateData.approvedBy = approvedBy;
      updateData.approvedAt = new Date();
      if (approvedBy === 'HR') {
        if (remarks) updateData.hrRemarks = remarks;
        if (value) updateData.hrValue = value;
      } else {
        if (remarks) updateData.partnerRemarks = remarks;
      }
    } else {
      updateData.rejectedBy = approvedBy;
      updateData.rejectedAt = new Date();
      if (approvedBy === 'HR') {
        if (remarks) updateData.hrRemarks = remarks;
      } else {
        if (remarks) updateData.partnerRemarks = remarks;
      }
    }

    await AttendanceRequest.findByIdAndUpdate(requestId, updateData);

    // If approved, update the actual attendance record
    if (action === 'approve') {
      // Find the attendance record for this month
      const attendanceRecord = await Attendance.findOne({
        userId: attendanceRequest.userId,
        monthYear: attendanceRequest.monthYear
      });

      if (attendanceRecord) {
        // Get existing record for the date or create new
        const existingRecord = attendanceRecord.records.get(attendanceRequest.date) || {};

        // Update the attendance record with the requested status
        const updateFields: any = {
          ...existingRecord,
          typeOfPresence: attendanceRequest.requestedStatus,
          updatedAt: new Date()
        };

        // Update times if provided
        if (attendanceRequest.startTime) {
          updateFields.checkin = attendanceRequest.startTime;
        }
        if (attendanceRequest.endTime) {
          updateFields.checkout = attendanceRequest.endTime;
        }

        // Calculate total hours if both times are provided
        if (attendanceRequest.startTime && attendanceRequest.endTime) {
          const start = new Date(`2000-01-01T${attendanceRequest.startTime}`);
          const end = new Date(`2000-01-01T${attendanceRequest.endTime}`);
          const diffMs = end.getTime() - start.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          updateFields.totalHour = Math.max(0, diffHours);
        }

        // Set value and halfDay based on approver
        if (approvedBy === 'HR' && value) {
          updateFields.value = parseFloat(value);
          updateFields.halfDay = parseFloat(value) > 0 && parseFloat(value) < 1;
        } else if (approvedBy !== 'HR') {
          // For partner approval, default to 1
          updateFields.value = 1;
          updateFields.halfDay = false;
        }

        // Update the records map
        attendanceRecord.records.set(attendanceRequest.date, updateFields);
        await attendanceRecord.save();
      }
    }

    // Send email notification
    try {
      const user = await User.findById(attendanceRequest.userId);
      if (user && user.email) {
        const subject = `Attendance Request ${action === 'approve' ? 'Approved' : 'Rejected'}`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${action === 'approve' ? '#10b981' : '#ef4444'};">${subject}</h2>
            <p>Dear ${attendanceRequest.userName},</p>
            <p>Your attendance correction request has been <strong>${action === 'approve' ? 'approved' : 'rejected'}</strong>.</p>

            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Date:</strong> ${new Date(attendanceRequest.date).toLocaleDateString()}</p>
              <p><strong>Requested Status:</strong> ${attendanceRequest.requestedStatus}</p>
              <p><strong>Reason:</strong> ${attendanceRequest.reason || 'N/A'}</p>
              ${remarks ? `<p><strong>Remarks:</strong> ${remarks}</p>` : ''}
              <p><strong>Approved/Rejected by:</strong> ${approvedBy}</p>
              <p><strong>Action taken on:</strong> ${new Date().toLocaleString()}</p>
            </div>

            <p>If you have any questions, please contact your supervisor or HR department.</p>
            <p>Best regards,<br>Attendance Management System</p>
          </div>
        `;

        await transporter.sendMail({
          ...mailOptions,
          to: user.email,
          subject,
          html
        });
      }
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      success: true,
      message: `Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`
    });

  } catch (error) {
    console.error('Approve/Reject Request Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process request'
    }, { status: 500 });
  }
}