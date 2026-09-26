// Server-rendered storefront pages. Mounted last in app.js: it also owns the storefront 404/500 pages.
import express from "express";
import helmet from "helmet";
import { getCatalog } from "../store/catalog.js";
import { getSettings, getCachedSettings } from "../services/settings.service.js";
import { layout } from "../store/views/layout.js";
import { familyCounts } from "../store/views/components.js";
import { home } from "../store/views/home.js";
import { collection, SORTS } from "../store/views/collection.js";
import { product } from "../store/views/product.js";
import { CATEGORIES, FAMILIES, FAMILY_KEYS } from "../../storefront/js/shared/vocab.js";
import { searchProducts } from "../../storefront/js/shared/search.js";
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

// Absolute site origin for canonical/Open Graph/JSON-LD URLs.
const siteBase = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");

function send(req, res, status, page) {
  res.status(status).type("html").send(String(layout({
    ...page,
    assetV: req.app.locals.assetV,
    origin: `${req.protocol}://${req.get("host")}`,
  })));
}

// ?f=oud,musk&s=30,50&stock=1 (comma-separated; repeated params from the no-JS form work too).
// Unknown values are dropped, never echoed.
const list = (v) => [].concat(v ?? []).flatMap((x) => String(x).split(",")).map((x) => x.trim()).filter(Boolean);
const parseFilter = (query) => ({
  f: list(query.f).filter((k) => FAMILY_KEYS.includes(k)),
  s: list(query.s).filter((x) => /^\d+(\.\d+)?$/.test(x)).slice(0, 20),
  stock: query.stock === "1",
});

const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));
const FAMILY_BY_KEY = new Map(FAMILIES.map((f) => [f.key, f]));
const AIR = ["home", "car"].map((slug) => CATEGORY_BY_SLUG.get(slug)); // the two معطرات aisles link to each other
const AISLE_LIMIT = 24;

// resolve(req, products) → { path, title, base, defaultSort, ... } or null for a 404.
const aislePage = (resolve) => async (req, res, next) => {
  const [{ products }, settings] = await Promise.all([getCatalog(), getSettings()]);
  const a = resolve(req, products);
  if (!a) return next();
  const q = a.q ?? "";
  const sort = SORTS[req.query.sort] && (req.query.sort !== "relevance" || q) ? req.query.sort : a.defaultSort;
  send(req, res, 200, {
    title: `${a.title} | نسمات`,
    description: a.description ?? `تسوّق ${a.title} من نسمات: عطور مختارة، توصيل لكل الأردن والدفع عند الاستلام.`,
    canonicalPath: q ? `${a.path}?q=${encodeURIComponent(q)}` : a.path,
    settings,
    families: familyCounts(products),
    styles: ["pages.css"],
    scripts: ["collection.js"],
    body: collection({ ...a, q, catalog: products, filter: parseFilter(req.query), sort }),
  });
};

router.get("/c/:category", aislePage((req, products) => {
  const c = CATEGORY_BY_SLUG.get(req.params.category);
  if (!c) return null;
  return {
    path: `/c/${c.slug}`, title: c.ar, eyebrow: "الأقسام", defaultSort: "best",
    base: products.filter((p) => p.category === c.key),
    switcher: AIR.includes(c) && AIR.map((x) => ({ href: `/c/${x.slug}`, label: x.ar, current: x === c })),
  };
}));

router.get("/family/:key", aislePage((req, products) => {
  const f = FAMILY_BY_KEY.get(req.params.key);
  if (!f) return null;
  return {
    path: `/family/${f.key}`, title: f.ar, eyebrow: "العائلات العطرية", defaultSort: "best", hideFamily: f.key,
    base: products.filter((p) => p.families.includes(f.key)),
  };
}));

router.get("/offers", aislePage((req, products) => ({
  path: "/offers", title: "العروض", intro: "خصومات حقيقية على عطور مختارة، لفترة محدودة.", defaultSort: "best",
  base: products.filter((p) => p.offer > 0),
})));

router.get("/new", aislePage((req, products) => ({
  path: "/new", title: "وصل حديثًا", intro: "أحدث ما وصل إلى رفوف نسمات.", defaultSort: "new",
  base: [...products].sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, AISLE_LIMIT),
})));

// getCatalog() is ordered by best-seller rank, then newest — the spec's best-sellers fallback.
router.get("/best-sellers", aislePage((req, products) => ({
  path: "/best-sellers", title: "الأكثر مبيعًا", intro: "العطور التي يعود إليها عملاؤنا مرة بعد مرة.", defaultSort: "best",
  base: products.slice(0, AISLE_LIMIT),
})));

router.get("/search", aislePage((req, products) => {
  const q = String([].concat(req.query.q ?? "")[0]).trim().slice(0, 100);
  return {
    path: "/search", q, title: q ? `نتائج البحث عن «${q}»` : "ابحث في المتجر", defaultSort: q ? "relevance" : "best",
    description: "ابحث في عطور نسمات بالاسم أو النوتة أو العائلة العطرية.",
    base: q ? searchProducts(products, q) : [],
  };
}));

router.get("/p/:id", async (req, res, next) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return next();
  const [{ products, byId }, settings] = await Promise.all([getCatalog(), getSettings()]);
  const p = byId.get(req.params.id.toLowerCase());
  if (!p) return next();
  // Related: same family, else same category.
  const others = products.filter((x) => x.id !== p.id);
  const byFamily = others.filter((x) => x.families.some((k) => p.families.includes(k)));
  const related = (byFamily.length ? byFamily : others.filter((x) => x.category === p.category)).slice(0, 12);
  const cat = CATEGORIES.find((c) => c.key === p.category);
  const relatedHref = byFamily.length ? `/family/${p.families.find((k) => byFamily[0].families.includes(k))}` : `/c/${cat?.slug ?? "men"}`;
  send(req, res, 200, {
    title: `${p.name} | نسمات`,
    description: (p.description || `${p.name} من نسمات${cat ? ` — ${cat.ar}` : ""}. توصيل لكل الأردن والدفع عند الاستلام.`).slice(0, 160),
    canonicalPath: `/p/${p.id}`,
    ogImage: p.image,
    hideBottomBar: true,
    settings,
    families: familyCounts(products),
    styles: ["pages.css"],
    scripts: ["product.js"],
    body: product({ p, related, relatedHref, settings, base: siteBase(req) }),
  });
});

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

// Catch-all (Express 5 rejects "*" paths). No DB work: bots probing random URLs stay cheap.
router.use((req, res) => {
  send(req, res, 404, { title: "الصفحة غير موجودة | نسمات", settings: getCachedSettings(), body: notFound() });
});

// Page errors render the styled 500 page (never JSON). Uses no DB, which may be what failed.
router.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const settings = getCachedSettings();
  send(req, res, 500, { title: "خلل مؤقت | نسمات", settings, body: serverError(settings) });
});

export default router;
