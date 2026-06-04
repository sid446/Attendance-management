import EmployeeAuthSession, { defaultEmployeeSessionExpiresAt } from '@/models/EmployeeAuthSession';
import { Types } from 'mongoose';

function generateEmployeeAuthToken(): string {
  return (
    Math.random().toString(36).substring(2) +
    Date.now().toString(36) +
    Math.random().toString(36).substring(2)
  );
}

/** Persist a new 30-day employee portal session and return the opaque token. */
export async function createEmployeeAuthSessionToken(userId: string): Promise<string> {
  const authToken = generateEmployeeAuthToken();
  const oid = new Types.ObjectId(userId);

  await EmployeeAuthSession.findOneAndUpdate(
    { token: authToken },
    { $set: { userId: oid, expiresAt: defaultEmployeeSessionExpiresAt() } },
    { upsert: true, new: true }
  );

  return authToken;
}
