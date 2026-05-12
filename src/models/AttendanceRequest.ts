import mongoose, { Schema, Document, Model } from 'mongoose';

export type TypeOfPresence =
  | 'ThumbMachine'
  | 'Manual'
  | 'Remote'
  | 'On leave'
  | 'Holiday'
  | 'Absent'
  | 'Present - in office'
  | 'Present - in office - weekdays'
  | 'Present - in office - weekoff'
  | 'Present - client place'
  | 'Present - outstation'
  | 'Present - weekoff'
  | 'Half Day - weekdays'
  | 'Half Day - weekoff'
  | 'WFH - weekdays'
  | 'WFH - weekoff'
  | 'Weekoff - special allowance'
  | 'Weekly Off - Present (WO-Present)'
  | 'Half Day (HD)'
  | 'Work From Home (WFH)'
  | 'Weekly Off - Work From Home (WO-WFH)'
  | 'Onsite Presence (OS-P)'
  | 'Thumb machine - not working'
  | 'Present - Outstation (Weekoff)'
  | 'Present - ClientPlace (Weekoff)'
  | 'Present - Outstation (Weekdays)'
  | 'Present - ClientPlace (Weekdays)';

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
  partnerRemarks?: string;
  /** Set when partner approves but HR must finalize (stale attendance date). */
  partnerApprovedAt?: Date;
  /** Partner-proposed attendance value (string) before HR final approval. */
  partnerProposedValue?: string;
  hrRemarks?: string; // HR remarks when approved by HR
  hrValue?: string; // HR value when approved by HR
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
      enum: [
        'ThumbMachine',
        'Manual',
        'Remote',
        'On leave',
        'Holiday',
        'Absent',
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
        'Present - ClientPlace (Weekdays)'
      ],
    },
    originalStatus: {
      type: String,
      required: true,
      enum: [
        'ThumbMachine',
        'Manual',
        'Remote',
        'On leave',
        'Holiday',
        'Absent',
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
        'Present - ClientPlace (Weekdays)'
      ],
    },
    reason: { type: String },
    status: { 
        type: String, 
        enum: ['Pending', 'PendingHr', 'Approved', 'Rejected'], 
        default: 'Pending' 
    },
    startTime: { type: String },
    endTime: { type: String },
    partnerRemarks: { type: String },
    partnerApprovedAt: { type: Date },
    partnerProposedValue: { type: String },
    hrRemarks: { type: String },
    hrValue: { type: String },
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

const AttendanceRequest: Model<IAttendanceRequest> =
  mongoose.models.AttendanceRequest || mongoose.model<IAttendanceRequest>('AttendanceRequest', AttendanceRequestSchema);

export default AttendanceRequest;
