# Promotions Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can run ads and offers from the admin. Scheduled placements fill eight storefront slots, product offers can expire (with a countdown), and discount codes are validated and claimed inside the order transaction.

**Architecture:**
- **Placements:** a `Placement` model and a small service. It holds a 60 s in-memory cache of *live* placements, invalidated on every admin write, and feeds the existing `slot(name, placements)` hook in the storefront views.
- **Offer expiry:** it lives only in `effectivePrice` (shared by display and charging).
- **Coupons:** a `Coupon` model. Coupons are checked publicly (rate-limited, no enumeration) and claimed with a guarded `$inc` inside `placeOrder`'s transaction, and returned exactly once on the same guard as the stock refund.
- **Totals:** `setTotals` remains the only totals function.

**Tech Stack:** Node 24 ESM, Express 5, Mongoose 8.24, local MongoDB replica set `rs0`, `node:test`, Playwright + installed Edge (`npm run test:e2e`). There are no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-promotions-engine-design.md` (the source of truth; read it in full). Builds on storefront core. Read `docs/superpowers/specs/2026-09-25-storefront-core-design.md` for the design system and page rules.

## Global Constraints

- **Local MongoDB only.** Tests use `tests/helpers.js` (throwaway `nsamat_test_<pid>`); e2e uses its own DB.
  - Never create, modify or delete data in `nsamat_dev`.
  - Never connect to Atlas or any `mongodb+srv` URI.
  - Never read or print `.env*` (a deny rule blocks it; don't try).
- **Security:**
  - All storefront HTML goes through the escaping `html` tag (`backend/store/html.js`). Use `raw()` only for markup you build yourself, and `json()` for data in script blocks.
  - Client JS uses `textContent`/`<template>`, never `innerHTML` with data.
  - No inline scripts or handlers on storefront pages (strict storefront CSP).
  - Admin pages render every DB value with `esc()` (from `frontend/js/navbar.js`) or `textContent`.
- **Links in placements:** accept an internal path matching `^/(?![/\\])\S*$`, or an absolute URL with `new URL(link).protocol === "https:"` (rendered with `rel="noopener"`). Anything else gets a 400.
- **Live placement:** `active && (!starts_at || starts_at <= now) && (!ends_at || now < ends_at)`. Start is inclusive, end is exclusive. The same rule applies to coupon windows and to `offer_ends_at` (the offer is live while `now < offer_ends_at`).
- **Totals are computed only in `setTotals`:**
  - `discount = coupon ? (coupon.type === "percent" ? round2(total_revenue × value / 100) : min(value, total_revenue)) : 0`
  - `final_total = round2(total_revenue − discount + delivery_fee)`
  - `total_profit = stock_deducted ? round2(Σ line total_profit − discount) : 0`
- **The delivery fee policy is unchanged.** The fee comes from pre-discount `total_revenue` (`total_revenue ≥ free_over > 0 ? 0 : fee`). The client cart display must use the same rule.
- **Coupons are online only.** The public body field `coupon` maps to the service input `coupon_code`. POS sales ignore any coupon.
- **One use is returned exactly once,** inside the transaction and under the same guard as the stock refund (the transition into `canceled`, or deleting a non-canceled order): `updateOne({ code, used: { $gt: 0 } }, { $inc: { used: -1 } })`.
- **Arabic user-facing messages.** Errors use `fail(status, message)` from `backend/utils/fail.js` and the central handler shape `{ success: false, message }`.
- **Design system** "Boutique at dusk" (tokens in `storefront/css/store.css`):
  - no emoji; SVG icons (`icon()` in `components.js`); 44px targets; visible focus; contrast ≥ 4.5:1;
  - no letter-spacing on Arabic; numbers via `Intl.NumberFormat("ar-JO-u-nu-latn")` inside `<bdi>`;
  - motion respects `prefers-reduced-motion`.
  - UI implementers: read `C:/Users/user/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.13.0/.claude/skills/ui-ux-pro-max/references/quick-reference.md` §1–9 first.
- **Text over images is real text,** never baked in, and every image has `alt` = title.
- **Datetimes:** the browser converts `datetime-local` values with `new Date(value).toISOString()`, and the server stores UTC. The admin displays times in `Asia/Amman` via `Intl.DateTimeFormat("ar-JO-u-nu-latn", { timeZone: "Asia/Amman", … })`.
- **Housekeeping:**
  - No `Co-Authored-By` or any attribution trailer.
  - Stage only your task's files (never `.claude/`, `Claude.md`, `backups/`).
  - Files < 500 lines: `store.css` is at 436, so new storefront CSS goes in `storefront/css/promo.css`, loaded on pages that render slots.
  - `tests/e2e/run.mjs` is at ~480 lines; new scenarios go in `tests/e2e/promotions.mjs`, registered like `admin-online.mjs`.
  - Paste REAL command output.
  - If a permission gate blocks an action, stop and report BLOCKED with the exact text.
- **Test gates:** `npm test` and `npm run test:e2e` must both be fully green after every task. The base is 152 unit tests and 14 e2e scenarios.

## Review Focus

1. **Time edges.** An offer, coupon or placement whose end has *just* passed must not be shown or charged. What the storefront shows and what the order charges must agree. The catalogue cache may lag by up to 30 s; the *charge* is always computed from the DB product at placement. Pin: `effectivePrice` at `ends_at − 1 ms` / `ends_at`, and a placeOrder test with an expired offer (Task 1).
2. **Concurrent last use of a code.** Two simultaneous orders on a `max_uses: 1` code: exactly one succeeds, and `used` ends at 1. Pin in Task 3.
3. **Refund of a code use happens exactly once.** Cancel then delete, delete of an already-canceled order, and cancel twice: `used` is decremented exactly once. Pin in Task 3.
4. **Hostile or odd placement input.** Links like `javascript:`, `//evil.com`, `/\evil.com`, `http:`, `data:`, and whitespace-padded values are rejected. Titles containing `<script>` render escaped. Unknown `slot` or `theme` values give a 400. Pin in Task 2 (validation) and Task 4 (rendering).
5. **Coupon enumeration and abuse.** An unknown, inactive, expired or not-yet-started code gives the *same* message. `min_subtotal` failures say how much more is needed. The check endpoint is limited to 30/hour/IP. A lowercase or space-padded code still works. Pin in Task 3.

