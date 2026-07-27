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

export async function startFaceLiveness(pubKey: string): Promise<{ sessionId: string; photoUrl: string }> {
  await loadSdk();
  if (!window.eKYC) throw new Error("eVerify Face Liveness SDK did not initialize");
  const response = await window.eKYC().start({ pubKey });
  return { sessionId: response.result.session_id, photoUrl: response.result.photo_url };
}
