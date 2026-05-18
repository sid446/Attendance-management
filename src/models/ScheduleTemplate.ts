import mongoose, { Schema, Document, Model } from 'mongoose';
import type { DailySchedule } from '@/types/ui';

export interface IScheduleTemplate extends Document {
  name: string;
  daily: DailySchedule;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduleTimeSchema = new Schema(
  {
    inTime: { type: String, default: '' },
    outTime: { type: String, default: '' },
    isHoliday: { type: Boolean, default: false },
    isHalfDay: { type: Boolean, default: false },
  },
  { _id: false }
);

const DailyScheduleSchema = new Schema(
  {
    monday: ScheduleTimeSchema,
    tuesday: ScheduleTimeSchema,
    wednesday: ScheduleTimeSchema,
    thursday: ScheduleTimeSchema,
    friday: ScheduleTimeSchema,
    saturday: ScheduleTimeSchema,
    sunday: ScheduleTimeSchema,
  },
  { _id: false }
);

const ScheduleTemplateSchema = new Schema<IScheduleTemplate>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    daily: { type: DailyScheduleSchema, required: true },
  },
  {
    timestamps: true,
    collection: 'schedule_templates',
  }
);

const ScheduleTemplate =
  (mongoose.models.ScheduleTemplate as Model<IScheduleTemplate>) ||
  mongoose.model<IScheduleTemplate>('ScheduleTemplate', ScheduleTemplateSchema);

export default ScheduleTemplate;