---

## File Map

| File | Responsibility |
|---|---|
| `backend/catalog/pricing.js` (edit) | `effectivePrice` honours `offer_ends_at`; new `liveOffer(product, now)` |
| `backend/models/product.model.js` (edit) | `offer_ends_at: Date` |
| `backend/store/catalog.js` (edit) | public `offer` is the *live* offer; expose `offer_ends_at` when live |
| `backend/models/placement.model.js` (new) | Placement schema and validation |
| `backend/services/placements.service.js` (new) | `isLive`, `getLivePlacements()` (60 s cache), `invalidatePlacements()`, `forSlot()`, `validLink()` |
| `backend/models/coupon.model.js` (new) | Coupon schema |
| `backend/services/coupons.service.js` (new) | `normalizeCode`, `checkCoupon`, `claimCoupon`, `releaseCoupon` |
| `backend/services/order.service.js` (edit) | coupon in `placeOrder`, `setTotals` discount, release on cancel/delete |
| `backend/models/order.model.js` (edit) | `discount`, `coupon: { code, type, value }` |
| `backend/controller/promotions.Controller.js`, `backend/routes/promotions.Routs.js` (new) | admin CRUD for `/api/placements`, `/api/coupons` |
| `backend/controller/store.Controller.js`, `backend/routes/store.Routs.js`, `backend/store/validate.js` (edit) | `POST /api/store/coupons/check`; `coupon` in the order body |
| `backend/store/views/promo.js` (new) | `placementMarkup(slotName, placements, ctx)` per slot |
| `backend/store/views/components.js`, `home.js`, `collection.js`, `product.js`, `layout.js` (edit) | real slots, offer countdown chip |
| `backend/routes/storefront.Routs.js` (edit) | pass live placements to views |
| `storefront/css/promo.css`, `storefront/js/promo.js` (new) | slot styles; announcement rotation, hero slider, dismiss |
| `storefront/js/checkout.js`, `backend/store/views/checkout.js`, `backend/store/views/order.js`, `storefront/js/shared/cart-store.js` (edit) | coupon field, discount display |
| `frontend/html/promotions.html` (new); `frontend/js/navbar.js`, `add_product.html`, `edit_product.html`, `frontend/js/reports.js` (edit) | admin UI |
| `tests/promotions.test.js`, `tests/coupons.test.js`, `tests/e2e/promotions.mjs` (new) | tests |

