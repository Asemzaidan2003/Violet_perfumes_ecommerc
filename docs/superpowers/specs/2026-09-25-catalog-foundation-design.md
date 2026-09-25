# Catalogue Foundation — Design Spec

Status: approved to proceed autonomously by the user ("do everything, don't wait for my input"),
2026-09-25. Revised after an independent design review (same day).
Scope: storefront sub-project 1 of 4. Sub-projects 2 (store), 3 (promotions), 4 (immersive layer)
build on it.

## Why

- **Images**: 136/147 products hotlink `fimgs.net` (another site's copyrighted photos — legal and
  reliability risk on a public store), 11 have the placeholder `"."`. There is no way to upload
  our own photos.
- **Categories** are free text and inconsistent (`" women"`, `"test"`, a product name used as a
  category, three spellings of "car diffuser").
- **Sizes** mix `"10"` and `"10ml"`. **Customer phones** are free text (the POS lookup is exact).
- **Discovery** needs scent families and notes (Oud, Musk, Amber…) — the competitor's strongest
  navigation device — and a description; none exist.

## Shared pure modules (`storefront/js/shared/`)

Plain ES modules with no Node- or browser-only APIs, imported by the server by path and loaded by
browsers from `/assets/js/shared/`. Admin pages (classic scripts) load them with `import()`.

- `vocab.js` — categories and scent families (below), each `{ key, ar, swatch }`.
- `phone.js` — `normalizePhone(input)`: maps Arabic-Indic digits U+0660–0669 and U+06F0–06F9 to
  0–9, keeps digits only, rewrites `00962…`/`962…` to `0…` and a 9-digit `7…` to `07…`; returns the
  normalised string. `isJordanMobile(p)` = `/^07[789]\d{7}$/.test(p)`.

Categories: `Men` رجالي · `Women` نسائي · `Unisex` للجنسين · `Home` معطرات منزلية ·
`Car` معطرات سيارات.

Families (key · label · swatch): `oud` عود `#5B3A1E` · `musk` مسك `#E8E0D5` · `amber` عنبر `#C77D2E` ·
`vanilla` فانيلا `#E9D6A8` · `leather` جلد `#6B4A3A` · `woody` خشبي `#7A5C3E` · `floral` زهري `#D98BA0` ·
`citrus` حمضي `#E8C23A` · `aquatic` مائي `#5BA4C9` · `powdery` بودري `#D8C8D8` · `tobacco` تبغ `#8A5A2B` ·
`coffee` قهوة `#4B2E1F` · `incense` بخور `#9A8C7A` · `oriental` شرقي `#A23B2A` · `gourmand` حلو `#C98B5E` ·
`spicy` توابل `#B5532E` · `fruity` فواكه `#E0664F` · `aromatic` أروماتيك `#6E8B5E` · `fresh` منعش `#8FC7B8`.

## Data model

`product.model.js` — additions (all optional; existing documents stay valid):

| Field | Type | Notes |
|---|---|---|
| `description` | String, trim, ≤ 2000 | product page |
| `families` | [String], enum = family keys | scent families |
| `notes` | `{ top: [String], heart: [String], base: [String] }` | each note trim ≤ 40 chars, ≤ 10 per tier |
| `images` | [String] | extra gallery images (URLs); `p_image` stays the primary image |
| `keywords` | String, trim, ≤ 300 | search synonyms incl. English names, e.g. `sauvage elixir dior` |

Changed:
- `p_category` becomes enum `Men | Women | Unisex | Home | Car` (after the migration — see the
  deploy order below).
- `size_list[].size` gets a setter: trims, strips a trailing `ml`/`مل` (any case/spacing), and the
  result must be a positive number string (validator), so `"10ml"` can never come back.
- `createProduct`/`updateProduct` accept and persist the new fields (today `createProduct` copies a
  fixed field list, which would silently drop them).

`Image` model (new) — uploaded images live **in MongoDB**, not on disk (managed hosts wipe local
disks on deploy; the DB is already backed up): `{ type: "image/webp"|"image/jpeg"|"image/png",
full: Buffer, thumb: Buffer (optional), bytes: Number }`, ≤ 3 MB per buffer (document limit 16 MB).

## Image upload (admin only)

- Browser (shared `frontend/js/upload.js` used by product forms and later promotions):
  `createImageBitmap(file)` → draw on a canvas → `toBlob("image/webp", 0.85)`; if the returned
  `blob.type` is not `image/webp` (Safari), re-encode as `image/jpeg` 0.85. Produce **full**
  (long edge ≤ 1400 px; ≤ 2400 px for banners) and **thumb** (long edge ≤ 480 px). Never use
  `blob:` URLs (CSP `img-src` has no `blob:`): preview with the URL the server returns.
