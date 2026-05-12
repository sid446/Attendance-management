import HrConsolePermission from '@/models/HrConsolePermission';

export async function loadHrConsolePermissionDoc(email: string) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  const doc = await HrConsolePermission.findOne({ operatorEmail: e }).lean();
  return doc;
}
