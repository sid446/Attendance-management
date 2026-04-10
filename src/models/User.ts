import mongoose, { Schema, Document, Model } from 'mongoose';

// Schedule time interface
export interface IScheduleTime {
  inTime: string;   // Format: "HH:mm" e.g., "09:00"
  outTime: string;  // Format: "HH:mm" e.g., "18:00"
  isHoliday?: boolean; // Whether this day is a holiday
  isHalfDay?: boolean; // Whether this day is a half day
}

// Daily schedule interface
export interface IDailySchedule {
  monday?: IScheduleTime;
  tuesday?: IScheduleTime;
  wednesday?: IScheduleTime;
  thursday?: IScheduleTime;
  friday?: IScheduleTime;
  saturday?: IScheduleTime;
  sunday?: IScheduleTime;
  [key: string]: IScheduleTime | undefined;
}

// Schedule entry with effective date
export interface IScheduleEntry {
  effectiveFrom: Date; // Date from which this schedule becomes effective
  daily: IDailySchedule; // Per-day schedules
}

export interface IEmploymentTypeHistory {
  employmentType: string;
  effectiveFrom: Date;
}

export interface IEffectiveValueHistory {
  value: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  source?: string;
}

export interface IUser extends Document {
  odId: string;
  name: string;
  email: string;
  attendanceEmail?: string; // New field for attendance-related emails
  designation?: string;
  team?: string;
  joiningDate: Date;
  
  // Extended fields
  registrationNo?: string;
  employeeCode?: string;
  paidFrom?: string;
  category?: string;
  employmentType?: string;
  employmentTypeHistory?: IEmploymentTypeHistory[];
  tallyName?: string;
  gender?: string;
  parentName?: string;
  parentOccupation?: string;
  mobileNumber?: string;
  alternateMobileNumber?: string;
  alternateEmail?: string;
  address1?: string;
  address2?: string;
  // New HR / personal & banking fields
  emergencyContactNo?: string;
  emergencyContactRelation?: string;
  anniversaryDate?: Date;
  bankName?: string;
  branchName?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountType?: string;
  accountHolderName?: string;
  aadhaarNumber?: string;
  panNumber?: string;
  basicSalary?: string; // Basis Salary/Stipend/Fees
  laptopAllowance?: string;
  otherAllowance?: string;
  bonus?: string;
  incentive?: string;
  totalSalaryPerMonth?: string;
  totalSalaryPerAnnum?: string;
  pf?: string; // Provident Fund
  esi?: string; // Employee State Insurance
  gratuity?: string;
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

  fieldHistories?: {
    registeredUnderPartner?: IEffectiveValueHistory[];
    workingUnderPartner?: IEffectiveValueHistory[];
    basicSalary?: IEffectiveValueHistory[];
    laptopAllowance?: IEffectiveValueHistory[];
    totalSalaryPerMonth?: IEffectiveValueHistory[];
    totalSalaryPerAnnum?: IEffectiveValueHistory[];
  };


  // Flexible additional info (e.g. PAN, Aadhaar, etc.)
  extraInfo?: {
    label: string;
    value: string;
  }[];

  // Credits for Articles (as on 1st Jan 26)
  articleCreditsAsOnJan26?: number;

  // Leave balance management
  leaveBalance?: {
    balanceAsOfJan26: number; // Opening balance as of 1st Jan 2026 (uploaded via Excel)
    earned: number; // Leave earned after 1st Jan 2026 (calculated from attendance uploads, only for non-articles)
    used: number; // Leaves taken before 1st Jan 2026 (from Excel upload)
    usedAfterJan26?: number; // Leaves taken on or after 1st Jan 2026 (calculated from attendance records)
    remaining: number; // Calculated dynamically
    lastUpdated: Date;
    monthlyEarned: number; // Monthly earning rate (default 2)
  };

  // Schedule entries with effective dates - NEW STRUCTURE
  schedules?: IScheduleEntry[]; // Array of schedule entries, ordered by effectiveFrom ascending

