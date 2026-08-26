import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // eslint-disable-next-line no-console
    console.warn(`[config] Missing env var ${name} — related routes will fail until it is set.`);
    return "";
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // `||` (not `??`) on purpose: .env.example ships JWT_SECRET blank ("JWT_SECRET="),
  // which reads as an empty string, not undefined — `??` would never fall back and
  // jsonwebtoken's sign() throws "secretOrPrivateKey must have a value".
  jwtSecret: process.env.JWT_SECRET || "dev-only-insecure-secret-change-me",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",

  /**
   * Public origins used to build the redirect/callback URLs handed to eGovPay and Face
   * Liveness. Both APIs type those fields as `url`, so they must be absolute HTTPS URLs
   * reachable from the public internet — a custom scheme like `ebilihan://` is not
   * something those gateways accept, and localhost is unreachable from them.
   *
   *  - appBaseUrl    where the *citizen's browser* lands afterwards (the Vercel web app)
   *  - serverBaseUrl where *the gateway's own server* POSTs status callbacks (this service)
   */
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:5173",
  serverBaseUrl: process.env.SERVER_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,

  // eGov SSO — base_url + partner_code + partner_secret, issued together on the API
  // Developer Portal's "eGov SSO > Credentials" tab. partner_code is safe in a browser
  // (the Login as eGov widget needs it there); partner_secret never is.
  egovph: {
    baseUrl: process.env.EGOVPH_BASE_URL ?? "",
    partnerCode: required("EGOVPH_PARTNER_CODE"),
    partnerSecret: required("EGOVPH_PARTNER_SECRET"),
  },

  // eVerify (NationalID eVerify) — client_id + client_secret + the Face Liveness Web
  // SDK's public key (the portal's Variables panel labels this one `public_api_key`).
  everify: {
    baseUrl: process.env.EVERIFY_BASE_URL ?? "",
    clientId: required("EVERIFY_CLIENT_ID"),
    clientSecret: required("EVERIFY_CLIENT_SECRET"),
    pubKey: process.env.EVERIFY_PUBKEY ?? "",
  },

  // eMessage — single access token, sent as X-EMESSAGE-Auth.
  emessage: {
    baseUrl: process.env.EMESSAGE_BASE_URL ?? "",
    apiToken: required("EMESSAGE_API_TOKEN"),
  },

  // eGovPay — merchant token (sent as X-eGovPay-Token, and doubling as the HMAC signing
  // key for `digest`) + the settlement template UUID created under eGovPAY > Templates.
  // Prefix the token with "test_" while integrating so no live funds move.
  egovpay: {
    baseUrl: process.env.EGOVPAY_BASE_URL ?? "",
    apiToken: required("EGOVPAY_API_TOKEN"),
    settlementTemplateUuid: process.env.EGOVPAY_SETTLEMENT_TEMPLATE_UUID ?? "",
  },

  /**
   * Opt-in test affordances. **Must be off in production**, and are: this reads true only
   * when ALLOW_TEST_VERIFICATION is exactly "true", so an unset or misspelled value is
   * disabled rather than enabled.
   *
   * Currently gates POST /loans/dev/seed-verification, which mints a verification record
   * for an obviously fictional borrower so the downstream flow — OTP, loan creation, the
   * agreement PDF, eMessage — can be exercised repeatedly without a real ID, a real face,
   * and a credit per attempt.
   *
   * It does NOT weaken the real path: nothing about `recordVerification` changes, and with
   * the flag off the route does not exist at all.
   */
  allowTestVerification: process.env.ALLOW_TEST_VERIFICATION === "true",

  loans: {
    /**
     * Loans at or above this amount (PHP) require the STORE OWNER to pass a standalone
     * Face Liveness check before the loan is recorded — distinct from the borrower's own
     * eVerify match, and enforced server-side in routes/loans.ts.
     *
     * Typical sari-sari store credit ("pautang") runs ₱50–₱500. ₱1,000 is where a loan
     * becomes unusual enough to be worth re-confirming that the owner is personally
     * present, rather than someone else holding an unlocked phone.
     *
     * This is eBilihan's own lending policy. No eGov API imposes it.
     */
    livenessThresholdPhp: Number(process.env.LOAN_LIVENESS_THRESHOLD_PHP ?? 1000),
  },

  // eReport — access_code exchanged for a short-lived integration access_token.
  ereport: {
    baseUrl: process.env.EREPORT_BASE_URL ?? "",
    accessCode: required("EREPORT_ACCESS_CODE"),
  },

  // Standalone Face Liveness REST product (v1/liveness/session, v1/liveness/result).
  // Distinct from eVerify's own embedded Face Liveness Web SDK — see CLAUDE.md.
  faceLiveness: {
    baseUrl: process.env.FACE_LIVENESS_BASE_URL ?? "",
    apiKey: process.env.FACE_LIVENESS_API_KEY ?? "",
    /**
     * The product's own documented security threshold: accept a session only when the
     * status is exactly "SUCCEEDED" AND confidence_score is >= 95.0 (out of 100.0).
     * Below that, the docs require rejecting the session as high-risk and retrying.
     */
    minConfidenceScore: 95,
  },
};
