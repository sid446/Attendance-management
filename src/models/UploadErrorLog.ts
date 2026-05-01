import mongoose, { Schema, Document } from 'mongoose';

export interface IUploadErrorLog extends Document {
  fileName: string;
  uploadDate: Date;
  errorDetails: {
    message: string;
    count: number;
    sampleRows: string[];
  }[];
}

const UploadErrorLogSchema: Schema = new Schema({
  fileName: { type: String, required: true },
  uploadDate: { type: Date, default: Date.now },
  errorDetails: [{
    message: { type: String, required: true },
    count: { type: Number, required: true },
    sampleRows: [{ type: String }]
  }]
}, {
  timestamps: true
});

export default mongoose.models.UploadErrorLog || mongoose.model<IUploadErrorLog>('UploadErrorLog', UploadErrorLogSchema);
