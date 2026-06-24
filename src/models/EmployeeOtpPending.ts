import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type EmployeeOtpPurpose = 'setup' | 'reset';

/** Short-lived employee portal OTP for password setup or reset. */
export interface IEmployeeOtpPending extends Document {
  sessionId: string;
  otp: string;
  email: string;
  userId: Types.ObjectId;
  purpose: EmployeeOtpPurpose;
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
    purpose: { type: String, enum: ['setup', 'reset'], required: true, default: 'setup' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

EmployeeOtpPendingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmployeeOtpPending: Model<IEmployeeOtpPending> =
  mongoose.models.EmployeeOtpPending ||
  mongoose.model<IEmployeeOtpPending>('EmployeeOtpPending', EmployeeOtpPendingSchema);

export default EmployeeOtpPending;
