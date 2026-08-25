import { Router } from "express";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { egovphClient } from "../lib/httpClients.js";
import { issueSessionToken } from "../lib/session.js";
import { owners, seedDemoProducts, type StoreLocation, type StoreOwner } from "../store/db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

/**
 * The citizen profile eGov SSO returns from POST /api/partner/sso_authentication.
 * Which fields are actually populated depends on what the citizen consented to share,
 * so everything except `uniqid` is treated as optional here.
 */
export type EgovphProfile = {
  uniqid: string;
  email?: string;
  mobile?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  suffix?: string | null;
  birth_date?: string;
  gender?: string;
  nationality?: string;
  photo?: string;
  address?: string;
  street?: string;
  barangay?: string;
};

/**
 * eGov SSO, both calls, exactly as documented:
 *
 *   1. POST {base}/api/token
 *        { exchange_code, scope: "SSO_AUTHENTICATION", partner_code, partner_secret }
 *        -> { access_token }   (issued by the gateway, valid 1 hour, free of charge)
 *   2. POST {base}/api/partner/sso_authentication
 *        Authorization: Bearer <access_token>, body {}
 *        -> { status, message, data: { uniqid, first_name, ... } }   (1 credit)
 *
 * The exchange_code is single-use and short-lived — redeem it immediately. It arrives
 * either from eGovPH opening our own SSO base URL with ?exchange_code=... appended, or
 * from the Login as eGov widget's onSuccess callback. Both funnel into POST /sso/login.
 */