---

### Task 1: Offers that expire

**Files:**
- Modify: `backend/catalog/pricing.js`, `backend/models/product.model.js`, `backend/store/catalog.js`, `backend/store/views/components.js` (countdown chip), `backend/store/views/product.js`, `frontend/html/add_product.html`, `frontend/html/edit_product.html`
- Test: `tests/promotions.test.js` (new), `tests/store-pages.test.js`

**Interfaces:**
- Produces:
  - `liveOffer(product, now = new Date()) → number`: `p_offer_percentage` if it is > 0 and (`offer_ends_at` unset or `now < offer_ends_at`), else 0.
  - `effectivePrice(product, sizeEntry, now)` uses `liveOffer`.
  - Public catalogue product gains `offer_ends_at` (an ISO string, only when the offer is live and has an end; otherwise `null`), and `offer` = `liveOffer(...)`.

- [ ] **Step 1: Write failing tests** in `tests/promotions.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectivePrice, liveOffer } from "../backend/catalog/pricing.js";

const end = new Date("2026-10-01T00:00:00Z");
const p = { p_offer_percentage: 20, offer_ends_at: end };
const size = { size: "30", price: 10 };

test("offer is live until (not including) its end", () => {
  assert.equal(liveOffer(p, new Date(end.getTime() - 1)), 20);
  assert.equal(liveOffer(p, end), 0);
  assert.equal(effectivePrice(p, size, new Date(end.getTime() - 1)), 8);
  assert.equal(effectivePrice(p, size, end), 10);
});

test("offer without an end never expires; zero offer is no offer", () => {
  assert.equal(liveOffer({ p_offer_percentage: 15 }, new Date("2099-01-01")), 15);
  assert.equal(liveOffer({ p_offer_percentage: 0, offer_ends_at: end }, new Date(0)), 0);
});
```

  In `tests/store-pages.test.js`, add a product whose offer ended yesterday (`p_offer_percentage: 30, offer_ends_at: <yesterday>`). Assert:
  - `/offers` does not list it;
  - its product page shows no `−30%` badge;
  - an online `POST /api/store/orders` for it is charged the full price (`data.subtotal === price × qty`).

  Add a product whose offer ends in 2 days. Assert its card and product page contain a countdown chip with the text `ينتهي خلال` and `data-ends-at` in ISO format.

- [ ] **Step 2: Run:** `node --test tests/promotions.test.js tests/store-pages.test.js`. Expected: FAIL (`liveOffer` is not exported; expired offer still listed).
- [ ] **Step 3: Implement.**
  - `pricing.js`: `liveOffer` plus `effectivePrice` calling it.
  - `product.model.js`: `offer_ends_at: { type: Date }`.
  - `catalog.js` `toPublic`: `offer: liveOffer(product, now)` and `offer_ends_at`. The existing 30 s catalogue cache may lag an expiry by ≤ 30 s. That is acceptable, because the charge in `placeOrder` is computed from the DB product via `effectivePrice`. Add a `ponytail:` comment noting it.
  - Countdown chip in `components.js`: `offerChip(p, now)` renders `<span class="chip-countdown" data-ends-at="…">ينتهي خلال …</span>` when `offer_ends_at` is within 7 days. The text comes from `new Intl.RelativeTimeFormat("ar", { numeric: "auto" })`, with days when ≥ 1 day remains and hours otherwise. Use it in `productCard` and in the product page next to the price. The server renders the text, and no JS is required.
  - Admin product forms: add `<label for="offer_ends_at">ينتهي العرض في</label><input type="datetime-local" id="offer_ends_at">` next to the offer percentage.
    - Send `offer_ends_at: value ? new Date(value).toISOString() : null`.
    - On edit, prefill with the local time, formatted as `YYYY-MM-DDTHH:mm` from the ISO value.
- [ ] **Step 4: Run** `npm test` and `npm run test:e2e`. Expected: all green.
- [ ] **Step 5: Commit** `feat: product offers can expire, with a countdown on the storefront`.

---

### Task 2: Placements: model, liveness, cache and admin API

