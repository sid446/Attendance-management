import { NextRequest } from 'next/server';

export function getCronSecret(): string {
  return (
    process.env.CRON_SECRET?.trim() ||
    process.env.PENDING_REQUEST_DIGEST_SECRET?.trim() ||
    ''
  );
}

export function isCronAuthorized(request: NextRequest): boolean {
  const expected = getCronSecret();
  if (!expected) return false;

  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token && token === expected) return true;
  }

  const headerSecret = request.headers.get('x-cron-secret')?.trim();
  if (headerSecret && headerSecret === expected) return true;

  // Allow secret in query only outside production (local testing).
  if (process.env.NODE_ENV !== 'production') {
    const q = request.nextUrl.searchParams.get('secret');
    if (q && q === expected) return true;
  }

  return false;
}
