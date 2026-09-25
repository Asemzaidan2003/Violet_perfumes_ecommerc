# Promotions Engine — Design Spec

Status: approved to proceed autonomously by the user, 2026-09-25. Revised after an independent
design review (same day).
Scope: storefront sub-project 3 of 4. Depends on storefront core (2), which defines the slots.

## Intent

"Nice places to post our ads or any offers we have, in multiple and different ways — not only in the
hero panel." The owner manages every placement, offer and code from the admin, with scheduling.

## Placements

`Placement` model:

| Field | Type | Notes |
|---|---|---|
| `slot` | enum | `announcement`, `hero`, `home_mid`, `home_bottom`, `collection_banner`, `grid_tile`, `product_promo`, `cart_upsell` |
| `title` | String ≤ 80, required | for `announcement` it is the whole text |
| `subtitle` | String ≤ 160 | optional |
| `image` | String | an `/img/…` upload URL; required for `hero`, `home_mid`, `home_bottom`, `collection_banner`, `grid_tile` |
| `link` | String, optional | internal path matching `^/(?![/\\])\S*$` (rejects `//evil.com`, `/\evil.com`) or an absolute URL whose `new URL(link).protocol === "https:"` (rendered with `rel="noopener"`); anything else → 400 |
| `cta` | String ≤ 30 | optional button label |
| `theme` | enum `dark`, `light`, `gold` | colour treatment |
| `target` | `{ category?, family? }` | `collection_banner`/`grid_tile` only: show only on that aisle; empty = every aisle |
| `starts_at`, `ends_at` | Date, optional | window: start inclusive, end exclusive |
| `active` | Boolean, default true | manual switch |
| `sort` | Number, default 0 | order within a slot |

**Live** = `active` and (`starts_at` unset or ≤ now) and (`ends_at` unset or now < `ends_at`). The
storefront loads live placements once per request from a 60 s in-memory cache invalidated on every
admin placement write. All placement text is rendered through the escaping `html` tag.

Rendering per slot:
- `announcement` — thin bar above the header; several rotate every 5 s (paused on hover/focus; no
  rotation under reduced motion); dismissible for the session.
- `hero` — slides after the built-in welcome slide (max 3 admin slides); swipe/arrows/dots;
  auto-advance 6 s paused on hover/focus/hidden tab; off under reduced motion.
- `home_mid`, `home_bottom` — wide banners (two side by side on desktop when two are live).
- `collection_banner` — under the aisle header, matched by `target`.
- `grid_tile` — card-sized promo after collection items 4, 12, 20…, cycling through matching tiles.
- `product_promo` — slim strip under the product price.
- `cart_upsell` — card inside the cart drawer.

Text over images is real text (never baked into the image); images have `alt` = title.

## Product offers

- Existing `p_offer_percentage` (0–100) plus `offer_ends_at` (optional Date).
- `effectivePrice` (`backend/catalog/pricing.js`, shared by display and the order service) applies
  the offer while `p_offer_percentage > 0` and (`offer_ends_at` unset or now < `offer_ends_at`).
- `/offers` lists products with a live offer; shelves/cards/pages show the struck-through list price
  and a "−X%" badge; a countdown chip (`Intl.RelativeTimeFormat("ar")`, e.g. "ينتهي خلال يومين") when
  the end is within 7 days.

## Discount codes

`Coupon`: `code` (uppercase, trim, unique, 3–20 of `[A-Z0-9_-]`), `type` `percent|fixed`, `value`
(> 0; percent ≤ 100), `min_subtotal` (≥ 0), `starts_at`/`ends_at` (start inclusive, end exclusive),
`max_uses` (0 = unlimited), `used` (default 0), `active`. Codes **stack on product offers** (the
discount applies to the already-offered subtotal).

- Checkout: collapsible "لديك كود خصم؟". `POST /api/store/coupons/check { code, subtotal }` →
  `{ valid, discount, message }`; rate limit 30/hour/IP; one generic message for unknown, inactive
  or expired codes (no enumeration); `min_subtotal` failures say how much more is needed.
- Public order body field `coupon` → service input `coupon_code` (online only). Inside the order
  transaction the service re-validates (active, window, `min_subtotal` on pre-discount
  `total_revenue`) and claims a use with a guarded update
  `updateOne({ _id, active: true, $or: [{ max_uses: 0 }, { $expr: { $lt: ["$used", "$max_uses"] } }] },
  { $inc: { used: 1 } })`; 0 matched → 400 with the Arabic reason. The order stores a snapshot
  `coupon: { code, type, value }` (validity/window are only checked at placement).
- **Totals — `setTotals` is the only place they are computed:**
  - `discount = coupon ? (percent ? round2(total_revenue × value / 100) : min(value, total_revenue)) : 0`
  - `final_total = round2(total_revenue − discount + delivery_fee)`
  - `total_profit = stock_deducted ? round2(Σ line profit − discount) : 0`
  - When the admin edits quantity/price at confirmation, the discount is re-derived from the edited
    revenue with the snapshot. Product-level reports stay pre-discount (the discount is not
    attributed to lines) — documented in the admin reports help text.
- **A use is returned exactly once**, under the same guard as the stock refund (the transition into
  `canceled`, or deleting a non-canceled order), inside the same transaction:
  `updateOne({ code, used: { $gt: 0 } }, { $inc: { used: -1 } })` — a deleted coupon is a no-op.
- POS sales don't take codes (the cashier already overrides prices).

## Admin UI

- `promotions.html` (new) — tabs **الإعلانات** (placements grouped by slot: thumbnail, live /
  scheduled / expired status, active toggle, sort up/down, edit, delete, "عرض في المتجر" link) and
  **أكواد الخصم** (code, type/value, window, `used/max`, active toggle, edit, delete). Forms reuse the
  catalogue upload component. No live preview (a thumbnail + view link is enough).
- `datetime-local` inputs are converted in the browser with `new Date(value).toISOString()` before
  sending (server stores UTC; `TZ=Asia/Amman` for display).
- Product forms gain `offer_ends_at` next to the offer percentage.
- Navbar link "العروض والإعلانات". All placement/coupon text rendered with `esc()`.

Admin API (behind `requireAdmin`): `GET/POST /api/placements`, `PUT/DELETE /api/placements/:id`,
`GET/POST /api/coupons`, `PUT/DELETE /api/coupons/:id`.

## Testing

- Placements: liveness window edges (before start, at start, before end, at end, inactive), targeting,
  link validation (`javascript:`, `//evil.com`, `/\evil.com`, `http:` rejected; `/c/men` and
  `https://…` accepted), escaped rendering, cache invalidation on write.
- `effectivePrice` expiry: display and charged price agree; an expired offer is not charged.
- Coupons: percent/fixed, `min_subtotal`, window edges, `max_uses`; concurrent orders on a 1-use code
  → exactly one succeeds; cancel returns the use once; delete of an already-canceled order doesn't
  return it again; a 10% code survives a quantity edit at confirmation in both `final_total` and
  `total_profit`; unconfirmed online orders report `total_profit` 0; the check endpoint gives one
  generic message for unknown vs inactive.
