# Storefront Core — Design Spec

Status: approved to proceed autonomously by the user, 2026-09-25. Revised after an independent
design review (same day).
Scope: storefront sub-project 2 of 4. Depends on the catalogue foundation (1) and the order & stock
engine (`2026-09-25-order-stock-engine-design.md`). Promotions (3) fill the placement slots defined
here; the immersive layer (4) adds 3D and signature motion.

## Intent (from the owner)

"Make the customer feel like they are in a real store" — an experience, not a generic shop:
unforgettable, yet **fast to order** and **smooth to search and navigate**, mobile-first, with room
for ads/offers in many forms. Arabic, RTL, Jordan, JOD. Benchmark vperfumesjo.com: good discovery
(gender → collection → scent family) but orders end in WhatsApp, offers only in a banner strip, no
stock handling, deep menus heavy on mobile — we beat each of those.

## Architecture

- Same Express app. Pages are **server-rendered HTML** at `/` (fast first paint, WhatsApp/Instagram
  link previews, SEO) with small ES-module scripts for interaction. Browsing, collections and product
  pages work without JS; cart and checkout need JS.
- No framework, no build step.
- Files:
  - `backend/store/html.js` — `html` tagged template that **escapes every interpolation**, `raw()`
    for trusted markup only (never data), and `json(v)` = `JSON.stringify(v)` with `<` `>` `&`
    U+2028 U+2029 escaped as `\uXXXX` — the **only** way data enters a `<script>` block (JSON-LD,
    page data).
  - `backend/catalog/pricing.js` — `effectivePrice(product, sizeEntry, now)`: the one place a
    customer price is computed (list price with the active offer, round2). The order service is
    refactored to use it, so the displayed and charged prices can never disagree. Sub-project 3 adds
    offer expiry here.
  - `backend/store/catalog.js` — loads products/oils/bottles; availability; public projections;
    compact index; best-sellers.
  - `backend/store/views/*.js` — `layout`, `home`, `collection`, `product`, `cart`, `checkout`,
    `order`, `notFound`, `error`, `components` (card, shelf, price, badges, slot renderers).
  - `backend/controller/store.Controller.js` + `backend/routes/store.Routs.js` — public JSON API at
    `/api/store/*`, mounted **above** `app.use("/api", requireAdmin)`.
  - `backend/routes/storefront.Routs.js` — page routes; mounted after `/admin` static and the API.
  - `storefront/` — static assets at `/assets` (`css/store.css`, `js/*.js`, `js/shared/*.js`, `img/`).
  - Settings: `Setting` document `_id: "shop"`: `whatsapp` (digits, e.g. `96279…`), `instagram` (URL),
    `delivery_fee` (JOD ≥ 0, default 0), `free_delivery_over` (JOD ≥ 0; 0 = off). Admin API
    `GET/PUT /api/settings`; admin page `settings.html`.

## Platform changes

- `app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 0))` — documented in `.env.example`
  (set to the number of proxies in front of the app when deployed).
- **One rate-limit module** `backend/middleware/rateLimit.js` (extracted from the login limiter):
  `createLimiter({ windowMs, max, key })` returning `{ hit(req) → { ok, retryAfterMs }, reset(req) }`
  plus an Express middleware form; keys IPv4 by address and IPv6 by its /64; expired buckets are
  deleted on access and by a periodic sweep (`unref()` timer). Login uses it (same semantics: count
  before the first await, reset on success). Limits are options of `createApp({ limits })` so tests can
  raise them. `ponytail:` in-memory, single process.
- `compression` middleware (new dependency).
- Asset versioning: `ASSET_V` (package version + boot time) appended as `?v=` to every `/assets`
  URL; `/assets` served with `max-age=31536000, immutable`.
- Fonts self-hosted via `@fontsource/el-messiri` (700) and `@fontsource/ibm-plex-sans-arabic`
  (400, 600), served from `node_modules` at `/vendor/fonts/`; the body font is preloaded.
  **No `letter-spacing` on Arabic text** (it breaks joined letterforms).
