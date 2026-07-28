import mongoose, { Schema, Document, Model } from 'mongoose';
import type { WeekdayHoursMode } from '@/lib/articleCredit';

export interface IArticleCreditSettings extends Document {
  /** Always 'global' - single settings document. */
  scope: 'global';
  cutoffMonth?: string;
  defaultWeekdayHours?: number;
  weekdayHoursMode?: WeekdayHoursMode;
  floorFinalCreditAtZero?: boolean;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ArticleCreditSettingsSchema = new Schema(
  {
    scope: {
      type: String,
      enum: ['global'],
      required: true,
    },
    cutoffMonth: { type: String, trim: true },
    defaultWeekdayHours: { type: Number, min: 0 },
    weekdayHoursMode: { type: String, enum: ['schedule', 'fixed'] },
    floorFinalCreditAtZero: { type: Boolean },
    updatedBy: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

ArticleCreditSettingsSchema.index(
  { scope: 1 },
  {
    unique: true,
    partialFilterExpression: { scope: 'global' },
  }
);

const ArticleCreditSettings: Model<IArticleCreditSettings> =
  mongoose.models.ArticleCreditSettings ||
  mongoose.model<IArticleCreditSettings>('ArticleCreditSettings', ArticleCreditSettingsSchema);

export default ArticleCreditSettings;