**Files:**
- Create: `backend/models/placement.model.js`, `backend/services/placements.service.js`, `backend/controller/promotions.Controller.js`, `backend/routes/promotions.Routs.js`
- Modify: `backend/app.js` (mount `promotions.Routs.js` at `/api`, below `requireAdmin`, next to `admin.Routs.js`)
- Test: `tests/promotions.test.js`

**Interfaces:**
- Produces:
  - `SLOTS = ["announcement","hero","home_mid","home_bottom","collection_banner","grid_tile","product_promo","cart_upsell"]`
  - `IMAGE_SLOTS = ["hero","home_mid","home_bottom","collection_banner","grid_tile"]`
  - `THEMES = ["dark","light","gold"]`
  - `validLink(link) → boolean`
  - `isLive(placement, now = new Date()) → boolean`
  - `getLivePlacements() → Promise<Placement[]>`: live placements sorted by `sort`, then `createdAt`, as lean plain objects, cached 60 s.
  - `invalidatePlacements()`
  - `forSlot(placements, slot, target = {}) → Placement[]`: the slot's placements. For `collection_banner` and `grid_tile` it keeps those whose `target` is empty or matches `{ category?, family? }` (a set field must equal the page's value).
  - Admin: `GET /api/placements` (all, newest first), `POST /api/placements`, `PUT /api/placements/:id`, `DELETE /api/placements/:id`. Each write calls `invalidatePlacements()` and returns `{ success: true, data }`.

- [ ] **Step 1: Write failing tests** (append to `tests/promotions.test.js`, using `startTestApp` and an admin login helper as in `tests/orders-api.test.js`):
  - `validLink`:
    - accepted: `"/c/men"`, `"/p/abc"`, `"https://example.com/x"`;
    - rejected: `"javascript:alert(1)"`, `"//evil.com"`, `"/\\evil.com"`, `"http://x.com"`, `"data:text/html,x"`, `" /c/men"`, `""`.
  - `isLive` edges with `starts_at = S`, `ends_at = E`:
    - `S − 1 ms` → false;
    - `S` → true;
    - `E − 1 ms` → true;
    - `E` → false;
    - `active: false` → false;
    - no window → true.
  - `forSlot` targeting:
    - a banner `{ target: { category: "men" } }` shows on `{ category: "men" }` and not on `{ category: "women" }`;
    - an empty target shows everywhere;
    - `{ family: "oud" }` shows on `{ family: "oud" }`.
  - API:
    - `POST /api/placements` without auth → 401.
    - With auth and a valid `hero` (title, image `/img/<24hex>.webp`) → 201.
    - `hero` without an image → 400 with an Arabic message.
    - `slot: "popup"` → 400.
    - `link: "javascript:x"` → 400.
    - `title` of 81 characters → 400.
    - The `announcement` slot needs no image.
  - Cache invalidation: `await getLivePlacements()` returns `[]`; POST an `announcement`; `getLivePlacements()` now returns 1 without waiting 60 s; PUT `active: false` → 0; DELETE → 0.
