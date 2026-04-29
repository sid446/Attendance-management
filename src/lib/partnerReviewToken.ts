import crypto from 'crypto';

export interface PartnerReviewClaims {
  partnerName: string;
  partnerEmail: string;
  exp: number;
}

interface TokenVerifySuccess {
  valid: true;
  claims: PartnerReviewClaims;
}

interface TokenVerifyFailure {
  valid: false;
  error: string;
}

export type PartnerReviewTokenVerification = TokenVerifySuccess | TokenVerifyFailure;

const DEFAULT_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const FALLBACK_PARTNER_REVIEW_SECRET = 'attendance-app-local-partner-review-secret';

function getPartnerReviewSecret(): string {
  const explicitSecret = process.env.PARTNER_REVIEW_LINK_SECRET?.trim();
  if (explicitSecret) return explicitSecret;

  const fallbackSecret = process.env.NEXTAUTH_SECRET?.trim();
  if (fallbackSecret) return fallbackSecret;

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      'Missing PARTNER_REVIEW_LINK_SECRET (or NEXTAUTH_SECRET); using the built-in fallback secret for partner review links.'
    );
  }

  return FALLBACK_PARTNER_REVIEW_SECRET;
}

function signPayload(encodedPayload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function createPartnerReviewToken(
  payload: { partnerName: string; partnerEmail: string },
  ttlSeconds: number = DEFAULT_TOKEN_TTL_SECONDS
): string {
  const secret = getPartnerReviewSecret();
  const claims: PartnerReviewClaims = {
    partnerName: payload.partnerName.trim(),
    partnerEmail: payload.partnerEmail.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyPartnerReviewToken(token: string): PartnerReviewTokenVerification {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Missing token' };
    }

    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      return { valid: false, error: 'Malformed token' };
    }

    const secret = getPartnerReviewSecret();
    const expectedSignature = signPayload(encodedPayload, secret);

    if (!safeEqual(signature, expectedSignature)) {
      return { valid: false, error: 'Invalid token signature' };
    }

    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<PartnerReviewClaims>;

    if (
      typeof parsed.partnerName !== 'string' ||
      !parsed.partnerName.trim() ||
      typeof parsed.partnerEmail !== 'string' ||
      !parsed.partnerEmail.trim() ||
      typeof parsed.exp !== 'number'
    ) {
      return { valid: false, error: 'Invalid token payload' };
    }

    if (parsed.exp <= Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' };
    }

    return {
      valid: true,
      claims: {
        partnerName: parsed.partnerName.trim(),
        partnerEmail: parsed.partnerEmail.trim().toLowerCase(),
        exp: parsed.exp,
      },
    };
  } catch (error) {
    return { valid: false, error: 'Token verification failed' };
  }
}

export function createPartnerReviewAllLink(baseUrl: string, partnerName: string, partnerEmail: string): string {
  const token = createPartnerReviewToken({ partnerName, partnerEmail });
  return `${baseUrl}/partner/review-all?token=${encodeURIComponent(token)}`;
}
