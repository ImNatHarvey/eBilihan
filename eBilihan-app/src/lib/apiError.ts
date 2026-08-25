import axios from "axios";

export type ApiErrorKind =
  | "network"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "server"
  | "unknown";

/**
 * Every failure path (axios network errors, eGov upstream errors our backend
 * forwards, our own validation 422s) gets normalized into this one shape, with a
 * `.message` that's already safe to show a store owner directly — so existing
 * `catch (err) { setError(err.message) }` call sites (LoginPage, ProductsPage, ...)
 * get a useful message for free, no call-site changes needed.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  /**
   * The server's raw error body. Some failures carry a flag the UI has to act on rather
   * than merely display — e.g. `needsOwnerLiveness` on a high-value loan, which tells the
   * client to offer a face check instead of just repeating the message.
   */
  readonly body?: Record<string, unknown>;

  constructor(message: string, kind: ApiErrorKind, status?: number, body?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.body = body;
  }

  /** True when the server asked for the owner's own Face Liveness check first. */
  get needsOwnerLiveness(): boolean {
    return this.body?.needsOwnerLiveness === true;
  }
}

function extractServerMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  for (const key of ["error", "message", "detail"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED") {
      return new ApiError("The server took too long to respond. Please try again.", "timeout");
    }
    if (!error.response) {
      // The request never got a response at all — almost always the backend (server/)
      // isn't running, or the device can't reach VITE_API_BASE_URL.
      return new ApiError(
        "Can't reach the eBilihan server. Make sure it's running (cd server && npm run dev) and that VITE_API_BASE_URL points to it.",
        "network",
      );
    }

    const status = error.response.status;
    const serverMessage = extractServerMessage(error.response.data);
    const body =
      error.response.data && typeof error.response.data === "object"
        ? (error.response.data as Record<string, unknown>)
        : undefined;
    if (status === 401) return new ApiError(serverMessage ?? "Your session expired — please log in again.", "unauthorized", status, body);
    if (status === 403) return new ApiError(serverMessage ?? "You don't have permission to do that.", "forbidden", status, body);
    if (status === 404) return new ApiError(serverMessage ?? "That wasn't found.", "not_found", status, body);
    if (status === 429) {
      // Account-level and shared across all six eGov APIs — surfaced distinctly so it
      // reads as "top up credits", not as a bug in whatever call happened to hit it.
      return new ApiError(serverMessage ?? "The eGov API quota is exhausted.", "server", status, body);
    }
    if (status === 400 || status === 422) return new ApiError(serverMessage ?? "Please check the details you entered.", "validation", status, body);
    if (status >= 500) return new ApiError(serverMessage ?? "Something went wrong on the server. Please try again shortly.", "server", status, body);
    return new ApiError(serverMessage ?? error.message, "unknown", status, body);
  }

  return new ApiError(error instanceof Error ? error.message : String(error), "unknown");
}

/**
 * Message ready to put straight in front of a store owner. Third-party SDKs (eGovPH's
 * login widget, eVerify's liveness SDK) reject with plain objects rather than Errors, so
 * `err.message` alone is not enough at those call sites — this falls back cleanly.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = extractServerMessage(error);
    if (message) return message;
    const status = (error as { status?: unknown }).status;
    if (typeof status === "string" && status) return `${fallback} (${status.toLowerCase()})`;
  }
  return fallback;
}
