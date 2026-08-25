import { Router } from "express";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { egovpayClient } from "../lib/httpClients.js";
import { sendUpstreamError } from "../lib/upstreamError.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { orders, products, type Order, type OrderItem } from "../store/db.js";
import { appendTransaction } from "../lib/egovchain.js";

const router = Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const list = [...orders.values()].filter((o) => o.ownerId === req.ownerId);
  res.json({ data: list });
});

/**
 * Creates an order from scanned cart lines.
 *
 * The client says *what* and *how many*; the server decides *how much*. Prices and names
 * are read from the stored product, never taken from the request — an earlier version
 * computed the order total from a client-supplied `unitPrice`, which meant the figure
 * written into the ledger was whatever the caller claimed it was.
 *
 * For "cash" the order is paid on the spot. For "gcash" it stays pending until eGovPay
 * itself confirms, via POST /orders/:id/refresh-payment or the payments webhook.
 */
router.post("/", (req, res) => {
  const { items, paymentMethod } = req.body as {
    items: { productId: string; quantity: number }[];
    paymentMethod: "cash" | "gcash";
  };
  if (!items?.length || !paymentMethod) {
    return res.status(422).json({ error: "items and paymentMethod are required" });
  }
  if (paymentMethod !== "cash" && paymentMethod !== "gcash") {
    return res.status(422).json({ error: "paymentMethod must be 'cash' or 'gcash'" });
  }

  const priced: OrderItem[] = [];
  for (const line of items) {
    const quantity = Number(line?.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(422).json({ error: "Each item needs a positive whole quantity" });
    }
    const product = products.get(line?.productId);
    if (!product || product.ownerId !== req.ownerId) {
      return res.status(404).json({ error: `Unknown product ${line?.productId}` });
    }
    if (product.quantity < quantity) {
      return res.status(409).json({ error: `Insufficient stock for ${product.name}` });
    }
    priced.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: product.sellingPrice,
    });
  }

  const total = priced.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const order: Order = {
    id: randomUUID(),
    ownerId: req.ownerId!,
    items: priced,
    total: Number(total.toFixed(2)),
    paymentMethod,
    paymentStatus: paymentMethod === "cash" ? "paid" : "pending",
    createdAt: new Date().toISOString(),
  };

  for (const item of priced) {
    const product = products.get(item.productId)!;
    product.quantity -= item.quantity;
    product.updatedAt = new Date().toISOString();
  }

  if (order.paymentStatus === "paid") {
    const chainEntry = appendTransaction({
      ownerId: req.ownerId,
      type: "sale",
      orderId: order.id,
      total: order.total,
      paymentMethod,
    });
    order.chainTxId = chainEntry.txId;
  }

  orders.set(order.id, order);
  res.status(201).json({ data: order });
});

/**
 * Re-checks a pending eGovPay order against the gateway and settles it if eGovPay says it
 * is paid.
 *
 * This replaces a PATCH that accepted `{ paymentStatus }` straight from the client — i.e.
 * any authenticated caller could mark any order paid, with no money having moved, and the
 * result was appended to the ledger as a sale. **It takes no body on purpose.** The only
 * thing that decides whether an order is paid is eGovPay's own Check Transaction response.
 */
router.post("/:id/refresh-payment", async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order || order.ownerId !== req.ownerId) return res.status(404).json({ error: "Order not found" });
  if (order.paymentMethod !== "gcash") {
    return res.status(422).json({ error: "Only eGovPay orders have a payment to check" });
  }
  if (!order.egovpayTransactionUuid) {
    return res.status(422).json({ error: "No eGovPay transaction has been generated for this order yet" });
  }

  try {
    const response = await egovpayClient.get(`/api/v1/transaction/${order.egovpayTransactionUuid}`, {
      headers: { "X-eGovPay-Token": config.egovpay.apiToken },
    });
    const status = String(response.data?.data?.payment_status ?? "").toUpperCase();

    if (status === "PAID" || status === "SETTLED") {
      order.paymentStatus = "paid";
      if (!order.chainTxId) {
        const chainEntry = appendTransaction({
          ownerId: req.ownerId,
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

    orders.set(order.id, order);
    res.json({ data: order, paymentStatus: status });
  } catch (err) {
    sendUpstreamError(res, err, "Checking the payment");
  }
});

export default router;
