import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/** Short-lived employee portal login OTP (survives serverless / multi-worker). */
export interface IEmployeeOtpPending extends Document {
  sessionId: string;
  otp: string;
  email: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeOtpPendingSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    otp: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

EmployeeOtpPendingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmployeeOtpPending: Model<IEmployeeOtpPending> =
  mongoose.models.EmployeeOtpPending ||
  mongoose.model<IEmployeeOtpPending>('EmployeeOtpPending', EmployeeOtpPendingSchema);

export default EmployeeOtpPending;
