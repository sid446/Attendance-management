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
  
  // Extended fields
  registrationNo?: string;
  employeeCode?: string;
  paidFrom?: string;
  category?: string;
  tallyName?: string;
  gender?: string;
  parentName?: string;
  parentOccupation?: string;
  mobileNumber?: string;
  alternateMobileNumber?: string;
  alternateEmail?: string;
  address1?: string;
  address2?: string;
  articleshipStartDate?: Date;
  transferCase?: string;
  firstYearArticleship?: string;
  secondYearArticleship?: string;
  thirdYearArticleship?: string;
  filledScholarship?: string;
  qualificationLevel?: string;
  nextAttemptDueDate?: Date;
  registeredUnderPartner?: string;
  workingUnderPartner?: string;
  workingTiming?: string;

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
     
      unique: true,
      trim: true,
    },
    name: {
      type: String,
     
      trim: true,
    },
    email: {
      type: String,
     
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
    registrationNo: {
      type: String,
      trim: true,
    },
    employeeCode: {
      type: String,
      trim: true,
    },
    paidFrom: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    tallyName: {
      type: String,
      trim: true,
    },
    gender: {
      type: String,
      trim: true,
    },
    parentName: {
      type: String,
      trim: true,
    },
    parentOccupation: {
      type: String,
      trim: true,
    },
    mobileNumber: {
      type: String,
      trim: true,
    },
    alternateMobileNumber: {
      type: String,
      trim: true,
    },
    alternateEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address1: {
      type: String,
      trim: true,
    },
    address2: {
      type: String,
      trim: true,
    },
    articleshipStartDate: {
      type: Date,
    },
    transferCase: {
      type: String,
      trim: true,
    },
    firstYearArticleship: {
      type: String,
      trim: true,
    },
    secondYearArticleship: {
      type: String,
      trim: true,
    },
    thirdYearArticleship: {
      type: String,
      trim: true,
    },
    filledScholarship: {
      type: String,
      trim: true,
    },
    qualificationLevel: {
      type: String,
      trim: true,
    },
    nextAttemptDueDate: {
      type: Date,
    },
    registeredUnderPartner: {
      type: String,
      trim: true,
    },
    workingUnderPartner: {
      type: String,
      trim: true,
    },
    workingTiming: {
      type: String,
      trim: true,
    },
    joiningDate: {
      type: Date,
      
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
