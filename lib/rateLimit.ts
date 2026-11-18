import "server-only";

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

// Best-effort only: state lives in one serverless instance's memory. Enough to blunt
// scripted sign-in attempts on a low-traffic app.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}
