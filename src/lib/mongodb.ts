
import mongoose from 'mongoose';
import '@/lib/backupPreview';



const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

async function dbConnect(): Promise<typeof mongoose> {
  if (!cached.conn) {
    if (!cached.promise) {
      const opts = {
        bufferCommands: false,
        family: 4,
      };

      cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
        return mongoose;
      });
    }

    try {
      cached.conn = await cached.promise;
    } catch (e) {
      cached.promise = null;
      throw e;
    }
  }

  await refreshAttendanceCalcPolicies();
  return cached.conn;
}

const POLICY_TTL_MS = 5_000;
let policyLoadedAt = 0;
let policyLoad: Promise<void> | null = null;

async function refreshAttendanceCalcPolicies(): Promise<void> {
  const now = Date.now();
  if (now - policyLoadedAt < POLICY_TTL_MS) return;
  if (!policyLoad) {
    policyLoad = import('@/lib/attendanceCalcPolicyDb')
      .then((mod) => mod.loadAttendanceCalcPolicies())
      .then(() => {
        policyLoadedAt = Date.now();
      })
      .catch((error) => {
        console.error('Attendance calc policy load failed:', error);
      })
      .finally(() => {
        policyLoad = null;
      });
  }
  await policyLoad;
}

export default dbConnect;