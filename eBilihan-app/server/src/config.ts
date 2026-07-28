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

  // eGov SSO (eGovPH) — base_url + partner-code + partner-secret,
  // as shown under "Your API credentials" > "eGov SSO" on the eGOV APIs dashboard.
  egovph: {
    baseUrl: process.env.EGOVPH_BASE_URL ?? "",
    partnerCode: required("EGOVPH_PARTNER_CODE"),
    partnerSecret: required("EGOVPH_PARTNER_SECRET"),
  },

  // eVerify (NationalID eVerify) — client-id + client-secret + pubkey.
  // pubkey is used client-side by the eVerify Face Liveness Web SDK.
  everify: {
    baseUrl: process.env.EVERIFY_BASE_URL ?? "",
    clientId: required("EVERIFY_CLIENT_ID"),
    clientSecret: required("EVERIFY_CLIENT_SECRET"),
    pubKey: process.env.EVERIFY_PUBKEY ?? "",
  },

  // eMessage — single access-token, sent as X-EMESSAGE-Auth.
  emessage: {
    baseUrl: process.env.EMESSAGE_BASE_URL ?? "",
    apiToken: required("EMESSAGE_API_TOKEN"),
  },

  // eGovPay — api-key (sent as X-eGovPay-Token) + settlement-template-uuid.
  // Prefix apiKey with "test_" while integrating so no live funds move.
  egovpay: {
    baseUrl: process.env.EGOVPAY_BASE_URL ?? "",
    apiToken: required("EGOVPAY_API_TOKEN"),
    settlementTemplateUuid: process.env.EGOVPAY_SETTLEMENT_TEMPLATE_UUID ?? "",
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
  },

  // Demo sign-in number standing in for a real eGovPH-linked mobile (see
  // routes/auth.ts DEMO_EGOVPH_PROFILE). MUST exactly match VITE_DEMO_MOBILE_E164 in
  // the frontend's .env, or first-time login 404s ("No eBilihan store registered").
  demoMobileE164: process.env.DEMO_MOBILE_E164 || "+639060585188",
};
