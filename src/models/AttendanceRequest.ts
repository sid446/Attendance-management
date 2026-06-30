import mongoose, { Schema, Document, Model } from 'mongoose';

/** Shared enum values for requestedStatus / originalStatus (keep in sync). */
export const TYPE_OF_PRESENCE_ENUM = [
  'ThumbMachine',
  'Manual',
  'Remote',
  'On leave',
  'Holiday',
  'Absent',
  'Future Request',
  'Present - in office',
  'Present - in office - weekdays',
  'Present - in office - weekoff',
  'Present - client place',
  'Present - outstation',
  'Present - weekoff',
  'Half Day - weekdays',
  'Half Day - weekoff',
  'WFH - weekdays',
  'WFH - weekoff',
  'Weekoff - special allowance',
  'Weekly Off - Present (WO-Present)',
  'Half Day (HD)',
  'Work From Home (WFH)',
  'Weekly Off - Work From Home (WO-WFH)',
  'Onsite Presence (OS-P)',
  'Thumb machine - not working',
  'Present - Outstation (Weekoff)',
  'Present - ClientPlace (Weekoff)',
  'Present - Outstation (Weekdays)',
  'Present - ClientPlace (Weekdays)',
  'Extra work hours',
] as const;

export type TypeOfPresence = (typeof TYPE_OF_PRESENCE_ENUM)[number];

export interface IAttendanceRequest extends Document {
  userId: mongoose.Types.ObjectId;
  userName: string;
  partnerName: string;
  date: string; // YYYY-MM-DD
  monthYear: string; // YYYY-MM
  requestedStatus: TypeOfPresence | string;
  originalStatus: TypeOfPresence | string;
  reason?: string;
  status: 'Pending' | 'PendingHr' | 'Approved' | 'Rejected';
  startTime?: string;
  endTime?: string;
  /** Distinguishes attendance correction from extra-work hour claims. */
  requestType?: 'correction' | 'extra_work';
  /** Multiple extra-work slots in one request (each with its own explanation). */
  extraWorkSlots?: { startTime: string; endTime: string; reason: string }[];
  partnerRemarks?: string;
  /** Set when partner approves but HR must finalize (stale attendance date). */
  partnerApprovedAt?: Date;
  /** Partner-proposed attendance value (string) before HR final approval. */
  partnerProposedValue?: string;
  hrRemarks?: string; // HR remarks when approved by HR
  hrValue?: string; // HR value when approved by HR
  /** employee = raised by staff; hr_direct = created only from HR calendar edit */
  requestSource?: 'employee' | 'hr_direct';
  /** Audit trail when HR edits attendance from the admin calendar */
  hrEditHistory?: {
    editedAt: Date;
    editedBy?: string;
    editedByEmail: string;
    previousStatus?: string;
    previousStartTime?: string;
    previousEndTime?: string;
    previousValue?: string;
    newStatus?: string;
    newStartTime?: string;
    newEndTime?: string;
    newValue?: string;
    remarks?: string;
    changeSummary?: string;
  }[];
  approvedBy?: string; // 'HR' or partner name
  approvedByEmail?: string; // Email of the person who approved (for historical tracking)
  approvedAt?: Date;
  rejectedBy?: string; // 'HR' or partner name
  rejectedByEmail?: string; // Email of the person who rejected (for historical tracking)
  rejectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceRequestSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    partnerName: { type: String, required: true },
    date: { type: String, required: true },
    monthYear: { type: String, required: true },
    requestedStatus: {
      type: String,
      required: true,
      enum: TYPE_OF_PRESENCE_ENUM,
    },
    originalStatus: {
      type: String,
      required: true,
      enum: TYPE_OF_PRESENCE_ENUM,
    },
    reason: { type: String },
    status: { 
        type: String, 
        enum: ['Pending', 'PendingHr', 'Approved', 'Rejected'], 
        default: 'Pending' 
    },
    startTime: { type: String },
    endTime: { type: String },
    requestType: {
      type: String,
      enum: ['correction', 'extra_work'],
      default: 'correction',
    },
    extraWorkSlots: {
      type: [
        {
          startTime: { type: String, required: true },
          endTime: { type: String, required: true },
          reason: { type: String, required: true },
        },
      ],
      default: undefined,
    },
    partnerRemarks: { type: String },
    partnerApprovedAt: { type: Date },
    partnerProposedValue: { type: String },
    hrRemarks: { type: String },
    hrValue: { type: String },
    requestSource: { type: String, enum: ['employee', 'hr_direct'] },
    hrEditHistory: {
      type: [
        {
          editedAt: { type: Date, required: true },
          editedBy: { type: String },
          editedByEmail: { type: String, required: true },
          previousStatus: { type: String },
          previousStartTime: { type: String },
          previousEndTime: { type: String },
          previousValue: { type: String },
          newStatus: { type: String },
          newStartTime: { type: String },
          newEndTime: { type: String },
          newValue: { type: String },
          remarks: { type: String },
          changeSummary: { type: String },
        },
      ],
      default: undefined,
    },
    approvedBy: { type: String },
    approvedByEmail: { type: String },
    approvedAt: { type: Date },
    rejectedBy: { type: String },
    rejectedByEmail: { type: String },
    rejectedAt: { type: Date }
  },
  {
    timestamps: true,
  }
);

// Re-register when schema changes (Next.js dev can cache an older model).
if (mongoose.models.AttendanceRequest) {
  delete mongoose.models.AttendanceRequest;
}

const AttendanceRequest: Model<IAttendanceRequest> = mongoose.model<IAttendanceRequest>(
  'AttendanceRequest',
  AttendanceRequestSchema
);

export default AttendanceRequest;
