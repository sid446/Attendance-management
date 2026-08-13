import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type InvalidAttendanceNotificationKind = 'invalid-punch' | 'missing-month';

export interface IInvalidAttendanceNotification extends Document {
  userId: Types.ObjectId;
  monthYear: string;
  date: string;
  kind?: InvalidAttendanceNotificationKind;
  sentAt: Date;
}

const InvalidAttendanceNotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    monthYear: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    kind: {
      type: String,
      enum: ['invalid-punch', 'missing-month'],
      default: 'invalid-punch',
    },
    sentAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: false }
);

InvalidAttendanceNotificationSchema.index({ userId: 1, monthYear: 1, date: 1, sentAt: -1 });
InvalidAttendanceNotificationSchema.index({ monthYear: 1, sentAt: -1 });

const InvalidAttendanceNotification: Model<IInvalidAttendanceNotification> =
  mongoose.models.InvalidAttendanceNotification ||
  mongoose.model<IInvalidAttendanceNotification>(
    'InvalidAttendanceNotification',
    InvalidAttendanceNotificationSchema
  );

export default InvalidAttendanceNotification;
