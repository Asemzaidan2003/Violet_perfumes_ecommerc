# Storefront Core — Design Spec

Status: approved to proceed autonomously by the user, 2026-09-25
Scope: storefront sub-project 2 of 4. Depends on catalogue foundation (1) and the order & stock
engine (`2026-09-25-order-stock-engine-design.md`). Promotions (3) fill the placement slots defined
here; the immersive layer (4) adds 3D and signature motion on top.

## Intent (from the owner)

"Make the customer feel like they are in a real store" — an experience, not a generic shop:
unforgettable, yet **fast to order** and **smooth to search and navigate**, mobile-first, with
places for ads/offers in many forms (not only the hero). Arabic, RTL, Jordan, JOD.
Benchmark: vperfumesjo.com — good discovery (gender → collection → scent family) but orders end in
WhatsApp, offers only in a banner strip, no stock handling, deep menus heavy on mobile. We beat it on
each of those.

## Architecture

- Same Express app. Storefront pages are **server-rendered HTML** at `/` (fast first paint, share
  previews on WhatsApp/Instagram via Open Graph, SEO) with small ES-module scripts for interaction
  (progressive enhancement: browsing works without JS; cart/checkout need JS).
- No framework, no build step. HTML via a tiny tagged-template helper `html\`...\`` that
  **escapes every interpolation by default** (`raw()` to opt out for trusted markup) — XSS-safe by
  construction for customer-visible pages.
- Files:
  - `backend/store/html.js` — `html` tag, `raw`, `esc`.
  - `backend/catalog/pricing.js` — `effectivePrice(product, sizeEntry, now)`: the **one** place a
    customer price is computed (list price with an active offer). The order service is refactored to
    use it, so the storefront display and the charged price can never disagree. Sub-project 3 adds
    offer expiry here.
  - `backend/store/catalog.js` — loads products/oils/bottles, computes availability and public
    projections, search index, best-sellers (cached 10 min).
  - `backend/store/views/*.js` — `layout`, `home`, `collection`, `product`, `checkout`, `order`,
    `notFound`, `components` (card, shelf, price, badges, placement slots).
  - `backend/controller/store.Controller.js` + `backend/routes/store.Routs.js` — public JSON API
    under `/api/store/*`, mounted **above** `app.use("/api", requireAdmin)`.
  - `backend/routes/storefront.Routs.js` — page routes (`/`, `/c/:category`, …).
  - `storefront/` — static assets served at `/assets` (`css/store.css`, `js/*.js`, `img/`).
- Settings: one `Setting` document (`_id: "shop"`): `whatsapp` (digits, e.g. `9627…`),
  `instagram` (URL), `delivery_fee` (JOD, default 0), `free_delivery_over` (JOD, 0 = off).
  Admin API `GET/PUT /api/settings`, admin page `settings.html`.

## Public API (`/api/store`, no auth)

| Route | Purpose |
|---|---|
| `GET /catalog` | compact index of all visible products for search/filter (see projection) |
| `POST /orders` | place an online order |
| `POST /interest` | "I'm interested" request for an out-of-stock perfume |

**Public product projection** (never expose `oil_id`, `oil_percentage`, `alcohol_percentage`,
costs, or stock quantities): `id, name, image, images, category, families, notes, description,
collections, keywords, offer, sizes: [{ size, price, final, in_stock }], in_stock (any size),
created, rank (best-seller rank or null)`.

