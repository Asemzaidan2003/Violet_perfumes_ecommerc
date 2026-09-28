// Server-rendered storefront pages. Mounted last in app.js: it also owns the storefront 404/500 pages.
import express from "express";
import helmet from "helmet";
import { getCatalog } from "../store/catalog.js";
import { getSettings, getCachedSettings } from "../services/settings.service.js";
import { layout, siteBase } from "../store/views/layout.js";
import { familyCounts } from "../store/views/components.js";
import { home } from "../store/views/home.js";
import { collection, SORTS } from "../store/views/collection.js";
import { product } from "../store/views/product.js";
import { CATEGORIES, FAMILIES, FAMILY_KEYS } from "../../storefront/js/shared/vocab.js";
import { searchProducts, normalize } from "../../storefront/js/shared/search.js";
import Brand from "../models/brand.model.js";
import { notFound, serverError } from "../store/views/errors.js";
import { checkout, cartPage } from "../store/views/checkout.js";
import { brandsIndex } from "../store/views/brands.js";
import { orderConfirmation } from "../store/views/order.js";
import { getOrderByRef, publicOrder } from "../services/order.service.js";
import { esc } from "../store/html.js";
import { getLivePlacements } from "../services/placements.service.js";
import { IMPORT_MAP_HASH } from "../store/importmap.js";

const router = express.Router();

// Strict storefront CSP (the admin keeps its own, looser one): no inline scripts or handlers.
router.use(helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    "default-src": ["'self'"],
    "script-src": ["'self'", IMPORT_MAP_HASH],
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

const origin = (req) => `${req.protocol}://${req.get("host")}`;

// Set by promo.js when a visitor closes the announcement bar: leave it out server-side (no flash).
const announceDismissed = (req) => /(?:^|;\s*)nsamat_announce_dismissed=1(?:;|$)/.test(req.headers.cookie || "");

function send(req, res, status, page) {
  const placements = page.placements && announceDismissed(req)
    ? page.placements.filter((p) => p.slot !== "announcement") : page.placements;
  res.status(status).type("html").send(String(layout({
    ...page,
    placements,
    assetV: req.app.locals.assetV,
    origin: origin(req),
  })));
}

// ?f=oud,musk&s=30,50&stock=1 (comma-separated; repeated params from the no-JS form work too).
// Unknown values are dropped, never echoed.
const list = (v) => [].concat(v ?? []).flatMap((x) => String(x).split(",")).map((x) => x.trim()).filter(Boolean);
const parseFilter = (query) => ({
  f: list(query.f).filter((k) => FAMILY_KEYS.includes(k)),
  s: list(query.s).filter((x) => /^\d+(\.\d+)?$/.test(x)).slice(0, 20),
  b: list(query.b).filter((x) => /^[a-z0-9-]{2,40}$/.test(x)).slice(0, 20),
  n: list(query.n).map((x) => normalize(x)).filter(Boolean).slice(0, 20),
  stock: query.stock === "1",
});

const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));
const FAMILY_BY_KEY = new Map(FAMILIES.map((f) => [f.key, f]));
const AIR = ["home", "car"].map((slug) => CATEGORY_BY_SLUG.get(slug)); // the two معطرات aisles link to each other
const AISLE_LIMIT = 24;

// resolve(req, products) → { path, title, base, defaultSort, ... } or null for a 404.
const aislePage = (resolve) => async (req, res, next) => {
  const [{ products }, settings, placements] = await Promise.all([getCatalog(), getSettings(), getLivePlacements()]);
  const a = resolve(req, products);
  if (!a) return next();
  const q = a.q ?? "";
  const asked = req.query.sort; // own keys only: "__proto__" or "constructor" must not index SORTS
  const sort = typeof asked === "string" && Object.hasOwn(SORTS, asked) && (asked !== "relevance" || q) ? asked : a.defaultSort;
  send(req, res, 200, {
    title: `${a.title} | نسمات`,
    description: a.description ?? `تسوّق ${a.title} من نسمات: عطور مختارة، توصيل لكل الأردن والدفع عند الاستلام.`,
    canonicalPath: a.path, // /search results: canonical without q, and not indexed
    noindex: a.path === "/search",
    settings,
    placements,
    families: familyCounts(products),
    styles: ["pages.css"],
    scripts: ["collection.js"],
    body: collection({ ...a, q, catalog: products, filter: parseFilter(req.query), sort, placements }),
  });
};

router.get("/c/:category", aislePage((req, products) => {
  const c = CATEGORY_BY_SLUG.get(req.params.category);
  if (!c) return null;
  return {
    path: `/c/${c.slug}`, title: c.ar, eyebrow: "الأقسام", defaultSort: "best", target: { category: c.slug },
    base: products.filter((p) => p.category === c.key),
    switcher: AIR.includes(c) && AIR.map((x) => ({ href: `/c/${x.slug}`, label: x.ar, current: x === c })),
  };
}));

