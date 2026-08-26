import type { Response } from "express";

/**
 * Maps a failed upstream eGov call onto a response our own client can act on.
 *
 * Every one of the six APIs previously collapsed to a blanket 502 with the upstream body
 * tucked into `detail`. That loses the one distinction that matters most during a demo:
 * `429 quota_exceeded` is account-level and can hit ANY of the six, and it surfaced as a
 * generic "verification failed" — which reads as a code bug and sends you debugging
 * instead of asking for a credit top-up.
 *
 * Statuses come from the portal's own documented error tables (eGov SSO's is the most
 * complete; the others share the same gateway conventions).
 */

type UpstreamError = {
  response?: { status?: number; data?: unknown };
  message?: string;
};

/** The upstream's own response body where there is one, else the thrown message. */
export function upstreamDetail(err: unknown): unknown {
  const e = err as UpstreamError;
  return e.response?.data ?? (err as Error)?.message ?? String(err);
}

export type UpstreamFailure = {
  status: number;
  body: { error: string; kind: string; detail?: unknown };
};

/**
 * `label` names the operation in a way a store owner could read, e.g. "Borrower
 * verification". Kept out of the message templates so each caller reads naturally.
 */
export function describeUpstreamError(err: unknown, label: string): UpstreamFailure {
  const status = (err as UpstreamError).response?.status;
  const detail = upstreamDetail(err);

  switch (status) {
    case 400:
    case 422:
      return {
        status: 422,
        body: { error: `${label} was rejected as invalid.`, kind: "invalid_request", detail },
      };
    case 401:
      return {
        status: 502,
        // A 401 from upstream is OUR credential problem, never the end user's session —
        // returning 401 here would trip the client's auto-logout interceptor and bounce
        // a perfectly valid user to the login screen.
        body: { error: `${label} failed: the eGov credential was rejected.`, kind: "upstream_unauthorized", detail },
      };
    case 403:
      return {
        status: 502,
        body: { error: `${label} failed: eGov rejected our credentials.`, kind: "upstream_forbidden", detail },
      };
    case 404:
      return { status: 404, body: { error: `${label} could not be found.`, kind: "not_found", detail } };
    case 429:
      return {
        status: 429,
        body: {
          error: "The eGov API quota is exhausted — ask an administrator for a credit top-up.",
          kind: "quota_exceeded",
          detail,
        },
      };
    case 502:
    case 503:
    case 504:
      return {
        status: 503,
        body: { error: `${label} is temporarily unavailable. Please try again.`, kind: "upstream_unavailable", detail },
      };
    default:
      return { status: 502, body: { error: `${label} failed.`, kind: "upstream_error", detail } };
  }
}

/** Convenience wrapper: `return sendUpstreamError(res, err, "Borrower verification")`. */
export function sendUpstreamError(res: Response, err: unknown, label: string) {
  const { status, body } = describeUpstreamError(err, label);
  const upstreamStatus = (err as UpstreamError).response?.status;

  /**
   * Log EVERY upstream failure with the gateway's own response body, not just quota
   * errors. These calls cost portal credits, so a failure that loses its body costs real
   * money to reproduce — and client-side tooling drops it easily (PowerShell 5.1 throws
   * on non-2xx and the response stream is often already consumed by the time you read it).
   * The server is the one place the body is guaranteed to be seen once.
   */
  // eslint-disable-next-line no-console
  console.error(
    `[eGov] ${label} — upstream HTTP ${upstreamStatus ?? "no response"} → returning ${status} (${body.kind}):`,
    JSON.stringify(body.detail),
  );

  return res.status(status).json(body);
}
