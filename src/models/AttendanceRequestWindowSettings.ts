import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import type { RequestWindowScope } from '@/lib/attendanceRequestWindow';

export interface IAttendanceRequestWindowSettings extends Document {
  scope: RequestWindowScope;
  /** Set when scope === 'team' (Work Partner name). */
  partnerName?: string;
  /** Set when scope === 'employee'. */
  userId?: Types.ObjectId;
  previousMonthCutoffDay?: number;
  currentMonthPastDays?: number;
  futureMonthsAhead?: number;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceRequestWindowSettingsSchema = new Schema(
  {
    scope: {
      type: String,
      enum: ['global', 'team', 'employee'],
      required: true,
    },
    partnerName: { type: String, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    previousMonthCutoffDay: { type: Number, min: 1, max: 31 },
    currentMonthPastDays: { type: Number, min: 0 },
    futureMonthsAhead: { type: Number, min: 0 },
    updatedBy: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

AttendanceRequestWindowSettingsSchema.index(
  { scope: 1, partnerName: 1 },
  {
    unique: true,
    partialFilterExpression: { scope: 'team', partnerName: { $type: 'string' } },
  }
);

AttendanceRequestWindowSettingsSchema.index(
  { scope: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { scope: 'employee' },
  }
);

AttendanceRequestWindowSettingsSchema.index(
  { scope: 1 },
  {
    unique: true,
    partialFilterExpression: { scope: 'global' },
  }
);

const AttendanceRequestWindowSettings: Model<IAttendanceRequestWindowSettings> =
  mongoose.models.AttendanceRequestWindowSettings ||
  mongoose.model<IAttendanceRequestWindowSettings>(
    'AttendanceRequestWindowSettings',
    AttendanceRequestWindowSettingsSchema
  );

export default AttendanceRequestWindowSettings;