router.get("/family/:key", aislePage((req, products) => {
  const f = FAMILY_BY_KEY.get(req.params.key);
  if (!f) return null;
  return {
    path: `/family/${f.key}`, title: f.ar, eyebrow: "العائلات العطرية", defaultSort: "best", hideFamily: f.key, target: { family: f.key },
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

// Index of every active brand with >= 1 visible product (logo/name tile + product count).
router.get("/brands", async (req, res) => {
  const [{ products }, settings, placements, brands] = await Promise.all([
    getCatalog(), getSettings(), getLivePlacements(), Brand.find({ active: true }).lean(),
  ]);
  const counts = new Map();
  for (const p of products) if (p.brand) counts.set(p.brand.slug, (counts.get(p.brand.slug) || 0) + 1);
  const rows = brands.filter((b) => counts.has(b.slug)).map((brand) => ({ brand, count: counts.get(brand.slug) }));
  send(req, res, 200, {
    title: "المصممون | نسمات",
    description: "تصفّح كل دور العطور المتوفرة في نسمات.",
    canonicalPath: "/brands",
    settings,
    placements,
    styles: ["pages.css"],
    body: brandsIndex(rows),
  });
});

// Brand slug looked up directly in Brand (own-key rule: Map, not object) — unlike /c/:category and
// /family/:key, an unknown or inactive brand must 404 even though getCatalog() would just show an
// empty aisle (it silently treats an inactive brand's products as brand: null).
router.get("/brand/:slug", async (req, res, next) => {
  const slug = req.params.slug;
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return next();
  const [brand, { products }, settings, placements] = await Promise.all([
    Brand.findOne({ slug, active: true }).lean(),
    getCatalog(), getSettings(), getLivePlacements(),
  ]);
  if (!brand) return next();
  const base = products.filter((p) => p.brand && p.brand.slug === slug);
  const asked = req.query.sort;
  const sort = typeof asked === "string" && Object.hasOwn(SORTS, asked) ? asked : "best";
  send(req, res, 200, {
    title: `${brand.name_ar} | نسمات`,
    description: `تسوّق عطور ${brand.name_ar} من نسمات: توصيل لكل الأردن والدفع عند الاستلام.`,
    canonicalPath: `/brand/${slug}`,
    settings,
    placements,
    families: familyCounts(products),
    styles: ["pages.css"],
    scripts: ["collection.js"],
    body: collection({
      path: `/brand/${slug}`, title: brand.name_ar, eyebrow: "المصممون", defaultSort: "best",
      base, catalog: products, filter: parseFilter(req.query), sort, placements, brandLogo: brand.logo || null,
    }),
  });
});

router.get("/p/:id", async (req, res, next) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return next();
  const [{ products, byId }, settings, placements] = await Promise.all([getCatalog(), getSettings(), getLivePlacements()]);
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
    placements,
    families: familyCounts(products),
    styles: ["pages.css"],
    scripts: ["product.js"],
    body: product({ p, related, relatedHref, settings, placements, base: siteBase(origin(req)) }),
  });
});

router.get("/cart", async (req, res) => {
  const [settings, placements] = await Promise.all([getSettings(), getLivePlacements()]);
  send(req, res, 200, { title: "سلة التسوق | نسمات", canonicalPath: "/cart", noindex: true, settings, placements, body: cartPage() });
});

router.get("/checkout", async (req, res) => {
  const [settings, placements] = await Promise.all([getSettings(), getLivePlacements()]);
  send(req, res, 200, {
    title: "إتمام الطلب | نسمات", canonicalPath: "/checkout", noindex: true, hideBottomBar: true, settings, placements,
    styles: ["pages.css"], scripts: ["checkout.js"], body: checkout(),
  });
});

// Public refs are 10 characters of the order service's base32 alphabet; anything else is a 404.
router.get("/order/:ref", async (req, res, next) => {
  if (!/^[A-Z2-9]{10}$/.test(req.params.ref)) return next();
  const [order, settings, placements] = await Promise.all([getOrderByRef(req.params.ref), getSettings(), getLivePlacements()]);
  if (!order) return next();
  res.set("Cache-Control", "no-store");
  send(req, res, 200, {
    title: "شكرًا لطلبك | نسمات", noindex: true, hideBottomBar: true, settings, placements,
    styles: ["pages.css"], body: orderConfirmation({ order: publicOrder(order), settings }),
  });
});

router.get("/", async (req, res) => {
  const [{ products }, settings, placements, brands] = await Promise.all([
    getCatalog(), getSettings(), getLivePlacements(), Brand.find({ active: true }).lean(),
  ]);
  send(req, res, 200, {
    title: "نسمات | عطور فاخرة في الأردن",
    description: "بوتيك نسمات للعطور: عطور رجالية ونسائية وللجنسين ومعطرات، توصيل لكل الأردن والدفع عند الاستلام.",
    canonicalPath: "/",
    settings,
    placements,
    families: familyCounts(products),
    styles: ["pages.css"],
    scripts: ["fx-entrance.js"],
    body: home({ products, settings, placements, brands }),
  });
});

router.get("/robots.txt", (req, res) => {
  const base = siteBase(origin(req));
  res.type("text/plain").send(["User-agent: *", ...["/admin", "/api", "/checkout", "/cart", "/order"].map((p) => `Disallow: ${p}`),
    "", `Sitemap: ${base}/sitemap.xml`, ""].join("\n"));
});

// Every indexable page: home, aisles and visible (non-discontinued) products. /search is noindex.
router.get("/sitemap.xml", async (req, res) => {
  const base = esc(siteBase(origin(req)));
  const [{ products }, brands] = await Promise.all([getCatalog(), Brand.find({ active: true }).lean()]);
  const paths = ["/", ...CATEGORIES.map((c) => `/c/${c.slug}`), ...FAMILY_KEYS.map((k) => `/family/${k}`),
    "/offers", "/new", "/best-sellers", "/brands", ...brands.map((b) => `/brand/${b.slug}`), ...products.map((p) => `/p/${p.id}`)];
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `<url><loc>${base}${p}</loc></url>`).join("\n")}
</urlset>
`);
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
