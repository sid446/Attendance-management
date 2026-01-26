import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IHoliday extends Document {
  date: string;          // Format: "YYYY-MM-DD" e.g., "2026-01-26"
  name: string;          // Holiday name e.g., "Republic Day"
  type: 'national' | 'regional' | 'company' | 'optional';  // Holiday type
  description?: string;  // Optional description
  year: number;          // Year for the holiday
  isActive: boolean;     // Whether this holiday is active
  createdAt: Date;
  updatedAt: Date;
}

const HolidaySchema: Schema = new Schema(
  {
    date: {
      type: String,
      required: [true, 'Please provide holiday date'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in format YYYY-MM-DD'],
    },
    name: {
      type: String,
      required: [true, 'Please provide holiday name'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['national', 'regional', 'company', 'optional'],
      default: 'national',
    },
    description: {
      type: String,
      default: '',
    },
    year: {
      type: Number,
      required: [true, 'Please provide year'],
      min: 2020,
      max: 2030,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one holiday per date
HolidaySchema.index({ date: 1 }, { unique: true });

// Index for efficient queries by year
HolidaySchema.index({ year: 1, isActive: 1 });

const Holiday: Model<IHoliday> =
  mongoose.models.Holiday || mongoose.model<IHoliday>('Holiday', HolidaySchema);

export default Holiday;