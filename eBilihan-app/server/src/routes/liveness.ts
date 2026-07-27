import { Router } from "express";
import { config } from "../config.js";
import { faceLivenessClient } from "../lib/httpClients.js";
import { requireAuth } from "../middleware/requireAuth.js";

/**
 * Standalone "Face Liveness" REST product (v1/liveness/session, v1/liveness/result),
 * distinct from the eVerify-embedded Face Liveness Web SDK used by routes/verify.ts
 * for the loan borrower flow. This one is exposed in case eBilihan needs a liveness
 * check that ISN'T followed by an eVerify PhilSys match (see CLAUDE.md).
 */
const router = Router();
router.use(requireAuth);

router.post("/session", async (req, res) => {
  const { action, callbackUrl, delay } = req.body as { action: "redirect" | "post" | "close"; callbackUrl?: string; delay?: number };
  if (!action) return res.status(422).json({ error: "action is required" });
  try {
    const response = await faceLivenessClient.post(
      "/v1/liveness/session",
      { action, callback_url: callbackUrl, delay: delay ?? 3000 },
      { headers: { "x-api-key": config.faceLiveness.apiKey, "Content-Type": "application/json" } },
    );
    res.status(201).json(response.data);
  } catch (err) {
    res.status(502).json({ error: "Face Liveness create-session failed", detail: (err as Error).message });
  }
});

router.get("/result/:sessionToken", async (req, res) => {
  try {
    const response = await faceLivenessClient.get(`/v1/liveness/result/${req.params.sessionToken}`, {
      headers: { "x-api-key": config.faceLiveness.apiKey },
    });
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: "Face Liveness get-result failed", detail: (err as Error).message });
  }
});

export default router;
