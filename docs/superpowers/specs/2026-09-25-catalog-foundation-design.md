# Catalogue Foundation — Design Spec

Status: approved to proceed autonomously by the user ("do everything, don't wait for my input"), 2026-09-25
Scope: storefront sub-project 1 of 4. Sub-projects 2 (store), 3 (promotions), 4 (immersive layer) build on it.

## Why

The storefront needs data the catalogue does not have today:

- **Images**: 136/147 products hotlink `fimgs.net` (a third-party site's copyrighted photos —
  legal and reliability risk on a public store), 11 have the placeholder `"."`. There is no way
  to upload our own photos.
- **Categories** are free text and inconsistent (`" women"`, `"test"`, a product name used as a
  category, three spellings of "car diffuser").
- **Sizes** mix `"10"` and `"10ml"`.
- **Discovery** needs scent families and notes (Oud, Musk, Amber…) — the competitor's strongest
  navigation device — and a description; none exist.

## Data model (`product.model.js`)

Additions (all optional, so existing documents stay valid):

| Field | Type | Notes |
|---|---|---|
| `description` | String, trim, ≤ 2000 | shown on the product page |
| `families` | [String] enum of family keys | scent families (below) |
| `notes` | `{ top: [String], heart: [String], base: [String] }` | each note trim ≤ 40 chars, ≤ 10 per tier |
| `images` | [String] | extra gallery images (URLs); `p_image` stays the primary image |
| `collections` | [String] enum `niche`, `classic`, `special`, `seasonal` | manual collections |
| `keywords` | String, trim, ≤ 300 | search synonyms incl. English names, e.g. `sauvage elixir dior` |

Changed: `p_category` becomes enum `Men`, `Women`, `Unisex`, `Home`, `Car` (after the migration below).

Arabic labels live in one shared module `backend/catalog/vocab.js`, used by server and (via API/SSR)
by the storefront and admin:

- Categories: Men رجالي · Women نسائي · Unisex للجنسين · Home معطرات منزلية · Car معطرات سيارات
- Families (key → label → swatch colour used by the store and the 3D liquid tint):
  `oud` عود `#5B3A1E` · `musk` مسك `#E8E0D5` · `amber` عنبر `#C77D2E` · `vanilla` فانيلا `#E9D6A8` ·
  `leather` جلد `#6B4A3A` · `woody` خشبي `#7A5C3E` · `floral` زهري `#D98BA0` · `citrus` حمضي `#E8C23A` ·
  `aquatic` منعش مائي `#5BA4C9` · `powdery` بودري `#D8C8D8` · `tobacco` تبغ `#8A5A2B` ·
  `coffee` قهوة `#4B2E1F` · `incense` بخور `#9A8C7A` · `oriental` شرقي `#A23B2A` ·
  `gourmand` حلو `#C98B5E` · `spicy` توابل `#B5532E` · `fruity` فواكه `#E0664F` ·
  `aromatic` أروماتيك `#6E8B5E` · `fresh` منعش `#8FC7B8`

## Image upload (admin only)

- `POST /api/uploads` behind `requireAdmin`, body = the raw image
  (`express.raw({ type: ["image/jpeg","image/png","image/webp"], limit: "3mb" })`) — no multipart
  library. The admin page resizes in the browser first (canvas → WebP, max 1400 px long edge,
  quality 0.85), so uploads are small and consistent.
- Server checks the magic bytes match JPEG/PNG/WebP (never SVG — script risk), writes
  `uploads/products/<random hex>.<ext>`, returns `{ url: "/uploads/products/<file>" }`.
- `/uploads` is served statically with `Cache-Control: public, max-age=31536000, immutable`
  (file names are random, never reused). `uploads/` and `backups/` are gitignored.
- `ponytail:` local disk storage; move to object storage (S3/R2/Cloudinary) when the app runs
  on more than one server or ephemeral hosting.

## Admin UI

`add_product.html` and `edit_product.html` gain:
- Image: file picker + drop zone → resize → upload → preview; set as primary; extra gallery images
  (add/remove/reorder with up/down buttons). The existing URL field stays for pasting a URL.
- Category `<select>` (enum above, Arabic labels).
- Scent families: checkbox chips (with swatch).
- Notes: three text inputs (top/heart/base), comma-separated.
- Description textarea, collections checkboxes, keywords input.
- `all_products.html` shows a small "بدون صورة خاصة" (no own photo) marker for products whose
  `p_image` is not under `/uploads/`, so the owner can see what still needs a photo.

## Migration (`scripts/migrate-catalog.js`)

Idempotent, runs against `MONGO_URI` (local dev now; production later, by the owner):
1. Back up the `products` collection to `backups/products-<ISO timestamp>.json` before changing anything.
2. Categories: `Men`/`Women`/`Unisex` kept; `" women"`/`"women"` → `Women`; `منزلي` → `Home`;
   `فواح`, `سيارات`, `Defusers` → `Car`; the product named `test` → status `discontinued`
   (hidden from the store, kept in the DB) and category `Unisex`; any other unknown value → `Unisex`,
   listed in the report for review.
3. Sizes: strip a trailing `ml` (case-insensitive) → `"10ml"` becomes `"10"`; duplicates after
   normalisation keep the first entry (reported).
4. Print a report of every changed document (`_id`, name, field, old → new).

## Testing

- Upload: admin-only (401 without cookie); JPEG/PNG/WebP accepted by magic bytes; SVG/HTML/fake
  content-type rejected 400; > 3 MB rejected 413; file served back with the immutable cache header.
- Model: new fields validate (bad family key → 400; note > 40 chars → 400); legacy product without
  the new fields still saves/edits.
- Migration: run twice on a seeded test DB — first run changes exactly the expected docs and writes
  a backup; second run changes nothing.

## Out of scope

Auto-filling families/notes (needs the owner's knowledge — the store hides empty facets gracefully);
replacing the hotlinked photos (owner uploads their own; the store shows whatever is set, with a
branded placeholder for `"."`); bilingual content.
