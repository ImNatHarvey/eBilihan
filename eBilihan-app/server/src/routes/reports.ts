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