  // Legacy fields for backward compatibility
  scheduleInOutTime?: IScheduleTime;      // Regular weekday schedule
  scheduleInOutTimeSat?: IScheduleTime;   // Saturday schedule
  scheduleInOutTimeMonth?: IScheduleTime; // Monthly/alternate schedule

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
    isHoliday: {
      type: Boolean,
      default: false,
    },
    isHalfDay: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

// Daily schedule schema
const DailyScheduleSchema: Schema = new Schema(
  {
    monday: ScheduleTimeSchema,
    tuesday: ScheduleTimeSchema,
    wednesday: ScheduleTimeSchema,
    thursday: ScheduleTimeSchema,
    friday: ScheduleTimeSchema,
    saturday: {
      ...ScheduleTimeSchema.obj,
      isHalfDay: { type: Boolean, default: true }, // Saturday defaults to half day
    },
    sunday: {
      ...ScheduleTimeSchema.obj,
      isHoliday: { type: Boolean, default: true }, // Sunday defaults to holiday
    },
  },
  { _id: false }
);

// Schedule entry schema
const ScheduleEntrySchema: Schema = new Schema(
  {
    effectiveFrom: {
      type: Date,
      required: true,
    },
    daily: DailyScheduleSchema,
  },
  { _id: false }
);

const EffectiveValueHistorySchema: Schema = new Schema(
  {
    value: {
      type: String,
      default: '',
      trim: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveTo: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
      trim: true,
      default: 'system',
    },
  },
  { _id: false }
);

const UserSchema = new Schema(
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
    attendanceEmail: {
      type: String,
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
    employmentType: {
      type: String,
      enum: ['halftime', 'fulltime', 'article'],
      default: 'fulltime',
    },
    employmentTypeHistory: [
      {
        employmentType: {
          type: String,
          enum: ['halftime', 'fulltime', 'article'],
          required: true,
        },
        effectiveFrom: {
          type: Date,
          required: true,
        },
        _id: false,
      },
    ],
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
    emergencyContactNo: {
      type: String,
      trim: true,
    },
    emergencyContactRelation: {
      type: String,
      trim: true,
    },
    anniversaryDate: {
      type: Date,
    },
    bankName: {
      type: String,
      trim: true,
    },
    branchName: {
      type: String,
      trim: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },
    ifscCode: {
      type: String,
      trim: true,
    },
    accountType: {
      type: String,
      trim: true,
    },
    accountHolderName: {
      type: String,
      trim: true,
    },
    aadhaarNumber: {
      type: String,
      trim: true,
    },
    panNumber: {
      type: String,
      trim: true,
    },
    basicSalary: {
      type: String,
      trim: true,
    },
    laptopAllowance: {
      type: String,
      trim: true,
    },
    otherAllowance: {
      type: String,
      trim: true,
    },
    bonus: {
      type: String,
      trim: true,
    },
    incentive: {
      type: String,
      trim: true,
    },
    totalSalaryPerMonth: {
      type: String,
      trim: true,
    },
    totalSalaryPerAnnum: {
      type: String,
      trim: true,
    },
    pf: {
      type: String,
      trim: true,
    },
    esi: {
      type: String,
      trim: true,
    },
    gratuity: {
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
    fieldHistories: {
      registeredUnderPartner: {
        type: [EffectiveValueHistorySchema],
        default: [],
      },
      workingUnderPartner: {
        type: [EffectiveValueHistorySchema],
        default: [],
      },
      basicSalary: {
        type: [EffectiveValueHistorySchema],
        default: [],
      },
      laptopAllowance: {
        type: [EffectiveValueHistorySchema],
        default: [],
      },
      totalSalaryPerMonth: {
        type: [EffectiveValueHistorySchema],
        default: [],
      },
      totalSalaryPerAnnum: {
        type: [EffectiveValueHistorySchema],
        default: [],
      },
    },
    extraInfo: [
      {
        label: { type: String, trim: true },
        value: { type: String, trim: true },
        _id: false,
      },
    ],

    // Credits for Articles (as on 1st Jan 26)
    articleCreditsAsOnJan26: {
      type: Number,
      default: 0,
    },
    leaveBalance: {
      balanceAsOfJan26: { type: Number, default: 0 }, // Opening balance as of 1st Jan 2026 (uploaded via Excel)
      earned: { type: Number, default: 0 }, // Leave earned after 1st Jan 2026 (calculated from attendance uploads, only for non-articles)
      used: { type: Number, default: 0 }, // Leaves taken before 1st Jan 2026 (from Excel upload)
      usedAfterJan26: { type: Number, default: 0 }, // Leaves taken on or after 1st Jan 2026 (calculated from attendance records)
      remaining: { type: Number, default: 0 }, // Calculated dynamically
      lastUpdated: { type: Date, default: Date.now },
      monthlyEarned: { type: Number, default: 2 }, // Monthly earning rate (default 2)
    },
    joiningDate: {
      type: Date,
      
    },
    // Schedule entries with effective dates - NEW STRUCTURE
    schedules: {
      type: [ScheduleEntrySchema],
      default: [],
    },
    // Legacy fields for backward compatibility
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

// Note: attendanceEmail is automatically set to email in API routes when creating/updating users

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
