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

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
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
    if (status === 401) return new ApiError(serverMessage ?? "Your session expired — please log in again.", "unauthorized", status);
    if (status === 403) return new ApiError(serverMessage ?? "You don't have permission to do that.", "forbidden", status);
    if (status === 404) return new ApiError(serverMessage ?? "That wasn't found.", "not_found", status);
    if (status === 400 || status === 422) return new ApiError(serverMessage ?? "Please check the details you entered.", "validation", status);
    if (status >= 500) return new ApiError(serverMessage ?? "Something went wrong on the server. Please try again shortly.", "server", status);
    return new ApiError(serverMessage ?? error.message, "unknown", status);
  }

  return new ApiError(error instanceof Error ? error.message : String(error), "unknown");
}
