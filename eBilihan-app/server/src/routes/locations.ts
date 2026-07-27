import { Router } from "express";
import { psgcClient } from "../lib/httpClients.js";

/**
 * Proxies PSGC Cloud (see lib/httpClients.ts) for the registration "Location" picker.
 * Deliberately NOT behind requireAuth — registration needs this before a session
 * token exists. It's public geographic reference data, not eGov account data.
 */
const router = Router();

router.get("/regions", async (_req, res) => {
  try {
    const response = await psgcClient.get("/regions");
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: "PSGC regions lookup failed", detail: (err as Error).message });
  }
});

router.get("/regions/:regionCode/provinces", async (req, res) => {
  try {
    const response = await psgcClient.get(`/regions/${req.params.regionCode}/provinces`);
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: "PSGC provinces lookup failed", detail: (err as Error).message });
  }
});

router.get("/provinces/:provinceCode/cities-municipalities", async (req, res) => {
  try {
    const response = await psgcClient.get(`/provinces/${req.params.provinceCode}/cities-municipalities`);
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: "PSGC cities/municipalities lookup failed", detail: (err as Error).message });
  }
});

router.get("/cities-municipalities/:cityCode/barangays", async (req, res) => {
  try {
    const response = await psgcClient.get(`/cities-municipalities/${req.params.cityCode}/barangays`);
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: "PSGC barangays lookup failed", detail: (err as Error).message });
  }
});

export default router;
