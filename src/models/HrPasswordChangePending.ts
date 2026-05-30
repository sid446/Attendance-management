import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IHrPasswordChangePending extends Document {
  sessionId: string;
  otp: string;
  requestedBy: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HrPasswordChangePendingSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    otp: { type: String, required: true },
    requestedBy: { type: String, required: true, lowercase: true, trim: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

HrPasswordChangePendingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const HrPasswordChangePending: Model<IHrPasswordChangePending> =
  mongoose.models.HrPasswordChangePending ||
  mongoose.model<IHrPasswordChangePending>('HrPasswordChangePending', HrPasswordChangePendingSchema);

export default HrPasswordChangePending;
