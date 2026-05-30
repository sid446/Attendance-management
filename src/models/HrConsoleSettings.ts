import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IHrConsoleSettings extends Document {
  key: string;
  password: string;
  updatedBy?: string;
  updatedAt: Date;
}

const HrConsoleSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'hr-console' },
    password: { type: String, required: true },
    updatedBy: { type: String, lowercase: true, trim: true },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
  }
);

const HrConsoleSettings: Model<IHrConsoleSettings> =
  mongoose.models.HrConsoleSettings ||
  mongoose.model<IHrConsoleSettings>('HrConsoleSettings', HrConsoleSettingsSchema);

export default HrConsoleSettings;

export const HR_CONSOLE_SETTINGS_KEY = 'hr-console';
