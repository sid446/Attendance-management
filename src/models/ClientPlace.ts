import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IClientPlace extends Document {
  name: string;
  address: string;
  googleMapsLink: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  radiusMeters: number; // Default 500m, configurable
  assignedEmployees: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ClientPlaceSchema = new Schema<IClientPlace>({
  name: { type: String, required: true },
  address: { type: String, required: true },
  googleMapsLink: { type: String, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  radiusMeters: { type: Number, default: 500 },
  assignedEmployees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Index for efficient queries
ClientPlaceSchema.index({ isActive: 1 });
ClientPlaceSchema.index({ assignedEmployees: 1 });

const ClientPlace: Model<IClientPlace> = mongoose.models.ClientPlace || mongoose.model<IClientPlace>('ClientPlace', ClientPlaceSchema);

export default ClientPlace;