- **Storefront CSP** (per-router helmet on storefront pages only): `script-src 'self'` plus the
  sha256 of the import map (sub-project 4), `script-src-attr 'none'`,
  `style-src 'self' 'unsafe-inline'` (inline `style` attributes carry swatch colours and stagger
  indexes; style injection is low-risk), `font-src 'self'`, `img-src 'self' data: https:`.
  Storefront markup uses no inline handlers and no inline scripts other than JSON data blocks
  (`type="application/json"` / `application/ld+json`, which are not executed). The admin keeps its
  current CSP.
- `PUBLIC_URL` env var for absolute URLs (Open Graph, canonical, sitemap, JSON-LD);
  `TZ=Asia/Amman` in the env contract (also fixes report day boundaries on a UTC host).
- Storefront error handling: page routes validate ids (`mongoose.isValidObjectId`) and render the
  404 page; a storefront error handler renders a styled 500 page (never JSON) for page routes; the
  final catch-all is `app.use(notFound)` (Express 5 rejects `app.get("*")`). `/admin` redirects to
  `/admin/html/index.html`.

## Public API (`/api/store`, no auth)

| Route | Purpose |
|---|---|
| `GET /catalog` | compact index for the search overlay and cart pricing |
| `POST /orders` | place an online order |
| `POST /interest` | "I'm interested" request |

**Compact index** (never `oil_id`, percentages, costs or stock quantities):
`[{ id, name, image, thumb, category, families, keywords, offer, sizes: [{ size, final, list,
in_stock }], rank, created }]`. Cached ≤ 30 s in memory; invalidated on product create/update/delete.

