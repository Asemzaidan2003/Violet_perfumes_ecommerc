import express from "express";
import helmet from "helmet";
import cors from "cors";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import productRouter from "./routes/product.Routs.js";
import oilRouter from "./routes/oil.Routs.js";
import bottleRouter from "./routes/bottle.Routs.js";
import alcoholRouter from "./routes/alcohol.Routs.js";
import orderRouter from "./routes/order.Routs.js";
import customerRouter from "./routes/customer.Routs.js";
import reportRouter from "./routes/report.Routs.js";
import { errorHandler } from "./middleware/error.js";

// Update queries (findByIdAndUpdate etc.) validate against the schema too.
mongoose.set("runValidators", true);

const frontendDir = fileURLToPath(new URL("../frontend", import.meta.url));

export function createApp() {
  const app = express();
  const prod = process.env.NODE_ENV === "production";

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        // ponytail: admin pages use inline <script>/onclick; move to files to drop 'unsafe-inline'
        "script-src": ["'self'", "'unsafe-inline'"],
        "script-src-attr": ["'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
        "upgrade-insecure-requests": prod ? [] : null,
      },
    },
  }));

  const origins = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (origins.length) app.use(cors({ origin: origins, credentials: true }));

  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 });
  });
  // AUTH: Task 2 mounts /api/auth and requireAdmin here.

  app.use("/api/products", productRouter);
  app.use("/api/oils", oilRouter);
  app.use("/api/bottles", bottleRouter);
  app.use("/api/alcohols", alcoholRouter);
  app.use("/api/orders", orderRouter);
  app.use("/api/customers", customerRouter);
  app.use("/api/reports", reportRouter);
  app.use("/api", (req, res) => res.status(404).json({ success: false, message: "Not found" }));

  app.use("/admin", express.static(frontendDir));
  app.get("/", (req, res) => res.redirect("/admin/html/index.html")); // storefront takes "/" later

  app.use(errorHandler);
  return app;
}
