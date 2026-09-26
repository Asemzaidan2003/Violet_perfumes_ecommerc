// Server-rendered storefront pages. Mounted last in app.js: it also owns the storefront 404/500 pages.
import express from "express";
import helmet from "helmet";
import { getCatalog } from "../store/catalog.js";
import { getSettings, getCachedSettings } from "../services/settings.service.js";
import { layout } from "../store/views/layout.js";
import { familyCounts } from "../store/views/components.js";
import { home } from "../store/views/home.js";
import { notFound, serverError } from "../store/views/errors.js";

const router = express.Router();

// Strict storefront CSP (the admin keeps its own, looser one): no inline scripts or handlers.
router.use(helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "script-src-attr": ["'none'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "font-src": ["'self'"],
    "img-src": ["'self'", "data:", "https:"],
    "connect-src": ["'self'"],
    "frame-ancestors": ["'self'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  },
}));

function send(req, res, status, page) {
  res.status(status).type("html").send(String(layout({
    ...page,
    assetV: req.app.locals.assetV,
    origin: `${req.protocol}://${req.get("host")}`,
  })));
}

router.get("/", async (req, res) => {
  const [{ products }, settings] = await Promise.all([getCatalog(), getSettings()]);
  send(req, res, 200, {
    title: "نسمات | عطور فاخرة في الأردن",
    description: "بوتيك نسمات للعطور: عطور رجالية ونسائية وللجنسين ومعطرات، توصيل لكل الأردن والدفع عند الاستلام.",
    canonicalPath: "/",
    settings,
    families: familyCounts(products),
    body: home({ products, settings }),
  });
});

// Catch-all (Express 5 rejects "*" paths).
router.use(async (req, res) => {
  const [{ products }, settings] = await Promise.all([getCatalog(), getSettings()]);
  send(req, res, 404, {
    title: "الصفحة غير موجودة | نسمات",
    settings,
    families: familyCounts(products),
    body: notFound(),
  });
});

// Page errors render the styled 500 page (never JSON). Uses no DB, which may be what failed.
router.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const settings = getCachedSettings();
  send(req, res, 500, { title: "خلل مؤقت | نسمات", settings, body: serverError(settings) });
});

export default router;
