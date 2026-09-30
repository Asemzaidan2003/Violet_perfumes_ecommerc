import express from "express";

// Old /admin/html/<page>.html bookmarks and links land on the matching React admin route (query ?id= becomes a path segment).
const enc = encodeURIComponent;
const FIXED = {
  "index.html": "/admin/", "login.html": "/admin/login", "dashboard.html": "/admin/dashboard", "interests.html": "/admin/interests", "reports.html": "/admin/reports",
  "orders.html": "/admin/orders", "all_products.html": "/admin/products", "add_product.html": "/admin/products/new",
  "all_oils.html": "/admin/oils", "add_oil.html": "/admin/oils/new", "all_bottles.html": "/admin/bottles", "add_bottle.html": "/admin/bottles/new",
  "brands.html": "/admin/brands", "categories.html": "/admin/categories", "catalog.html": "/admin/catalog", "pages.html": "/admin/pages",
  "promotions.html": "/admin/promotions", "settings.html": "/admin/settings", "storefront.html": "/admin/storefront",
};
const WITH_ID = {
  "order-details.html": ["/admin/orders", (id) => `/admin/orders/${enc(id)}`],
  "edit_product.html": ["/admin/products", (id) => `/admin/products/${enc(id)}/edit`],
  "update_oil.html": ["/admin/oils", (id) => `/admin/oils/${enc(id)}/edit`],
  "update_bottle.html": ["/admin/bottles", (id) => `/admin/bottles/${enc(id)}/edit`],
};

export function legacyAdminTarget(page, query = {}) {
  if (Object.hasOwn(WITH_ID, page)) {
    const [fallback, build] = WITH_ID[page];
    return typeof query.id === "string" && query.id ? build(query.id) : fallback;
  }
  if (!Object.hasOwn(FIXED, page)) return null;
  const filter = page === "orders.html" && typeof query.filter === "string" && query.filter ? `?filter=${enc(query.filter)}` : "";
  return FIXED[page] + filter;
}

const router = express.Router();
router.get("/admin/html/:page", (req, res, next) => {
  const target = legacyAdminTarget(req.params.page, req.query);
  return target ? res.redirect(302, target) : next();
});
export default router;