**Availability** (display only — ordering is never blocked, per the owner's rule):
- `status: "discontinued"` → hidden everywhere.
- `status: "out of stock"` (manual) → every size out of stock.
- Otherwise a size is in stock when its oil has `oil_quantity ≥ oil_percentage/100 × ml` **and** a
  bottle with `capacity === ml` has `quantity ≥ 1`. Alcohol is not considered (bulk shop supply).

**`POST /orders`** body:
`{ items: [{ product_id, size, quantity }], customer: { name, phone, city, address, notes },
client_key, website }` (sub-project 3 adds `coupon`).
Governorates (Amman first): عمّان، الزرقاء، إربد، البلقاء، المفرق، جرش، عجلون، مادبا، الكرك،
الطفيلة، معان، العقبة.
- `website` is a honeypot field hidden from people (off-screen, `tabindex=-1`,
  `autocomplete=off`); if it is non-empty the request is rejected with a generic 400.
- Validation (Arabic messages): 1–20 lines, quantity 1–20; name 2–80; phone = Jordan mobile
  `07[789]\d{7}` after normalising (`+962`/`00962`/spaces/dashes → `07…`); city from the fixed
  governorate list; address 5–300; notes ≤ 500; `client_key` = UUID.
- Server-owned (never from the client): `source: "online"`, `payment_method: "Cash"`, price
  (list price with active offer), delivery fee from settings (0 when subtotal ≥ `free_delivery_over`
  > 0), `created_by: "online"`, no `bottle_id`.
- Customer: find by normalised phone; create `{ name, phone, address: "<city> — <address>" }` if
  none. The order stores a **delivery snapshot** `delivery: { name, phone, city, address, notes }`.
- Idempotency: `client_key` is stored on the order (unique sparse index); a repeat POST with the same
  key returns the original order (200) instead of creating a second one.
- Response (201): `{ ref, total, delivery_fee, items: [{ name, size, quantity, price, line_total }] }`
  where `ref` is the order's **public reference** — 10 random base32 chars (`NS-XXXXXXXXXX` shown),
  stored as unique `public_ref`. Never return ObjectIds, costs or stock data.
- Abuse: per-IP in-memory rate limit (`backend/middleware/rateLimit.js`): orders 10/hour,
  interest 20/hour → 429 with an Arabic message. `ponytail:` in-memory, single process.

**`POST /interest`**: `{ product_id, size?, name, phone, note?, website }` → `Interest` model
`{ product_id, product_name (snapshot), size, name, phone, note, status: new|contacted|closed }`.
Same validation/honeypot rules. 201 `{ ok: true }`.

## Order model additions

`public_ref` (String, unique sparse), `client_key` (String, unique sparse),
`delivery: { name, phone, city, address, notes }`. The service's `placeOrder` accepts these plus
`delivery_policy: { fee, free_over }` and applies it after pricing (fee 0 when
`total_revenue ≥ free_over > 0`); `final_total = total_revenue + delivery_fee` (coupons: sub-project 3).

## Pages

All pages: `<html lang="ar" dir="rtl">`, skip link, landmarks, one `<h1>`, `<meta name="viewport">`
without disabling zoom, meta description, Open Graph, `theme-color`.

**Header** (sticky, compact on scroll): logo (text mark "نسمات" in El Messiri + small bottle SVG),
prominent search field (desktop) / search icon (mobile) opening a full-screen search overlay,
primary nav: رجالي · نسائي · للجنسين · معطرات · العائلات العطرية (mega panel of family swatches) ·
العروض, cart button with live count. **Mobile bottom bar** (≤ 5): الرئيسية · الأقسام · بحث · السلة ·
واتساب. Safe-area insets respected.

**Home `/`** — "walking into the boutique", top to bottom:
1. Announcement bar (slot `announcement`).
2. Window display / hero (slot `hero`, up to 3 slides; default slide = brand welcome when empty).
3. The aisles — four large category tiles (Men, Women, Unisex, Home & Car).
4. Best-sellers shelf (computed from completed orders, last 90 days; falls back to newest).
5. Promo slot `home_mid`.
6. The tester bar — scent-family cards with swatch, Arabic name, short line; link to `/family/:key`.
   Families with no products are hidden.
7. New arrivals shelf (newest 12).
8. Offers shelf (products with an active offer; hidden when none).
9. Promo slot `home_bottom`.
10. Service strip: توصيل لكل الأردن · الدفع عند الاستلام · خدمة واتساب.
11. Footer: contact (WhatsApp/Instagram from settings), category links, © year.

**Shelves**: horizontal scroll-snap rows (touch-swipe, arrow buttons on desktop, keyboard focusable),
items on cream plinth cards under a soft "spotlight".

**Collection** — one view for `/c/:category` (`men|women|unisex|home|car`), `/family/:key`,
`/offers`, `/new`, `/best-sellers`, `/search?q=`:
- Aisle header (title, count; slot `collection_banner` targeted to that category/family).
- Filter bar: families chips, size chips, price range (min/max), "المتوفر فقط" toggle; sort:
  الأكثر مبيعًا (default) · الأحدث · السعر ↑ · السعر ↓. Filters apply instantly client-side
  (the page embeds its product list as JSON) and are reflected in the URL (shareable, back works).
- Grid: 2 columns mobile, 3 tablet, 4 desktop; slot `grid_tile` promo tiles injected after the 4th
  and every 8th item.
- Empty state with suggestions ("جرّب…" links to top families) — never a blank screen.

**Product card**: image (width/height set, lazy, `alt` = name), name, family chips (max 2),
"من X د.أ" price (offer shows the struck-through list price + % badge), badges: جديد (≤ 30 days),
الأكثر مبيعًا (rank ≤ 10), غير متوفر حاليًا (no size in stock). Quick-add button (adds the
default size = cheapest in-stock size, else cheapest) with feedback.

**Product `/p/:id`**:
- Gallery (swipe on mobile, thumbnails on desktop, placeholder bottle SVG for `"."`).
- Name, category link, family chips, price for the selected size (offer shown as above).
- Size chips showing size + price; out-of-stock sizes are selectable but marked, with the note
  "غير متوفر حاليًا — نحضّره لك عند الطلب وقد يستغرق وقتًا أطول" and a secondary button
  **"أعلمني عند التوفر"** opening the interest dialog (name, phone, optional note).
- Quantity stepper; **أضف إلى السلة** (primary) and **اطلب الآن** (buy now → checkout with just this
  line). On mobile these sit in a sticky bottom action bar.
- Notes pyramid (top/heart/base; hidden when empty), description, share (Web Share API, fallback copy
  link), WhatsApp inquiry link (`wa.me/<whatsapp>?text=` with product name + URL).
- Related shelf (same family, else same category), recently viewed shelf (localStorage).
- JSON-LD `Product` with `offers` (price, `priceCurrency: "JOD"`, availability).

**Cart**: slide-in drawer (a `<dialog>`-style panel: focus trapped, Esc closes, focus returns),
available on every page; `/cart` page as the deep-link target (bottom bar, shared links). Lines with image, size,
stepper, remove, line total; subtotal, delivery fee, free-delivery progress bar ("باقي X د.أ للتوصيل
المجاني") when enabled; slot `cart_upsell`; "إتمام الطلب" CTA. The cart lives in `localStorage`
(`nsamat_cart_v1`: `[{ id, size, qty }]`); prices shown are refreshed from `/api/store/catalog`, and
the server re-prices at checkout.

**Checkout `/checkout`** — one screen, 4 required fields, target under 30 seconds:
الاسم · رقم الهاتف (`type=tel`, `inputmode=numeric`, `autocomplete=tel`) · المحافظة (select of the
12 governorates, Amman first) · العنوان بالتفصيل (textarea, `autocomplete=street-address`) ·
ملاحظات (optional). Payment shown as a single fixed option "الدفع عند الاستلام". "تذكّر معلوماتي"
(default on) stores the details in localStorage for the next order. Inline errors under each field
(`aria-describedby`), a summary of errors on submit, submit button shows progress and cannot
double-submit; `client_key` generated once per checkout attempt (sessionStorage) so retries are safe.
Order summary (sticky on desktop, collapsible on mobile).

**Order confirmation `/order/:ref`**: thank-you, reference, items and totals, "سنتواصل معك قريبًا
لتأكيد طلبك", WhatsApp button with a prefilled message containing the reference, continue shopping.
The cart is cleared after success. Unknown ref → 404.

**404**: styled, with search and category links. `robots.txt`, `sitemap.xml` (home, collections,
products).

## Admin additions

- `interests.html` (new): list interest requests (newest first; product, size, name, phone, note,
  date), status filter, mark contacted/closed. Admin API `GET /api/interests`, `PUT /api/interests/:id`.
- `settings.html` (new): shop settings form.
- Orders list & details: show source badge "الموقع", delivery snapshot (name, phone, city, address,
  notes) on order details. **Escape all customer-supplied text** (names, phones, notes, addresses)
  wherever admin pages render it with `innerHTML` — shared `esc()` exposed by `navbar.js`, which
  every admin page already loads.
- Navbar links for the new pages.

## Design system (from ui-ux-pro-max research, adapted for Arabic RTL)

"Boutique at dusk": warm espresso-dark ambience with spotlight gradients, gold accents, products on
cream plinths (the current catalogue photos are shot on white — plinths keep them consistent).

Tokens (CSS custom properties in `storefront/css/store.css`; no raw hex in components):
- Colour: `--bg #0E0C0A` · `--surface #17130F` · `--surface-2 #211B15` · `--line #3A3128` ·
  `--text #F4EDE3` · `--text-muted #B9AC9A` · `--gold #D4AF37` · `--gold-strong #E6C46A` ·
  `--gold-ink #1A1206` (text on gold) · `--cream #F7F1E7` · `--ink #1C1917` (text on cream) ·
  `--danger #E5484D` · `--success #3FB68B` · `--focus #F2D27A`. All text pairs ≥ 4.5:1.
- Type: display **El Messiri** (600/700), UI/body **IBM Plex Sans Arabic** (400/500/600), Latin digits
  for prices; base 16px, line-height 1.6; scale 14 · 16 · 18 · 22 · 28 · 36 · 48 · clamp display.
  Google Fonts with `preconnect` and `display=swap`.
- Space 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96; radius 8 controls / 16 cards / 999 chips.
- Motion: `--dur-fast 150ms` (hover) · `--dur-base 240ms` (UI) · `--dur-slow 480ms` (reveals);
  `--ease-out cubic-bezier(.2,.8,.2,1)`; exits faster than entrances; motion only on
  transform/opacity; everything respects `prefers-reduced-motion`.
- Icons: inline SVG (stroke 1.75, `aria-hidden` when decorative, labelled when interactive);
  **no emoji**. RTL-aware chevrons.
- Touch targets ≥ 44×44 px, ≥ 8px apart; visible gold focus ring; no horizontal page scroll at
  375 px; tested at 375 · 768 · 1024 · 1440.
- Performance: images lazy with explicit dimensions (CLS < 0.1), LCP image `fetchpriority=high`,
  core storefront JS ≤ 30 KB gzip, no render-blocking scripts (`type=module`, `defer`).

## Testing

- `node:test` HTTP tests on the local test DB:
  - catalog: visible products only, no secret fields, availability rules (oil/bottle/manual status),
    offer pricing.
  - orders: happy path creates an unconfirmed **online** order with delivery snapshot, public ref,
    server prices, settings delivery fee / free-delivery rule, customer find-or-create by phone;
    idempotent retry returns the same ref; validation errors (Arabic, 400); honeypot 400; rate
    limit 429; client price/bottle ignored.
  - interest: create, validation, admin list/update.
  - pages: `/`, a collection, a product, `/checkout`, `/order/:ref`, 404 return correct status and
    key markup; user-controlled text is escaped (a product named `<img src=x onerror=alert(1)>`
    renders inert).
- Browser smoke test (`npm run test:e2e`, Playwright driving the installed Microsoft Edge via
  `playwright-core`, no browser download) against a seeded test DB: home renders without console or
  CSP errors, search finds a product, add to cart, checkout completes and shows the confirmation,
  the order appears unconfirmed in the admin list.
