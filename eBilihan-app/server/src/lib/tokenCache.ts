type CachedToken = { value: string; expiresAtMs: number };

const cache = new Map<string, CachedToken>();

/**
 * Requests that are currently minting a token, keyed the same way as `cache`.
 *
 * Without this the memoizer was single-flight in name only: two concurrent callers with a
 * cold cache both missed the `cache.get` check, both awaited `fetcher()`, and both minted
 * a token. Observed live — the Reports page mounts two queries in parallel, and the portal
 * logged two `POST /api/integration/token` calls in the same second.
 *
 * That is not merely wasteful. eReport appears to bill its token exchange, so a cold cache
 * cost two credits instead of one, and on a cold-started server the stampede scales with
 * however many users arrive at once — exactly what would happen when judges open the site
 * together.
 */
const inFlight = new Map<string, Promise<string>>();

/**
 * Single-flight memoizer for upstream service tokens (eVerify access_token, eReport
 * integration_token, ...). Refetches ~60s before the upstream-declared expiry, and
 * guarantees only ONE fetch is ever in progress per key.
 */
export async function getCachedToken(
  key: string,
  fetcher: () => Promise<{ token: string; expiresAtMs: number }>,
): Promise<string> {
  const cached = cache.get(key);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) {
    return cached.value;
  }

  // Someone else is already fetching this token — wait for their result rather than
  // starting a second, billable request.
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const { token, expiresAtMs } = await fetcher();
    cache.set(key, { value: token, expiresAtMs });
    return token;
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    // Cleared on failure too, so a transient error doesn't wedge the key permanently
    // with a rejected promise that every later caller would re-await.
    inFlight.delete(key);
  }
}
