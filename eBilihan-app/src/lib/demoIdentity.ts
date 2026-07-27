/**
 * Hardcoded demo mobile number, standing in for a real eGovPH-linked number while
 * there's no eGovPH authorize/redirect URL to obtain one from a real SSO round-trip
 * (see CLAUDE.md). The matching demo eGovPH profile lives server-side in
 * server/src/routes/auth.ts (DEMO_EGOVPH_PROFILE) and is fetched via
 * GET /auth/egovph/demo-profile — this constant only needs to match its `mobile` field.
 */
export const DEMO_MOBILE_E164 = "+639060585188";

/** "+639060585188" -> "+63906****188" (keeps enough to recognize the number, masks the rest). */
export function maskMobile(mobile: string): string {
  if (mobile.length <= 6) return mobile;
  const head = mobile.slice(0, mobile.length - 6);
  const tail = mobile.slice(-3);
  return `${head}${"*".repeat(mobile.length - head.length - tail.length)}${tail}`;
}
