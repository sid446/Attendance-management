import mongoose from 'mongoose';

interface IBackupDocument {
  _id?: mongoose.Types.ObjectId;
  fileName: string;
  data: any;
  metadata: {
    timestamp: Date;
    collections: string[];
    mongooseVersion: string;
    nodeVersion: string;
    fileSize: number;
  };
  createdAt: Date;
  expiresAt?: Date; // For automatic cleanup
}

const BackupSchema = new mongoose.Schema<IBackupDocument>({
  fileName: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  metadata: {
    timestamp: {
      type: Date,
      required: true
    },
    collections: [{
      type: String,
      required: true
    }],
    mongooseVersion: {
      type: String,
      required: true
    },
    nodeVersion: {
      type: String,
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    }
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 90 * 24 * 60 * 60 // Auto-delete after 90 days
  }
}, {
  timestamps: true
});

// Index for efficient queries
BackupSchema.index({ createdAt: -1 });
BackupSchema.index({ 'metadata.timestamp': -1 });

// Prevent overwriting with mongoose models re-registration
const BackupModel = mongoose.models.Backup || mongoose.model<IBackupDocument>('Backup', BackupSchema);

export default BackupModel;
export type { IBackupDocument };