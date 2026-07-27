import { Router } from "express";
import { randomUUID } from "node:crypto";
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
 * Creates an order from scanned cart lines. Stock is decremented immediately;
 * for "cash" it is marked paid on the spot. For "gcash" the caller should follow up
 * with POST /payments/generate using this order's id as txnid, then confirm via
 * PATCH /orders/:id once eGovPay reports the transaction as paid.
 */
router.post("/", (req, res) => {
  const { items, paymentMethod } = req.body as { items: OrderItem[]; paymentMethod: "cash" | "gcash" };
  if (!items?.length || !paymentMethod) {
    return res.status(422).json({ error: "items and paymentMethod are required" });
  }

  for (const item of items) {
    const product = products.get(item.productId);
    if (!product || product.ownerId !== req.ownerId) {
      return res.status(404).json({ error: `Unknown product ${item.productId}` });
    }
    if (product.quantity < item.quantity) {
      return res.status(409).json({ error: `Insufficient stock for ${product.name}` });
    }
  }

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const order: Order = {
    id: randomUUID(),
    ownerId: req.ownerId!,
    items,
    total,
    paymentMethod,
    paymentStatus: paymentMethod === "cash" ? "paid" : "pending",
    createdAt: new Date().toISOString(),
  };

  for (const item of items) {
    const product = products.get(item.productId)!;
    product.quantity -= item.quantity;
    product.updatedAt = new Date().toISOString();
  }

  if (order.paymentStatus === "paid") {
    const chainEntry = appendTransaction({ ownerId: req.ownerId, type: "sale", orderId: order.id, total, paymentMethod });
    order.chainTxId = chainEntry.txId;
  }

  orders.set(order.id, order);
  res.status(201).json({ data: order });
});

/** Marks a pending gcash order as paid/voided once eGovPay confirms, and logs it to the ledger. */
router.patch("/:id", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order || order.ownerId !== req.ownerId) return res.status(404).json({ error: "Order not found" });

  const { paymentStatus, egovpayTransactionUuid } = req.body as { paymentStatus: Order["paymentStatus"]; egovpayTransactionUuid?: string };
  order.paymentStatus = paymentStatus;
  order.egovpayTransactionUuid = egovpayTransactionUuid ?? order.egovpayTransactionUuid;

  if (paymentStatus === "paid" && !order.chainTxId) {
    const chainEntry = appendTransaction({
      ownerId: req.ownerId,
      type: "sale",
      orderId: order.id,
      total: order.total,
      paymentMethod: order.paymentMethod,
    });
    order.chainTxId = chainEntry.txId;
  }

  orders.set(order.id, order);
  res.json({ data: order });
});

export default router;
