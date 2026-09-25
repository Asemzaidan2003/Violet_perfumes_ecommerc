# Storefront Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public Arabic storefront at `/` — boutique home, collections, search, product pages, cart, 30-second checkout that creates unconfirmed online orders, interest requests — plus the platform hardening and admin additions it needs.

**Architecture:** Server-rendered HTML from the same Express app (tagged-template views with escape-by-default), small ES-module scripts for interaction, a public JSON API at `/api/store` mounted above `requireAdmin`, and the existing order service extended for online orders (server-owned fields, delivery snapshot, idempotency, public reference). Shared pure modules in `storefront/js/shared/` run on both server and browser.

**Tech Stack:** Node 24 ESM, Express 5, Mongoose 8.10, local MongoDB replica set, `node:test`, Playwright + installed Edge (`npm run test:e2e`), new deps `compression`, `@fontsource/el-messiri`, `@fontsource/ibm-plex-sans-arabic`.

**Spec:** `docs/superpowers/specs/2026-09-25-storefront-core-design.md` (read it — the page and design-system sections are the source of truth for Tasks 5–7).

## Global Constraints

- **Local MongoDB only.** Tests via `tests/helpers.js`; e2e via its own DB. Never write to `nsamat_dev`; never print `.env` (a deny rule blocks reading `.env*` — don't try).
- **Security:** every page is rendered through `html\`\`` (escapes by default); data enters `<script>` blocks only via `json()`; client scripts use `textContent`/`<template>`, never `innerHTML` with data; no inline scripts/handlers on storefront pages (strict storefront CSP).
- **Public API never returns** `oil_id`, `oil_percentage`, `alcohol_percentage`, costs, profits, stock quantities, ObjectIds of orders, or customer data.
- **Arabic** user-facing messages; `{ success: false, message }` errors via the central handler (`Object.assign(new Error(msg), { status, expose: true })`).
- **Images:** product images may be `https://fimgs.net/...` hotlinks (owner's decision) — render them with `referrerpolicy="no-referrer"`, explicit `width`/`height`, `loading="lazy"` (except the LCP image), and a JS `error` listener (no inline `onerror`) that swaps in `/assets/img/placeholder-bottle.svg`; `"."` renders the placeholder directly.
- **Design system tokens and rules** from the spec (colours, El Messiri/IBM Plex Sans Arabic, spacing, motion, 44px targets, no emoji, RTL logical properties, `<bdi>` for numbers, `Intl.NumberFormat("ar-JO-u-nu-latn")`, no letter-spacing on Arabic). UI implementers: read `C:/Users/user/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.13.0/.claude/skills/ui-ux-pro-max/references/quick-reference.md` sections 1–9 before writing UI.
- No `Co-Authored-By` trailer. Stage only your task's files (never `.claude/`, `Claude.md`, `backups/`). Quote shell patterns. Files < 500 lines. Paste REAL command output.
- If a permission gate blocks an action, stop and report BLOCKED with the exact text.

## File Map

| File | Responsibility |
|---|---|
| `backend/middleware/rateLimit.js` (new) | `createLimiter`, `clientKey` |
| `backend/app.js` (edit) | `createApp({ limits })`, trust proxy, compression, assets/vendor mounts, store API + pages, error pages |
| `backend/controller/auth.Controller.js` (edit) | login uses the shared limiter |
| `backend/catalog/pricing.js` (new) | `effectivePrice` |
| `backend/models/setting.model.js`, `interest.model.js` (new); `order.model.js` (edit) | data |
| `backend/services/order.service.js` (edit) | online orders, confirm edits/linking, pricing via `effectivePrice` |
| `backend/services/settings.service.js` (new) | `getSettings`, `saveSettings` |
| `backend/store/html.js` (new) | `html`, `raw`, `json`, `esc` |
| `backend/store/catalog.js` (new) | availability, projections, index, best-sellers, cache |
| `backend/store/validate.js` (new) | public input validation |
| `backend/controller/store.Controller.js`, `backend/routes/store.Routs.js` (new) | `/api/store/*` |
| `backend/controller/admin.Controller.js`, `backend/routes/admin.Routs.js` (new) | `/api/settings`, `/api/interests` |
| `backend/store/views/*.js`, `backend/routes/storefront.Routs.js` (new) | pages |
| `storefront/css/store.css`, `storefront/js/*.js`, `storefront/js/shared/search.js`, `storefront/js/shared/format.js`, `storefront/img/*` (new) | assets |
| `frontend/html/interests.html`, `settings.html` (new); `orders.html`, `order-details.html`, `frontend/js/reports.js`, `frontend/js/navbar.js` (edit) | admin |
| `tests/*.test.js`, `tests/e2e/run.mjs` (extend) | tests |

---

### Task 1: Platform — shared rate limiter, createApp options, compression, assets, error pages

**Files:** Create `backend/middleware/rateLimit.js`, `tests/platform.test.js`. Modify `backend/app.js`, `backend/controller/auth.Controller.js`, `tests/helpers.js`, `package.json`.

**Produces:** `createApp({ limits } = {})` with `app.locals.limiters = { login, orders, interest }` (defaults: login 5/15 min, orders 10/h, interest 20/h); `startTestApp(options)` passes options through; `app.locals.assetV`; `/assets` (Cache-Control: `public, max-age=31536000, immutable` when `?v=` present, else `no-cache`); `/vendor/fonts/el-messiri/*` and `/vendor/fonts/plex-arabic/*` from the fontsource packages' `files/` dirs; `/admin` → redirect `/admin/html/index.html`.

- [ ] **Step 1:** `npm install compression @fontsource/el-messiri @fontsource/ibm-plex-sans-arabic`.

- [ ] **Step 2: `backend/middleware/rateLimit.js`**

```js
// ponytail: in-memory buckets, one process only; move to Redis/Mongo when running several instances.

// Group IPv6 clients by /64 (one household/device range), IPv4 by address.
export function clientKey(ip = "") {
  const addr = String(ip).replace(/^::ffff:/, "").replace(/%.*$/, "");
  if (!addr.includes(":")) return addr;
  const [head, tail = ""] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${full.slice(0, 4).map((p) => p.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export function createLimiter({ windowMs, max }) {
  const buckets = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) if (now - b.first >= windowMs) buckets.delete(key);
  }, Math.min(windowMs, 60_000));
  sweep.unref();

  const bucketFor = (req, now) => {
    const key = clientKey(req.ip);
    let b = buckets.get(key);
    if (!b || now - b.first >= windowMs) { b = { count: 0, first: now }; buckets.set(key, b); }
    return b;
  };

  return {
    // Synchronous check-and-count, so concurrent requests can't all slip past the limit.
    hit(req) {
      const now = Date.now();
      const b = bucketFor(req, now);
      if (b.count >= max) return { ok: false, retryAfterMs: windowMs - (now - b.first) };
      b.count++;
      return { ok: true };
    },
    reset(req) { buckets.delete(clientKey(req.ip)); },
    size: () => buckets.size,
  };
}

// Express middleware form; `message` may be a function of req (e.g. to include the WhatsApp link).
export const limit = (name, message) => (req, res, next) => {
  const r = req.app.locals.limiters[name].hit(req);
  if (r.ok) return next();
  res.set("Retry-After", String(Math.ceil(r.retryAfterMs / 1000)));
  res.status(429).json({ success: false, message: typeof message === "function" ? message(req) : message });
};
```

- [ ] **Step 3: Failing tests** — `tests/platform.test.js`

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./helpers.js";
import { clientKey, createLimiter } from "../backend/middleware/rateLimit.js";

let t;
before(async () => { t = await startTestApp(); });
after(() => t.close());

test("clientKey groups IPv6 by /64 and keeps IPv4", () => {
  assert.equal(clientKey("203.0.113.5"), "203.0.113.5");
  assert.equal(clientKey("::ffff:203.0.113.5"), "203.0.113.5");
  assert.equal(clientKey("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64");
  assert.equal(clientKey("2001:db8:1:2:bbbb:cccc:dddd:eeee"), "2001:db8:1:2::/64");
  assert.equal(clientKey("2001:db8::1"), "2001:db8:0:0::/64");
});

test("limiter counts synchronously and expires buckets", async () => {
  const l = createLimiter({ windowMs: 50, max: 2 });
  const req = { ip: "1.2.3.4" };
  assert.equal(l.hit(req).ok, true);
  assert.equal(l.hit(req).ok, true);
  assert.equal(l.hit(req).ok, false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(l.hit(req).ok, true, "a new window starts after expiry");
});

test("assets are versioned-immutable and admin redirects", async () => {
  const v = await fetch(`${t.url}/assets/js/shared/vocab.js?v=1`);
  assert.match(v.headers.get("cache-control"), /immutable/);
  const nv = await fetch(`${t.url}/assets/js/shared/vocab.js`);
  assert.equal(nv.headers.get("cache-control"), "no-cache");
  const r = await fetch(`${t.url}/admin`, { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/admin/html/index.html");
});

test("responses are compressed when the client accepts gzip", async () => {
  const res = await fetch(`${t.url}/assets/js/shared/vocab.js`, { headers: { "accept-encoding": "gzip" } });
  assert.equal(res.headers.get("content-encoding"), "gzip");
});

test("self-hosted fonts are served", async () => {
  const res = await fetch(`${t.url}/vendor/fonts/el-messiri/el-messiri-arabic-700-normal.woff2`);
  assert.equal(res.status, 200);
});
```
(If the fontsource file name differs, list `node_modules/@fontsource/el-messiri/files/` and use the real Arabic 700 woff2 name in both the test and the CSS.)

- [ ] **Step 4: Run, expect FAIL.**

- [ ] **Step 5: `backend/app.js`** — signature `export function createApp({ limits = {} } = {})`:
  - At the top of the function: `app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 0));` and
    ```js
    app.locals.limiters = {
      login: createLimiter({ windowMs: 15 * 60_000, max: 5, ...limits.login }),
      orders: createLimiter({ windowMs: 60 * 60_000, max: 10, ...limits.orders }),
      interest: createLimiter({ windowMs: 60 * 60_000, max: 20, ...limits.interest }),
    };
    app.locals.assetV = `${pkg.version}-${Date.now().toString(36)}`;
    ```
    with `import pkg from "../package.json" with { type: "json" };`.
  - `app.use(compression());` right after helmet.
  - Assets: replace `app.use("/assets", express.static(storefrontDir))` with
    ```js
    app.use("/assets", (req, res, next) => {
      res.set("Cache-Control", "v" in req.query ? "public, max-age=31536000, immutable" : "no-cache");
      next();
    }, express.static(storefrontDir, { cacheControl: false }));
    const fontsDir = (pkgName) => fileURLToPath(new URL(`../node_modules/@fontsource/${pkgName}/files`, import.meta.url));
    app.use("/vendor/fonts/el-messiri", express.static(fontsDir("el-messiri"), { maxAge: "1y", immutable: true }));
    app.use("/vendor/fonts/plex-arabic", express.static(fontsDir("ibm-plex-sans-arabic"), { maxAge: "1y", immutable: true }));
    ```
  - `app.get("/admin", (req, res) => res.redirect("/admin/html/index.html"));` before the `/admin` static mount.
  - Keep the existing `app.get("/", …)` redirect for now (Task 5 replaces it).

- [ ] **Step 6: Login uses the shared limiter** — in `auth.Controller.js` remove the module-level `failures`/`WINDOW_MS`/`MAX_FAILURES` and use:
  ```js
  const limiter = req.app.locals.limiters.login;
  if (!limiter.hit(req).ok) return res.status(429).json({ success: false, message: "Too many attempts, try again later" });
  // ... on success: limiter.reset(req);
  ```
  Keep every other line of `login` as is. The existing login rate-limit tests must pass unchanged.

- [ ] **Step 7: `tests/helpers.js`** — `export async function startTestApp(options = {})` and `createApp(options)`.

- [ ] **Step 8: Run, expect PASS** — `node --test tests/platform.test.js`, then `npm test`, then `npm run test:e2e`.

- [ ] **Step 9: Commit** — `git add package.json package-lock.json backend tests && git commit -m "feat: shared rate limiter, trust proxy, compression, versioned assets, self-hosted fonts"`

---

### Task 2: Pricing, settings, catalog projection, html helpers, public catalog API

**Files:** Create `backend/catalog/pricing.js`, `backend/models/setting.model.js`, `backend/services/settings.service.js`, `backend/store/html.js`, `backend/store/catalog.js`, `backend/controller/store.Controller.js`, `backend/routes/store.Routs.js`, `backend/controller/admin.Controller.js`, `backend/routes/admin.Routs.js`, `tests/store-catalog.test.js`, `tests/html.test.js`. Modify `backend/services/order.service.js` (use `effectivePrice`), `backend/controller/product.Controller.js` (invalidate cache on writes), `backend/app.js` (mounts).

**Produces:** `effectivePrice(product, sizeEntry, now = new Date()) → number` (round2 of `price × (1 − offer/100)`; sub-project 3 adds expiry); `getSettings() → { whatsapp, instagram, delivery_fee, free_delivery_over }`; `html`, `raw`, `json`, `esc`; `getCatalog() → { products: PublicProduct[], byId: Map }` (cached ≤ 30 s), `invalidateCatalog()`, `getBestSellerRanks()`; `GET /api/store/catalog` → compact index; admin `GET/PUT /api/settings`.

- [ ] **Step 1: `backend/catalog/pricing.js`**

```js
const round2 = (n) => Math.round(n * 100) / 100;

// The ONE place a customer price is computed — used by the storefront display and the order
// service, so what the customer sees is what they're charged.
export function effectivePrice(product, sizeEntry, now = new Date()) {
  const offer = Number(product.p_offer_percentage) || 0;
  return round2(sizeEntry.price * (1 - offer / 100));
}
```
In `order.service.js` `priceLines`, replace the inline offer computation with `effectivePrice(product, listed)` (POS override unchanged).

- [ ] **Step 2: `backend/store/html.js`**

```js
// Escape-by-default HTML templating for server-rendered pages.
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
// Trusted markup only — never data.
export const raw = (s) => new Raw(String(s));

const render = (v) =>
  v == null || v === false ? "" : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(render).join("") : esc(v);

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

// The only way data enters a <script> block (JSON-LD, page data): no </script>, no line separators.
export const json = (v) =>
  raw(JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`));
```
`tests/html.test.js`: escapes text and attributes; arrays join; `raw` passes through; nested `html` isn't double-escaped; `json({ n: "</script><img src=x onerror=alert(1)>" })` contains no `<` or `>` and `JSON.parse` of its string round-trips.

- [ ] **Step 3: Settings** — `setting.model.js`:
```js
const settingSchema = new mongoose.Schema({
  _id: { type: String, default: "shop" },
  whatsapp: { type: String, trim: true, match: [/^\d{8,15}$/, "رقم واتساب غير صالح"], default: "" },
  instagram: { type: String, trim: true, match: [/^(https:\/\/[^\s"'<>]+)?$/, "رابط انستغرام غير صالح"], default: "" },
  delivery_fee: { type: Number, min: 0, default: 0 },
  free_delivery_over: { type: Number, min: 0, default: 0 },
}, { timestamps: true });
export default mongoose.model("Setting", settingSchema);
```
(Allow empty `whatsapp` with `match: /^(\d{8,15})?$/`.) `settings.service.js`: `getSettings()` → the `shop` doc (lean) merged over defaults (no write on read); `saveSettings(patch)` → `findByIdAndUpdate("shop", { $set: patch }, { upsert: true, new: true, runValidators: true })` picking only the four keys. Admin routes `GET /api/settings`, `PUT /api/settings` (in `admin.Routs.js`, mounted below `requireAdmin`).

- [ ] **Step 4: `backend/store/catalog.js`** — implement:
  - `computeAvailability(product, oilsById, bottlesByCapacity)` per the spec rules (discontinued → not visible; manual `"out of stock"` → all sizes out; else `oil.oil_quantity ≥ oil_percentage/100 × ml` and some bottle with `capacity === ml` and `quantity ≥ 1`).
  - `toPublic(product, availability, rank)` → `{ id, name, image, thumb, images, category, families, notes, description, keywords, offer, sizes: [{ size, list, final, in_stock }], in_stock, rank, created }` where `final = effectivePrice(...)`, `thumb` = `image.replace(/\.(webp|jpg|png)$/, "-480.$1")` only for `/img/` URLs (else same as image), and `image` `"."` → `null`.
  - `getBestSellerRanks()` — aggregate completed orders of the last 90 days (`status: "completed"`, `createdAt ≥ now − 90d`), unwind products, group by `product_id` summing quantity, sort desc → `Map(id → rank 1..n)`; cached 10 min.
  - `getCatalog()` — loads products (not discontinued), oils, bottles; builds public products sorted by `rank` then newest; `byId` map; cached 30 s; `invalidateCatalog()` clears it. Product controller create/update/delete call `invalidateCatalog()`.
  - `compactIndex(products)` → `[{ id, name, image, thumb, category, families, keywords, offer, sizes: [{ size, final, list, in_stock }], rank, created }]`.

- [ ] **Step 5: Public API** — `store.Routs.js` with `GET /catalog` → `res.set("Cache-Control", "public, max-age=30").json({ success: true, data: compactIndex(products) })`. Mount in `app.js`: `app.use("/api/store", storeRouter);` **above** `app.use("/api", requireAdmin)`.

- [ ] **Step 6: Tests** — `tests/store-catalog.test.js`: seed oils/bottles/alcohol/products covering: in stock; oil short; no bottle of that capacity; manual `out of stock`; discontinued (absent); offer 10% (final = 0.9 × list); a product named `<img src=x onerror=alert(1)>` round-trips as text. Assert `GET /api/store/catalog` (no cookie) returns 200 and **no** item has keys `oil_id`, `oil_percentage`, `alcohol_percentage`, `cost`, `quantity`; best-seller rank ordering from two completed orders; `PUT /api/settings` validation (bad whatsapp → 400 Arabic) and round trip; POS order still charges the offer price via `effectivePrice`.

- [ ] **Step 7: Run** `npm test`; **Commit** — `git commit -m "feat: shared pricing, shop settings, public catalog API, escaping html helpers"`

---

### Task 3: Online orders — service, public order & interest API, admin interests

**Files:** Create `backend/models/interest.model.js`, `backend/store/validate.js`, `tests/store-orders.test.js`. Modify `backend/models/order.model.js`, `backend/services/order.service.js`, `backend/controller/store.Controller.js`, `backend/routes/store.Routs.js`, `backend/controller/admin.Controller.js`, `backend/routes/admin.Routs.js`, `backend/controller/order.Controller.js` (confirm accepts `delivery_fee`), `backend/controller/customer.Controller.js` only if needed.

**Produces:** `POST /api/store/orders` → 201/200 `{ success: true, data: { ref, subtotal, delivery_fee, discount, total, items: [{ name, size, quantity, price, line_total }] } }`; `POST /api/store/interest` → 201 `{ success: true }`; admin `GET /api/interests`, `PUT /api/interests/:id`; `confirmOrder(id, lines, { delivery_fee })`; `publicOrder(order)` helper; `getOrderByRef(ref)`.

- [ ] **Step 1: Order model** — add `public_ref: { type: String, unique: true, sparse: true }`, `client_key: { type: String, unique: true, sparse: true }`, `delivery: { name: String, phone: String, city: String, address: String, notes: String }`.

- [ ] **Step 2: Service changes** (`order.service.js`):
  - `priceLines(items, source, session)`: for `source === "online"`, a product with `status: "discontinued"` → `fail(404, "المنتج غير متوفر")`.
  - `newRef()`: 10 chars from `crypto.randomBytes(10)` mapped onto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
  - `placeOrder(input, source)`:
    ```js
    const online = source === "online";
    if (online) {
      const p = input.delivery_policy;
      if (!p || !(Number(p.fee) >= 0) || !(Number(p.free_over) >= 0) || !input.delivery || typeof input.client_key !== "string") {
        throw new Error("placeOrder(online) requires delivery_policy, delivery and client_key"); // programmer error → 500
      }
    }
    // (existing POS delivery_fee validation only when !online)
    return inTransaction(async (session) => {
      if (online) {
        const existing = await Order.findOne({ client_key: input.client_key }).session(session);
        if (existing) return { order: existing, shortages: [], replay: true };
      }
      const order = new Order({
        products: await priceLines(input.products, source, session),
        source,
        customer_id: online ? undefined : input.customer_id || undefined,
        payment_method: online ? "Cash" : input.payment_method || "Cash",
        delivery_fee: online ? 0 : deliveryFee,
        order_notes: online ? "" : input.order_notes || "",
        created_by: online ? "online" : "admin",
        ...(online && { delivery: input.delivery, client_key: input.client_key, public_ref: newRef() }),
        stock_deducted: false,
        total_items: 0, total_revenue: 0, total_cost: 0, total_profit: 0, final_total: 0,
      });
      setTotals(order);
      if (online) {
        const { fee, free_over } = input.delivery_policy;
        order.delivery_fee = Number(free_over) > 0 && order.total_revenue >= Number(free_over) ? 0 : Number(fee);
        setTotals(order);
      }
      const shortages = online ? [] : await deductAndCost(order, session);
      await order.save({ session });
      return { order, shortages, replay: false };
    });
    ```
    (Keep the source validation and existing behaviour for POS exactly as today.)
  - `confirmOrder(id, edits = [], { delivery_fee } = {})`: after applying line edits, if `delivery_fee != null` → must be a finite number ≥ 0 else 400 `"رسوم التوصيل غير صالحة"`, set it; then, before `deductAndCost`, link the customer for online orders without `customer_id`:
    ```js
    if (order.source === "online" && !order.customer_id && order.delivery?.phone) {
      const phone = normalizePhone(order.delivery.phone);
      let customer = await Customer.findOne({ phone }).session(session);
      if (!customer) {
        [customer] = await Customer.create([{ name: order.delivery.name, phone,
          address: [order.delivery.city, order.delivery.address].filter(Boolean).join(" — ") }], { session });
      }
      order.customer_id = customer._id;
    }
    ```
    (`deductAndCost` calls `setTotals`, which already includes `delivery_fee`.)
  - Export `publicOrder(order)` → `{ ref, subtotal: total_revenue, delivery_fee, discount: order.discount ?? 0, total: final_total, items: products.map(({ p_name, product_size, quantity, selling_price, total_revenue }) => ({ name: p_name, size: product_size, quantity, price: selling_price, line_total: total_revenue })) }` and `getOrderByRef(ref)`.

- [ ] **Step 3: `backend/store/validate.js`** — pure functions throwing `fail(400, …)`:
  - `GOVERNORATES` (spec list, Amman first).
  - `cleanText(v, { min, max, field })` → trims, strips `<` and `>`, enforces length with messages like `الاسم يجب أن يكون بين 2 و 80 حرفًا`.
  - `validateOrderBody(body)` → `{ items: [{ product_id, size, quantity }], customer: { name, phone, city, address, notes }, client_key }`: honeypot `website` non-empty → 400 `"تعذر إرسال الطلب"`; 1–20 items, integer quantity 1–20, `product_id` valid ObjectId; phone via `normalizePhone`/`isJordanMobile` (`"رقم الهاتف غير صالح — مثال: 0791234567"`); city ∈ GOVERNORATES; address 5–300; notes ≤ 500; `client_key` UUID v4 regex.
  - `validateInterestBody(body)` similarly (product_id, optional size, name, phone, optional note ≤ 300, honeypot).

- [ ] **Step 4: Public controller + routes** — `POST /orders` with `limit("orders", (req) => orderLimitMessage(req))` (message: "طلبات كثيرة من نفس الجهاز — تواصل معنا على واتساب: https://wa.me/<whatsapp>" when a WhatsApp number is set):
  ```js
  const { items, customer, client_key } = validateOrderBody(req.body);
  const settings = await getSettings();
  try {
    const { order, replay } = await placeOrder({
      products: items, client_key,
      delivery: customer,
      delivery_policy: { fee: settings.delivery_fee, free_over: settings.free_delivery_over },
    }, "online");
    invalidateCatalog();
    res.status(replay ? 200 : 201).json({ success: true, data: publicOrder(order) });
  } catch (err) {
    if (err?.code === 11000 && err.keyPattern?.client_key) {
      const existing = await Order.findOne({ client_key });
      return res.status(200).json({ success: true, data: publicOrder(existing) });
    }
    throw err;
  }
  ```
  `POST /interest` with `limit("interest", …)`: validate; product must exist and not be discontinued (404 otherwise); dedupe — `Interest.findOneAndUpdate({ phone, product_id, size: size ?? null, status: "new" }, { $set: { name, note, product_name } }, { upsert: true, new: true, setDefaultsOnInsert: true })`; 201 `{ success: true }`.
- [ ] **Step 5: Interest model** — `{ product_id (ObjectId, required), product_name (String), size (String, default null), name, phone, note, status: enum new|contacted|closed default new }`, timestamps, index `{ status: 1, createdAt: -1 }`.
- [ ] **Step 6: Admin** — `GET /api/interests?status=` (newest first, limit 500), `PUT /api/interests/:id` `{ status }` (enum-validated); `POST /api/orders/:id/confirm` passes `{ delivery_fee: req.body.delivery_fee }` as the third argument.
- [ ] **Step 7: Tests** — `tests/store-orders.test.js` (use `startTestApp({ limits: { orders: { max: 1000 }, interest: { max: 1000 } } })` except the one rate-limit test, which uses its own app with `max: 2`):
  - happy path: 201; `ref` matches `/^[A-Z2-9]{10}$/`; `Order` saved with `source: "online"`, `stock_deducted: false`, `delivery` snapshot, `payment_method: "Cash"`, server price (offer applied), no `customer_id`; **no Customer document created**; stock unchanged.
  - body with `price: 0.01`, `bottle_id`, `delivery_fee: 0`, `payment_method: "Credit"`, `customer_id` are all ignored.
  - delivery fee from settings; free when subtotal ≥ `free_delivery_over`.
  - replay with the same `client_key` → 200, same `ref`, one order in the DB; two **concurrent** replays → one order.
  - validation: bad phone, bad city, 21 items, qty 0, honeypot → 400 with Arabic messages; `٠٧٩١٢٣٤٥٦٧` accepted.
  - discontinued product → 404.
  - rate limit: third order from the same client → 429.
  - confirm (admin) links an existing customer with the same normalised phone, or creates one; confirm with `delivery_fee: 3` updates `final_total`.
  - interest: 201; duplicate while `new` → still one document; admin list + status update.
  - response bodies contain no `_id`, `total_cost`, `total_profit`, `oil`.
- [ ] **Step 8:** `npm test`; **Commit** — `git commit -m "feat: online orders with delivery snapshot, idempotency and public refs; interest requests"`

---

### Task 4: Design system, layout shell and home page

**Files:** Create `storefront/css/store.css`, `storefront/img/placeholder-bottle.svg`, `storefront/img/logo.svg`, `storefront/js/shared/format.js`, `storefront/js/store.js`, `backend/store/views/layout.js`, `backend/store/views/components.js`, `backend/store/views/home.js`, `backend/store/views/errors.js`, `backend/routes/storefront.Routs.js`, `tests/store-pages.test.js`. Modify `backend/app.js` (mount storefront router; replace the `/` redirect; storefront 404/500 handling).

**Contracts:**
- `layout({ title, description, canonicalPath, ogImage, body, bodyClass, hideBottomBar, settings, assetV })` → full HTML document per the spec's page rules (lang/dir, skip link, header, mobile bottom bar unless `hideBottomBar`, cart drawer placeholder `<dialog id="cart-drawer">` (empty shell; Task 6 fills it), footer, `<script type="module" src="/assets/js/store.js?v=…">`). Font faces and tokens come from `store.css`. Absolute URLs use `process.env.PUBLIC_URL` (fallback: request origin).
- `components.js`: `productCard(p, { priority })`, `shelf({ title, href, products })`, `price(p, size?)`, `badges(p)`, `slot(name, placements)` (renders nothing for an empty list — sub-project 3 fills slots), `familyChip(key)`, `icon(name)` (inline SVG set: search, cart, whatsapp, home, grid, close, chevron (RTL-aware), plus, minus, share).
- `format.js` (shared, pure): `money(n)` → `"20.00 د.أ"` via `Intl.NumberFormat("ar-JO-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`; `sizeLabel("30")` → `"30 مل"`.
- Home: sections 1–11 from the spec in order, using real data from `getCatalog()`, `getBestSellerRanks()`, `getSettings()`; the hero is the built-in brand welcome slide (headline "نسمات — عطرك يحكي عنك", subline, CTA to `/c/men` and `/c/women`); aisles tiles; best-sellers shelf; tester bar (hidden when no product has families); new arrivals; offers shelf (hidden when none); service strip; footer.
- `storefront/js/store.js` (entry module): image error fallback, header compaction on scroll, shelf arrow buttons (RTL-aware `scrollBy`), cart count badge from localStorage (`nsamat_cart_v1`), live region element for announcements. No inline handlers.
- Storefront CSP (per-router helmet on storefront pages): `default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`.
- Page errors: unknown storefront paths → styled 404 (`errors.js`) with status 404; thrown errors on page routes → styled 500 (never JSON). `/api/*` keeps JSON errors.

- [ ] **Steps:** implement → `tests/store-pages.test.js` (GET `/` → 200, `text/html`, contains `lang="ar"`, `dir="rtl"`, one `<h1>`, the seeded product names, no `oil_percentage` string, a product named `<img src=x onerror=alert(1)>` appears escaped; `/nope` → 404 HTML; CSP header on `/` contains `script-src-attr 'none'`) → extend `tests/e2e/run.mjs` with a **Storefront home** scenario (desktop 1440 and mobile 375 viewports: renders, no console/CSP errors, no horizontal scroll: `document.documentElement.scrollWidth <= innerWidth`) → `npm test` + `npm run test:e2e` → commit `"feat: storefront design system, layout and boutique home page"`.

---

### Task 5: Collections, search and product pages

**Files:** Create `storefront/js/shared/search.js`, `storefront/js/search.js` (overlay), `storefront/js/collection.js`, `storefront/js/product.js`, `backend/store/views/collection.js`, `backend/store/views/product.js`, `tests/search.test.js`. Modify `backend/routes/storefront.Routs.js`, `tests/store-pages.test.js`, `tests/e2e/run.mjs`.

**Contracts:**
- `shared/search.js` exactly per the spec's Search section: `normalize(s)`, `tokens(s)`, `searchProducts(products, query) → ranked products` (products = compact index items with `families` keys; family labels resolved through `vocab.js`). `tests/search.test.js`: `normalize("أَحْمَد")` → `"احمد"`; `"ـعـود"` → `"عود"`; `"الشانيل"` matches a product "شانيل"; `"إيف"` matches "ايف"; Arabic-Indic digits; English keywords (`"sauvage"`); ranking name-prefix first; no results for garbage.
- Routes: `/c/:category` (`men|women|unisex|home|car`, else 404), `/family/:key` (vocab key, else 404), `/offers`, `/new`, `/best-sellers`, `/search?q=` — one `collection` view with the spec's aisle header, filters (`f`, `s`, `stock`, `sort` query params, comma-separated), server-side filtering/sorting, `data-*` attributes on cards for client filtering (`collection.js` hides/reorders instantly and `history.replaceState`s the URL), empty state with suggestions. `/c/home` shows a chip linking to `/c/car` and vice versa.
- `/p/:id` (invalid id or unknown/discontinued → 404): the product page per the spec — gallery, size chips (out-of-stock marked **غير متوفر حاليًا** with the note), quantity stepper, **أضف إلى السلة** / **اطلب الآن** (buttons carry `data-*`; Task 6's cart module handles them — for now they add to `localStorage` cart and update the badge), **أعلمني عند التوفر** `<dialog>` form posting to `/api/store/interest` with inline errors and success state, notes pyramid, description, share (Web Share API, fallback copy link), WhatsApp inquiry link (only when a number is set), related shelf, recently viewed (localStorage, rendered client-side with `textContent`), JSON-LD via `json()` (`InStock`/`MadeToOrder`), Open Graph image.
- Search overlay (`search.js`): opens from the header search field/icon (and `/` keyboard shortcut on desktop), fetches `/api/store/catalog` once (cached in memory), filters as the user types with `searchProducts`, shows up to 8 results (thumb, name, price) as links, keyboard navigable (↑/↓/Enter/Esc), "عرض كل النتائج" → `/search?q=`, suggestions on no results. Built with `<template>` cloning.

- [ ] **Steps:** TDD for `search.test.js` and page tests (collection filters via query string; `/c/nope` 404; `/p/<bad>` 404; product page escapes; JSON-LD contains no raw `<`) → e2e scenarios **Search** (type an alef-variant spelling, see the product, press Enter → search page) and **Collection filter** (tick a family chip → grid updates, URL has `f=`) and **Product page** (select an out-of-stock size → note visible; submit the interest dialog → success; add to cart → badge count 1) → commit `"feat: collections, Arabic search, product pages with interest requests"`.

---

### Task 6: Cart drawer, checkout and order confirmation

**Files:** Create `storefront/js/cart.js`, `storefront/js/checkout.js`, `backend/store/views/checkout.js`, `backend/store/views/order.js`. Modify `backend/store/views/layout.js` (drawer markup + `<template>`s), `backend/routes/storefront.Routs.js` (`/cart`, `/checkout`, `/order/:ref`), `tests/store-pages.test.js`, `tests/e2e/run.mjs`.

**Contracts:**
- `cart.js`: storage `nsamat_cart_v1` `[{ id, size, qty }]`; `add(id, size, qty)`, `setQty`, `remove`, `clear`; drawer = native `<dialog>` with `showModal()`, lines rendered from `<template>` with prices from `/api/store/catalog` (lines whose product/size vanished are shown as unavailable and excluded from totals), subtotal, delivery fee and free-delivery progress from settings embedded as `json()` in the layout (`<script type="application/json" id="shop-settings">`), "إتمام الطلب" → `/checkout`. Handles the product page / card buttons (`data-add-to-cart`, `data-buy-now` → add then `location.href = "/checkout"`). Updates the header badge and announces via the live region. `/cart` renders the layout with the drawer opened on load.
- `/checkout`: the spec's one-screen form (labels, autocomplete, `inputmode`, `dir="ltr"` phone, governorate select, remembered details, privacy line, summary). `checkout.js`: client validation mirrors the server (import shared `phone.js`), inline errors + summary, `client_key` in sessionStorage (new key whenever the cart contents change and after success), submit → `POST /api/store/orders` → on 201/200 clear the cart and `location.href = "/order/" + ref`; on 4xx show the server message near the form; on network failure keep the form and offer retry; button disabled while in flight.
- `/order/:ref` (`Cache-Control: no-store`, `<meta name="robots" content="noindex">`): thank-you, `NS-` ref in `<bdi>`, items, totals, WhatsApp button with a prefilled message containing the ref (only when a number is set), continue shopping. Unknown ref → 404.
- `/checkout` and `/p/:id` hide the mobile bottom bar.

- [ ] **Steps:** page tests (`/checkout` 200 with the governorate list; `/order/<unknown>` 404; `/order/<real ref>` shows the ref and no delivery phone; `Cache-Control: no-store`) → e2e **Full purchase** (mobile viewport: add to cart from a card → open drawer → checkout → fill name, Arabic-digit phone `٠٧٩١٢٣٤٥٦٧`, city, address → submit → confirmation shows `NS-` ref → admin orders API shows one unconfirmed online order with that delivery snapshot) and **Double submit** (click submit twice fast → exactly one order) → commit `"feat: cart drawer, 30-second checkout, order confirmation"`.

---

### Task 7: Admin additions — interests, settings, online orders, escaping, new-order signal

**Files:** Create `frontend/html/interests.html`, `frontend/html/settings.html`. Modify `frontend/js/navbar.js`, `frontend/html/orders.html`, `frontend/html/order-details.html`, `frontend/js/reports.js`, `tests/e2e/run.mjs`.

**Contracts:**
- `navbar.js`: define `window.esc` (escapes `& < > " '`); add links "طلبات الاهتمام" (`interests.html`) and "إعدادات المتجر" (`settings.html`); poll `GET /api/orders` count of `stock_deducted === false && status !== "canceled"` every 60 s → badge on the orders link and `(n) ` prefix on `document.title`.
- Apply `esc()` to every interpolation of customer/delivery/interest text in `orders.html` (rows + search), `order-details.html` (summary incl. `order_notes`, the new delivery block), `reports.js` (customers tab), and existing `all_products.html` product name/image interpolations.
- `orders.html`: "الموقع" source badge; for online orders show `delivery.name`/`delivery.phone` (fallback to the customer); WhatsApp link (`https://wa.me/962…` from the normalised phone) per online row.
- `order-details.html`: delivery block (name, phone, city, address, notes) for online orders; in the confirm form add a "رسوم التوصيل" number input prefilled with `delivery_fee`, sent as `delivery_fee` to `POST /api/orders/:id/confirm`.
- `interests.html`: table (product, size, name, phone, note, date), status filter, "تم التواصل"/"إغلاق" buttons → `PUT /api/interests/:id`, WhatsApp link per row; DOM-built.
- `settings.html`: form for whatsapp, instagram, delivery_fee, free_delivery_over → `PUT /api/settings`; inline server errors.

- [ ] **Steps:** e2e **Admin sees the online order** (after the Full purchase scenario: orders page shows the badge and "الموقع", details page shows the delivery block, confirm with bottle + delivery fee → stock deducted, customer linked) and **XSS inert** (place an online order with name `<img src=x onerror=window.__xss=1>` → open orders.html and order-details.html → `window.__xss` is undefined) and **Settings round trip** → `npm test` + `npm run test:e2e` → commit `"feat: admin interests, shop settings, online order details, escaped customer text"`.

---

### Task 8: SEO basics and final checks (controller)

- [ ] `robots.txt` (disallow `/admin`, `/api`, `/checkout`, `/order`; sitemap URL) and `sitemap.xml` (home, category, family, offers/new/best-sellers, every visible product) routes — small, can be done by the Task 7 implementer if time allows, else a follow-up dispatch.
- [ ] `npm test`, `npm run test:e2e` green; manual look at `/` in Edge at 375 and 1440 via Playwright screenshots saved to the session scratchpad.
- [ ] Final whole-branch review, then merge to `main` (user asked for the storefront on `main`).
