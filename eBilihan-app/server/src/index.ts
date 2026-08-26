import express from "express";
import cors from "cors";
import { config } from "./config.js";

import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import orderRoutes from "./routes/orders.js";
import paymentRoutes from "./routes/payments.js";
import verifyRoutes from "./routes/verify.js";
import livenessRoutes from "./routes/liveness.js";
import loanRoutes from "./routes/loans.js";
import walletRoutes from "./routes/wallet.js";
import reportRoutes from "./routes/reports.js";
import locationRoutes from "./routes/locations.js";
import { billedRateLimit } from "./middleware/rateLimit.js";
import { cacheStats } from "./lib/responseCache.js";

const app = express();
// Render and Vercel sit in front of this, so the client IP arrives in x-forwarded-for.
// Without this Express reports the proxy's address and the rate limiter would treat every
// visitor as one client.
app.set("trust proxy", 1);
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, cache: cacheStats() }));

/**
 * Every route below that can reach an eGov API is rate limited, because each of those
 * calls spends from a finite, shared credit balance. Excluded deliberately:
 *
 *   /auth      — sign-in must never be throttled; a judge locked out of the app is worse
 *                than the credit it costs, and eGovPH's own widget rate-limits its OTPs.
 *   /products  — local only, no upstream call.
 *   /orders    — local only. (Its /refresh-payment does call eGovPay, and payments is
 *                limited separately below.)
 *   /wallet    — reads the local ledger.
 *   /locations — PSGC Cloud, free and public, not an eGov API.
 */
app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/payments", billedRateLimit, paymentRoutes);
app.use("/verify", billedRateLimit, verifyRoutes);
app.use("/liveness", billedRateLimit, livenessRoutes);
app.use("/loans", billedRateLimit, loanRoutes);
app.use("/wallet", walletRoutes);
app.use("/reports", billedRateLimit, reportRoutes);
app.use("/locations", locationRoutes);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`eBilihan server listening on http://localhost:${config.port}`);
});
