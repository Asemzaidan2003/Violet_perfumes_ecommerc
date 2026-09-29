# Admin Redesign Phase 4 — Catalogue (Products, Oils, Bottles, Alcohol) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the catalogue management pages (products list/add/edit with media and taxonomy, oils, bottles, alcohol) in the new React admin, mobile-first, fixing the legacy pages' data-loss and validation traps, with a small TDD backend hardening for the create endpoints.

**Architecture:** A form kit (react-hook-form + zod through the shadcn Form components, Arabic-digit-aware number inputs, image upload with the legacy client-side resize/encode pipeline) is built first and reused by every form. Pages live under `admin/src/pages/{products,oils,bottles,alcohol}/`. The backend gets narrowly scoped fixes (create product persists `brand`/`offer_ends_at`, zero values accepted, oil create honours `status`) covered by `node --test` tests; nothing else on the server changes.

**Tech Stack:** React 19, Vite, plain JavaScript, Tailwind v4, shadcn/ui, TanStack Query, react-router, react-hook-form, zod, `@hookform/resolvers`, Vitest, node:test, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-29-admin-redesign-design.md` (sections 4, 8, 9; Phase 4). Earlier plans (implemented): `2026-09-29-admin-redesign-foundation-pos.md`, `2026-09-29-admin-phase3-orders-reports.md` — their `admin/src` code (shared components in `admin/src/components/*`, `format.js`, `cart.js` helpers, `tests/e2e/admin-helpers.mjs`, `E2E_ONLY` filter) is the base.

**Contract sheet (READ FIRST for every task):** `.superpowers/research/phase4-contracts.md` (git-ignored). It documents, per legacy page, every control, API call with verified response shapes, model constraints, existing e2e coverage and traps. Where this plan and the sheet disagree, the plan (deliberate changes) wins.

> **Plan style note:** as in Phase 3, tasks specify contracts, behaviours and required tests instead of verbatim source; each task is gated by a task review.

## Global Constraints

- Plain JavaScript; files under 500 lines; commit small; NO `Co-Authored-By` trailer; never read or print `.env`; tests use only local MongoDB.
- Arabic right-to-left with logical utilities only; touch targets >= 44px and >= 8px apart; contrast >= 4.5:1 in light and dark; no `alert()`/`confirm()`/`dangerouslySetInnerHTML`; numbers/money/dates in `<bdi dir="ltr">`; icons Lucide only; dialogs/sheets use `showCloseButton={false}` + a 44px Arabic close; every `cn` import from `@/lib/utils` (re-check after each shadcn CLI run: it generates a stray `cn` package import and physical-direction classes).
- Same-origin API via `api()`/`listOf()`/`unwrap()`/`ApiError`; server Arabic error messages verbatim in toasts; non-`ApiError` failures show "تعذّر الاتصال بالخادم"; every mutation has a synchronous ref guard + `disabled` while pending; empty-list 404s handled (`listOf`).
- Forms: Arabic-Indic digits and decimal commas accepted (`normalizeNumberInput` from `@/lib/cart`), inline field errors in Arabic next to the field (server English defaults mapped to Arabic messages where the field is known, else the server message), unsaved-change guard on navigation (a `beforeunload`/router blocker with a `ConfirmDialog`), focused inputs committed before submit, sticky bottom action bar on phones (above the tab bar, safe-area aware), `min-h-11` inputs with 16px text (no iOS zoom).
- Backend changes are limited to Task 1 (create endpoints) and must keep the whole backend suite green; legacy pages and legacy e2e stay working until the cutover phase.
- Each page ships an e2e scenario (`tests/e2e/admin-catalogue.mjs`, registered in `run.mjs`; titles contain the E2E_ONLY token the task names) with API login (`openAdmin`), own seeded data, `finally` cleanup, `check(page)` (no console/CSP errors — no `blob:` images, no failing XHRs), `assertPageIsXssSafe` for user-controlled strings, desktop 1440 and phone 375 (no sideways scroll, controls >= 44px).

## Review Focus

- Editing a product must never silently drop its brand, offer, images or categories (legacy edit wiped the brand via a load race and rejected decimal prices): brand options load before the form is populated, an inactive current brand stays selectable, untouched fields round-trip unchanged — Tasks 4-5.
- Create validation traps: 0 % oil/alcohol, 0 price, 0-quantity oil, blank or duplicate oil id, duplicate product name (409 "Duplicate value" → Arabic message on the name field), size strings like "30ml" and " 50 مل " — Tasks 1, 4, 6.
- Owed (negative) stock: quantity shown negative in a danger tone; changing quantity vs adding stock (`add_quantity` semantics: an absolute quantity sent together with `add_quantity` is discarded by the server, so the form sends only one of them) — Tasks 6-8.
- Image upload: JPEG/PNG/WebP only, 3 MB cap, server-URL preview only (`blob:` is blocked by the CSP), thumb upload failure handled, primary/gallery ordering persists — Task 5.
- Stored-XSS in names (`oil_name`, `id`, bottle `name`, alcohol `name`/`type`, product name, brand/category labels, notes, description): rendered as text in lists, pickers, inputs' values and option labels — every task e2e.
- Delete flows (oil): confirm dialog naming the oil, warning that products may still reference it (server has no referential check), error toasts — Task 6.
- Hidden products remain sellable at the POS; the visibility switch must reflect server state and revert with a toast on failure — Task 3.

---

## File Structure

Backend: `backend/controller/product.Controller.js`, `backend/controller/oil.Controller.js`, `tests/catalogue-create.test.js` (new).

Admin (create): `admin/src/lib/{numbers.js,upload.js,productForm.js}` (+ tests), `admin/src/components/form/{FormShell.jsx,Field.jsx,NumberField.jsx,SwitchField.jsx,ImageUpload.jsx,ChipGroup.jsx,SizesEditor.jsx,ConfirmLeave.jsx}`, `admin/src/pages/products/{ProductsPage.jsx,ProductFormPage.jsx,OilPicker.jsx,MediaSection.jsx,TaxonomySection.jsx,useProductLookups.js}`, `admin/src/pages/oils/{OilsPage.jsx,OilFormPage.jsx}`, `admin/src/pages/bottles/{BottlesPage.jsx,BottleFormPage.jsx}`, `admin/src/pages/alcohol/AlcoholPage.jsx`, `tests/e2e/admin-catalogue.mjs`.

Modify: `admin/src/app/{App.jsx,nav.js,Shell.jsx}` (routes, "+" add menu), `tests/e2e/run.mjs`, `admin/package.json` (react-hook-form, zod, resolvers), `admin/src/components/ui/*` (shadcn `form`, `textarea`, `select`-free — use `NativeSelect`).

---

### Task 1: Backend hardening for catalogue create endpoints (TDD)

**Files:**
- Modify: `backend/controller/product.Controller.js` (createProduct), `backend/controller/oil.Controller.js` (createOil)
- Create: `tests/catalogue-create.test.js`

**Interfaces:** No new routes. Behaviour changes only: `POST /api/products` persists `brand` and `offer_ends_at`; accepts `oil_percentage: 0`, `alcohol_percentage: 0` and size `price: 0` (still rejects missing/null/NaN, negative, and malformed size_list with the existing messages); `POST /api/oils` persists `status` (enum-validated by the model), accepts `oil_cost: 0` and `oil_quantity: 0` (still requires non-blank `id` and `oil_name`; duplicate id stays 409; success stays HTTP 200). Validation error messages for the required-field checks gain Arabic text while keeping `success:false` and the same status codes (400): products `يرجى تعبئة جميع الحقول المطلوبة`, size list `صيغة الأحجام غير صحيحة — لكل حجم مقاس وسعر`, oils `يرجى تعبئة رقم الزيت واسمه وتكلفته وكميته`. Legacy pages only read `res.ok`, so they keep working.

- [ ] **Step 1: Write failing tests** in `tests/catalogue-create.test.js` (use `startTestApp`/`loginAs` from `tests/helpers.js`, model-level seeding like `tests/catalog-model.test.js`): product create with `brand` (a real Brand doc id) and `offer_ends_at` persists both (`GET /api/products/:id` shows them); create with `oil_percentage: 0` and `alcohol_percentage: 100` and a size `{size:"30ml",price:0}` succeeds with the size normalised to `"30"` and price 0; create still rejects a missing `p_name`, a `null` percentage, negative price (400), an empty-object size entry, and a non-array `size_list` — assert the new Arabic messages and `success:false`; oil create with `status:"out of stock"`, `oil_cost:0`, `oil_quantity:0` persists all three; oil create with a blank id → 400 (Arabic message); duplicate oil id → 409 "Duplicate value"; oil create with an invalid status → 400 (model enum). Also assert unauthenticated create → 401.
- [ ] **Step 2: Run** `node --test tests/catalogue-create.test.js` — expect failures for the new behaviours.
- [ ] **Step 3: Implement** the smallest controller changes: replace the falsy checks with explicit presence/finite-number checks (missing, `null`, `""`, NaN → reject; `0` ok; negatives left to the model's `min`), destructure and pass `brand` and `offer_ends_at`, pass `status` for oils. Keep every other behaviour.
- [ ] **Step 4: Run** the new tests, then the whole backend suite (`npm test`) — all green (305+ passing, plus the new ones).
- [ ] **Step 5: Commit** "fix: product/oil create persist brand, offer end and status and accept zero values".

---

### Task 2: Form kit — dependencies, number parsing, image upload, shared field components

**Files:** create the `admin/src/lib/{numbers.js,upload.js}` (+ tests) and `admin/src/components/form/*` files listed above; add shadcn `form`, `textarea`; add `react-hook-form`, `zod`, `@hookform/resolvers`.

**Interfaces (exact names):**
- `numbers.js`: `parseNumberInput(raw)` → finite number or `null` (uses `normalizeNumberInput` from `@/lib/cart`; blank/garbage → null), `parseIntInput(raw)`, `formatForInput(n)` (`"" ` for null/NaN, no exponent), `splitList(raw)` (split on `,` and `،`, trim, drop empties, dedupe preserving order).
- `upload.js`: pure `planResize(width, height, maxEdge)` → `{w,h}` (never upscales; keeps aspect; rounds), `pickEncoding(supportsWebp)` → `{type,quality}` (`image/webp` q 0.85 else `image/jpeg` q 0.85), and `uploadImage(file, {kind="product", signal})` → `{id,url,thumb}` porting `frontend/js/upload.js` (sheet 1.4): `createImageBitmap`, canvas resize (full ≤ 1400 product / 2400 banner, thumb 480), encode, `POST /api/uploads?kind=` raw bytes with the blob's content type, then `POST /api/uploads/:id/thumb`; Arabic errors (`body.message || "فشل رفع الصورة"`, "تعذر معالجة الصورة في المتصفح"); rejects non-JPEG/PNG/WebP and files over 3 MB client-side with Arabic messages before any request; never uses `URL.createObjectURL`.
- Components: `<FormShell title backTo onSubmit dirty submitting submitLabel extraActions>` (page header, form card, sticky bottom action bar on phones with 44px buttons; blocks navigation when `dirty` through `<ConfirmLeave>` using `ConfirmDialog`), `<Field label htmlFor hint error required>`, `<NumberField>` (text input `inputMode="decimal"`, commit/parse on blur, shows the parsed value back, `min/max/step` hints), `<SwitchField label checked onChange>` (44px hit area, visible label), `<ChipGroup options selected onChange>` (checkbox chips, 44px), `<SizesEditor value onChange>` (rows of size + price with add/remove, at least one row enforced by the parent schema, live hint of the normalised size, decimal prices allowed), `<ImageUpload value onChange kind>` (drop zone + file input `accept="image/jpeg,image/png,image/webp"` with id passed through, progress/status text with `role="status"`, server-URL preview only, error text `role="alert"`).

- [ ] **Step 1: Unit tests first** (`numbers.test.js`, `upload.test.js`): Arabic-Indic/comma inputs, blanks, garbage, list splitting with `،`, resize planning (landscape, portrait, already small, exactly at limit), encoding choice, client-side rejection of a wrong type/oversized file (with a stubbed `File`), request order (`POST /api/uploads` then `/thumb`) with stubbed `fetch`/canvas helpers extracted into small injectable functions so they are testable in Node. See them fail, implement, see them pass.
- [ ] **Step 2: Build the components** following the conventions from the phase-1/3 code; add the shadcn `form`/`textarea` components (fix `cn` imports and physical classes). Write one small demo route only if needed for verification and remove it before committing.
- [ ] **Step 3: Verify** `npm run test:admin`, `npm run build:admin`, RTL grep; commit "feat(admin): form kit — number parsing, image upload pipeline and field components".

---

### Task 3: Products list page (`/products`)

**Files:** create `admin/src/pages/products/ProductsPage.jsx`; modify `App.jsx`, `nav.js` (Products → route; add the "+" add menu to Shell: أضف عطر جديد / أضف زيت جديد / أضف زجاجة جديدة with routes `/products/new`, `/oils/new`, `/bottles/new`); e2e in `tests/e2e/admin-catalogue.mjs` (register in `run.mjs`).

Requirements (sheet section 2 plus deliberate changes): search box filters by name, brand and category label (Arabic `name_ar` and key); category filter chips from `GET /api/categories`; "بدون صورة خاصة" and "مخفي" badges; brand name; category shown by Arabic name; oil/alcohol percentages; status pill (متوفر/غير متوفر/متوقف, contrast-safe); sizes and prices; edit link; visibility switch with a visible label (`aria-label` "ظاهر في المتجر — {name}"), 44px hit area, PUT `{visible}`, success updates the row (badge appears/disappears) and shows a toast, failure reverts with a toast — guarded against rapid double toggles; "إضافة منتج" primary action; empty catalogue shows an EmptyState with an add button (legacy hung on a spinner); table on desktop, cards on phones; thumbnail images with `alt=""` and a placeholder icon for `"."`; product images load lazily; all strings as text.

- [ ] **Step 1: Write e2e first** (port `product-visibility.mjs`): create a product with `p_image "."` and hostile name/brand, open `/products`, assert the row and badges, toggle visibility and assert the PUT (200) + "مخفي" badge + API state and that the storefront home no longer lists it (as the legacy scenario does), toggle back; a failing PUT (Playwright route abort) reverts the switch with a toast; empty state via a route stub returning the server's 404; search by Arabic category label; `assertPageIsXssSafe`; 375px layout (cards, 44px controls, no sideways scroll). See it fail.
- [ ] **Step 2: Implement** page, routes, nav, add menu; run `E2E_ONLY="Products list" npm run test:e2e`; verify build; commit "feat(admin): products list page with visibility switch".

---

### Task 4: Product form core — add and edit (`/products/new`, `/products/:id/edit`)

**Files:** create `admin/src/lib/productForm.js` (+ test), `admin/src/pages/products/{ProductFormPage.jsx,OilPicker.jsx,useProductLookups.js}`; modify `App.jsx`.

**Interfaces:** `productForm.js`: zod schema `productSchema` and pure mappers `toFormValues(product)` / `toPayload(values, {mode})` (payload shape = sheet 1.3/3: `p_name` trimmed, `p_category`, `p_offer_percentage` number, `offer_ends_at` ISO or `null`, `oil_id`, `oil_percentage`, `alcohol_percentage`, `status`, `p_image` (empty → `"."`), `visible`, `size_list[{size,price}]`, plus the extras owned by Task 5: `families`, `notes`, `description`, `keywords`, `brand`, `images` — the mapper handles them so the form round-trips every field even before Task 5's UI exists), `datetimeLocalToIso` / `isoToDatetimeLocal` (local getters, no seconds). `useProductLookups()` → `{categories, brands, oils, loading, error}` (one `GET /api/categories`, `GET /api/brands`, `GET /api/oils` via `listOf`; the form is not rendered until all three settle, fixing the legacy brand race).

Requirements: sections for identity (name, category select with `name_ar` labels incl. hidden categories, status, visibility switch), pricing (offer % `0–100` decimals allowed, offer end `datetime-local`), composition (oil picker dialog searching by oil name AND id with the selected oil name shown and a clear/change action; oil % and alcohol % decimals allowed, 0 allowed), sizes (`SizesEditor`, at least one size required, decimals in prices, 0 allowed), image URL/upload placeholder handled by Task 5 (Task 4 renders the `ImageUpload` with `p_image` only). Validation in Arabic next to fields (required name/category/oil/size, percentage 0–100, size positive number, price ≥ 0, image `.`/`/img/…`/`https://` only — explain that `http://` is rejected). Add: POST, then toast "تمت إضافة المنتج" and navigate to `/products`; 409 duplicate name → field error "اسم المنتج مستخدم مسبقًا"; other server messages verbatim. Edit: `GET /api/products/:id` (brand is the raw id), missing/bad id → ErrorState; PUT with the payload; success → toast + `/products`; a `null`/absent brand and every untouched field round-trip unchanged. A "form ready" signal: the form root has `data-ready="true"` once lookups and (edit) the product are loaded (the e2e waits on it instead of option counts).

- [ ] **Step 1: Unit tests first** for `productForm.js` (schema accept/reject table: 0 percentages accepted, 101 rejected, empty sizes rejected, "30ml" size accepted and normalised in the payload preview, price "12,5" → 12.5, `.` and `/img/<24hex>.webp` accepted, `http://x` rejected; `toFormValues`→`toPayload` round-trip equality for a full product incl. a null brand; `offer_ends_at` local/ISO conversion). See them fail; implement; pass.
- [ ] **Step 2: Write e2e first** (`admin-catalogue.mjs`): create a product through the new form (seed an oil "OIL1", categories exist), assert the POST body via the request event and API state (brand and offer end now persist thanks to Task 1 — include both); 0 % alcohol accepted; duplicate name shows the field error; edit keeps brand/offer/images/families untouched when only the name changes (assert API state before/after); an edit for a product whose brand is inactive keeps the brand; decimals in price accepted on edit; unsaved-change guard prompts on back navigation; 404 product id shows ErrorState; hostile strings in name/oil/brand/category labels render literally (`assertPageIsXssSafe`); `check(page)`; 375px layout with the sticky action bar above the tab bar. See them fail.
- [ ] **Step 3: Implement** page, routes and hooks; run `E2E_ONLY="Product form" npm run test:e2e`; verify build; commit "feat(admin): product add and edit form (core fields)".

---

### Task 5: Product form media and taxonomy sections

**Files:** create `admin/src/pages/products/{MediaSection.jsx,TaxonomySection.jsx}`; modify `ProductFormPage.jsx`, `tests/e2e/admin-catalogue.mjs`.

Requirements (sheet section 5): primary image (`ImageUpload`, input id `p_image_file`, sets `p_image` to the returned server URL, preview from the server URL only, status text "جارٍ رفع الصورة…"/"تم رفع الصورة"/error; a URL field for `https://` images; a "بدون صورة" action that sets `.`), additional images (multi-upload, list with thumbnails, up/down reorder, "جعلها الرئيسية", remove; order persists in `images[]`; `.` is never allowed in the gallery), scent families as `ChipGroup` (19 keys from `@store-shared/vocab.js`, Arabic names + swatch colours, order = selection order as the e2e expects `["oud","amber"]` when oud then amber are checked in DOM order — keep DOM order equal to vocab order and document it), designer (brand) select (label `${name_ar} / ${name_en}`, first option "بدون", active brands plus the product's current brand even if inactive), three note fields (top/heart/base) parsed with `splitList` (client checks: ≤ 10 per layer, ≤ 40 chars each, Arabic errors), description (max 2000 with counter), keywords (max 300). Every control has a label; chips and buttons ≥ 44px.

- [ ] **Step 1: Write e2e first**: port "Add product with an uploaded photo" (upload a PNG via `#p_image_file`, wait until the form value is a `/img/…` URL, fill fields, check oud and amber families, fill base notes with `،`-separated input, submit, read the POST body, assert 201 and API state incl. `p_image` fetchable 200, no `blob:` request, `check(page)` clean); port "Edit product keeps and changes fields" (uncheck amber; API shows `["oud"]`); gallery add/reorder/make-primary/remove persisted; a 4 MB file and an SVG are rejected with the Arabic message and no upload request; a failing thumb upload still leaves a usable product with a toast; brand assign and category assign scenarios (`brands.mjs`/`categories.mjs` ports); note validation errors; 375px layout. See them fail.
- [ ] **Step 2: Implement**; run `E2E_ONLY="Product form|Product media" npm run test:e2e`; verify build; commit "feat(admin): product media, families, designer and notes sections".

---

### Task 6: Oils — list, add, edit, delete

**Files:** create `admin/src/pages/oils/{OilsPage.jsx,OilFormPage.jsx}`; modify `App.jsx`, `nav.js`, `tests/e2e/admin-catalogue.mjs`.

Requirements (sheet section 6): `/oils` with two capital cards (available ml and capital from `GET /api/oils/calculate_oil_capital`, hidden gracefully when it 404s), search by id and name, sort select (five options), table/cards with id, name, cost, quantity ml (negative in danger tone with "مستحق"), quantity cost, status pill (available / not available / discontinued shown distinctly — the legacy lumped discontinued into "غير متوفر"), edit link; empty state with add button (legacy spinner bug). `/oils/new`: fields id, name, cost (decimals, 0 allowed), quantity (0 allowed, decimals allowed as the model is a Number), status (all three values now honoured by Task 1); duplicate id → field error "رقم الزيت مستخدم مسبقًا"; success toast + navigate to `/oils`. `/oils/:id/edit` (id is the custom `id`, URL-encoded): load `GET /api/oils/:id`; fields name, cost, status (all three options), quantity and "إضافة كمية" — sending ONLY the changed quantity (`oil_quantity` when it differs from the loaded value) or `add_quantity` (> 0), never both (if the user fills both, the add wins and the form says so); "حذف الزيت" opens a `ConfirmDialog` naming the oil with the warning that products referencing it will fail at the POS; delete → toast + `/oils`. 404/bad id → ErrorState.

- [ ] **Step 1: Write e2e first**: seed three oils (one negative, one hostile name `"><img src=x onerror=window.__xss=1>` and hostile id-like text) — list shows values equal to the API and capital cards equal `GET …/calculate_oil_capital`, search and sort work, `assertPageIsXssSafe`; add an oil with quantity 0 and cost 0 and status `out of stock` (persisted); duplicate id error; edit: rename keeps quantity untouched (assert API), add 10 to a negative stock (-7 → 3), change absolute quantity; both fields filled → only increment applied; delete with confirm removes it (API 404 afterwards) and cancel keeps it; empty collection state via route stub; 375px layout. See them fail.
- [ ] **Step 2: Implement**; run `E2E_ONLY="Oils" npm run test:e2e`; verify build; commit "feat(admin): oils list, add, edit and delete".

---

### Task 7: Bottles — list, add, edit

**Files:** create `admin/src/pages/bottles/{BottlesPage.jsx,BottleFormPage.jsx}`; modify `App.jsx`, `nav.js`, `tests/e2e/admin-catalogue.mjs`.

Requirements (sheet section 7): `/bottles` with a capital card (from `GET /api/bottles/calculate_bottle_capital`, loaded automatically, hidden when it 404s), search by name (the legacy `_id` search is dropped as meaningless; search also matches capacity), sort (cost ascending / quantity descending / capacity), table/cards (name, capacity ml, cost, quantity with negative in danger tone), edit link, empty state with add button. `/bottles/new`: name, capacity (decimals rejected — integer ml ≥ 1), cost (decimals), quantity (integer, 0 and negatives allowed by the model but the form requires ≥ 0 on create). `/bottles/:id/edit` (Mongo `_id`): load, same fields plus "إضافة كمية" with the changed-quantity-vs-add rule of oils; bad id/404 → ErrorState (legacy crashed). No delete UI (parity; the API has none in the legacy UI).

- [ ] **Step 1: Write e2e first**: seed bottles (one hostile name, one negative quantity); list values equal the API, capital card, search by name, sort; add validation (capacity 0 or decimal rejected, cost negative rejected) and a successful add; edit rename keeps quantity; add-quantity semantics; 404 id; empty state; `assertPageIsXssSafe`; 375px layout. See them fail.
- [ ] **Step 2: Implement**; run `E2E_ONLY="Bottles" npm run test:e2e`; verify build; commit "feat(admin): bottles list, add and edit".

---

### Task 8: Alcohol page and stock navigation

**Files:** create `admin/src/pages/alcohol/AlcoholPage.jsx`; modify `App.jsx`, `nav.js` (add "الكحول" under Catalogue), `tests/e2e/admin-catalogue.mjs`.

Requirements (sheet section 8): `/alcohol` manages the singleton record the POS deducts from: loads `GET /api/alcohols` (bare array). Empty → a create form (name, type, cost ≥ 0, quantity) posting `POST /api/alcohols` (201 bare doc) with a note "المتجر يستخدم سجل كحول واحدًا في كل الطلبات". Existing record → an edit form (name, type, cost, quantity/"إضافة كمية" with the same only-one rule) using `PUT /api/alcohols/:id` (bare doc; 404 `{message}` has no `success`), current stock displayed with owed-stock styling, capital value. If several records exist (legacy data), list them all and edit each, with a warning that the POS always uses the first one. Hostile name/type render literally in labels and prefilled inputs and save back unchanged.

- [ ] **Step 1: Write e2e first**: empty → create → appears; add 10 to the stock (DB +10, name unchanged); hostile name/type with quotes round-trips unchanged; multi-record warning; validation errors; 375px layout; `assertPageIsXssSafe`. See it fail.
- [ ] **Step 2: Implement**; run `E2E_ONLY="Alcohol" npm run test:e2e`; verify build; commit "feat(admin): alcohol stock page".

---

### Task 9: Nav wiring and phase verification

**Files:** modify `admin/src/app/nav.js` (all Phase 4 entries are `to:` routes), `admin/src/app/Shell.jsx` (mobile tab set: POS, Orders, Products, Reports, More — Products now an in-app link; "+" add menu reachable on phones too), `tests/e2e/admin-pos.mjs` if a selector changed.

- [ ] **Step 1: Wire and update selectors**; run the affected scenarios with `E2E_ONLY`.
- [ ] **Step 2: Full verification**: `npm test`, `npm run test:admin`, `npm run build:admin`, full `npm run test:e2e` (known flake "Header: hides on scroll down" may need a rerun), RTL grep on `admin/src`; commit "feat(admin): switch catalogue pages to in-app routes".

---

## Self-Review

**Spec coverage (spec section 8 and Phase 4):** list pages use tables/cards with visibility toggle and inline actions → Tasks 3, 6, 7; add/edit share one form pattern with sections, sticky Save bar on mobile, image upload with preview and field-level errors → Tasks 2, 4, 5; the "+" add menu replaces the hover dropdown → Task 3; oils/bottles/alcohol stock rules with owed stock → Tasks 6-8; backend traps → Task 1.

**Consistency:** `numbers.js` names, `productForm.js` mappers, `FormShell` props and the `data-ready` signal are defined once (Tasks 2, 4) and used later; e2e tokens per task: "Products list", "Product form", "Product media", "Oils", "Bottles", "Alcohol".

**Review Focus coverage:** brand/offer round-trip → Tasks 4-5 e2e; create traps → Tasks 1, 4, 6; owed stock/add_quantity → Tasks 6-8; upload rules → Task 5; XSS → each e2e; delete flow → Task 6; visibility switch → Task 3.
