import { normalizeForMatch } from '@/lib/attendanceNameMatch';

/** Jaccard similarity on whitespace tokens (order-independent). */
export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter++;
  }
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Score in [0, 1]: normalized equality, token overlap, and prefix overlap. */
export function nameSimilarityScore(uploadName: string, dbName: string): number {
  const u = uploadName.trim();
  const d = dbName.trim();
  if (!u || !d) return 0;
  if (normalizeForMatch(u) === normalizeForMatch(d)) return 1;
  const j = tokenJaccard(u, d);
  const ul = u.toLowerCase();
  const dl = d.toLowerCase();
  let prefixBoost = 0;
  const minLen = Math.min(ul.length, dl.length, 8);
  if (minLen >= 3 && ul.slice(0, minLen) === dl.slice(0, minLen)) {
    prefixBoost = 0.08;
  }
  return Math.min(1, j + prefixBoost);
}

export type CandidateUser = {
  _id: unknown;
  name: string;
  odId?: string;
  employeeCode?: string;
};

export type RankedCandidate = {
  userId: string;
  name: string;
  odId: string;
  employeeCode: string;
  score: number;
};

/** Best-effort suggestions for HR when machine name ≠ DB name. */
export function rankUserCandidates(
  uploadName: string,
  users: CandidateUser[],
  limit = 5
): RankedCandidate[] {
  const scored = users.map((u) => ({
    userId: String(u._id),
    name: u.name,
    odId: String(u.odId ?? ''),
    employeeCode: String(u.employeeCode ?? ''),
    score: nameSimilarityScore(uploadName, u.name),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
