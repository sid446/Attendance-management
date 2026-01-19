import mongoose, { Schema, Document, Model, Types } from 'mongoose';

// Daily record interface
export interface IDailyRecord {
  checkin: string;        // Format: "HH:mm" e.g., "10:45"
  checkout: string;       // Format: "HH:mm" e.g., "18:30"
  totalHour: number;      // Total hours worked
  excessHour: number;     // Extra hours beyond standard
  typeOfPresence: 'ThumbMachine' | 'Manual' | 'Remote' | 'Leave' | 'Holiday' | 'Absent' | 'Present - in office' | 'Present - client place' | 'Present - outstation' | 'Present - weekoff' | 'Half Day - weekdays' | 'Half Day - weekoff' | 'WFH - weekdays' | 'WFH - weekoff' | 'Weekoff - special allowance' | 'OHD' | 'Official Holiday Duty (OHD)' | 'Weekly Off - Present (WO-Present)' | 'Half Day (HD)' | 'Work From Home (WFH)' | 'Weekly Off - Work From Home (WO-WFH)' | 'Onsite Presence (OS-P)' | 'Week Off';
  halfDay: boolean;
  value: number;          // Attendance value: 1 for present, 0 for absent, 0.75 for half day
  remarks?: string;
}

// Monthly summary interface
export interface ISummary {
  totalHour: number;
  totalLateArrival: number;
  excessHour: number;
  totalHalfDay: number;
  totalPresent: number;
  totalAbsent: number;
  totalLeave: number;
}

export interface IAttendance extends Document {
  userId: Types.ObjectId;
  monthYear: string;      // Format: "YYYY-MM" e.g., "2026-01"
  records: Map<string, IDailyRecord>;  // Key format: "YYYY-MM-DD" e.g., "2026-01-10"
  summary: ISummary;
  createdAt: Date;
  updatedAt: Date;
}

const DailyRecordSchema: Schema = new Schema(
  {
    checkin: {
      type: String,
      default: '',
    },
    checkout: {
      type: String,
      default: '',
    },
    totalHour: {
      type: Number,
      default: 0,
    },
    excessHour: {
      type: Number,
      default: 0,
    },
    typeOfPresence: {
      type: String,
      enum: [
        'ThumbMachine',
        'Manual',
        'Remote',
        'Leave',
        'Holiday',
        'Absent',
        'Present - in office',
        'Present - client place',
        'Present - outstation',
        'Present - weekoff',
        'Half Day - weekdays',
        'Half Day - weekoff',
        'WFH - weekdays',
        'WFH - weekoff',
        'Weekoff - special allowance',
        'OHD',
        'Official Holiday Duty (OHD)',
        'Weekly Off - Present (WO-Present)',
        'Half Day (HD)',
        'Work From Home (WFH)',
        'Weekly Off - Work From Home (WO-WFH)',
        'Onsite Presence (OS-P)',
        'Week Off'
      ],
      default: 'ThumbMachine',
    },
    halfDay: {
      type: Boolean,
      default: false,
    },
    value: {
      type: Number,
      default: 0,
      min: 0,
      max: 1.2,
    },
    remarks: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const SummarySchema: Schema = new Schema(
  {
    totalHour: {
      type: Number,
      default: 0,
    },
    totalLateArrival: {
      type: Number,
      default: 0,
    },
    excessHour: {
      type: Number,
      default: 0,
    },
    totalHalfDay: {
      type: Number,
      default: 0,
    },
    totalPresent: {
      type: Number,
      default: 0,
    },
    totalAbsent: {
      type: Number,
      default: 0,
    },
    totalLeave: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const AttendanceSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Please provide user ID'],
    },
    monthYear: {
      type: String,
      required: [true, 'Please provide month and year'],
      match: [/^\d{4}-\d{2}$/, 'Month-Year must be in format YYYY-MM'],
    },
    records: {
      type: Map,
      of: DailyRecordSchema,
      default: new Map(),
    },
    summary: {
      type: SummarySchema,
      default: () => ({
        totalHour: 0,
        totalLateArrival: 0,
        excessHour: 0,
        totalHalfDay: 0,
        totalPresent: 0,
        totalAbsent: 0,
        totalLeave: 0,
      }),
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one attendance record per user per month
AttendanceSchema.index({ userId: 1, monthYear: 1 }, { unique: true });

const Attendance: Model<IAttendance> =
  mongoose.models.Attendance || mongoose.model<IAttendance>('Attendance', AttendanceSchema);

export default Attendance;
