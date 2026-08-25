import { Router } from "express";
import { config } from "../config.js";
import { faceLivenessClient } from "../lib/httpClients.js";
import { sendUpstreamError } from "../lib/upstreamError.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { passedLivenessChecks, pruneExpired } from "../store/db.js";

/**
 * How long a passed owner face check stays usable. Short on purpose: it is evidence that
 * someone was in front of a camera just now, and it authorises exactly one high-value loan.
 */
const LIVENESS_PASS_TTL_MS = 10 * 60_000;

/**
 * Standalone "Face Liveness" REST product (v1/liveness/session, v1/liveness/result),
 * distinct from the eVerify-embedded Face Liveness Web SDK used by routes/verify.ts for
 * the loan borrower flow. Its session tokens are a different namespace — a token minted
 * here is not accepted by eVerify's /api/query* endpoints, and vice versa. See CLAUDE.md.
 *
 * eBilihan uses this one for the store owner's own onboarding liveness check, where
 * there is no PhilSys match to follow.
 */
const router = Router();
router.use(requireAuth);

router.post("/session", async (req, res) => {
  const { action = "redirect", callbackUrl, delay } = req.body as {
    action?: "redirect" | "post" | "close";
    callbackUrl?: string;
    delay?: number;
  };
  if (!config.faceLiveness.apiKey || !config.faceLiveness.baseUrl) {
    return res.status(503).json({ error: "Face Liveness is not configured on this server" });
  }
  // callback_url is required by the API whenever action is `redirect`. Default it to the
  // onboarding screen so the citizen lands back where they started.
  const resolvedCallback = callbackUrl ?? `${config.appBaseUrl}/onboarding?liveness=done`;

  try {
    const response = await faceLivenessClient.post(
      "/v1/liveness/session",
      {
        action,
        ...(action === "redirect" ? { callback_url: resolvedCallback } : {}),
        delay: delay ?? 3000,
      },
      { headers: { "x-api-key": config.faceLiveness.apiKey, "Content-Type": "application/json" } },
    );
    res.status(201).json(response.data);
  } catch (err) {
    sendUpstreamError(res, err, "Starting the face check");
  }
});

/**
 * Applies the threshold the Face Liveness docs themselves prescribe rather than handing
 * a raw score to the client to interpret: the status must be exactly "SUCCEEDED" AND
 * confidence_score must be >= 95.0 out of 100.0. Anything below that is to be treated as
 * high-risk (a possible spoof) and retried.
 *
 * The decision is made here, server-side, on purpose. A client that receives a bare
 * score can be modified to ignore it; a client that receives `passed: false` has nothing
 * to reinterpret.
 */
router.get("/result/:sessionToken", async (req, res) => {
  const sessionToken = req.params.sessionToken;
  try {
    const response = await faceLivenessClient.get(`/v1/liveness/result/${sessionToken}`, {
      headers: { "x-api-key": config.faceLiveness.apiKey },
    });
    const { status, confidence_score: confidenceScore, reference_image_url: referenceImageUrl } =
      response.data as { status: string; confidence_score: number; reference_image_url?: string };

    const passed = status === "SUCCEEDED" && Number(confidenceScore) >= config.faceLiveness.minConfidenceScore;

    // A passed check is recorded here, server-side, so the high-value loan gate can
    // require one. Returning only a boolean to the client would leave the gate advisory —
    // a client could simply not call this, or lie about the answer.
    if (passed) {
      pruneExpired();
      passedLivenessChecks.set(sessionToken, {
        ownerId: req.ownerId!,
        expiresAtMs: Date.now() + LIVENESS_PASS_TTL_MS,
      });
    }

    res.json({
      passed,
      status,
      confidenceScore,
      referenceImageUrl,
      threshold: config.faceLiveness.minConfidenceScore,
      // Handed back only on success; it is what a loan request presents as proof.
      livenessToken: passed ? sessionToken : undefined,
      reason: passed
        ? undefined
        : status !== "SUCCEEDED"
          ? `The face check didn't succeed (status: ${status}). Please try again.`
          : `Confidence ${confidenceScore} is below the required ${config.faceLiveness.minConfidenceScore}. Please try again.`,
    });
  } catch (err) {
    sendUpstreamError(res, err, "The face check");
  }
});

export default router;
