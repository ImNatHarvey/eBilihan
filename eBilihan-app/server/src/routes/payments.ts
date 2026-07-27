import { Router } from "express";
import { createHmac } from "node:crypto";
import { config } from "../config.js";
import { egovpayClient } from "../lib/httpClients.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

/** eGovPay > Generate Payment: digest = hash_hmac('sha256', "$amount|$txnid", $token). */
function computeDigest(amount: number, txnid: string): string {
  return createHmac("sha256", config.egovpay.apiToken).update(`${amount}|${txnid}`).digest("hex");
}

router.post("/generate", async (req, res) => {
  const { amount, items, txnid, mobile, email, name, redirectUrl, callbackUrl } = req.body as {
    amount: number;
    items: { name: string; amount: number }[];
    txnid: string;
    mobile?: string;
    email?: string;
    name?: string;
    redirectUrl: string;
    callbackUrl: string;
  };
  if (!amount || !items?.length || !txnid || !redirectUrl || !callbackUrl) {
    return res.status(422).json({ error: "amount, items, txnid, redirectUrl, and callbackUrl are required" });
  }

  try {
    const response = await egovpayClient.post(
      "/api/v1/transaction",
      {
        amount,
        items,
        currency: "PHP",
        settlement_template_uuid: config.egovpay.settlementTemplateUuid,
        txnid,
        digest: computeDigest(amount, txnid),
        redirect_url: redirectUrl,
        callback_url: callbackUrl,
        mobile,
        email,
        name,
      },
      { headers: { "X-eGovPay-Token": config.egovpay.apiToken, "Content-Type": "application/json; charset=utf-8" } },
    );
    res.status(201).json(response.data);
  } catch (err) {
    res.status(502).json({ error: "eGovPay generate-payment failed", detail: (err as Error).message });
  }
});

router.get("/:uuid", async (req, res) => {
  try {
    const response = await egovpayClient.get(`/api/v1/transaction/${req.params.uuid}`, {
      headers: { "X-eGovPay-Token": config.egovpay.apiToken },
    });
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: "eGovPay check-transaction failed", detail: (err as Error).message });
  }
});

router.put("/:uuid/void", async (req, res) => {
  try {
    const response = await egovpayClient.put(
      `/api/v1/transaction/${req.params.uuid}/void`,
      {},
      { headers: { "X-eGovPay-Token": config.egovpay.apiToken } },
    );
    res.json(response.data);
  } catch (err) {
    res.status(502).json({ error: "eGovPay void-transaction failed", detail: (err as Error).message });
  }
});

export default router;
