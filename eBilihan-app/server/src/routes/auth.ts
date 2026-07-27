import { Router } from "express";
import { customAlphabet } from "nanoid";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { egovphClient } from "../lib/httpClients.js";
import { issueSessionToken } from "../lib/session.js";
import { sendSms } from "../lib/emessage.js";
import { owners, pendingOtps, seedDemoProducts, type StoreLocation, type StoreOwner } from "../store/db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
const generateOtp = customAlphabet("0123456789", 6);

type EgovphProfile = {
  uniqid: string;
  email: string;
  mobile: string;
  first_name: string;
  last_name: string;
};

/**
 * Hardcoded demo identity standing in for a real eGovPH SSO profile fetch. This exists
 * because eGovPH's authorize/redirect URL (the thing that would hand back a real
 * exchange_code) was never available in the reviewed reference docs — see CLAUDE.md.
 * GET /egovph/demo-profile below returns exactly this, and both "Login via eGovPH SSO"
 * and "Continue with eGovPH" (registration) use it in place of a real SSO round-trip.
 * Replace this whole block — and switch the routes below back to resolveEgovphProfile —
 * once EGOVPH_AUTHORIZE_URL is confirmed and a deep-link callback is wired up.
 */
const DEMO_EGOVPH_PROFILE: EgovphProfile = {
  uniqid: "DEMO-EGOVPH-0001",
  first_name: "JOSH HARVEY",
  last_name: "CRISOLOGO",
  email: "jharveycrisologo@gmail.com",
  mobile: "+639060585188",
};

/**
 * Placeholder used only when /login/otp/confirm auto-provisions the demo store (see
 * below) — there's no in-memory database, so every backend restart wipes `owners`, and
 * making every fresh login require a full Register-first round-trip was pure friction
 * for a single-demo-identity setup. Real registration (with a real Store Name + PSGC
 * Location) still overwrites this the moment someone actually runs it.
 */
const DEMO_DEFAULT_STORE_NAME = "My Sari-Sari Store";
const DEMO_DEFAULT_LOCATION: StoreLocation = {
  regionCode: "",
  regionName: "Not set yet",
  provinceCode: "",
  provinceName: "",
  cityCode: "",
  cityName: "",
  barangayCode: "",
  barangayName: "",
};

/**
 * Exchanges an eGovPH SSO exchange_code for an access_token, then resolves the
 * authenticated citizen's profile. Mirrors eGOV APIs > eGovPH > "Generates Access
 * Token" (POST /api/token) followed by "SSO Authentication" (POST /api/partner/sso_authentication).
 *
 * Not currently called by any route below (see DEMO_EGOVPH_PROFILE) — kept ready for
 * when EGOVPH_AUTHORIZE_URL is known, at which point /sso/login becomes reachable again.
 */
