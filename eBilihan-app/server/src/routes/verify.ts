import { Router } from "express";
import { config } from "../config.js";
import { everifyClient } from "../lib/httpClients.js";
import { getCachedToken } from "../lib/tokenCache.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

/** eVerify > Authenticate (Generate Access Token): POST /api/auth. */
async function getEverifyAccessToken(): Promise<string> {
  return getCachedToken("everify", async () => {
    const res = await everifyClient.post("/api/auth", {
      client_id: config.everify.clientId,
      client_secret: config.everify.clientSecret,
    });
    const { access_token, expires_at } = res.data.data as { access_token: string; expires_at: string };
    return { token: access_token, expiresAtMs: Number(expires_at) * 1000 };
  });
}

/** So the mobile app can call window.eKYC().start({ pubKey }) without shipping the pubkey in the bundle. */
router.get("/pubkey", (_req, res) => {
  res.json({ pubKey: config.everify.pubKey });
});

/** Decodes a scanned National ID QR value without a biometric match (eVerify > QR Check). */
router.post("/qr-check", async (req, res) => {
  const { value } = req.body as { value: string };
  if (!value) return res.status(422).json({ error: "value is required" });
  try {
    const accessToken = await getEverifyAccessToken();
    const response = await everifyClient.post(
      "/api/query/qr/check",
      { value },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: "eVerify QR check failed", detail: (err as Error).message });
  }
});

/**
 * Full identity verification: QR value + face_liveness_session_id (from the eVerify
 * Face Liveness Web SDK running client-side) matched against PhilSys (eVerify > QR Verify).
 */
router.post("/qr-verify", async (req, res) => {
  const { value, faceLivenessSessionId } = req.body as { value: string; faceLivenessSessionId: string };
  if (!value || !faceLivenessSessionId) {
    return res.status(422).json({ error: "value and faceLivenessSessionId are required" });
  }
  try {
    const accessToken = await getEverifyAccessToken();
    const response = await everifyClient.post(
      "/api/query/qr",
      { value, face_liveness_session_id: faceLivenessSessionId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: "eVerify QR verify failed", detail: (err as Error).message });
  }
});

/** Demographic + biometric verification without a QR code (eVerify > Verify Personal Information). */
router.post("/personal", async (req, res) => {
  const { firstName, middleName, lastName, suffix, birthDate, faceLivenessSessionId } = req.body as {
    firstName: string;
    middleName?: string;
    lastName: string;
    suffix?: string;
    birthDate: string;
    faceLivenessSessionId: string;
  };
  if (!firstName || !lastName || !birthDate || !faceLivenessSessionId) {
    return res.status(422).json({ error: "firstName, lastName, birthDate, and faceLivenessSessionId are required" });
  }
  try {
    const accessToken = await getEverifyAccessToken();
    const response = await everifyClient.post(
      "/api/query",
      {
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        suffix,
        birth_date: birthDate,
        face_liveness_session_id: faceLivenessSessionId,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: "eVerify verify failed", detail: (err as Error).message });
  }
});

export default router;
