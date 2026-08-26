import type { NextFunction, Request, Response } from "express";

/**
 * A small fixed-window rate limiter for routes that spend portal credits.
 *
 * Every eGov API call costs a credit from a shared, finite balance. Without a limit, a
 * stuck retry loop, an impatient double-click, or a crawler hitting the deployed site can
 * drain the account — and there is no overdraft: at zero, every integration returns
 * `429 quota_exceeded` and the app stops working mid-demo.
 *
 * Deliberately dependency-free and in-memory. This is not protection against a determined
 * attacker (a distributed caller trivially defeats per-IP counting, and the counters reset
 * on restart) — it is a brake on runaway or accidental spend, which is the realistic
 * failure mode for a hackathon deployment. If this app ever handles real money at scale,
 * replace it with a shared store like Redis.
 */

type Bucket = { count: number; windowStartMs: number };

const buckets = new Map<string, Bucket>();

/** Bound the map so a stream of unique IPs can't grow it without limit. */
const MAX_TRACKED = 5_000;

function clientKey(req: Request): string {
  // Behind Render/Vercel the real client is in x-forwarded-for; fall back to the socket.
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : undefined;
  return ip || req.socket.remoteAddress || "unknown";
}

export function rateLimit(options: { windowMs: number; max: number; label: string }) {
  const { windowMs, max, label } = options;

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const key = `${label}:${clientKey(req)}`;

    if (buckets.size > MAX_TRACKED) {
      for (const [k, b] of buckets) if (now - b.windowStartMs > windowMs) buckets.delete(k);
    }

    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStartMs >= windowMs) {
      buckets.set(key, { count: 1, windowStartMs: now });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSec = Math.ceil((bucket.windowStartMs + windowMs - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      // eslint-disable-next-line no-console
      console.warn(`[rateLimit] ${label} blocked ${clientKey(req)} (${bucket.count}/${max} in window)`);
      return res.status(429).json({
        error: "Too many requests — please wait a moment and try again.",
        kind: "rate_limited",
        retryAfterSeconds: retryAfterSec,
      });
    }

    return next();
  };
}

/**
 * Budgets, chosen against what a real person doing a demo would need.
 *
 * `billed` covers anything that reaches an eGov API and consumes credit. 20/minute is far
 * above human pace — a judge working through the whole app will not approach it — while
 * still capping a runaway loop at 20 credits a minute rather than thousands.
 *
 * `expensive` is for the handful of calls that are both billed and irreversible or
 * chargeable in sequence: filing a report, creating a payment, verifying an identity.
 */
export const billedRateLimit = rateLimit({ windowMs: 60_000, max: 20, label: "billed" });
export const expensiveRateLimit = rateLimit({ windowMs: 60_000, max: 5, label: "expensive" });
