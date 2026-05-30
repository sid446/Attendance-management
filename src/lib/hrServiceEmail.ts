export const DEFAULT_SERVICE_ADMIN_EMAIL = 'service@asija.in';

export function getServiceAdminEmail(): string {
  if (typeof process !== 'undefined') {
    const admin = process.env.ADMIN_EMAIL?.trim();
    if (admin) return admin;
    const pub = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim();
    if (pub) return pub;
  }
  return DEFAULT_SERVICE_ADMIN_EMAIL;
}
