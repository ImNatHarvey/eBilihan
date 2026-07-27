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

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/payments", paymentRoutes);
app.use("/verify", verifyRoutes);
app.use("/liveness", livenessRoutes);
app.use("/loans", loanRoutes);
app.use("/wallet", walletRoutes);
app.use("/reports", reportRoutes);
app.use("/locations", locationRoutes);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`eBilihan server listening on http://localhost:${config.port}`);
});
