import { Router } from "express";
import { createHmac } from "node:crypto";
import { config } from "../config.js";
import { egovpayClient } from "../lib/httpClients.js";
import { sendUpstreamError } from "../lib/upstreamError.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { expensiveRateLimit } from "../middleware/rateLimit.js";
import { orders } from "../store/db.js";
import { appendTransaction } from "../lib/egovchain.js";

const router = Router();

/**
 * eGovPay > Generate Payment: digest = hash_hmac('sha256', "$amount|$txnid", $token).
 *
 * Two details the formula alone does not pin down, both established the hard way:
 *
 *  - **The key is the full header value, `test_` prefix included.** Signing with the
 *    prefixed token is what got us past `401 invalid_api_header` to a digest-only fault,
 *    which proves the gateway accepted it.
 *  - **The amount is normalised to 4 decimal places.** The docs interpolate `$amount`
 *    literally, which reads as `"120"`, but eGovPay's own Check Transaction response
 *    renders amounts as `"1000.0000"` — and signing `"120|<txnid>"` was rejected with
 *    `{"errors":{"digest":["The digest is not valid."]}}` while every other field
 *    validated.
 *
 * Output is lowercase hex: the documented sample digest is 64 lowercase hex characters,
 * which is PHP `hash_hmac`'s default.
 */
function computeDigest(amount: number, txnid: string): string {
  return createHmac("sha256", config.egovpay.apiToken)
    .update(`${amount.toFixed(4)}|${txnid}`)
    .digest("hex");
}

/** Asks eGovPay what actually happened. This is the only thing that settles an order. */
async function settleFromGateway(transactionUuid: string): Promise<string> {
  const response = await egovpayClient.get(`/api/v1/transaction/${transactionUuid}`, {
    headers: { "X-eGovPay-Token": config.egovpay.apiToken },
  });
  return String(response.data?.data?.payment_status ?? "").toUpperCase();
}

/**
 * eGovPay's status callback.
 *
 * This endpoint is an **unauthenticated request from the open internet** — it carries no
 * eBilihan session, and anyone who learns the URL can POST to it. So the body is treated
 * as a hint that something changed, never as a statement of fact: whatever it claims, we
 * go and ask eGovPay directly via Check Transaction and write only what the gateway says.
 *
 * That holds regardless of whether eGovPay signs its callbacks. The saved documentation
 * describes `callback_url` only as "URL notified for every transaction status change" and
 * never specifies the payload, so any field-level verification here would be built on an
 * assumption. Confirm-server-side is correct either way, and must not be relaxed into
 * trusting the payload even if a signature turns out to be present.
 *
 * Mounted before the router-wide `requireAuth` below, deliberately.
 */
router.post("/webhook", async (req, res) => {
  // Logged once at info level so the real payload shape is captured on first contact —
  // the docs don't specify it. Review this, then narrow the logging.
  // eslint-disable-next-line no-console
  console.info("[eGovPay] webhook received:", JSON.stringify(req.body));

  const { uuid, txnid } = req.body as { uuid?: string; txnid?: string };

  // `txnid` is our own order id (set at generate time), so it maps straight back.
  const order = txnid ? orders.get(txnid) : undefined;
  const transactionUuid = uuid ?? order?.egovpayTransactionUuid;

  // Always 200 to a well-formed notification, even when we can't act on it — a non-2xx
  // makes eGovPay retry a callback that will never succeed.
  if (!order || !transactionUuid) {
    return res.json({ received: true, applied: false });
  }

  try {
    const status = await settleFromGateway(transactionUuid);
    if (status === "PAID" || status === "SETTLED") {
      order.paymentStatus = "paid";
      if (!order.chainTxId) {
        const chainEntry = appendTransaction({
          ownerId: order.ownerId,
          type: "sale",
          orderId: order.id,
          total: order.total,
          paymentMethod: order.paymentMethod,
        });
        order.chainTxId = chainEntry.txId;
      }
    } else if (status === "VOIDED" || status === "CANCELLED" || status === "EXPIRED") {
      order.paymentStatus = "voided";
    }
    order.egovpayTransactionUuid = transactionUuid;
    orders.set(order.id, order);
    res.json({ received: true, applied: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[eGovPay] webhook could not confirm with the gateway:", (err as Error).message);
    // Non-2xx so eGovPay retries — this one is worth retrying, since the gateway was
    // briefly unreachable rather than the notification being unusable.
    res.status(503).json({ received: true, applied: false });
  }
});

router.use(requireAuth);

router.post("/generate", expensiveRateLimit, async (req, res) => {
  const { orderId } = req.body as { orderId?: string };
  const order = orderId ? orders.get(orderId) : undefined;
  if (!order || order.ownerId !== req.ownerId) {
    return res.status(404).json({ error: "Order not found" });
  }
  if (!config.egovpay.settlementTemplateUuid) {
    return res.status(503).json({ error: "EGOVPAY_SETTLEMENT_TEMPLATE_UUID is not configured on this server" });
  }

  // Amount and line items come from the stored order, not the request — the client has
  // no say in what a payment is for or how much it is.
  const amount = order.total;
  const txnid = order.id;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 19).replace("T", " ");

  try {
    const response = await egovpayClient.post(
      "/api/v1/transaction",
      {
        amount,
        items: order.items.map((i) => ({ name: i.name, amount: i.unitPrice * i.quantity })),
        currency: "PHP",
        settlement_template_uuid: config.egovpay.settlementTemplateUuid,
        txnid,
        digest: computeDigest(amount, txnid),
        // Both are typed `url` by eGovPay and are resolved here rather than by the app:
        // the client cannot know this service's public origin, and a custom scheme
        // (ebilihan://) is not a URL the gateway accepts.
        redirect_url: `${config.appBaseUrl}/order?payment=complete&txnid=${encodeURIComponent(txnid)}`,
        callback_url: `${config.serverBaseUrl}/payments/webhook`,
        // Without these a payment link generated during a demo stays live indefinitely.
        expires_at: expiresAt,
        link_expires_at: expiresAt,
      },
      { headers: { "X-eGovPay-Token": config.egovpay.apiToken, "Content-Type": "application/json; charset=utf-8" } },
    );

    // Remember the transaction so /orders/:id/refresh-payment and the webhook can both
    // ask the gateway about it later.
    const transactionUuid = response.data?.data?.uuid as string | undefined;
    if (transactionUuid) {
      order.egovpayTransactionUuid = transactionUuid;
      orders.set(order.id, order);
    }

    res.status(201).json(response.data);
  } catch (err) {
    sendUpstreamError(res, err, "Starting the payment");
  }
});

router.get("/:uuid", async (req, res) => {
  try {
    const response = await egovpayClient.get(`/api/v1/transaction/${req.params.uuid}`, {
      headers: { "X-eGovPay-Token": config.egovpay.apiToken },
    });
    res.json(response.data);
  } catch (err) {
    sendUpstreamError(res, err, "Checking the payment");
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
    sendUpstreamError(res, err, "Voiding the payment");
  }
});

export default router;