- [ ] **Step 2: Run** `node --test tests/promotions.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Model:** fields exactly per the spec table.
    - `title` is required and ≤ 80, `subtitle` ≤ 160, `cta` ≤ 30.
    - `image` uses the product `IMAGE_URL` regex. It is required when `IMAGE_SLOTS.includes(this.slot)`; use a validator with the Arabic message `"الصورة مطلوبة لهذا الموضع"`.
    - `link` validator: `validLink`.
    - `target: { category: { type: String, enum: [...CATEGORY_KEYS, undefined] }, family: { enum: FAMILY_KEYS } }`, using `vocab.js`. The `category` values are the category **slugs** used in `/c/:category`; check `vocab.js` `CATEGORIES[].slug`.
    - `theme` default `"dark"`, `active` default true, `sort` default 0, with timestamps.
    - `ends_at` must be after `starts_at` when both are set; otherwise a 400 with `"تاريخ الانتهاء يجب أن يكون بعد البداية"`.
  - **Service:** `validLink = (l) => typeof l === "string" && (/^\/(?![\/\\])\S*$/.test(l) || (() => { try { return new URL(l).protocol === "https:"; } catch { return false; } })())`.
    - Cache: `{ at, rows }`, refetched when older than 60 s. `getLivePlacements` filters `isLive` in memory at call time (so a window edge inside the 60 s is respected) over the cached active rows.
  - **Controller:** pick only the known fields from `req.body`, and use `runValidators` on update (global). Hero slides: the spec allows max 3 admin slides live at once. Enforce this at render time (Task 4) by taking the first 3, not at write time.
- [ ] **Step 4: Run** `npm test` and `npm run test:e2e`. Expected: all green.
- [ ] **Step 5: Commit** `feat: scheduled promotion placements with admin API`.

---

### Task 3: Discount codes: model, check endpoint, order integration

**Files:**
- Create: `backend/models/coupon.model.js`, `backend/services/coupons.service.js`, `tests/coupons.test.js`
- Modify:
  - `backend/models/order.model.js`: `discount: { type: Number, default: 0 }`, `coupon: { code: String, type: String, value: Number }`.
  - `backend/services/order.service.js`: `setTotals`, `placeOrder`, `confirmOrder` (re-derive via `setTotals`), `changeStatus`, `removeOrder`.
  - `backend/store/validate.js`: optional `coupon`, a string ≤ 20.
  - `backend/controller/store.Controller.js` and `backend/routes/store.Routs.js`: `POST /api/store/coupons/check`, limiter `coupons` 30/h.
  - `backend/app.js`: limits default `coupons: { windowMs: 3600000, max: 30 }`.
  - `backend/controller/promotions.Controller.js` and `backend/routes/promotions.Routs.js`: admin `GET/POST /api/coupons`, `PUT/DELETE /api/coupons/:id`.
  - `backend/controller/report.Controller.js`: nothing, unless its revenue sums should subtract `discount`. They stay pre-discount per the spec. Add a one-line code comment saying so.

**Interfaces:**
- Produces:
  - `normalizeCode(v) → string | null`: `String(v).trim().toUpperCase()`, valid if it matches `/^[A-Z0-9_-]{3,20}$/`.
  - `checkCoupon(code, subtotal, now) → { valid: boolean, discount: number, message: string, coupon? }`.
    - One generic message `"الكود غير صالح أو منتهي"` for unknown, inactive, outside the window, or used up.
    - A `min_subtotal` failure gives `"أضف ${money(min_subtotal − subtotal)} لتفعيل هذا الكود"` (`money` from `storefront/js/shared/format.js`).
  - `claimCoupon(code, session) → coupon | null`: the guarded `updateOne` from the spec, then returns the doc.
  - `releaseCoupon(code, session)`: `updateOne({ code, used: { $gt: 0 } }, { $inc: { used: -1 } })`.
  - Public `POST /api/store/coupons/check` takes `{ code, subtotal }` and returns `200 { success: true, valid, discount, message }`.
  - Order body `coupon` maps to `placeOrder(input.coupon_code)`. `publicOrder.discount` is now real, and `publicOrder.coupon = order.coupon?.code ?? null`.

- [ ] **Step 1: Write failing tests** in `tests/coupons.test.js` (use `startTestApp`, seed oil, bottle and product as in `tests/store-orders.test.js`):
  - **Percent:** `SAVE10` (percent 10) on a 40.00 order gives `discount 4`, `total 36 + delivery`. **Fixed:** `FLAT5` (fixed 5) gives `discount 5`. A fixed code larger than the revenue caps the discount at the revenue.
  - **Windows:**
    - `starts_at` = now + 1 h → invalid;
    - `ends_at` = now − 1 ms → invalid;
    - `ends_at` = now + 1 h → valid;
    - `active: false` → invalid.
  - **Enumeration:** unknown, inactive, expired and used-up codes all return the identical `message` string.
  - **`min_subtotal`:** 50 with subtotal 40 gives `valid: false` and a message containing `10.00`.
  - **Normalization:** `"  save10 "` is accepted as `SAVE10`.
  - **Order placement:**
    - An online order with `coupon: "SAVE10"` stores `coupon: { code: "SAVE10", type: "percent", value: 10 }` and `discount: 4`, and `used` becomes 1.
    - A POS order with a `coupon_code` ignores it (`discount 0`, `used` unchanged).
  - **Concurrency:** with `MAX1` (`max_uses: 1`), two parallel `POST /api/store/orders` (different `client_key`s) give exactly one 201 and one 400 with an Arabic reason, and `used === 1`.
  - **Idempotent replay:** the same `client_key` twice with a coupon gives `used === 1`.
  - **Refund once:**
    - cancel → `used` goes back to 0;
    - delete of that canceled order → still 0;
    - a second cancel → still 0 (409 or no-op per the existing rules);
    - delete of a non-canceled order with a coupon → returns the use once.
  - **Confirm edits:** with a 10% code, confirming with the quantity edited 1 → 2 recomputes `discount` from the edited revenue. `total_profit === round2(Σ line profit − discount)`, and before confirmation `total_profit === 0`.
  - **Deleted coupon:** cancelling an order whose coupon was deleted must not throw.
  - **Admin API:**
    - `POST /api/coupons` without auth → 401.
    - A duplicate `code` → 409 or 400 with an Arabic message.
    - `value: 0` → 400; percent `value: 101` → 400.
    - The code is stored uppercase.
  - **Rate limit:** use `createApp({ limits: { coupons: { windowMs: 60000, max: 2 } } })` the way `tests/store-orders.test.js` builds its own app for the orders limiter. The 3rd `/api/store/coupons/check` → 429.
- [ ] **Step 2: Run** `node --test tests/coupons.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Model:**
    - `code` is unique, uppercase and trimmed, matching `^[A-Z0-9_-]{3,20}$`.
    - `type` enum `["percent","fixed"]`.
    - `value` `> 0` (a validator), and ≤ 100 when the type is percent.
    - `min_subtotal` ≥ 0, default 0.
    - `starts_at` and `ends_at` are optional Dates.
    - `max_uses` ≥ 0 (0 = unlimited), `used` default 0, `active` default true, with timestamps.
  - **`placeOrder`:** online only. Inside the transaction, after pricing:
    - if `coupon_code` is present: `const c = normalizeCode(...)`; run `checkCoupon(c, order.total_revenue)` (pre-discount revenue) and throw a 400 with its message if invalid;
    - then `claimCoupon(c, session)` — `null` → 400 `"انتهت استخدامات هذا الكود"`;
    - set `order.coupon = { code, type, value }` before `setTotals`.
  - The idempotent replay path returns the existing order **before** claiming.
  - **`setTotals`:** implement the Global Constraints formulas. Profit is `stock_deducted ? round2(Σ line total_profit − discount) : 0`.
  - **Release:** in `changeStatus`, where `restock(order, session)` runs on the transition into `canceled`, also call `if (order.coupon?.code) await releaseCoupon(order.coupon.code, session)`. Do the same in `removeOrder` inside its `status !== "canceled"` branch.
