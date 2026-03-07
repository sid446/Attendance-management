import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILocationPunch {
  time: string; // HH:mm format
  timestamp: Date;
  coordinates: {
    lat: number;
    lng: number;
  };
  distanceFromClient: number; // Distance in meters from client place
  isWithinRadius: boolean;
  status: 'approved' | 'rejected' | 'pending';
}

export interface ILocationAttendance extends Document {
  userId: mongoose.Types.ObjectId;
  clientPlaceId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD format
  inPunch?: ILocationPunch;
  outPunch?: ILocationPunch;
  totalHours?: number; // Calculated total hours worked
  status: 'partial' | 'complete' | 'pending';
  createdAt: Date;
  updatedAt: Date;
}

const LocationPunchSchema = new Schema<ILocationPunch>({
  time: { type: String, required: true },
  timestamp: { type: Date, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  distanceFromClient: { type: Number, required: true },
  isWithinRadius: { type: Boolean, required: true },
  status: { type: String, enum: ['approved', 'rejected', 'pending'], default: 'pending' }
}, { _id: false });

const LocationAttendanceSchema = new Schema<ILocationAttendance>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  clientPlaceId: { type: Schema.Types.ObjectId, ref: 'ClientPlace', required: true },
  date: { type: String, required: true },
  inPunch: LocationPunchSchema,
  outPunch: LocationPunchSchema,
  totalHours: { type: Number },
  status: { type: String, enum: ['partial', 'complete', 'pending'], default: 'pending' }
}, {
  timestamps: true
});

// Compound index for efficient queries
LocationAttendanceSchema.index({ userId: 1, date: 1 });
LocationAttendanceSchema.index({ clientPlaceId: 1, date: 1 });
LocationAttendanceSchema.index({ userId: 1, clientPlaceId: 1, date: 1 }, { unique: true });

const LocationAttendance: Model<ILocationAttendance> = mongoose.models.LocationAttendance || mongoose.model<ILocationAttendance>('LocationAttendance', LocationAttendanceSchema);

export default LocationAttendance;
