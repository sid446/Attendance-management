import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPredefinedValues extends Document {
  type: 'teams' | 'designations' | 'paidFrom' | 'categories';
  values: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface IPredefinedValuesModel extends Model<IPredefinedValues> {
  getValuesByType(type: string): Promise<string[]>;
  addValue(type: string, value: string): Promise<boolean>;
  removeValue(type: string, value: string): Promise<boolean>;
  getAllValues(): Promise<{
    teams: string[];
    designations: string[];
    paidFrom: string[];
    categories: string[];
  }>;
}

const PredefinedValuesSchema: Schema<IPredefinedValues> = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['teams', 'designations', 'paidFrom', 'categories'],
    unique: true
  },
  values: {
    type: [String],
    required: true,
    default: []
  }
}, {
  timestamps: true,
  collection: 'predefined_values'
});

// Static methods
PredefinedValuesSchema.statics.getValuesByType = async function(type: string): Promise<string[]> {
  const doc = await this.findOne({ type });
  return doc ? doc.values : [];
};

PredefinedValuesSchema.statics.addValue = async function(type: string, value: string): Promise<boolean> {
  const trimmedValue = value.trim();
  if (!trimmedValue) return false;

  const result = await this.updateOne(
    { type },
    {
      $addToSet: { values: trimmedValue },
      $set: { updatedAt: new Date() }
    },
    { upsert: true }
  );

  return result.modifiedCount > 0 || result.upsertedCount > 0;
};

PredefinedValuesSchema.statics.removeValue = async function(type: string, value: string): Promise<boolean> {
  const result = await this.updateOne(
    { type },
    {
      $pull: { values: value },
      $set: { updatedAt: new Date() }
    }
  );

  return result.modifiedCount > 0;
};

PredefinedValuesSchema.statics.getAllValues = async function(): Promise<{
  teams: string[];
  designations: string[];
  paidFrom: string[];
  categories: string[];
}> {
  const docs = await this.find({});
  const result = {
    teams: [] as string[],
    designations: [] as string[],
    paidFrom: [] as string[],
    categories: [] as string[]
  };

  docs.forEach((doc: any) => {
    if (doc.type === 'teams') result.teams = doc.values;
    if (doc.type === 'designations') result.designations = doc.values;
    if (doc.type === 'paidFrom') result.paidFrom = doc.values;
    if (doc.type === 'categories') result.categories = doc.values;
  });

  return result;
};

const PredefinedValues: IPredefinedValuesModel = mongoose.models.PredefinedValues ||
  mongoose.model<IPredefinedValues, IPredefinedValuesModel>('PredefinedValues', PredefinedValuesSchema);

export default PredefinedValues;