- [ ] **Step 4: Run** `npm test` and `npm run test:e2e`. Expected: all green, including the existing order tests.
- [ ] **Step 5: Commit** `feat: discount codes claimed inside the order transaction, returned once on cancel`.

---

### Task 4: Storefront: render every slot

**Files:**
- Create: `backend/store/views/promo.js`, `storefront/css/promo.css`, `storefront/js/promo.js`
- Modify:
  - `backend/store/views/components.js`: `slot(name, placements, ctx)` delegates to `promo.js`; remove the `ponytail:` stub comment.
  - `backend/store/views/home.js`, `collection.js`, `product.js`, `layout.js` (announcement bar above the header on every page; `cart_upsell` inside the drawer; `promo.css`/`promo.js` loaded when any slot is non-empty).
  - `backend/routes/storefront.Routs.js`: call `getLivePlacements()` alongside `getCatalog()` in each page handler, and pass it to `send()`/the views. The 404/500 pages pass none, so they do no DB work.
- Test: `tests/store-pages.test.js`, `tests/e2e/promotions.mjs` (new; register it in `run.mjs` with one import plus one call, like `admin-online.mjs`)

**Interfaces:**
- Consumes: `getLivePlacements`, `forSlot` (Task 2).
- Produces: `placementMarkup(slot, placements, { category?, family?, index? })` → the escaped `html` fragment for that slot. Markup per the spec's "Rendering per slot":
  - **`announcement`:** `<div class="announce" role="region" aria-label="إعلانات">` with each item as `<p class="announce-item">` (link optional). Include a dismiss button (`aria-label="إغلاق الإعلان"`). Several items rotate every 5 s in `promo.js`, paused on hover and focus, with no rotation under reduced motion. The dismissal lasts the session (`sessionStorage` `nsamat_announce_dismissed`, try/catch).
  - **`hero`:** the brand welcome slide stays first. Up to 3 admin slides follow, each an `<article class="hero-slide theme-…">` containing:
    - `<img alt="title" …>` (not the LCP: `loading="lazy"`, because the brand slide is the LCP);
    - real `<h2>`/`<p>` text;
    - a CTA link.

    `promo.js` handles the slider: arrow buttons (RTL-aware), dots (`aria-label="الشريحة n"`, `aria-current`), swipe (pointer events) and 6 s auto-advance. Auto-advance pauses on hover, on focus and while `document.hidden`, and is off under reduced motion. With no admin slides the hero is exactly as today, and no slider JS runs.
  - **`home_mid` and `home_bottom`:** wide banners, two side by side at ≥ 900 px when two are live (CSS grid).
  - **`collection_banner`:** under the aisle header, filtered by `forSlot(..., { category | family })`.
  - **`grid_tile`:** a card-sized promo inserted after collection items 4, 12, 20, … (index-based), cycling through the matching tiles. It must not break `collection.js`'s client-side re-filtering: tiles carry `data-promo` and are skipped by the filter logic. Check `storefront/js/collection.js` and keep the tiles' positions stable.
  - **`product_promo`:** a slim strip under the price on the product page.
  - **`cart_upsell`:** a card inside the cart drawer (`layout.js` already has the hook).
  - **External links** get `rel="noopener"` (and `target="_blank"` only for external `https:` links). Internal links have no target.
  - **Themes:** `dark`, `light` and `gold` classes map to token pairs that meet ≥ 4.5:1 text contrast.