async function resolveEgovphProfile(exchangeCode: string): Promise<EgovphProfile> {
  const tokenRes = await egovphClient.post("/api/token", {
    exchange_code: exchangeCode,
    scope: "SSO_AUTHENTICATION",
    partner_code: config.egovph.partnerCode,
    partner_secret: config.egovph.partnerSecret,
  });
  const accessToken = tokenRes.data.access_token as string;

  const profileRes = await egovphClient.post(
    "/api/partner/sso_authentication",
    {},
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return profileRes.data.data as EgovphProfile;
}

function findOwnerByUniqid(uniqid: string): StoreOwner | undefined {
  return [...owners.values()].find((o) => o.egovphUniqid === uniqid);
}

function findOwnerByMobile(mobile: string): StoreOwner | undefined {
  return [...owners.values()].find((o) => o.mobile === mobile);
}

/** Powers both "Login via eGovPH SSO" and registration's "Continue with eGovPH" button. */
router.get("/egovph/demo-profile", (_req, res) => {
  res.json({ profile: DEMO_EGOVPH_PROFILE });
});

/**
 * Lets the frontend verify a stored session on app boot (see authStore.hydrate()).
 * requireAuth already 401s if the owner no longer exists — e.g. right after a backend
 * restart, since `owners` is in-memory (store/db.ts) — which is exactly the "auth
 * should reset when the app restarts" behavior: the frontend's response interceptor
 * clears the stale token and bounces to /login the moment this fails.
 */
router.get("/me", requireAuth, (req, res) => {
  res.json({ owner: owners.get(req.ownerId!) });
});

/** Existing eBilihan store owners: log in with an already-linked eGovPH account (real SSO — currently unreachable from the UI, see above). */
router.post("/sso/login", async (req, res) => {
  const { exchangeCode } = req.body as { exchangeCode?: string };
  if (!exchangeCode) return res.status(422).json({ error: "exchangeCode is required" });

  try {
    const profile = await resolveEgovphProfile(exchangeCode);
    const owner = findOwnerByUniqid(profile.uniqid);
    if (!owner) {
      return res.status(404).json({ error: "No eBilihan store linked to this eGovPH account yet", profile });
    }
    const token = issueSessionToken({ ownerId: owner.id });
    res.json({ token, owner });
  } catch (err) {
    res.status(502).json({ error: "eGovPH SSO exchange failed", detail: (err as Error).message });
  }
});

/**
 * Mobile-number + eMessage OTP login: a stand-in for real eGovPH SSO login while
 * EGOVPH_AUTHORIZE_URL is unknown (see CLAUDE.md). Sends the code regardless of
 * whether a store already exists for this number — /login/otp/confirm below decides
 * whether that means "log in" or "auto-provision the demo store".
 */
router.post("/login/otp/start", async (req, res) => {
  const { mobile } = req.body as { mobile?: string };
  if (!mobile) return res.status(422).json({ error: "mobile is required" });

  const otp = generateOtp();
  pendingOtps.set(mobile, { otp, expiresAtMs: Date.now() + 5 * 60_000 });
  try {
    await sendSms(mobile, `Your eBilihan login code is ${otp}. It expires in 5 minutes.`);
    res.json({ message: `OTP sent to ${mobile}` });
  } catch (err) {
    res.status(502).json({ error: "Could not send OTP via eMessage", detail: (err as Error).message });
  }
});

router.post("/login/otp/confirm", async (req, res) => {
  const { mobile, otp } = req.body as { mobile?: string; otp?: string };
  if (!mobile || !otp) return res.status(422).json({ error: "mobile and otp are required" });

  const pending = pendingOtps.get(mobile);
  if (!pending || pending.otp !== otp || pending.expiresAtMs < Date.now()) {
    return res.status(401).json({ error: "Invalid or expired OTP" });
  }
  pendingOtps.delete(mobile);

  let owner = findOwnerByMobile(mobile);
  if (!owner) {
    // Only the demo identity auto-provisions on first login — a real mobile number
    // (once real eGovPH SSO exists) should still have to go through /register/*.
    if (mobile !== DEMO_EGOVPH_PROFILE.mobile) {
      return res.status(404).json({ error: "No eBilihan store registered with that mobile number" });
    }
    owner = {
      id: randomUUID(),
      egovphUniqid: DEMO_EGOVPH_PROFILE.uniqid,
      email: DEMO_EGOVPH_PROFILE.email,
      mobile: DEMO_EGOVPH_PROFILE.mobile,
      fullName: `${DEMO_EGOVPH_PROFILE.first_name} ${DEMO_EGOVPH_PROFILE.last_name}`.trim(),
      storeName: DEMO_DEFAULT_STORE_NAME,
      location: DEMO_DEFAULT_LOCATION,
      createdAt: new Date().toISOString(),
    };
    owners.set(owner.id, owner);
    seedDemoProducts(owner.id);
  }

  const token = issueSessionToken({ ownerId: owner.id });
  res.json({ token, owner });
});

/**
 * Step 1 of registration: the frontend has already fetched `profile` from
 * GET /egovph/demo-profile (or, once real SSO exists, resolved it there) — this just
 * validates it isn't already linked, then sends an OTP via eMessage to prove the person
 * completing eBilihan setup on this device controls that number.
 */
router.post("/register/start", async (req, res) => {
  const { profile, storeName, location } = req.body as {
    profile?: EgovphProfile;
    storeName?: string;
    location?: StoreLocation;
  };
  if (!profile || !storeName || !location) {
    return res.status(422).json({ error: "profile, storeName, and location are required" });
  }
  if (findOwnerByUniqid(profile.uniqid)) {
    return res.status(409).json({ error: "This eGovPH account is already linked to an eBilihan store" });
  }

  const otp = generateOtp();
  pendingOtps.set(profile.mobile, { otp, expiresAtMs: Date.now() + 5 * 60_000 });
  try {
    await sendSms(profile.mobile, `Your eBilihan verification code is ${otp}. It expires in 5 minutes.`);
    res.json({
      message: `OTP sent to ${profile.mobile}`,
      pendingRegistration: { profile, storeName, location },
    });
  } catch (err) {
    res.status(502).json({ error: "Could not send OTP via eMessage", detail: (err as Error).message });
  }
});

/** Step 2 of registration: confirm the OTP and create the local store-owner record. */
router.post("/register/confirm", async (req, res) => {
  const { profile, storeName, location, otp } = req.body as {
    profile?: EgovphProfile;
    storeName?: string;
    location?: StoreLocation;
    otp?: string;
  };
  if (!profile || !storeName || !location || !otp) {
    return res.status(422).json({ error: "profile, storeName, location, and otp are required" });
  }

  const pending = pendingOtps.get(profile.mobile);
  if (!pending || pending.otp !== otp || pending.expiresAtMs < Date.now()) {
    return res.status(401).json({ error: "Invalid or expired OTP" });
  }
  pendingOtps.delete(profile.mobile);

  const owner: StoreOwner = {
    id: randomUUID(),
    egovphUniqid: profile.uniqid,
    email: profile.email,
    mobile: profile.mobile,
    fullName: `${profile.first_name} ${profile.last_name}`.trim(),
    storeName,
    location,
    createdAt: new Date().toISOString(),
  };
  owners.set(owner.id, owner);
  seedDemoProducts(owner.id);

  const token = issueSessionToken({ ownerId: owner.id });
  res.status(201).json({ token, owner });
});

export default router;
