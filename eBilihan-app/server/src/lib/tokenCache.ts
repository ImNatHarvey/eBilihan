type CachedToken = { value: string; expiresAtMs: number };

const cache = new Map<string, CachedToken>();

/**
 * Generic single-flight-ish memoizer for upstream service tokens (eVerify access_token,
 * eReport integration_token, ...). Refetches ~60s before the upstream-declared expiry.
 */
export async function getCachedToken(
  key: string,
  fetcher: () => Promise<{ token: string; expiresAtMs: number }>,
): Promise<string> {
  const cached = cache.get(key);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) {
    return cached.value;
  }
  const { token, expiresAtMs } = await fetcher();
  cache.set(key, { value: token, expiresAtMs });
  return token;
}
