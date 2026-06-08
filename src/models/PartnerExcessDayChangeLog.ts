import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IPartnerExcessDayChangeLog extends Document {
  userId: Types.ObjectId;
  monthYear: string;
  date: string;
  /** null = default (full excess counts) before change */
  oldAllowedExcessHours: number | null;
  /** null = reset to default */
  newAllowedExcessHours: number | null;
  changedByUserId: Types.ObjectId;
  changedByEmail: string;
  typeOfPresence?: string;
  missedEntry?: boolean;
  changedAt: Date;
}

const PartnerExcessDayChangeLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    monthYear: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    oldAllowedExcessHours: { type: Number, default: null },
    newAllowedExcessHours: { type: Number, default: null },
    changedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedByEmail: { type: String, required: true, trim: true },
    typeOfPresence: { type: String, default: '' },
    missedEntry: { type: Boolean, default: false },
    changedAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: false }
);

PartnerExcessDayChangeLogSchema.index({ userId: 1, monthYear: 1, changedAt: -1 });
PartnerExcessDayChangeLogSchema.index({ userId: 1, date: 1, changedAt: -1 });

const PartnerExcessDayChangeLog: Model<IPartnerExcessDayChangeLog> =
  mongoose.models.PartnerExcessDayChangeLog ||
  mongoose.model<IPartnerExcessDayChangeLog>(
    'PartnerExcessDayChangeLog',
    PartnerExcessDayChangeLogSchema
  );

export default PartnerExcessDayChangeLog;
