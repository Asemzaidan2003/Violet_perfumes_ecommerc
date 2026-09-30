import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLimiter } from "./middleware/rateLimit.js";
import { parseTrustProxyHops } from "./utils/trustProxy.js";
import { ASSET_V } from "./store/assets.js";
import { THREE_VERSION } from "./store/importmap.js";
import productRouter from "./routes/product.Routs.js";
import oilRouter from "./routes/oil.Routs.js";
import bottleRouter from "./routes/bottle.Routs.js";
import alcoholRouter from "./routes/alcohol.Routs.js";
import orderRouter from "./routes/order.Routs.js";
import customerRouter from "./routes/customer.Routs.js";
import reportRouter from "./routes/report.Routs.js";
import authRouter from "./routes/auth.Routs.js";
import uploadRouter from "./routes/upload.Routs.js";
import imageRouter from "./routes/image.Routs.js";
import storeRouter from "./routes/store.Routs.js";
import adminRouter from "./routes/admin.Routs.js";
import adminLegacyRouter from "./routes/adminLegacy.Routs.js";
import promotionsRouter from "./routes/promotions.Routs.js";
import brandsRouter from "./routes/brands.Routs.js";
import pagesRouter from "./routes/pages.Routs.js";
import categoriesRouter from "./routes/categories.Routs.js";
import storefrontRouter from "./routes/storefront.Routs.js";
import { requireAdmin } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";

// Update queries (findByIdAndUpdate etc.) validate against the schema too.
mongoose.set("runValidators", true);

const storefrontDir = fileURLToPath(new URL("../storefront", import.meta.url));

const defaultAdminDist = fileURLToPath(new URL("../admin/dist", import.meta.url));

export function createApp({ limits = {}, adminDist = defaultAdminDist } = {}) {
  const app = express();
  const prod = process.env.NODE_ENV === "production";

  app.set("trust proxy", parseTrustProxyHops(process.env.TRUST_PROXY_HOPS) ?? 0);
  app.locals.limiters = {
    login: createLimiter({ windowMs: 15 * 60_000, max: 5, ...limits.login }),
    orders: createLimiter({ windowMs: 60 * 60_000, max: 30, ...limits.orders }),
    interest: createLimiter({ windowMs: 60 * 60_000, max: 20, ...limits.interest }),
    coupons: createLimiter({ windowMs: 60 * 60_000, max: 30, ...limits.coupons }),
  };
  app.locals.assetV = ASSET_V;

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
  app.use(compression());

  const origins = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (origins.length) app.use(cors({ origin: origins, credentials: true }));

  app.use(express.json({ limit: "100kb" }));
  app.use((req, res, next) => { req.body ??= {}; next(); });

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/store", storeRouter); // public storefront API — must stay above the requireAdmin gate below
  app.use("/api", requireAdmin); // everything below is admin-only; storefront adds public routes above this line

  app.use("/api/products", productRouter);
  app.use("/api/oils", oilRouter);
  app.use("/api/bottles", bottleRouter);
  app.use("/api/alcohols", alcoholRouter);
  app.use("/api/orders", orderRouter);
  app.use("/api/customers", customerRouter);
  app.use("/api/reports", reportRouter);
  app.use("/api/uploads", uploadRouter);
  app.use("/api", adminRouter); // defines /settings and /interests
  app.use("/api", promotionsRouter); // defines /placements and /coupons
  app.use("/api", brandsRouter); // defines /brands
  app.use("/api", pagesRouter); // defines /pages
  app.use("/api", categoriesRouter); // defines /categories
  app.use("/api", (req, res) => res.status(404).json({ success: false, message: "Not found" }));

  // React admin (built by `npm run build:admin`). Old /admin/html/*.html URLs redirect to the matching route.
  const adminIndex = path.join(adminDist, "index.html");
  app.use(adminLegacyRouter);
  app.use("/admin", express.static(adminDist, {
    index: false,
    redirect: false,
    cacheControl: false,
    setHeaders: (res, file) => res.set("Cache-Control", file.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable"),
  }));
  app.get(["/admin", "/admin/*splat"], (req, res, next) => {
    if (path.extname(req.path)) return next();
    if (!fs.existsSync(adminIndex)) return res.status(503).type("text/plain; charset=utf-8").send("لوحة الإدارة غير مبنية بعد — شغّل: npm run build:admin");
    res.set("Cache-Control", "no-cache").sendFile(adminIndex);
  });
  // Cache headers only on a hit: a missing file must never be cached immutable.
  app.use("/assets", express.static(storefrontDir, {
    cacheControl: false,
    setHeaders: (res) => res.set("Cache-Control", "v" in res.req.query ? "public, max-age=31536000, immutable" : "no-cache"),
  }));
  const fontsDir = (pkgName) => fileURLToPath(new URL(`../node_modules/@fontsource/${pkgName}/files`, import.meta.url));
  app.use("/vendor/fonts/el-messiri", express.static(fontsDir("el-messiri"), { maxAge: "1y", immutable: true }));
  app.use("/vendor/fonts/plex-arabic", express.static(fontsDir("ibm-plex-sans-arabic"), { maxAge: "1y", immutable: true }));
  const threeDir = (sub) => fileURLToPath(new URL(`../node_modules/three/${sub}`, import.meta.url));
  app.use(`/vendor/three@${THREE_VERSION}/build`, express.static(threeDir("build"), { maxAge: "1y", immutable: true }));
  app.use(`/vendor/three@${THREE_VERSION}/examples/jsm`, express.static(threeDir("examples/jsm"), { maxAge: "1y", immutable: true }));
  app.use("/img", imageRouter);
  app.use(storefrontRouter); // pages at "/", plus the storefront 404/500 pages — keep last

  app.use(errorHandler);
  return app;
}
