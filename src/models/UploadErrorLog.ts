import mongoose, { Schema, Document } from 'mongoose';

export type UploadLogType = 'attendance' | 'employee-master' | 'employee-schedule';

export interface IUploadErrorLog extends Document {
  fileName: string;
  uploadDate: Date;
  logType: UploadLogType;
  errorDetails: {
    message: string;
    count: number;
    sampleRows: string[];
  }[];
}

const UploadErrorLogSchema: Schema = new Schema({
  fileName: { type: String, required: true },
  uploadDate: { type: Date, default: Date.now },
  logType: {
    type: String,
    enum: ['attendance', 'employee-master', 'employee-schedule'],
    default: 'attendance',
  },
  errorDetails: [{
    message: { type: String, required: true },
    count: { type: Number, required: true },
    sampleRows: [{ type: String }]
  }]
}, {
  timestamps: true
});

export default mongoose.models.UploadErrorLog || mongoose.model<IUploadErrorLog>('UploadErrorLog', UploadErrorLogSchema);
