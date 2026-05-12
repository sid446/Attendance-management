import mongoose, { Schema, Document, Model } from 'mongoose';

/** Short-lived HR password-step OTP (survives serverless / multi-worker; TTL cleans orphans). */
export interface IHrOtpPending extends Document {
  sessionId: string;
  otp: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HrOtpPendingSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    otp: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

HrOtpPendingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const HrOtpPending: Model<IHrOtpPending> =
  mongoose.models.HrOtpPending || mongoose.model<IHrOtpPending>('HrOtpPending', HrOtpPendingSchema);

export default HrOtpPending;
