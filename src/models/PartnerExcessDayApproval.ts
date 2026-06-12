import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IPartnerExcessDayApproval extends Document {
  userId: Types.ObjectId;
  monthYear: string;
  date: string;
  allowedExcessHours: number;
  setByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PartnerExcessDayApprovalSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    monthYear: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    allowedExcessHours: { type: Number, required: true },
    setByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

PartnerExcessDayApprovalSchema.index({ userId: 1, date: 1 }, { unique: true });
PartnerExcessDayApprovalSchema.index({ userId: 1, monthYear: 1 });

const PartnerExcessDayApproval: Model<IPartnerExcessDayApproval> =
  mongoose.models.PartnerExcessDayApproval ||
  mongoose.model<IPartnerExcessDayApproval>(
    'PartnerExcessDayApproval',
    PartnerExcessDayApprovalSchema
  );

export default PartnerExcessDayApproval;
