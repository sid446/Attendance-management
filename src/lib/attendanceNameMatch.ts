/** Strip non-alphanumeric characters for stable name comparison (matches bulk upload logic). */
export function normalizeForMatch(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
