const PH_MOBILE_RE = /^(?:\+63|63|0)?9\d{9}$/;

/** Normalizes "09171234567" / "9171234567" / "639171234567" / "+639171234567" (with
 * optional spaces/dashes) to canonical E.164 "+639171234567". Returns null if invalid. */
export function normalizePhMobile(raw: string): string | null {
  const stripped = raw.replace(/[\s-]/g, "");
  if (!PH_MOBILE_RE.test(stripped)) return null;
  const digits = stripped.replace(/^\+?63|^0/, "");
  return `+63${digits}`;
}
