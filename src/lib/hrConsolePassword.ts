import dbConnect from '@/lib/mongodb';
import HrConsoleSettings, { HR_CONSOLE_SETTINGS_KEY } from '@/models/HrConsoleSettings';

export const DEFAULT_HR_CONSOLE_PASSWORD = 'Asija@2026';

export async function getHrConsolePassword(): Promise<string> {
  await dbConnect();
  const doc = await HrConsoleSettings.findOne({ key: HR_CONSOLE_SETTINGS_KEY }).lean();
  if (doc?.password) return doc.password;
  const fromEnv = process.env.HR_CONSOLE_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_HR_CONSOLE_PASSWORD;
}

export async function verifyHrConsolePassword(input: string): Promise<boolean> {
  const stored = await getHrConsolePassword();
  return String(input || '') === stored;
}

export async function setHrConsolePassword(password: string, updatedBy: string): Promise<void> {
  await dbConnect();
  await HrConsoleSettings.findOneAndUpdate(
    { key: HR_CONSOLE_SETTINGS_KEY },
    { $set: { password, updatedBy: updatedBy.trim().toLowerCase() } },
    { upsert: true }
  );
}
