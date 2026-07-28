/**
 * Loader for eVerify's own embedded "Face Liveness Web SDK" — per
 * eBilihanReference/eGOV API/eVerify/integration.png, this is a client-side <script>
 * that resolves a face_liveness_session_id which is then sent (via our backend) to
 * eVerify's QR Verify / Verify Personal Information endpoints for the strict
 * identification step in the Loan Management flow.
 *
 * This is deliberately separate from src/api/ (which only calls our own backend):
 * the SDK talks directly to eVerify's liveness-capture domain from the device, and
 * only the resulting session_id — never a secret — ever reaches our backend.
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
      script.onerror = () => reject(new Error("Failed to load eVerify Face Liveness SDK"));
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}

/**
 * The SDK's own promise only settles when its hosted iframe (liveness.everify.gov.ph)
 * either posts a completion message back or the user taps its own "X" close button —
 * there's no way to reach into that iframe from here, so if that handshake never fires
 * (e.g. the hosted page gets stuck) the promise would otherwise hang forever behind a
 * full-screen overlay with no feedback. This timeout turns that into a visible error.
 */
const LIVENESS_TIMEOUT_MS = 120_000;

export async function startFaceLiveness(pubKey: string): Promise<{ sessionId: string; photoUrl: string }> {
  await loadSdk();
  if (!window.eKYC) throw new Error("eVerify Face Liveness SDK did not initialize");

  // Diagnostic only: the SDK's own listener silently ignores any postMessage whose
  // origin doesn't exactly match "https://liveness.everify.gov.ph", so if the hosted
  // page finishes but the handshake doesn't line up, the SDK's promise just hangs with
  // no signal at all. Logging every message here — regardless of origin — makes that
  // "it never completed" case visible in devtools instead of a silent stuck white screen.
  const debugListener = (event: MessageEvent) => {
    console.info("[eVerify Face Liveness] window message received:", { origin: event.origin, data: event.data });
  };
  window.addEventListener("message", debugListener);

  let response: EverifyLivenessResult;
  try {
    response = await Promise.race([
      window.eKYC().start({ pubKey }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Face Liveness check timed out. If the camera window is still open, close it and try again.")),
          LIVENESS_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    window.removeEventListener("message", debugListener);
    // The SDK rejects with { status: "CANCELLED", result: undefined } (not an Error) when
    // its own "X" button is tapped — normalize that into a real, message-bearing Error.
    if (err && typeof err === "object" && "status" in err && (err as { status?: string }).status === "CANCELLED") {
      throw new Error("Face Liveness check was cancelled.");
    }
    throw err;
  }
  window.removeEventListener("message", debugListener);

  console.info("[eVerify Face Liveness] SDK result:", response);
  const sessionId = response?.result?.session_id;
  if (!sessionId) {
    throw new Error("Face Liveness didn't return a valid session — please try again.");
  }
  return { sessionId, photoUrl: response.result.photo_url };
}
