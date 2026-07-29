/** Strip non-alphanumeric characters for stable name comparison (matches bulk upload logic). */
export function normalizeForMatch(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Canonical stored person name: no dots between parts — use spaces.
 * "A.K.Sharma" / "A.K. Sharma" → "A K Sharma"
 */
export function normalizeStoredPersonName(s: string): string {
  return String(s || '')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