**Availability** (display only — ordering is never blocked, per the owner's rule):
- `status: "discontinued"` → hidden everywhere and not orderable (404 at order/interest).
- `status: "out of stock"` (manual) → every size out of stock.
- Otherwise a size is in stock when its oil has `oil_quantity ≥ oil_percentage/100 × ml` **and** a
  bottle with `capacity === ml` has `quantity ≥ 1`. Alcohol is not considered (bulk shop supply).

**`POST /orders`** body:
`{ items: [{ product_id, size, quantity }], customer: { name, phone, city, address, notes },
client_key, website }` (sub-project 3 adds `coupon`). The route maps `items` → the service's
`products`.
- `website` is a honeypot (off-screen, `tabindex=-1`, `autocomplete=off`); non-empty → generic 400.
- Validation (Arabic messages): 1–20 lines, quantity 1–20; name 2–80; phone via shared
  `normalizePhone` + `isJordanMobile`; city ∈ governorates (عمّان، الزرقاء، إربد، البلقاء، المفرق،
  جرش، عجلون، مادبا، الكرك، الطفيلة، معان، العقبة); address 5–300; notes ≤ 500; `client_key` = UUID v4.
  `<` and `>` are stripped from name, address and notes.
- **The service owns every other field for `source: "online"`**: `placeOrder` ignores
  `input.delivery_fee`, `payment_method`, `customer_id`, `order_notes` and any `price`/`bottle_id`,
  requires `delivery_policy: { fee, free_over }` and `delivery`, and sets `payment_method: "Cash"`,
  `created_by: "online"`. A `discontinued` product → 404.
- **Free delivery** is decided once, at placement, on the pre-discount `total_revenue`
  (`delivery_fee = total_revenue ≥ free_over > 0 ? 0 : fee`) and stored; later edits never re-apply
  it. The cart's progress bar uses the same basis.
- **No customer record is read or written at placement** (the phone is unverified). The order keeps
  a snapshot `delivery: { name, phone, city, address, notes }`. When the admin **confirms** an online
  order without `customer_id`, `confirmOrder` finds the customer by normalised phone and links it,
  or creates `{ name, phone, address: "<city> — <address>" }` from the snapshot. Order data never
  modifies an existing customer. Admin lists/search show `delivery.name/phone` for online orders,
  falling back to the linked customer.
- **Idempotency**: `client_key` is stored on the order (unique sparse index). Inside `placeOrder`'s
  transaction the key is looked up first and, if found, that order is returned unchanged (so a
  write-conflict retry also re-checks). A duplicate-key error on `client_key` after commit also
  returns the stored order. The checkout generates a new key whenever the cart changes and after a
  successful order.
- Response 201: `{ ref, subtotal, delivery_fee, discount, total, items: [{ name, size, quantity,
  price, line_total }] }`; a replay returns 200 with the same body. `ref` = `public_ref`: 10 random
  base32 chars (unique), displayed as `NS-XXXXXXXXXX`. Never ObjectIds, costs or stock data.
- Rate limits: orders 10/hour/IP, interest 20/hour/IP → 429 with an Arabic message that includes the
  shop's WhatsApp link, so the sale isn't lost.

**`POST /interest`**: `{ product_id, size?, name, phone, note?, website }` → `Interest`
`{ product_id, product_name (snapshot), size, name, phone, note, status: new|contacted|closed }`.
Same validation/honeypot/stripping rules; a duplicate (same phone + product + size while `new`)
updates the existing request instead of creating another. 201 `{ ok: true }`.

## Order model & service additions

Order: `public_ref` (unique sparse), `client_key` (unique sparse), `delivery { name, phone, city,
address, notes }`. `placeOrder` gains `delivery_policy`, `delivery`, `client_key` (online);
`confirmOrder` accepts an optional `delivery_fee` (≥ 0) edit and links the customer as above.
`setTotals` remains the single totals function (`final_total = total_revenue + delivery_fee`;
sub-project 3 adds the discount).

## Pages

All pages: `<html lang="ar" dir="rtl">`, skip link, landmarks, one `<h1>`, viewport meta without
zoom lock, meta description, canonical, Open Graph (`PUBLIC_URL`), `theme-color`.
Numbers: `Intl.NumberFormat("ar-JO-u-nu-latn")` (Latin digits), prices `"20.00 د.أ"`; prices,
percentages, phone numbers and `NS-` refs wrapped in `<bdi>`; phone inputs `dir="ltr"`; plurals and
relative times via `Intl.PluralRules`/`RelativeTimeFormat("ar")`; CSS logical properties;
horizontal scrollers and swipes are RTL-aware.

**Header** (sticky, compact on scroll): wordmark "نسمات" (El Messiri) + small bottle SVG; a
prominent search field (desktop) / search icon (mobile) opening the search overlay; nav:
رجالي `/c/men` · نسائي `/c/women` · للجنسين `/c/unisex` · معطرات `/c/home` (with a chip to switch to
`/c/car`) · العائلات العطرية (panel of family swatches, only families that have products) ·
العروض `/offers`; cart button with a live count. **Mobile bottom bar** (≤ 5): الرئيسية · الأقسام ·
بحث · السلة · واتساب — hidden on product and checkout pages (they have their own sticky action bar).

**Search** — one pure module `storefront/js/shared/search.js`, used by the server-rendered
`/search?q=` and the client overlay (identical results):
`normalize()` = NFKC, strip U+064B–065F, U+0670 and tatweel U+0640, map `[أإآٱ]→ا`, `ة→ه`, `ى→ي`,
`ؤ→و`, `ئ→ي`, Arabic-Indic digits → ASCII, lowercase. Tokens longer than 3 letters drop a leading
`ال`, `وال`, `بال`, `لل`. Every query token must prefix-match a token of the name, keywords, family
labels or notes. Rank: name-prefix > name > keywords > families/notes, then best-seller rank. The
overlay searches as you type (no request per keystroke — it filters the compact index), shows
product thumbs + price, highlights nothing it can't match, and offers family/category suggestions
on "no results".

**Home `/`** — "walking into the boutique":
1. Announcement bar (slot `announcement`).
2. Window display / hero (slot `hero`; slide 1 is always the built-in brand welcome, admin hero
   placements follow).
3. The aisles — tiles: رجالي · نسائي · للجنسين · معطرات (→ `/c/home`).
4. Best-sellers shelf (completed orders, last 90 days, cached 10 min; falls back to newest).
5. Slot `home_mid`.
6. The tester bar — scent-family cards (swatch, label, product count) → `/family/:key`; hidden
   families with no products; the whole section hidden when no product has families yet.
7. New arrivals (newest 12). 8. Offers shelf (live offers; hidden when none). 9. Slot `home_bottom`.
10. Service strip: توصيل لكل الأردن · الدفع عند الاستلام · خدمة واتساب. 11. Footer (WhatsApp,
    Instagram, category links, © year).

**Shelves**: horizontal scroll-snap rows (swipe, arrow buttons on desktop, keyboard focusable), items
on cream plinth cards under a soft spotlight.

**Collection** — one view for `/c/:category` (`men|women|unisex|home|car`), `/family/:key`,
`/offers`, `/new`, `/best-sellers`, `/search?q=`:
- Aisle header (title, count; slot `collection_banner` matched by target).
- Filters: family chips, size chips, "المتوفر فقط"; sort: الأكثر مبيعًا (default) · الأحدث ·
  السعر ↑ · السعر ↓. The server renders the filtered/sorted grid from the query string
  (`?f=oud,musk&s=30,50&stock=1&sort=price_asc`, comma-separated), so shared URLs and no-JS work;
  with JS, cards carry `data-*` attributes and filtering/sorting hides and reorders them instantly,
  updating the URL with `history.replaceState` (back returns to the previous page, not each filter).
- Grid: 2 columns mobile, 3 tablet, 4 desktop; `grid_tile` promos after items 4, 12, 20… (cycling
  through the live tiles).
- Empty state with suggestions — never a blank screen.

**Product card**: image (`srcset` with the 480 px thumb for uploaded images, explicit width/height,
lazy, `alt` = name), name, up to 2 family chips, "من X" price (offer: struck-through list price +
"−X%" badge), badges جديد (≤ 30 days), الأكثر مبيعًا (rank ≤ 10), **غير متوفر حاليًا** (no size in
stock). Quick-add (cheapest in-stock size, else cheapest) with feedback.

**Product `/p/:id`**:
- Gallery (swipe on mobile, thumbnails on desktop; branded bottle placeholder for `"."`).
- Name, category link, family chips, price for the selected size.
- Size chips (size + price). Out-of-stock sizes stay selectable and are marked
  **غير متوفر حاليًا**, with the note "نحضّره لك عند الطلب وقد يستغرق وقتًا أطول" and a secondary
  button **أعلمني عند التوفر** (native `<dialog>`: name, phone, optional note).
- Quantity stepper; **أضف إلى السلة** (primary) and **اطلب الآن** (adds the line to the cart and
  opens checkout with the whole cart). Mobile: sticky bottom action bar.
- Notes pyramid (hidden when empty), description, share (Web Share API, fallback copy link),
  WhatsApp inquiry link.
- Related shelf (same family, else same category), recently viewed (localStorage).
- JSON-LD `Product` via `json()`: offers with price, `priceCurrency: "JOD"`, availability `InStock` or
  `MadeToOrder`.

**Cart**: a native `<dialog>` drawer opened with `showModal()` (focus trap, Esc, inert background
for free), on every page; `/cart` renders the normal layout with the drawer open. Lines: image, size,
stepper, remove, line total; subtotal, delivery fee, free-delivery progress ("باقي X للتوصيل
المجاني"); slot `cart_upsell`; "إتمام الطلب". Storage `localStorage` `nsamat_cart_v1`
`[{ id, size, qty }]`; prices refreshed from `/api/store/catalog`; the server re-prices at checkout.
Client-side rendering (overlay, drawer, recently viewed) uses `textContent`/`<template>` cloning —
never `innerHTML` with data.

**Checkout `/checkout`** — one screen, 4 required fields, target < 30 seconds:
الاسم (`autocomplete=name`) · رقم الهاتف (`type=tel`, `inputmode=numeric`, `dir=ltr`,
`autocomplete=tel`; validated with the shared `normalizePhone`) · المحافظة (select, Amman first) ·
العنوان بالتفصيل (`autocomplete=street-address`) · ملاحظات (optional). Payment: single fixed option
"الدفع عند الاستلام". "تذكّر معلوماتي" (default on) stores details in localStorage. Inline errors
under fields (`aria-describedby`) plus an error summary on submit; the submit button shows progress
and can't double-submit. A one-line privacy note (Jordan PDPL 2023): details are used only to deliver
the order. Order summary (sticky desktop, collapsible mobile).

**Order confirmation `/order/:ref`** (`Cache-Control: no-store`, `noindex`): thank-you, `NS-` ref,
items, totals, "سنتواصل معك قريبًا لتأكيد طلبك", WhatsApp button with a prefilled message containing
the ref, continue shopping. Shows no delivery details. Cart cleared after success. Unknown ref → 404.

**404 / 500**: styled, with search and category links. `robots.txt` disallows `/admin`, `/api`,
`/checkout`, `/order`; `sitemap.xml` lists home, collections and products.

## Admin additions

- `interests.html` (new): requests newest first (product, size, name, phone, note, date), status
  filter, mark contacted/closed, WhatsApp button per row. API `GET /api/interests`,
  `PUT /api/interests/:id`.
- `settings.html` (new): shop settings form.
- Orders list: source badge "الموقع", delivery name/phone for online orders, WhatsApp button.
  Order details: delivery block, optional delivery-fee edit at confirmation.
- **New-order signal**: `navbar.js` polls the unconfirmed-order count every 60 s and shows a badge on
  the orders link and "(n)" in the page title.
- **Escape all customer, delivery and interest text**: `navbar.js` defines `esc()` (escapes
  `& < > " '`), applied to every such interpolation in `orders.html` (rows and search),
  `order-details.html` (summary incl. `order_notes`, delivery block), `reports.js` (customers tab),
  `interests.html` (and later `promotions.html`).
- Navbar links for the new pages.

## Design system (ui-ux-pro-max research, adapted for Arabic RTL)

"Boutique at dusk": warm espresso-dark ambience with spotlight gradients, gold accents, products on
cream plinths (today's catalogue photos are shot on white — plinths keep them consistent).

Tokens (CSS custom properties in `storefront/css/store.css`; no raw hex in components):
- Colour: `--bg #0E0C0A` · `--surface #17130F` · `--surface-2 #211B15` · `--line #3A3128` ·
  `--text #F4EDE3` · `--text-muted #B9AC9A` · `--gold #D4AF37` · `--gold-strong #E6C46A` ·
  `--gold-ink #1A1206` (text on gold) · `--cream #F7F1E7` · `--ink #1C1917` (text on cream) ·
  `--danger #E5484D` · `--success #3FB68B` · `--focus #F2D27A`. Every text pair ≥ 4.5:1.
- Type: display El Messiri 700; UI/body IBM Plex Sans Arabic 400/600; base 16px, line-height 1.6;
  scale 14 · 16 · 18 · 22 · 28 · 36 · 48 · clamp display. No letter-spacing on Arabic.
- Space 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96; radius 8 controls / 16 cards / 999 chips.
- Motion: `--dur-fast 150ms` · `--dur-base 240ms` · `--dur-slow 480ms`;
  `--ease-out cubic-bezier(.2,.8,.2,1)`; exits faster than entrances; transform/opacity only;
  `prefers-reduced-motion` respected.
- Icons: inline SVG (stroke 1.75; `aria-hidden` when decorative, labelled when interactive); no emoji;
  RTL-aware chevrons.
- Touch targets ≥ 44×44 px, ≥ 8 px apart; visible gold focus ring; no horizontal page scroll at
  375 px; checked at 375 · 768 · 1024 · 1440.
- Performance: explicit image dimensions (CLS < 0.1), LCP image `fetchpriority=high`, core storefront
  JS ≤ 30 KB gzip, scripts `type=module` (deferred), gzip via `compression`.

## Testing

- `node:test` HTTP tests on the local test DB:
  - catalog: visible products only; no secret fields; availability rules; offer pricing via
    `effectivePrice`.
  - orders: creates an unconfirmed online order with delivery snapshot, public ref, server prices,
    delivery fee and free-delivery rule; ignores client price/bottle/delivery_fee/payment/customer_id;
    no Customer created at placement; confirm links/creates the customer by normalised phone; replay
    with the same `client_key` returns the same ref (incl. concurrent replays); validation errors are
    Arabic 400; honeypot 400; rate limit 429 (limits raised via `createApp` options elsewhere);
    discontinued → 404.
  - interest: create, dedupe, validation; admin list/update.
  - pages: `/`, a collection with filters in the query, a product, `/checkout`, `/order/:ref`,
    404/500 return the right status and markup; a product named `</script><img src=x onerror=alert(1)>`
    is inert in HTML and JSON-LD; a customer with that name is inert on the admin orders page source.
  - rate limiter: IPv6 /64 grouping, bucket expiry, login still works as before.
- Browser smoke test `npm run test:e2e` — Playwright (`playwright-core`, driving the installed
  Microsoft Edge; no browser download) against a seeded test DB: home renders with no console or CSP
  errors; search finds a product (incl. an alef-variant spelling); add to cart; checkout completes and
  shows the confirmation; the order appears unconfirmed in the admin.