- [ ] **Step 1: Write failing tests** in `tests/store-pages.test.js`. Seed placements directly with the model in the test DB, then call `invalidatePlacements()`.
  - An announcement with title `<script>alert(1)</script>` renders escaped on `/` and on a product page, and never raw.
  - A hero slide shows its title as real text inside `.hero-slide`. The brand h1 is still the only `<h1>`.
  - A `collection_banner` targeted to `men` appears on `/c/men`, not on `/c/women`.
  - With 5 matching `grid_tile`s and ≥ 13 products on `/c/men`, a tile appears after item 4 and after item 12.
  - A `product_promo` appears on `/p/:id`, and a `cart_upsell` in the drawer markup.
  - An expired placement (`ends_at` in the past) appears nowhere.
  - An external `https:` link has `rel="noopener"`.
  - The 404 page makes no placement query: extend the existing 404 no-DB test if present.
- [ ] **Step 2: Run** `node --test tests/store-pages.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Add the e2e scenario "Promotions render"** in `tests/e2e/promotions.mjs`, at 1440 and at 375 (`openPage({ mobile: true })`). Seed an announcement (2 items) and 2 hero slides via the models, then check:
  - the home page has no console or CSP errors;
  - the hero next arrow shows slide 2 (its title is visible);
  - the announcement dismiss hides the bar, and it stays hidden after a reload in the same context;
  - no horizontal scroll: `document.documentElement.scrollWidth <= innerWidth && innerWidth === viewport.width`.
  - Reduced motion (`page.emulateMedia({ reducedMotion: "reduce" })`): the announcement doesn't rotate within 6 s.
  - Save screenshots `p4-home-1440.png` and `p4-home-375.png` to the session scratchpad directory given in your brief.
- [ ] **Step 5: Run** `npm test` and `npm run test:e2e`. Expected: all green.
- [ ] **Step 6: Commit** `feat: storefront renders scheduled ads in every slot`.

---

### Task 5: Checkout coupon field and discount display

**Files:**
- Modify: `backend/store/views/checkout.js`, `storefront/js/checkout.js`, `storefront/js/shared/cart-store.js` (`priceCart` accepts an optional `{ discount }` for display only), `backend/store/views/order.js`, `storefront/css/pages.css`
- Test: `tests/cart-store.test.js`, `tests/e2e/promotions.mjs`

**Interfaces:**
- Consumes: `POST /api/store/coupons/check` → `{ valid, discount, message }`. The order body field `coupon`; `publicOrder.discount`, `publicOrder.coupon` (Task 3).
- Produces: a checkout UI with a collapsible "لديك كود خصم؟" (a native `<details>`).
  - It contains a code input (`autocapitalize="characters"`, `autocomplete="off"`) and an "تطبيق" button.
  - The result shows inline (`aria-live="polite"`). A valid result shows a discount row in the summary and in the sticky mobile bar total.
  - Changing the cart re-checks the applied code.
  - Removing the code (an × button) clears it.
  - The applied code is sent as `coupon` in the order body and is part of the `client_key` signature.
  - If the server rejects the code at order time, the returned message shows next to the code field, and the rest of the form stays filled.
  - Confirmation page: a "الخصم (CODE)" row when `discount > 0`.

- [ ] **Step 1: Write failing tests.**
  - `tests/cart-store.test.js`: `priceCart(lines, catalog, settings, { discount: 4 })` gives `total === subtotal − 4 + delivery`, and the delivery fee is still decided on the **pre-discount** subtotal.
  - e2e "Coupon checkout" at 375 (mobile):
    - seed `SAVE10`; add a product; open checkout;
    - apply ` save10 ` (lowercase and padded) → the discount row is visible;
    - submit → the confirmation shows the discount row, and the admin `GET /api/orders` has that order with `discount > 0`;
    - apply `NOPE` → the generic message shows and no discount row appears.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run test:e2e`. Expected: all green.
