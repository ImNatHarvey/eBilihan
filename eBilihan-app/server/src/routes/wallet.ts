import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { orders, loans } from "../store/db.js";
import { listTransactions } from "../lib/egovchain.js";

const router = Router();
router.use(requireAuth);

/**
 * Simplified assets/liabilities/equity view, computed from eGovchain's transaction
 * log (see lib/egovchain.ts — currently a stand-in ledger, no real eGovchain docs exist).
 * Liabilities are not modeled yet (no supplier-payable tracking in this MVP), so
 * equity == assets until that's added.
 */
router.get("/summary", (req, res) => {
  const chainEntries = listTransactions(req.ownerId!);
  const cashCollected = chainEntries
    .filter((e) => e.payload.type === "sale")
    .reduce((sum, e) => sum + Number(e.payload.total ?? 0), 0);

  const ownerLoans = [...loans.values()].filter((l) => l.ownerId === req.ownerId);
  const outstandingLoans = ownerLoans.reduce((sum, l) => sum + l.balance, 0);

  const ownerOrders = [...orders.values()].filter((o) => o.ownerId === req.ownerId);
  const cogs = ownerOrders
    .filter((o) => o.paymentStatus === "paid")
    .flatMap((o) => o.items)
    .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const assets = cashCollected + outstandingLoans;
  const liabilities = 0;
  const equity = assets - liabilities;

  res.json({
    data: {
      assets,
      liabilities,
      equity,
      cashCollected,
      outstandingLoans,
      loanCount: ownerLoans.length,
      chainEntryCount: chainEntries.length,
      salesRevenueEstimate: cogs,
    },
  });
});

router.get("/ledger", (req, res) => {
  res.json({ data: listTransactions(req.ownerId!) });
});

export default router;
