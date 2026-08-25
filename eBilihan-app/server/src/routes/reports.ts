import { Router } from "express";
import { config } from "../config.js";
import { ereportClient } from "../lib/httpClients.js";
import { sendUpstreamError } from "../lib/upstreamError.js";
import { getCachedToken } from "../lib/tokenCache.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { owners } from "../store/db.js";

const router = Router();
router.use(requireAuth);

/** eReport > Generate Token: exchanges the pre-issued access_code for a short-lived integration access_token. */
async function getEreportIntegrationToken(): Promise<string> {
  return getCachedToken("ereport", async () => {
    const res = await ereportClient.post("/api/integration/token", { access_code: config.ereport.accessCode });
    const { access_token, expires_at } = res.data as { access_token: string; expires_at: string };
    return { token: access_token, expiresAtMs: new Date(expires_at).getTime() };
  });
}

/** In-memory cache of report_view_token per owner, obtained via /reports/otp/confirm. */
const reportViewTokens = new Map<string, string>();

router.post("/otp/request", async (req, res) => {
  const { email } = req.body as { email: string };
  if (!email) return res.status(422).json({ error: "email is required" });
  try {
    const integrationToken = await getEreportIntegrationToken();
    const response = await ereportClient.post(
      "/api/integration/verify/request",
      { email },
      { headers: { Authorization: `Bearer ${integrationToken}` } },
    );
    res.json(response.data);
  } catch (err) {
    sendUpstreamError(res, err, "Sending your verification code");
  }
});

router.post("/otp/confirm", async (req, res) => {
  const { email, otp } = req.body as { email: string; otp: string };
  if (!email || !otp) return res.status(422).json({ error: "email and otp are required" });
  try {
    const integrationToken = await getEreportIntegrationToken();
    const response = await ereportClient.post(
      "/api/integration/verify/confirm",
      { email, otp },
      { headers: { Authorization: `Bearer ${integrationToken}` } },
    );
    const reportViewToken = response.data.report_view_token as string;
    reportViewTokens.set(req.ownerId!, reportViewToken);
    res.json(response.data);
  } catch (err) {
    sendUpstreamError(res, err, "Confirming your verification code");
  }
});

/**
 * Files a complaint with eReport.
 *
 * The complainant's identity is read from the signed-in owner record — which is itself
 * mirrored from their eGovPH SSO profile and read-only — and never from the request body.
 * Previously the client supplied name, mobile, email and gender directly, which meant
 * anyone with a session could file an official complaint under an invented identity
 * **using our eReport credential**. The client says what happened; the server says who is
 * saying it.
 *
 * `gender` is the one exception, and only as a fallback: eReport requires it, and eGovPH
 * omits it when the citizen didn't consent to share it.
 */
router.post("/", async (req, res) => {
  const owner = owners.get(req.ownerId!)!;
  const body = req.body as {
    gender?: string;
    reportType: string;
    subject: string;
    message: string;
    evidences?: string[];
    regionCode: string;
    provinceCode: string;
    municipalityCode: string;
    barangayCode: string;
    latitude?: string;
    longitude?: string;
  };

  const gender = owner.gender || body.gender;
  if (!gender) return res.status(422).json({ error: "gender is required" });
  if (!body.reportType || !body.subject || !body.message) {
    return res.status(422).json({ error: "reportType, subject, and message are required" });
  }
  if (!body.regionCode || !body.provinceCode || !body.municipalityCode || !body.barangayCode) {
    return res.status(422).json({ error: "A complete incident location is required" });
  }
  if (!owner.mobile || !owner.email) {
    return res.status(422).json({ error: "Your eGovPH account has no mobile number or email on file" });
  }

  try {
    const integrationToken = await getEreportIntegrationToken();
    const response = await ereportClient.post(
      "/api/integration/submit_complaint",
      {
        mobile: owner.mobile,
        first_name: owner.firstName || owner.fullName,
        last_name: owner.lastName || owner.fullName,
        gender,
        complainant_email: owner.email,
        report_type: body.reportType,
        subject: body.subject,
        message: body.message,
        evidences: body.evidences ?? [],
        region_code: body.regionCode,
        province_code: body.provinceCode,
        municipality_code: body.municipalityCode,
        barangay_code: body.barangayCode,
        latitude: body.latitude,
        longitude: body.longitude,
      },
      { headers: { Authorization: `Bearer ${integrationToken}` } },
    );
    res.status(201).json(response.data);
  } catch (err) {
    sendUpstreamError(res, err, "Filing your report");
  }
});

