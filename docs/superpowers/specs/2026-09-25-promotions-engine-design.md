# Promotions Engine — Design Spec

Status: approved to proceed autonomously by the user, 2026-09-25
Scope: storefront sub-project 3 of 4. Depends on storefront core (2), which defines the slots.

## Intent

"Nice places to post our ads or any offers we have, in multiple and different ways — not only in the
hero panel." The owner manages every placement, offer and code from the admin panel, with
scheduling, and without a developer.

## Placements

`Placement` model:

| Field | Type | Notes |
|---|---|---|
| `slot` | enum | `announcement`, `hero`, `home_mid`, `home_bottom`, `collection_banner`, `grid_tile`, `product_promo`, `cart_upsell` |
| `title` | String ≤ 80 | required except `announcement` uses it as the whole text |
| `subtitle` | String ≤ 160 | optional |
| `image` | String (upload URL) | required for `hero`, `home_mid`, `home_bottom`, `collection_banner`, `grid_tile`; optional elsewhere |
| `link` | String | internal path (`/c/men`, `/p/<id>`, `/offers`…) or `https://…`; nothing else (no `javascript:`) |
| `cta` | String ≤ 30 | button label, optional |
| `theme` | enum `dark`, `light`, `gold` | colour treatment |
| `target` | `{ category?, family? }` | for `collection_banner` / `grid_tile`: show only on that aisle; empty = everywhere |
| `starts_at`, `ends_at` | Date, optional | schedule window (inclusive start, exclusive end) |
| `active` | Boolean, default true | manual on/off |
| `sort` | Number, default 0 | order within a slot |

A placement is **live** when `active` and `starts_at ≤ now` (or unset) and `now < ends_at` (or unset).
The storefront reads live placements per page (one query per request, cached 60 s in memory and
invalidated on any admin write).

How each slot renders:
- `announcement` — thin bar above the header; rotates if several (5 s, paused on hover/focus,
  no rotation under reduced motion); dismissible per session.
- `hero` — the window display: up to 3 slides, swipe/arrows/dots, auto-advance 6 s (paused on
  hover/focus/hidden tab; off under reduced motion). When none are live, the built-in brand welcome
  slide shows.
- `home_mid`, `home_bottom` — wide banners (1 or 2 side by side on desktop).
- `collection_banner` — banner under an aisle header, matched by `target`.
- `grid_tile` — promo card injected into collection grids (after the 4th and every 8th product),
  same size as a product card, matched by `target`.
- `product_promo` — slim strip under the product price (e.g. "توصيل مجاني فوق 30 د.أ").
- `cart_upsell` — card inside the cart drawer.

Images use `alt` = title; decorative overlay text is real text, never baked into the image.

## Product offers

- Existing `p_offer_percentage` (0–100) plus new `offer_ends_at` (optional Date).
- One shared `effectivePrice(product, sizeEntry, now)` (in `backend/catalog/pricing.js`) is used by
  **both** the storefront display and the order service: the offer applies while
  `p_offer_percentage > 0` and (`offer_ends_at` unset or `now < offer_ends_at`).
- `/offers` lists products with a live offer, plus live `collection_banner`s targeted at nothing.
- Product cards/pages show the struck-through list price and a "−X%" badge; a countdown chip
  ("ينتهي خلال 2 يوم") when `offer_ends_at` is within 7 days.

## Discount codes

`Coupon` model: `code` (String, uppercase, trim, unique, 3–20 `[A-Z0-9_-]`), `type` enum
`percent|fixed`, `value` (> 0; percent ≤ 100), `min_subtotal` (≥ 0, default 0), `starts_at`,
`ends_at`, `max_uses` (0 = unlimited), `used` (default 0), `active`.

- Checkout has a collapsible "لديك كود خصم؟" field. `POST /api/store/coupons/check
  { code, subtotal }` → `{ valid, discount, message }` (Arabic message; rate limit 30/hour/IP; same
  generic message for unknown and inactive codes to avoid code enumeration).
- `placeOrder` (online only) accepts `coupon_code`. Inside the order transaction it re-validates the
  code, computes `discount` on `total_revenue` (percent → round2; fixed → min(value, revenue)),
  and increments `used` with a guarded update (`used < max_uses` when limited) so concurrent orders
  can't exceed the limit. Invalid at that moment → 400 with the Arabic reason (the checkout shows it).
- Order fields: `discount` (Number, default 0), `coupon_code` (String). Totals:
  `final_total = total_revenue + delivery_fee − discount` (never below 0);
  `total_profit = Σ line profits − discount` (discount is not attributed to lines; product-level
  reports stay pre-discount — documented).
- Cancelling or deleting an order with a coupon decrements `used` in the same transaction.
- POS sales don't take codes (the cashier already overrides prices).

## Admin UI

- `promotions.html` (new) — tabs: **الإعلانات** (placements grouped by slot with thumbnail, live/
  scheduled/expired status, active toggle, sort up/down, edit, delete) and **أكواد الخصم** (coupon
  list with usage `used/max`, active toggle, edit, delete). Create/edit forms reuse the image
  upload component from the catalogue sub-project and show a live preview of the placement in its
  slot style.
- Product forms gain `offer_ends_at` (date-time) next to the offer percentage.
- Navbar link "العروض والإعلانات".

Admin API (behind `requireAdmin`): `GET/POST /api/placements`, `PUT/DELETE /api/placements/:id`,
`GET/POST /api/coupons`, `PUT/DELETE /api/coupons/:id`.

## Testing

- Placement liveness window (before start, active, after end, inactive), targeting, link validation
  (reject `javascript:`/other schemes), public rendering escapes text.
- `effectivePrice` expiry: storefront and order service agree; an expired offer is not charged.
- Coupons: percent/fixed/min_subtotal/window/max_uses; concurrent orders on a 1-use code → exactly
  one succeeds; cancel restores `used`; `final_total`/`total_profit` include the discount; code check
  endpoint gives one generic message for unknown vs inactive.
