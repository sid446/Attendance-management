import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IHrAllowedAdminEmail extends Document {
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

const HrAllowedAdminEmailSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

const HrAllowedAdminEmail: Model<IHrAllowedAdminEmail> =
  mongoose.models.HrAllowedAdminEmail ||
  mongoose.model<IHrAllowedAdminEmail>('HrAllowedAdminEmail', HrAllowedAdminEmailSchema);

export default HrAllowedAdminEmail;
