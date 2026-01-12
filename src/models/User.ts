import mongoose, { Schema, Document, Model } from 'mongoose';

// Schedule time interface
export interface IScheduleTime {
  inTime: string;   // Format: "HH:mm" e.g., "09:00"
  outTime: string;  // Format: "HH:mm" e.g., "18:00"
}

export interface IUser extends Document {
  odId: string;
  name: string;
  email: string;
  designation?: string;
  team?: string;
  joiningDate: Date;
  scheduleInOutTime: IScheduleTime;      // Regular weekday schedule
  scheduleInOutTimeSat: IScheduleTime;   // Saturday schedule
  scheduleInOutTimeMonth: IScheduleTime; // Monthly/alternate schedule
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduleTimeSchema: Schema = new Schema(
  {
    inTime: {
      type: String,
      default: '09:00',
    },
    outTime: {
      type: String,
      default: '18:00',
    },
  },
  { _id: false }
);

const UserSchema: Schema = new Schema(
  {
    odId: {
      type: String,
      required: [true, 'Please provide user ID'],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Please provide name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide email'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    designation: {
      type: String,
      trim: true,
    },
    team: {
      type: String,
      trim: true,
    },
    joiningDate: {
      type: Date,
      required: [true, 'Please provide joining date'],
    },
    scheduleInOutTime: {
      type: ScheduleTimeSchema,
      default: () => ({ inTime: '09:00', outTime: '18:00' }),
    },
    scheduleInOutTimeSat: {
      type: ScheduleTimeSchema,
      default: () => ({ inTime: '09:00', outTime: '13:00' }),
    },
    scheduleInOutTimeMonth: {
      type: ScheduleTimeSchema,
      default: () => ({ inTime: '09:00', outTime: '18:00' }),
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

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