router.get("/", async (req, res) => {
  const reportViewToken = reportViewTokens.get(req.ownerId!);
  if (!reportViewToken) return res.status(401).json({ error: "Confirm OTP via /reports/otp/confirm first" });
  try {
    const response = await ereportClient.get("/api/integration/reports", {
      headers: { "X-EReport-View-Token": reportViewToken },
      params: { q: req.query.q, page: req.query.page, limit: req.query.limit },
    });
    res.json(response.data);
  } catch (err) {
    sendUpstreamError(res, err, "Loading your reports");
  }
});

/**
 * eReport's own location dataset — NOT the same codes as PSGC Cloud (src/routes/locations.ts).
 * Confirmed live (2026-07-28): submit_complaint rejects PSGC Cloud's codes outright
 * ("Region code does not exist", etc.) because eReport keeps its own PSGC-derived code
 * list with different numbering (e.g. 9-digit "010000000" here vs PSGC Cloud's 10-digit
 * "0100000000" for the same region). These endpoints were named in the reference
 * screenshots' sidebar ("Datasets") but never opened — found by probing
 * /api/integration/datasets/{regions,provinces,municipalities,barangays,report_types}
 * against the real eReport API with a valid integration token.
 */
type JsonApiItem = { id: string; attributes: Record<string, unknown> };
function unwrapJsonApi(data: { data: JsonApiItem[] }): { code: string; name: string }[] {
  return data.data.map((item) => ({ code: item.id, name: String(item.attributes.name) }));
}

router.get("/datasets/regions", async (_req, res) => {
  try {
    const integrationToken = await getEreportIntegrationToken();
    const response = await ereportClient.get("/api/integration/datasets/regions", {
      headers: { Authorization: `Bearer ${integrationToken}` },
    });
    res.json(unwrapJsonApi(response.data));
  } catch (err) {
    sendUpstreamError(res, err, "Loading regions");
  }
});

router.get("/datasets/provinces", async (req, res) => {
  try {
    const integrationToken = await getEreportIntegrationToken();
    const response = await ereportClient.get("/api/integration/datasets/provinces", {
      headers: { Authorization: `Bearer ${integrationToken}` },
      params: { region_code: req.query.regionCode },
    });
    res.json(unwrapJsonApi(response.data));
  } catch (err) {
    sendUpstreamError(res, err, "Loading provinces");
  }
});

router.get("/datasets/municipalities", async (req, res) => {
  try {
    const integrationToken = await getEreportIntegrationToken();
    const response = await ereportClient.get("/api/integration/datasets/municipalities", {
      headers: { Authorization: `Bearer ${integrationToken}` },
      params: { province_code: req.query.provinceCode },
    });
    res.json(unwrapJsonApi(response.data));
  } catch (err) {
    sendUpstreamError(res, err, "Loading municipalities");
  }
});

router.get("/datasets/barangays", async (req, res) => {
  try {
    const integrationToken = await getEreportIntegrationToken();
    const response = await ereportClient.get("/api/integration/datasets/barangays", {
      headers: { Authorization: `Bearer ${integrationToken}` },
      params: { municipality_code: req.query.municipalityCode },
    });
    res.json(unwrapJsonApi(response.data));
  } catch (err) {
    sendUpstreamError(res, err, "Loading barangays");
  }
});

/** Real report categories (12 confirmed: scam, gas_station_concerns, red_tape, child_abuse, women_abuse, OFW_APP, overpricing, fire, "Senior Citizen", accident, crime, illegal_dumping) — replaces the earlier best-guess list. */
router.get("/datasets/report-types", async (_req, res) => {
  try {
    const integrationToken = await getEreportIntegrationToken();
    const response = await ereportClient.get("/api/integration/datasets/report_types", {
      headers: { Authorization: `Bearer ${integrationToken}` },
    });
    const types = (response.data as { data: JsonApiItem[] }).data.map((item) => ({
      code: String(item.attributes.code),
      name: String(item.attributes.name),
    }));
    res.json(types);
  } catch (err) {
    sendUpstreamError(res, err, "Loading report categories");
  }
});

router.get("/:caseNumber", async (req, res) => {
  const reportViewToken = reportViewTokens.get(req.ownerId!);
  if (!reportViewToken) return res.status(401).json({ error: "Confirm OTP via /reports/otp/confirm first" });
  try {
    const response = await ereportClient.get(`/api/integration/reports/${req.params.caseNumber}`, {
      headers: { "X-EReport-View-Token": reportViewToken },
    });
    res.json(response.data);
  } catch (err) {
    sendUpstreamError(res, err, "Loading that report");
  }
});

export default router;
