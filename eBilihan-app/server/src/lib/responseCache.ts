/**
 * TTL cache for upstream responses that cost a credit but almost never change.
 *
 * Why this exists: the eReport dataset lookups (report types, and the
 * region/province/municipality/barangay cascade) are billed per call, and every visitor
 * who opens the Reports tab triggers at least two of them. Without caching, N judges
 * reviewing the app costs 2N credits for data that is identical every time. With it, the
 * first visitor pays and everyone after that is free until the TTL expires.
 *
 * A client-side fix already stops one browser refetching (see EGOV_REFERENCE_QUERY in
 * src/api/reports.ts), but that is per-browser — it does nothing for the second visitor.
 * This is the half that scales.
 *
 * Single-flight, for the same reason tokenCache.ts is: two visitors arriving together on
 * a cold cache would otherwise both call upstream and both be billed.
 */

type Entry<T> = { value: T; expiresAtMs: number };

const cache = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/** Reference data changes on the order of once a year; a day is conservative. */
export const REFERENCE_DATA_TTL_MS = 24 * 60 * 60_000;

export async function getCachedResponse<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAtMs > Date.now()) {
    return hit.value as T;
  }

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const request = (async () => {
    const value = await fetcher();
    cache.set(key, { value, expiresAtMs: Date.now() + ttlMs });
    return value;
  })();

  inFlight.set(key, request);
  try {
    return (await request) as T;
  } finally {
    // Cleared on failure too, so one upstream error doesn't wedge the key with a
    // permanently rejected promise.
    inFlight.delete(key);
  }
}

/** Diagnostics only — surfaced by GET /health so cache behaviour is visible in production. */
export function cacheStats() {
  const now = Date.now();
  let live = 0;
  for (const entry of cache.values()) if (entry.expiresAtMs > now) live++;
  return { entries: cache.size, live, inFlight: inFlight.size };
}
