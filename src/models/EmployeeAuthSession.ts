import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/** Employee portal browser session length (cookie max-age matches DB expiresAt). */
export const EMPLOYEE_SESSION_DAYS = 30;

export function getEmployeeSessionCookieMaxAgeSeconds(): number {
  return EMPLOYEE_SESSION_DAYS * 24 * 60 * 60;
}

export function defaultEmployeeSessionExpiresAt(): Date {
  return new Date(Date.now() + EMPLOYEE_SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export interface IEmployeeAuthSession extends Document {
  token: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeAuthSessionSchema = new Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

EmployeeAuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmployeeAuthSession: Model<IEmployeeAuthSession> =
  mongoose.models.EmployeeAuthSession ||
  mongoose.model<IEmployeeAuthSession>('EmployeeAuthSession', EmployeeAuthSessionSchema);

export default EmployeeAuthSession;
