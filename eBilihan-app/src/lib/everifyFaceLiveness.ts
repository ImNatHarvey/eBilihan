/**
 * Loader for eVerify's own embedded "Face Liveness Web SDK".
 *
 * Per the NationalID eVerify integration guide, this is a client-side <script> that
 * resolves a `session_id`, which is then sent (via our backend) to eVerify's QR Verify /
 * Verify Personal Information endpoints as `face_liveness_session_id` — the strict
 * identification step in the Loan Management flow.
 *
 * Deliberately separate from src/api/ (which only calls our own backend): the SDK talks
 * directly to eVerify's liveness-capture domain from the device, and only the resulting
 * session_id — never a secret — reaches our backend.
 *
 * Not to be confused with the standalone Face Liveness REST product (src/api/liveness.ts).
 * Their session tokens live in different namespaces and are not interchangeable.
 */
const SDK_URL =
  import.meta.env.VITE_EVERIFY_LIVENESS_SDK_URL ??
  "https://hackathon-everify-face-liveness.e.gov.ph/js/everify-liveness-sdk.min.js";

let loadPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.eKYC) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        // Don't cache the failure — let a retry attempt the load again.
        loadPromise = null;
        reject(new Error("Failed to load eVerify Face Liveness SDK"));
      };
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}

/**
 * The check did not produce a result — it timed out, the user backed out, or the SDK
 * never posted its completion message.
 *
 * This is emphatically **not** the same event as eVerify rejecting a match, and the two
 * must never be shown with the same wording. "We couldn't match this borrower" accuses a
 * real customer of presenting a false identity; if the truth is that a camera widget hung,
 * the store owner may refuse service — or treat them as attempting fraud — over a UI bug.
 * A failure of ours must never be rendered as a finding about a person.
 */
export class LivenessIncompleteError extends Error {
  readonly kind = "incomplete" as const;
  constructor(message: string) {
    super(message);
    this.name = "LivenessIncompleteError";
  }
}

/**
 * How long to wait for the SDK's completion handshake before giving up.
 *
 * CLAUDE.md records this hang happening live: the check runs, but the iframe's
 * postMessage never arrives and the promise stays pending forever. Waiting indefinitely
 * behind a spinner is not "failing closed", it is just failing invisibly.
 */
const RESPONSE_TIMEOUT_MS = 45_000;

/**
 * Resolves with a real `session_id` from eVerify, or rejects. It never invents one.
 *
 * An earlier version waited 20 seconds and then continued the loan flow with a fabricated
 * `demo-liveness-<timestamp>` id. That was not a safety net: eVerify rejects any session
 * id it did not issue, so it could only ever produce a failed match — while making the UI
 * look like the check had succeeded. A liveness check that cannot report its result must
 * fail closed, because its whole purpose is to stop a loan being recorded against someone
 * who was never present.
 *
 * `signal` lets the caller offer a Cancel button; the timeout covers the case where the
 * user is waiting on something that will never arrive.
 */
export async function startFaceLiveness(
  pubKey: string,
  signal?: AbortSignal,
): Promise<{ sessionId: string; photoUrl: string }> {
  if (!pubKey) {
    // The SDK throws synchronously on a blank pubKey, which previously aborted the loan
    // flow with no visible reason. Fail with something a person can act on instead.
    throw new LivenessIncompleteError(
      "The face check isn't configured — check EVERIFY_PUBKEY on the server.",
    );
  }

  await loadSdk();
  if (!window.eKYC) {
    throw new LivenessIncompleteError("The face check couldn't start. Please try again.");
  }

  // The SDK appends its overlay to <body> and hands back no reference to it, so the only
  // way to tear it down after a timeout is to diff the children.
  const before = new Set(Array.from(document.body.children));
  const removeOverlay = () => {
    for (const child of Array.from(document.body.children)) {
      if (!before.has(child)) child.remove();
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  try {
    const response = await Promise.race<EverifyLivenessResult>([
      window.eKYC().start({ pubKey }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new LivenessIncompleteError("The face check didn't respond. Please try again.")),
          RESPONSE_TIMEOUT_MS,
        );
        if (signal) {
          onAbort = () => reject(new LivenessIncompleteError("The face check was cancelled."));
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        }
      }),
    ]);

    const sessionId = response?.result?.session_id;
    if (!sessionId) {
      throw new LivenessIncompleteError("The face check didn't return a session. Please try again.");
    }
    return { sessionId, photoUrl: response.result.photo_url ?? "" };
  } catch (err) {
    // The SDK rejects with { status: "CANCELLED" } — a plain object, not an Error — when
    // its own close button is tapped.
    if (err && typeof err === "object" && "status" in err && (err as { status?: string }).status === "CANCELLED") {
      throw new LivenessIncompleteError("The face check was cancelled.");
    }
    if (err instanceof LivenessIncompleteError) throw err;
    throw new LivenessIncompleteError("The face check didn't finish. Please try again.");
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    removeOverlay();
  }
}