async function resolveEgovphProfile(exchangeCode: string): Promise<EgovphProfile> {
  const tokenRes = await egovphClient.post("/api/token", {
    exchange_code: exchangeCode,
    scope: "SSO_AUTHENTICATION",
    partner_code: config.egovph.partnerCode,
    partner_secret: config.egovph.partnerSecret,
  });
  const accessToken = tokenRes.data.access_token as string;
  if (!accessToken) throw new Error("eGov SSO returned no access_token");

  const profileRes = await egovphClient.post(
    "/api/partner/sso_authentication",
    {},
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return profileRes.data.data as EgovphProfile;
}

function fullNameOf(profile: EgovphProfile): string {
  return [profile.first_name, profile.middle_name, profile.last_name, profile.suffix]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * eGovPH's integration requirement: match existing users by `uniqid`, falling back to
 * personal details (name + birthdate), then bind the uniqid so future logins go
 * straight through. New citizens are registered automatically from the profile.
 */
function findOwnerForProfile(profile: EgovphProfile): StoreOwner | undefined {
  const all = [...owners.values()];

  const byUniqid = all.find((o) => o.egovphUniqid === profile.uniqid);
  if (byUniqid) return byUniqid;

  const fullName = fullNameOf(profile).toLowerCase();
  if (!fullName || !profile.birth_date) return undefined;
  const byDetails = all.find(
    (o) => o.fullName.toLowerCase() === fullName && o.birthDate === profile.birth_date,
  );
  if (byDetails) {
    // Bind the uniqid so the next sign-in matches on the fast path above.
    byDetails.egovphUniqid = profile.uniqid;
    owners.set(byDetails.id, byDetails);
  }
  return byDetails;
}

/** A brand-new citizen: register them from the SSO profile alone. */
function registerOwnerFromProfile(profile: EgovphProfile): StoreOwner {
  const owner: StoreOwner = {
    id: randomUUID(),
    egovphUniqid: profile.uniqid,
    email: profile.email ?? "",
    mobile: profile.mobile ?? "",
    fullName: fullNameOf(profile),
    firstName: profile.first_name ?? "",
    middleName: profile.middle_name ?? "",
    lastName: profile.last_name ?? "",
    suffix: profile.suffix ?? "",
    birthDate: profile.birth_date ?? "",
    gender: profile.gender ?? "",
    photo: profile.photo ?? "",
    address: profile.address ?? "",
    // Store name and location are eBilihan's own data, not eGovPH's — collected once on
    // the onboarding screen straight after this first sign-in. Empty storeName is the
    // flag the client reads as `needsOnboarding`.
    storeName: "",
    location: null,
    createdAt: new Date().toISOString(),
  };
  owners.set(owner.id, owner);
  seedDemoProducts(owner.id);
  return owner;
}

/** Owners created before this field existed still have to pass through onboarding. */
function needsOnboarding(owner: StoreOwner): boolean {
  return !owner.storeName || !owner.location;
}

/**
 * Login as eGov / Quick start both end here. The client hands over the single-use
 * exchange_code; we redeem it, match-or-register the citizen, and issue an eBilihan
 * session JWT. There is no login screen, no password, and no OTP on our side —
 * the citizen arrives already authenticated by eGovPH.
 */
router.post("/sso/login", async (req, res) => {
  const { exchangeCode } = req.body as { exchangeCode?: string };
  if (!exchangeCode) return res.status(422).json({ error: "exchangeCode is required" });

  let profile: EgovphProfile;
  try {
    profile = await resolveEgovphProfile(exchangeCode);
  } catch (err) {
    // Pass the gateway's own status through where we can — 403 (bad/revoked partner
    // credentials), 422 (expired or already-used exchange_code) and 429 (no credits
    // remaining) all mean very different things to whoever is debugging the demo.
    const status = (err as { response?: { status?: number } }).response?.status;
    const upstream = (err as { response?: { data?: unknown } }).response?.data;
    if (status === 403) {
      return res.status(403).json({ error: "eGov SSO rejected our partner credentials", detail: upstream });
    }
    if (status === 422) {
      return res.status(422).json({ error: "This eGovPH sign-in link has expired — please sign in again", detail: upstream });
    }
    if (status === 429) {
      return res.status(429).json({ error: "eGov API quota exhausted — ask an administrator for a top-up", detail: upstream });
    }
    return res.status(502).json({ error: "eGov SSO exchange failed", detail: (err as Error).message });
  }

  if (!profile?.uniqid) {
    return res.status(502).json({ error: "eGov SSO returned a profile with no uniqid" });
  }

  const owner = findOwnerForProfile(profile) ?? registerOwnerFromProfile(profile);
  const token = issueSessionToken({ ownerId: owner.id });
  res.json({ token, owner, needsOnboarding: needsOnboarding(owner) });
});

/**
 * Probe for the Login as eGov widget: confirms our partner_code is known and approved
 * before the client bothers rendering the widget. Documented never to error — a bad or
 * revoked code simply answers `is_code_valid: 0`. Free of charge.
 */
router.get("/sso/health", async (_req, res) => {
  if (!config.egovph.baseUrl || !config.egovph.partnerCode) {
    return res.json({ ok: false, reason: "eGov SSO is not configured on this server yet" });
  }
  try {
    const response = await egovphClient.post("/api/partner/check_access", {
      partner_code: config.egovph.partnerCode,
    });
    const ok = response.data?.is_code_valid === 1;
    res.json({ ok, reason: ok ? undefined : "Partner code is unknown, revoked, or the account is unapproved" });
  } catch (err) {
    res.json({ ok: false, reason: (err as Error).message });
  }
});

/**
 * The two public values the Login as eGov widget needs in the browser: our partner_code
 * and our gateway base URL. The integration guide is explicit that partner_code is
 * "safe to expose in a browser" and that `host` is the widget's own base URL option —
 * the partner_secret and every access_token stay on this server. Serving them from here
 * rather than baking them into the bundle keeps a rotated credential a server-side
 * change, with no app rebuild.
 */
router.get("/sso/widget-config", (_req, res) => {
  res.json({
    partnerCode: config.egovph.partnerCode,
    host: config.egovph.baseUrl,
    partnerName: "eBilihan",
  });
});

/**
 * Lets the frontend verify a stored session on app boot (see authStore.hydrate()).
 * requireAuth already 401s if the owner no longer exists — e.g. right after a backend
 * restart, since `owners` is in-memory (store/db.ts) — which is exactly the "auth
 * should reset when the app restarts" behavior: the frontend's response interceptor
 * clears the stale token and bounces to /login the moment this fails.
 */
router.get("/me", requireAuth, (req, res) => {
  const owner = owners.get(req.ownerId!)!;
  res.json({ owner, needsOnboarding: needsOnboarding(owner) });
});

/**
 * Onboarding: the only two things eGovPH cannot give us. Everything identifying the
 * citizen (name, birthdate, address, email, mobile) comes from the SSO profile and is
 * deliberately not editable here — per eGovPH's requirements, profile updates happen
 * in eGovPH, not on the partner site.
 */
router.post("/onboarding", requireAuth, (req, res) => {
  const { storeName, location } = req.body as { storeName?: string; location?: StoreLocation };
  const trimmed = storeName?.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 60) {
    return res.status(422).json({ error: "Store name must be between 2 and 60 characters" });
  }
  if (!location?.regionCode || !location.provinceCode || !location.cityCode || !location.barangayCode) {
    return res.status(422).json({ error: "Complete the full location (region, province, city, barangay)" });
  }

  const owner = owners.get(req.ownerId!)!;
  owner.storeName = trimmed;
  owner.location = location;
  owners.set(owner.id, owner);

  res.json({ owner, needsOnboarding: false });
});

export default router;