- [ ] **Step 5: Commit** `feat: discount codes at checkout`.

---

### Task 6: Admin: promotions page, navbar, report note

**Files:**
- Create: `frontend/html/promotions.html`
- Modify: `frontend/js/navbar.js` (link "العروض والإعلانات" → `promotions.html`), `frontend/js/reports.js` (help text: "التقارير حسب المنتج قبل خصم الأكواد"), `frontend/css/style.css` (only if needed; keep additions small)
- Test: `tests/e2e/promotions.mjs`

**Interfaces:**
- Consumes: the admin placement and coupon APIs (Tasks 2 and 3); the existing upload component `frontend/js/upload.js` (read how `add_product.html` uses it).
- Produces: `promotions.html` with two tabs (buttons with `role="tab"`, `aria-selected`, and panels with `role="tabpanel"`).
  - **الإعلانات:**
    - placements grouped by slot (Arabic slot names);
    - each shows a thumbnail, a status badge (مباشر / مجدول / منتهي / متوقف, computed client-side with the same live rule), an active toggle, sort up/down, edit, delete (with confirm) and a "عرض في المتجر" link to where the slot appears;
    - the add/edit form has slot, title, subtitle, image (upload component, required for image slots), link, cta, theme, target (category or family selects, shown only for `collection_banner`/`grid_tile`), starts/ends (`datetime-local` → ISO), active and sort.
  - **أكواد الخصم:**
    - a table of code, type/value, window, `used/max` (∞ when 0), an active toggle, edit and delete;
    - the form has code (uppercased as you type), type, value, min_subtotal, starts/ends, max_uses and active.
  - Every DB value renders via `esc()` or `textContent`. Server validation messages show next to the form (`#error`, `role="alert"`). Save is disabled while the request runs.

- [ ] **Step 1: Write the failing e2e scenario "Admin promotions"** (desktop):
  - Log in and open `promotions.html`.
  - Create an announcement titled `"عرض <b>&</b> 'خاص'"` → it appears in the list as literal text, with no `<b>` element.
  - Open `/` in the same browser → the announcement bar shows the same literal text.
  - Toggle it inactive → gone from `/` after reload (cache invalidated).
  - Create coupon `TEST20` (percent 20) → the list shows `TEST20` and `0/∞`.
  - A second create of `TEST20` → the error message is visible.
  - A placement link `javascript:alert(1)` → the error is visible and nothing is saved.
  - A `hero` without an image → the error is visible.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: FAIL (page missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run test:e2e`. Expected: all green. Save the screenshot `p6-promotions-1440.png` to the scratchpad.
- [ ] **Step 5: Commit** `feat: admin promotions page for ads and discount codes`.

---

### Task 7: Final checks (controller)

- [ ] `npm test` and `npm run test:e2e` green; `npm audit --omit=dev` clean.
- [ ] Final whole-branch review of `4ff78aa..HEAD` against the spec and this plan's Review Focus. Fix round.
- [ ] Merge to `main` (fast-forward; not pushed).
