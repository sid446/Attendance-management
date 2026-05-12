import mongoose, { Schema, Document, Model } from 'mongoose';

/** HR browser session length (cookie max-age matches DB expiresAt). */
export const HR_SESSION_DAYS = 30;

export function getHrSessionCookieMaxAgeSeconds(): number {
  return HR_SESSION_DAYS * 24 * 60 * 60;
}

export function defaultHrSessionExpiresAt(): Date {
  return new Date(Date.now() + HR_SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export interface IHrAuthSession extends Document {
  token: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HrAuthSessionSchema = new Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

HrAuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const HrAuthSession: Model<IHrAuthSession> =
  mongoose.models.HrAuthSession || mongoose.model<IHrAuthSession>('HrAuthSession', HrAuthSessionSchema);

export default HrAuthSession;
