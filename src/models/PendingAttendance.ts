import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type PendingAttendanceStatus = 'pending' | 'merged' | 'discarded';

/** One uploaded row stored under a calendar day key (YYYY-MM-DD). */
export interface IPendingDayEntry {
  odId: string;
  rawRecord: Record<string, unknown>;
}

export interface IPendingAttendance extends Document {
  /** Latest display name seen from machine export for this normalized key */
  uploadName: string;
  nameNormalized: string;
  monthYear: string;
  /** Map isoDate (YYYY-MM-DD) → uploaded row payload */
  records: Map<string, IPendingDayEntry>;
  status: PendingAttendanceStatus;
  mergedUserId?: Types.ObjectId;
  mergedAt?: Date;
  source?: {
    fileName?: string;
    uploadBatchId?: Types.ObjectId;
    machineFormat?: string;
    uploadedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const PendingDayEntrySchema = new Schema<IPendingDayEntry>(
  {
    odId: { type: String, default: '' },
    rawRecord: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const PendingAttendanceSchema = new Schema<IPendingAttendance>(
  {
    uploadName: { type: String, required: true },
    nameNormalized: { type: String, required: true, index: true },
    monthYear: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}$/, 'monthYear must be YYYY-MM'],
    },
    records: {
      type: Map,
      of: PendingDayEntrySchema,
      default: () => new Map(),
    },
    status: {
      type: String,
      enum: ['pending', 'merged', 'discarded'],
      default: 'pending',
      index: true,
    },
    mergedUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    mergedAt: { type: Date },
    source: {
      fileName: String,
      uploadBatchId: Schema.Types.ObjectId,
      machineFormat: String,
      uploadedAt: Date,
    },
  },
  { timestamps: true }
);

PendingAttendanceSchema.index({ nameNormalized: 1, status: 1 });
PendingAttendanceSchema.index({ status: 1, monthYear: 1, createdAt: -1 });
PendingAttendanceSchema.index(
  { nameNormalized: 1, monthYear: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
  }
);

const PendingAttendance: Model<IPendingAttendance> =
  mongoose.models.PendingAttendance ||
  mongoose.model<IPendingAttendance>('PendingAttendance', PendingAttendanceSchema);

export default PendingAttendance;
