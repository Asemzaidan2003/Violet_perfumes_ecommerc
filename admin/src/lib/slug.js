export const slugify = (input) => String(input ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
export const SLUG_RE = /^[a-z0-9-]{2,40}$/;
// Mirrors backend/models/page.model.js RESERVED_SLUGS (routes the storefront already owns).
export const RESERVED_PAGE_SLUGS = [
  "c", "p", "brand", "brands", "family", "search", "offers", "new", "best-sellers",
  "cart", "checkout", "order", "admin", "api", "assets", "vendor", "img", "robots.txt", "sitemap.xml",
];
