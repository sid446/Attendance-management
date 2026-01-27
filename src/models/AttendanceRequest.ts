import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAttendanceRequest extends Document {
  userId: mongoose.Types.ObjectId;
  userName: string;
  partnerName: string;
  date: string; // YYYY-MM-DD
  monthYear: string; // YYYY-MM
  requestedStatus: string;
  originalStatus: string;
  reason?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  startTime?: string;
  endTime?: string;
  partnerRemarks?: string;
  hrRemarks?: string; // HR remarks when approved by HR
  hrValue?: string; // HR value when approved by HR
  approvedBy?: string; // 'HR' or partner name
  approvedAt?: Date;
  rejectedBy?: string; // 'HR' or partner name
  rejectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceRequestSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    partnerName: { type: String, required: true },
    date: { type: String, required: true },
    monthYear: { type: String, required: true },
    requestedStatus: { type: String, required: true },
    originalStatus: { type: String, required: true },
    reason: { type: String },
    status: { 
        type: String, 
        enum: ['Pending', 'Approved', 'Rejected'], 
        default: 'Pending' 
    },
    startTime: { type: String },
    endTime: { type: String },
    partnerRemarks: { type: String },
    hrRemarks: { type: String },
    hrValue: { type: String },
    approvedBy: { type: String },
    approvedAt: { type: Date },
    rejectedBy: { type: String },
    rejectedAt: { type: Date }
  },
  {
    timestamps: true,
  }
);

const AttendanceRequest: Model<IAttendanceRequest> =
  mongoose.models.AttendanceRequest || mongoose.model<IAttendanceRequest>('AttendanceRequest', AttendanceRequestSchema);

export default AttendanceRequest;
