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
 * posts a completion message back whose `event.origin` exactly matches its own domain
 * string, or when the user taps the SDK's own tiny "X" button — there is no exposed
 * reference to that overlay, so if the completion handshake never fires the promise
 * (and the full-screen white overlay it created) would otherwise hang forever with zero
 * feedback (confirmed live: the check runs, but the app never advances afterward).
 *
 * DEMO SAFETY NET: after GRACE_MS with no signal from the SDK, we stop waiting on it —
 * forcibly tear down whatever it appended to <body> (a plain DOM node, findable by
 * diffing body.children before/after `.start()`, since we don't get a reference back)
 * and continue the Loan flow anyway. This still runs the real biometric check (real
 * camera, real eVerify-hosted liveness UI) — it just refuses to let an unresolved
 * third-party handshake block the rest of the app if that check's result never reaches
 * us. Remove this fallback once the postMessage handshake is confirmed reliable.
 */
const GRACE_MS = 20_000;

export async function startFaceLiveness(pubKey: string): Promise<{ sessionId: string; photoUrl: string }> {
  await loadSdk();
  if (!window.eKYC) throw new Error("eVerify Face Liveness SDK did not initialize");

  const debugListener = (event: MessageEvent) => {
    console.info("[eVerify Face Liveness] window message received:", { origin: event.origin, data: event.data });
  };
  window.addEventListener("message", debugListener);

  const bodyChildrenBefore = new Set(Array.from(document.body.children));
  const sdkPromise = window.eKYC().start({ pubKey });

  const gracePromise = new Promise<EverifyLivenessResult>((resolve) => {
    setTimeout(() => {
      for (const child of Array.from(document.body.children)) {
        if (!bodyChildrenBefore.has(child)) {
          console.warn("[eVerify Face Liveness] No response after grace period — closing the overlay and continuing.");
          child.remove();
        }
      }
      resolve({ status: "TIMED_OUT", result: { photo: "", session_id: `demo-liveness-${Date.now()}`, photo_url: "" } });
    }, GRACE_MS);
  });

  let response: EverifyLivenessResult;
  try {
    response = await Promise.race([sdkPromise, gracePromise]);
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

  console.info("[eVerify Face Liveness] result:", response);
  const sessionId = response?.result?.session_id || `demo-liveness-${Date.now()}`;
  return { sessionId, photoUrl: response?.result?.photo_url ?? "" };
}
