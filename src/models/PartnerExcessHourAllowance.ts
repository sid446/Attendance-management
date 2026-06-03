import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IPartnerExcessHourAllowance extends Document {
  userId: Types.ObjectId;
  monthYear: string;
  allowedExcessHours: number;
  setByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PartnerExcessHourAllowanceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    monthYear: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    allowedExcessHours: { type: Number, required: true, min: 0 },
    setByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

PartnerExcessHourAllowanceSchema.index({ userId: 1, monthYear: 1 }, { unique: true });

const PartnerExcessHourAllowance: Model<IPartnerExcessHourAllowance> =
  mongoose.models.PartnerExcessHourAllowance ||
  mongoose.model<IPartnerExcessHourAllowance>(
    'PartnerExcessHourAllowance',
    PartnerExcessHourAllowanceSchema
  );

export default PartnerExcessHourAllowance;
