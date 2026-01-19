import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMachineFormat extends Document {
  machineId: string; // Unique identifier like 'machine1', 'machine2', etc.
  name: string; // Display name like 'BioMax Machine', 'TimeClock Pro', etc.
  description: string; // Description of the machine/format
  headers: string[]; // Array of expected column headers
  isActive: boolean; // Whether this format is active/available
  createdAt: Date;
  updatedAt: Date;
}

const MachineFormatSchema: Schema<IMachineFormat> = new Schema({
  machineId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  headers: [{
    type: String,
    required: true,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create indexes
MachineFormatSchema.index({ isActive: 1 });

const MachineFormat: Model<IMachineFormat> = mongoose.models.MachineFormat || mongoose.model<IMachineFormat>('MachineFormat', MachineFormatSchema);

export default MachineFormat;