- `POST /api/uploads?kind=product|banner` — sends the full image as the raw body with its
  `Content-Type`; then `POST /api/uploads/:id/thumb` sends the thumb. `express.raw({ type:
  ["image/jpeg","image/png","image/webp"], limit: "3mb" })` is mounted **only on these routes,
  after `requireAdmin`**. The handler returns 400 unless `Buffer.isBuffer(req.body)` (with
  `req.body ??= {}` a mismatched type arrives as `{}`), checks the **magic bytes** (JPEG `FF D8 FF`,
  PNG `89 50 4E 47`, WebP `RIFF….WEBP`; never SVG) and takes the type from the magic bytes, not the
  header. > 3 MB → 413.
- Response `{ id, url: "/img/<id>.<ext>", thumb: "/img/<id>-480.<ext>" }`.
- `GET /img/:file` (public, outside `/api`): serves `full` or `thumb` (falls back to `full` if no
  thumb) with `Content-Type` from the stored type and `Cache-Control: public, max-age=31536000,
  immutable`; unknown/invalid id → 404. Ids are ObjectIds, never reused.

## Admin UI

- `add_product.html` / `edit_product.html`: image drop zone + picker → resize → upload → preview;
  "set as primary"; extra gallery images (add/remove/reorder up-down); the existing URL field stays.
  Category `<select>`; scent-family checkbox chips with swatches; notes (three inputs,
  comma-separated); description; keywords.
- `all_products.html`: a "بدون صورة خاصة" (no own photo) marker for products whose `p_image` is not
  under `/img/`.
- **Bulk tagging** page `catalog.html` (new, navbar link): one table row per product — image thumb,
  name, category select, family chips — saving each row with one click (`PUT /api/products/:id`
  with only those fields), so tagging all 147 products takes one sitting. Filter: "untagged only".

## Migration (`scripts/migrate-catalog.js`)

Idempotent; runs against `MONGO_URI` (local dev now, production later by the owner).
- **Dry run by default**: prints the target host/database and the full report; `--apply` writes.
- Backup first (on `--apply`): `backups/products-YYYYMMDD-HHmmss.json` and
  `backups/customers-YYYYMMDD-HHmmss.json`, written with
  `mongoose.mongo.BSON.EJSON.stringify(docs, { relaxed: false })` (types preserved; restorable with
  `mongoimport --jsonArray --drop`). `backups/` is gitignored.
- Categories: `trim().toLowerCase()` then map: `men`→Men, `women`→Women, `unisex`→Unisex,
  `منزلي`→Home, `فواح`/`سيارات`/`defusers`→Car. The product named `test` → status `discontinued`
  (hidden from the store, kept) and category `Unisex`. Anything unmatched → `Unisex` and listed as
  **needs review**.
- Sizes: strip trailing `ml`/`مل`; duplicates after normalisation keep the first (reported).
- Customers: `phone` → `normalizePhone(phone)`; values that don't pass `isJordanMobile` are left
  unchanged and reported.
- Also report (no change): products whose `oil_id` matches no oil, or with non-numeric sizes — they
  can be ordered online but never confirmed until fixed.
- Every update is compare-and-set on the old value (`{ _id, p_category: old }`), so a concurrent edit
  is never overwritten.
- **Deploy order** (documented in the script header and the final report to the owner): stop the
  app → run `--apply` (backup included) → start the new code. With `runValidators` on, the new enum
  would reject edits of un-migrated products.

## POS phone lookup

`getCustomerByPhone` normalises its input with `normalizePhone` before matching (existing customers
are normalised by the migration).

## Testing

- Upload: 401 without the admin cookie; JPEG/PNG/WebP accepted by magic bytes; SVG, HTML and a PNG
  header on HTML bytes rejected 400; > 3 MB → 413; `GET /img/<id>.webp` serves the bytes with the
  immutable cache header; thumb fallback; unknown id 404.
- Model: bad family key → 400; note > 40 chars → 400; size `"30ml"` saves as `"30"`; size `"abc"` →
  400; legacy product without the new fields still saves/edits; `createProduct` persists the new fields.
- `normalizePhone`: `٠٧٩١٢٣٤٥٦٧`, `+962 79 123 4567`, `962791234567`, `791234567` → `0791234567`.
- Migration on a seeded test DB: dry run changes nothing; `--apply` changes exactly the expected docs
  and writes EJSON backups; a second `--apply` changes nothing.

## Out of scope

Auto-filling families/notes (the owner's knowledge — the bulk page makes it fast; the store hides
empty facets); replacing the hotlinked photos (the owner uploads their own; the store shows whatever
is set, with a branded placeholder for `"."`); bilingual content; manual "collections" (cut — no page
uses them).
