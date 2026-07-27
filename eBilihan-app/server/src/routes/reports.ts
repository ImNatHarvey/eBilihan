import { Router } from "express";
import { config } from "../config.js";
import { ereportClient } from "../lib/httpClients.js";
import { getCachedToken } from "../lib/tokenCache.js";
import { requireAuth } from "../middleware/requireAuth.js";

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
    res.status(502).json({ error: "eReport OTP request failed", detail: (err as Error).message });
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
    res.status(502).json({ error: "eReport OTP confirm failed", detail: (err as Error).message });
  }
});

router.post("/", async (req, res) => {
  const body = req.body as {
    mobile: string;
    firstName: string;
    lastName: string;
    gender: string;
    complainantEmail: string;
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
  try {
    const integrationToken = await getEreportIntegrationToken();
    const response = await ereportClient.post(
      "/api/integration/submit_complaint",
      {
        mobile: body.mobile,
        first_name: body.firstName,
        last_name: body.lastName,
        gender: body.gender,
        complainant_email: body.complainantEmail,
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
    res.status(502).json({ error: "eReport submit-complaint failed", detail: (err as Error).message });
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
    res.status(502).json({ error: "eReport list failed", detail: (err as Error).message });
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
    res.status(502).json({ error: "eReport regions lookup failed", detail: (err as Error).message });
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
    res.status(502).json({ error: "eReport provinces lookup failed", detail: (err as Error).message });
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
    res.status(502).json({ error: "eReport municipalities lookup failed", detail: (err as Error).message });
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
    res.status(502).json({ error: "eReport barangays lookup failed", detail: (err as Error).message });
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
    res.status(502).json({ error: "eReport report-types lookup failed", detail: (err as Error).message });
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
    res.status(502).json({ error: "eReport view-by-case-number failed", detail: (err as Error).message });
  }
});

export default router;
