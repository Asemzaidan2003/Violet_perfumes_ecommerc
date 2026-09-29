# Admin Redesign Phase 5 — Store Content (Designers, Categories, Tagging, Pages, Promotions, Storefront, Settings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every store-content admin page (designers, categories, catalogue tagging, content pages with live preview, promotions with placements and coupons, storefront CMS, store settings with theme/identity) in the new React admin, mobile-first, keeping the owner's rule that every store-facing detail is editable from the admin, and fixing the legacy pages' silent-data-loss traps.

**Architecture:** A small CRUD kit (dialog-or-sheet editor, reorder list with pure renumbering helper, active/visible switches, banner upload field, slug/link helpers) is built first and shared by brands, categories, pages and promotions. Settings and storefront pages share a settings hook (one `GET /api/settings` query, `PUT` result written straight into the cache, save disabled until the load succeeded). The pages preview renders the server's already-sanitised HTML through an allow-list HTML→React mapper (no `dangerouslySetInnerHTML`). No backend changes.

**Tech Stack:** React 19, Vite, plain JavaScript, Tailwind v4, shadcn/ui, TanStack Query, react-router, react-hook-form + zod (added in phase 4), Vitest, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-29-admin-redesign-design.md` (sections 4, 8, 9; Phase 5). Earlier plans (implemented): foundation+POS, phase 3 (orders/reports), phase 4 (catalogue, form kit). Their `admin/src` code is the base (shared components, `format.js`, form kit `admin/src/components/form/*`, `ImageUpload`, `tests/e2e/admin-helpers.mjs`, `E2E_ONLY`).

**Contract sheets (READ FIRST for every task):** `.superpowers/research/phase5a-contracts.md` (brands, categories, catalog, pages, promotions) and `.superpowers/research/phase5b-contracts.md` (storefront + settings), git-ignored. They hold every control, API call with verified shapes, validation messages, e2e hooks and gotchas. Where this plan and a sheet disagree, the plan (deliberate changes) wins.

> **Plan style note:** as in phases 3-4, tasks specify contracts, behaviours and required tests rather than verbatim source; every task is gated by a task review.

## Global Constraints

- Plain JavaScript; files under 500 lines; commit small; NO `Co-Authored-By` trailer; never read or print `.env`; tests use only local MongoDB.
- Arabic RTL, logical utilities only; touch targets >= 44px and >= 8px apart; contrast >= 4.5:1 light and dark; no `alert()`/`confirm()`/`dangerouslySetInnerHTML`; numbers/dates/phones in `<bdi dir="ltr">`; Lucide icons only; dialogs/sheets `showCloseButton={false}` + 44px Arabic close; `cn` from `@/lib/utils` (re-check after each shadcn CLI run).
- Same-origin API via `api()`/`unwrap()`/`ApiError`; server Arabic messages verbatim in toasts or an in-form `role="alert"` banner (no `field` keys exist on these endpoints: the server joins all failures in one message, so per-field errors come from client-side schemas first and the server message is shown as a form-level banner); non-`ApiError` failures show "تعذّر الاتصال بالخادم"; every mutation has a synchronous ref guard + `disabled` while pending.
- Where the server returns English Mongoose defaults ("Path `name_ar` is required."), the client validates first with Arabic messages so users rarely see them; the banner shows whatever the server sends.
- Never send `theme: null` or `overrides: null` (server 500); never send `undefined` for a value the user cleared when clearing is meant (send `null`/`""` as the sheet says for that field).
- Legacy pages and their e2e scenarios stay working until the cutover phase. Each page ships an e2e scenario in `tests/e2e/admin-content.mjs` (registered in `run.mjs`; titles contain the `E2E_ONLY` token the task names), API login (`openAdmin`), own seeded data with cleanup in `finally` (legacy e2e left brands/categories/settings modified; the new ones must restore what they change), `check(page)`, `assertPageIsXssSafe` for user-controlled strings, desktop 1440 and phone 375 (no sideways scroll, controls >= 44px).
- Time zone ruling: every date/time the admin shows or accepts (placement and coupon windows) is interpreted in `Asia/Amman` regardless of the browser zone (`ammanLocalToIso` / `isoToAmmanLocal`), fixing the legacy mix of browser-local entry and Amman display.

## Review Focus

- Settings PUT is partial and one 400 aborts everything: page-level save must send only that page's groups, keep Save disabled until GET succeeded, show the server message, and never overwrite loaded values with client defaults — Tasks 8, 9.
- Read-side default fallback: clearing hero/footer/oos/thanks text, all service items or the section list does not persist as empty (server returns defaults). The UI must say so (placeholder = default, "استعادة الافتراضي" per field) instead of pretending it saved an empty value — Task 9.
- Theme: 4 main colours + up to 12 overrides; reset restores defaults and (new) the advanced section has its own clear-all; unset overrides show as "مشتق" (derived value shown), never a misleading `#000000`; contrast info non-blocking with warnings from the unused `validateContrast` thresholds (4.5 / 4.5 / 3) — Task 8.
- Silent data loss traps in legacy fixed: catalogue tagging typed brand names (use a select), category icon "بدون" not clearing (send `null`), placements target replaced/omitted on slot change, reorder partial failures (sequential PUTs) — Tasks 3-7.
- Reorder correctness: pure renumbering (0..n-1 within group), only changed items PUT, failure mid-way reloads server truth and shows the message — Tasks 2, 4, 6, 7, 9.
- Live preview of pages: debounce, out-of-order response guard, safe rendering of `<script>`, `javascript:` links and raw HTML as literal text; toolbar inserts at line starts for `H`/list — Task 6.
- Stored-XSS: names/titles/labels/URLs/hostile text in every list, dialog, input value, option label, hrefs (`/c/{slug}`, `/page/{slug}`), previews — every task e2e.
- Immutable fields honoured: category `key`, coupon `code` (edit shows them read-only and never sends them, or sends unchanged) — Tasks 4, 7.
- Deleting referenced brands/categories (409 with count) shows the server message clearly; deleting anything asks for confirmation naming it — Tasks 3, 4, 6, 7.

---

## File Structure

Create (admin): `admin/src/lib/{slug.js,links.js,reorder.js,amman.js,themeColors.js,governorates.js,htmlToReact.jsx}` (+ tests), `admin/src/components/crud/{CrudDialog.jsx,ReorderButtons.jsx,ActiveSwitch.jsx,DeleteConfirm.jsx,BannerUpload.jsx}`, `admin/src/hooks/useSettings.js`, pages `admin/src/pages/{brands,categories,catalog,pages,promotions,settings,storefront}/*`, `tests/e2e/admin-content.mjs`, and a backend guard test `tests/admin-governorates.test.js`.

Modify: `admin/src/app/{App.jsx,nav.js,Shell.jsx}`, `tests/e2e/run.mjs`.

---

### Task 1: CRUD kit and shared pure helpers

**Files:** create the `lib` helpers (+ tests) and `components/crud/*` above.

**Interfaces (exact names):**
- `slug.js`: `slugify(input)` = `trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40)`; `SLUG_RE = /^[a-z0-9-]{2,40}$/`; `RESERVED_PAGE_SLUGS` (the 19 in sheet 4.5).
- `links.js`: `validLink(l)` (internal `^/(?![/\\])\S*$` or parseable `https:` URL — port of `placement.model.js:20`), `isImageUrl(u)` (`IMAGE_URL` regex from sheet §0: `/img/<24hex>[-480].(webp|jpg|png)` or `https://…`), `isHttps(u)`.
- `reorder.js`: `moveItem(list, index, delta)` → new array (no-op at edges); `renumber(list, key="sort")` → `[{item, sort}]` for ONLY the items whose stored `sort !== index`; `reorderRequests(list, key)` → array of `{id, body:{sort}}`; `runSequential(requests, put)` → resolves with the ids done and throws an error carrying `done` when one fails (so the caller can reload server truth).
- `amman.js`: `ammanLocalToIso("YYYY-MM-DDTHH:mm")` → ISO string (interprets the wall time in Asia/Amman using `Intl.DateTimeFormat` offset lookup; empty → `null`), `isoToAmmanLocal(iso)` → `"YYYY-MM-DDTHH:mm"` or `""`, `formatAmman(iso)` → `Intl.DateTimeFormat("ar-JO-u-nu-latn",{timeZone:"Asia/Amman",dateStyle:"medium",timeStyle:"short"})`.
- Components: `<CrudDialog open title onOpenChange onSubmit submitting error submitLabel>{fields}</CrudDialog>` (centered dialog >= 640px, bottom sheet on phones, sticky footer with 44px Save/Cancel, Arabic 44px close, Escape closes, focus on the first field, `role="alert"` banner for `error`, blocks close while submitting), `<ReorderButtons onUp onDown disableUp disableDown label />` (44px buttons with aria-labels `رفع {label}` / `خفض {label}` — the legacy e2e used exactly these names), `<ActiveSwitch checked onChange label pending />` (44px, visible text label), `<DeleteConfirm open name onConfirm onOpenChange pending message />` (wraps `ConfirmDialog`, names the item), `<BannerUpload value onChange id kind="banner">` (wraps `ImageUpload`, adds a URL text input accepting `https://` or `/img/…`, remove button, server-URL preview only).

- [ ] **Step 1: Unit tests first** for every pure helper: slugify (Arabic-only → `""`, mixed, trimming, 40 cap, leading/trailing dashes), `SLUG_RE`, `validLink` (accept `/c/men`, `https://x.com/a`; reject `http://`, `javascript:alert(1)`, `//evil`, `/\x`, `#a`, `foo`, `mailto:`, empty is the caller's choice), `isImageUrl` (accept upload URLs and https; reject http, other relative), `moveItem` edges, `renumber` (ties at 0 get renumbered 0..n-1, unchanged items omitted), `runSequential` failure reports the done ids, `amman.js` (fixed dates: `2026-09-29T18:00` in Amman = `2026-09-29T15:00:00.000Z`; round trip; empty; garbage → `""`/`null`). See them fail; implement; pass.
- [ ] **Step 2: Build the components**; verify build; commit "feat(admin): CRUD kit and shared helpers for the content pages".

---

### Task 2: Settings hook, theme helpers and governorates single source

**Files:** create `admin/src/hooks/useSettings.js`, `admin/src/lib/{themeColors.js,governorates.js}` (+ tests), `tests/admin-governorates.test.js`.

**Interfaces:** `useSettings()` → `{settings, loading, error, refetch, save(patch)}` where `save` does `PUT /api/settings` and writes the returned full object into the query cache, throws `ApiError` (server message) on failure and is guarded against double calls; the query key is shared by the settings and storefront pages. `themeColors.js`: `DEFAULT_THEME` (`#0E0C0A/#17130F/#F4EDE3/#D4AF37`), `OVERRIDE_TOKENS` (the 12 keys with Arabic labels in the sheet's order), `contrast(a,b)` (WCAG, identical to `theme.js`), `contrastReport(theme)` → `[{key,label,ratio,threshold,ok}]` for text/bg ≥ 4.5, text/surface ≥ 4.5, accent/bg ≥ 3, `deriveTokens(theme)` (port of `deriveTheme` for showing derived values of the advanced tokens: `surface-2`, `line`, `text-muted`, `gold-strong`, `focus`, `gold-ink`, `bg-glass`… — mixes per sheet 5b §1; values only for display), `isHex6(v)`. `governorates.js`: `GOVERNORATES` (12 names copied character-for-character from `backend/store/validate.js`).

- [ ] **Step 1: Tests first**: `contrast` (black/white = 21, same = 1), `contrastReport` for the default theme (all ok) and for near-black colours (three failures with the Arabic labels `النص على الخلفية`, `النص على السطح`, `لون التمييز على الخلفية`), `deriveTokens` determinism and hex/`rgb(r g b / 0.NN)` shape, `OVERRIDE_TOKENS` keys equal the server whitelist; a backend `node --test` in `tests/admin-governorates.test.js` importing both `backend/store/validate.js` `GOVERNORATES` and `admin/src/lib/governorates.js` and asserting deep equality and that the theme override keys equal `backend/store/theme.js` `OVERRIDE_TOKENS` (read the admin file as text/ESM import; both are pure). See them fail; implement; pass.
- [ ] **Step 2: Implement `useSettings`** (unit test with a stubbed `fetch`: save writes cache, failure keeps cache, double call ignored); verify; commit "feat(admin): settings hook, theme colour helpers and governorates list".

---

### Task 3: Designers (brands) page (`/brands`)

**Files:** create `admin/src/pages/brands/BrandsPage.jsx`; modify `App.jsx`, `nav.js`; e2e in `admin-content.mjs`.

Requirements (sheet 5a §1): list (table/cards) with logo thumb, Arabic and English names, product count, active switch (immediate PUT `{active}`), edit, delete (`DeleteConfirm`; 409 message about linked products shown verbatim), "إضافة مصمم"; dialog with name_ar (≤ 60, required), name_en (≤ 60, required), slug (optional; placeholder "يُشتق تلقائيًا…"; when given it must match `SLUG_RE` — trimmed and lower-cased client-side to avoid the `Dior` → 400 trap), logo (`BannerUpload`), active; POST exactly `/api/brands`; PUT sends the full editable set; dup slug 409 message in the banner; empty state "لا يوجد مصممون بعد" with an add button; hostile names render as text; toast on success.

- [ ] **Step 1: e2e first** (port `brands.mjs`; clean up the created brands): create "Dior/ديور" via the dialog (assert the POST URL ends `/api/brands` and the row), edit the slug, toggle active, delete a brand with products → 409 message shown and the brand remains, delete an unused brand with confirm; hostile brand name `<img src=x onerror=…>` inert; uppercase slug typed `Dior` is normalised; 375px layout (cards, sheet dialog, 44px controls). See it fail.
- [ ] **Step 2: Implement**; run `E2E_ONLY="Designers" npm run test:e2e`; commit "feat(admin): designers page".

---

### Task 4: Categories page (`/categories`)

**Files:** create `admin/src/pages/categories/CategoriesPage.jsx`; modify `App.jsx`, `nav.js`; e2e.

Requirements (sheet 5a §2): list ordered by `sort`, columns/cards: Arabic name, `/c/{slug}` text, product count, ReorderButtons (renumber with `reorderRequests` + `runSequential`, reload on failure), visible switch, "عرض" link (`target=_blank rel=noopener`), edit, delete (409 message); dialog: key (create only; disabled on edit; pattern `^[A-Za-z][A-Za-z0-9_-]{1,30}$`, help text "المفتاح لا يتغير بعد الإنشاء"), slug (required, `SLUG_RE`), name_ar (required ≤ 40), name_en (≤ 40), icon select (بدون/صندوق/منزل/شبكة/شاحنة/محفظة) — choosing "بدون" on edit sends `icon: null` so it actually clears (legacy trap; verify with the server: if `null` is rejected, send `""` and confirm it stores empty — check `backend/controller/categories.Controller.js` and `category.model.js` before choosing and note the outcome), image (`BannerUpload`), visible; POST exactly `/api/categories`; PUT never includes `key`; the empty-collection fallback categories (non-ObjectId `_id`s, real `key` strings) are shown read-only with a note "القيم الافتراضية — أضف قسمًا لحفظها" (their PUT/DELETE would 400).

- [ ] **Step 1: e2e first** (port `categories.mjs`, restore state): create "Oud/oud-perfumes/عطور العود", assign it to a product through the API and verify the product form lists it (`/products/:id/edit` select label), hide it via the switch (storefront nav link gone, as the legacy scenario asserts), reorder two categories (aria-labels `رفع/خفض …`, API order matches), clearing the icon persists, key immutable on edit, delete guard 409 shown, hostile names inert, 375px layout. See it fail.
- [ ] **Step 2: Implement**; run `E2E_ONLY="Categories" npm run test:e2e`; commit "feat(admin): categories page".

---

### Task 5: Catalogue tagging page (`/catalog`)

**Files:** create `admin/src/pages/catalog/CatalogPage.jsx`; modify `App.jsx`, `nav.js`; e2e.

Requirements (sheet 5a §3): the legacy page is per-row save, not bulk; keep row-level save (stable e2e semantics) and add a "حفظ المعدّل (n)" action that saves all dirty rows sequentially and reports per-row status. Each product row/card: thumbnail (placeholder for `"."`), name, category select (`— اختر الفئة —` + all categories by `name_ar`, value = key; exactly one native `<select>` per row), 19 family chips (checkbox `value=<key>`, vocab order), brand as a native select of ACTIVE brands plus the product's current brand even if inactive, with "بدون" (a typo can no longer wipe a brand), "حفظ" button per row with status text `جارٍ الحفظ…` / `تم الحفظ ✓` / server message, dirty marker; filter "غير المصنّفة فقط" (no families) that does not discard unsaved edits (keep row state when toggling); search box; PUT `/api/products/:id` with `{p_category, families, brand}` (brand `null` to clear); products 404-on-empty handled (EmptyState). Family checkboxes in cards remain 44px.

- [ ] **Step 1: e2e first** (port "Bulk tagging on catalog page" using a product it seeds itself instead of mutating the shared seeded one): select category, check `musk`, save, wait for "تم الحفظ", API verifies; brand select assigns and clears; dirty rows saved together via "حفظ المعدّل"; unclassified filter keeps unsaved edits; empty catalogue state; hostile product name inert; 375px layout. See it fail.
- [ ] **Step 2: Implement**; run `E2E_ONLY="Catalogue tagging" npm run test:e2e`; commit "feat(admin): catalogue tagging page".

---

### Task 6: Content pages — list, editor, markup toolbar and safe live preview (`/pages`)

**Files:** create `admin/src/lib/htmlToReact.jsx` (+ test), `admin/src/lib/markupToolbar.js` (+ test), `admin/src/pages/pages/PagesPage.jsx`, `admin/src/pages/pages/PageEditorDialog.jsx`; modify `App.jsx`, `nav.js`; e2e.

**Interfaces:** `htmlToReact(html)` → React nodes: parses with `DOMParser`, walks the tree and renders ONLY `h2,h3,p,ul,li,br,strong,a` (any other element → its text content as literal text; scripts/styles dropped entirely as text; attributes ignored except `a[href]` which must satisfy `validLink` and renders `rel="noopener"`); text nodes as text. `markupToolbar.js`: `applyToolbar(value, selStart, selEnd, action, slug)` → `{value, selStart, selEnd}` for `h` (`## ` inserted at the START OF THE CURRENT LINE), `b` (`**…**` around the selection), `list` (`- ` at the start of every selected line), `link` (`[selection](/page/{slug})`), plus a fifth `h2` action (`# ` — the legacy toolbar lacked an h2 button) with pure, tested behaviour (idempotent-prefix rules: toggling `## ` on a line that already has it removes it).

Requirements (sheet 5a §4): list ordered as the server sends (group order help, info, none) with visible group headings (معلومات / مساعدة / بدون), title, `/page/{slug}`, ReorderButtons within the group (renumber per group), published switch (aria-label `نشر {title}`), "عرض" link (disabled with a tooltip/hint for drafts since it 404s), edit, delete; editor dialog (wide): title (≤ 80), slug (auto-derived from the title until the user edits it; `SLUG_RE`; reserved slugs rejected client-side with "هذا الرابط محجوز" and the server message shown too), body textarea (≤ 20000 with counter) with toolbar (H2, H3, B, قائمة, رابط — 44px buttons, aria-labels, `role="toolbar"`), live preview beside/below the editor (debounced 300 ms `POST /api/pages/preview {body}` → `data.html` → `htmlToReact`; ignore out-of-order responses with a request counter and abort; preview failure keeps the last preview and shows a small "تعذّرت المعاينة" hint), meta description (≤ 160), footer group select (معلومات default / مساعدة / بدون), published switch; POST exactly `/api/pages`; PUT sends the full editable set.

- [ ] **Step 1: Unit tests first** for `htmlToReact` (allowed tags render; `<script>alert(1)</script>` inside preview HTML → literal text and no element; `<img onerror>` → literal text; `<a href="javascript:…">` → no anchor, text kept; `<a href="/page/terms">` → anchor with `rel="noopener"`; nested unknown tags flatten to text) and `markupToolbar` (each action at line start/mid-line, multi-line list, selection preserved, toggling). See them fail; implement; pass.
- [ ] **Step 2: e2e first** (port `pages.mjs`; clean up): create the "سياسة الشحن" page with the `# …`/list body, wait for the preview `h2`, save, assert POST URL exactly `/api/pages`, footer link on the storefront, the mobile `/page/e2e-shipping` layout; reorder within a group; published toggle; reserved slug `cart` rejected; hostile title inert in the list; a body containing `<script>window.__xss=1</script>` and `[x](javascript:alert(1))` previews as literal text with no `window.__xss`; out-of-order preview responses (delay the first response with `page.route`) never leave a stale preview; 375px layout with the editor as a full-screen sheet. See it fail.
- [ ] **Step 3: Implement**; run `E2E_ONLY="Content pages" npm run test:e2e`; commit "feat(admin): content pages with markup toolbar and safe live preview".

---

### Task 7: Promotions — placements and coupons (`/promotions`)

**Files:** create `admin/src/pages/promotions/{PromotionsPage.jsx,PlacementsTab.jsx,PlacementDialog.jsx,CouponsTab.jsx,CouponDialog.jsx,slots.js}`; modify `App.jsx`, `nav.js`; e2e. (Two review units: implement placements first, then coupons, as two commits inside this task.)

**Interfaces:** `slots.js`: `SLOTS` (the eight keys with Arabic labels, `imageRequired`, `targeted` per sheet 5a §5.2), `liveStatus(placement, now)` → `"مباشر"|"مجدول"|"منتهي"|"متوقف"` with the sheet's rules, `storeLinkFor(placement)` (product_promo → `/offers`; targeted → `/c/{category}` else `/family/{family}` else `/c/men`; others `/`), `scheduleText(p)` (uses `formatAmman`).

Requirements (sheet 5a §5): tabs (الإعلانات / أكواد الخصم) with `role=tablist`, roving tabindex and arrow-key navigation (RTL: ArrowLeft = next); `data-tab` attributes kept; the selected tab persists in `?tab=`.
- Placements: groups per slot (fixed order, empty slots omitted) with headings; rows: thumb, title, status badge, schedule text, `ActiveSwitch` (aria-label `تفعيل {title}`), ReorderButtons (`رفع/خفض {title}` names), edit, delete, "عرض في المتجر" link. Dialog fields: slot (changing slot shows/hides the target block and the image-required hint), title (≤ 80), subtitle (≤ 160), image (`BannerUpload`; required for image slots — bad URL shows the correct message "رابط صورة غير صالح", not the server's misleading "image required"), link (`validLink` or empty; hint `/c/men أو https://…`), cta (≤ 30), theme (داكن/فاتح/ذهبي), target category (select by category `slug`, "— الكل —") and target family (19 + all) shown only for targeted slots, starts/ends (`datetime-local` in Amman time via `ammanLocalToIso`), sort, active. The body sends `target` ALWAYS for targeted slots (`{}` when both are "All") and `target: {}` when the slot is switched to a non-targeted one (fixes the stale-target survival); window validation client-side (`ends > starts`, Arabic) plus server messages in the banner. POST exactly `/api/placements`.
- Coupons: table/cards: code, type/value text (نسبة X% / قيمة X.XX), window, usage `used/max` (`∞` for 0), active switch (aria-label `تفعيل الكود {code}`), edit, delete (`DeleteConfirm`), "إضافة كود". Dialog: code (uppercased live, ≤ 20, pattern `^[A-Z0-9_-]{3,20}$`, read-only on edit and NOT sent on edit), type, value (> 0, ≤ 100 for percent, decimals), min subtotal, starts/ends (Amman), max uses (0 = unlimited, integer), active; the legacy server gap (type flip not re-validating a stored value > 100) is compensated client-side by validating value against type on every save. POST exactly `/api/coupons`; 409 duplicate message in the banner.

- [ ] **Step 1: Unit tests first** for `slots.js` (`liveStatus` edges: inactive, before start, at end exclusive, no bounds; `storeLinkFor` all branches; `scheduleText` empty/one-sided/both) — fixed `now`; and any pure payload builders you extract (`buildPlacementBody`, `buildCouponBody`) including the target rules and the type/value validation. See them fail; implement; pass.
- [ ] **Step 2: e2e first** (port "Admin promotions", restoring state via `finally` deletion): hostile title `عرض <b>&</b> 'خاص'` creates and renders as text with zero `b` elements and the storefront `.announce-item` shows the literal text; active toggle → row shows `متوقف`, storefront `[data-announce]` gone; reorder two announcements by clicking `خفض {title}`; coupon TEST20 (`0/∞`), duplicate `test20` → 409 banner; hostile link `javascript:alert(1)` rejected client-side (no request) and hero without image rejected with the right message; target selects only for targeted slots and a slot switch clears the stored target (API state); Amman-time round trip (enter `2026-09-29T18:00`, API stores `…T15:00:00.000Z`, list shows 18:00); tab keyboard navigation (ArrowLeft/Right/Home/End); 375px layout. See them fail.
- [ ] **Step 3: Implement** placements (commit "feat(admin): promotions — placements"), then coupons (commit "feat(admin): promotions — coupons"); run `E2E_ONLY="Promotions" npm run test:e2e`.

---

### Task 8: Store settings page (`/settings`)

**Files:** create `admin/src/pages/settings/{SettingsPage.jsx,ThemeSection.jsx,IdentitySection.jsx,AdvancedColors.jsx}`; modify `App.jsx`, `nav.js`; e2e.

Requirements (sheet 5b §1 plus rulings): one form with sections الهوية (store name required client-side ≤ 40, tagline ≤ 80, four upload fields logo_light/logo_dark/favicon/share_image each with preview, remove button, and a status line; a hidden or visible input carrying the URL so tests can read `id="logo_light"`; whatsapp free-text with the server's 8–15 digit rule shown as helper text and the server 400 surfaced — keep the field free-text like the legacy e2e expects a server 400 for `not-a-number`; instagram (https); delivery fee and free-delivery threshold (decimals, ≥ 0, Arabic digits accepted)) and ألوان المتجر (four colour inputs `id="theme_bg|theme_surface|theme_text|theme_accent"` each as a native `<input type="color">` plus a hex text field kept in sync; live preview panel with the three contrast ratios and non-blocking warnings from `contrastReport` — "نسب التباين إعلامية ولا تمنع الحفظ"; "استعادة الألوان الافتراضية" restores the four colours and saves theme-only immediately like legacy but WITHOUT clearing overrides; advanced section (collapsible) with the 12 tokens: each shows its derived value as the swatch when unset with the label "مشتق", set values with a "إعادة تعيين" action that sends `""` for that key, a "مسح كل التخصيصات" action that clears every set override, native colour inputs with ids `ov_<token>`). Save button `id="saveBtn"` disabled until the GET succeeded and while saving; the PUT body = `{store_name, tagline, logo_light, logo_dark, favicon, share_image, whatsapp, instagram, delivery_fee, free_delivery_over, theme:{bg,surface,text,accent,overrides}}` where `overrides` contains only changed tokens (never `null`); success `role="status"` text "تم حفظ الإعدادات"; failure in a `role="alert"` banner with the server message; uploads persist only on Save (say so under the status line); `ConfirmLeave` guard when dirty.

- [ ] **Step 1: e2e first** (port `identity.mjs`, `colors.mjs`, the `nav.mjs` light-theme scenario and the `admin-online.mjs` settings round trip; each restores the settings it changed in `finally`): save is disabled until loaded; store name + logo upload persist and appear on the storefront (title contains the name, `.site-header .brand-mark` src `^/img/`), removing the logo persists; accent change reflected as `--gold` on the storefront and reset restores it; the light theme scenario luminance assertions; advanced `ov_bg-glass` override renders as `rgb(51, 102, 153)` on `.site-header`, per-token reset and clear-all remove it; whatsapp round trip and `not-a-number` shows the server's Arabic 400 in the banner; contrast ratios update live and warnings appear for near-black colours yet Save still works; hostile store name inert in the form; 375px layout (single column, sticky Save bar above the tab bar). See it fail.
- [ ] **Step 2: Implement**; run `E2E_ONLY="Settings" npm run test:e2e`; commit "feat(admin): store settings page with theme, identity and advanced colours".

---

### Task 9: Storefront CMS page (`/storefront`)

**Files:** create `admin/src/pages/storefront/{StorefrontPage.jsx,HomeGroup.jsx,SectionsTable.jsx,ServiceItems.jsx,ContactGroup.jsx,TextsGroup.jsx,DeliveryGroup.jsx,SeoGroup.jsx}`; modify `App.jsx`, `nav.js`; e2e.

Requirements (sheet 5b §2): five collapsible groups (accordion; first open; ALL groups submitted even when collapsed) sharing one Save (`id="sfSave"`, disabled until loaded/while saving), `role="status"` success "تم الحفظ" and a `role="alert"` banner for server messages (one 400 aborts the entire save: the banner explains "لم يُحفظ شيء"). Groups: الصفحة الرئيسية — hero title (≤ 80, hint `{store_name}`), subtitle (≤ 200), two CTAs (label ≤ 30, link via `validLink` client-side), sections table/cards (ReorderButtons with `▲`/`▼` glyph buttons keeping accessible names, visible switch, custom title ≤ 40 only for the titled keys; controlled React state so the legacy title-loss quirk cannot occur; row labels from the sheet), service items (≤ 4, rows title ≤ 40 / text ≤ 80, add disabled at 4, blank rows dropped on save; a note that emptying them restores the three default items); التذييل والتواصل — phone (`^\+?[\d\s-]{6,20}$`), email (native validation kept), address (≤ 200), map URL (https), hours (≤ 120), four socials (https), footer about (≤ 300 with counter), copyright (≤ 120, hint `{store_name}` and `{year}`); نصوص المتجر — oos_note, checkout_note (optional), order_thanks (≤ 200 each); التوصيل — 12 governorate checkboxes from `governorates.js` (at least one enforced client-side); محركات البحث — SEO title (≤ 70) and description (≤ 160). Because the server substitutes defaults for emptied fields, each defaulted field shows its default as placeholder and an "استعادة الافتراضي" action, and the page states that clearing such a field restores the default. Only the storefront groups are sent (home, contact, social, footer, texts, delivery, seo). Keep ids used by the legacy e2e where cheap (`hero_title`, `contact_phone`, `social_instagram`, `sectionsBody`, `governoratesBody`).

- [ ] **Step 1: e2e first** (port `storefront-cms.mjs`; restore original settings in `finally` — the legacy scenario left them modified): hero title, hide "الأكثر مبيعًا" (storefront has no `a[href="/best-sellers"]`), move "العروض" up seven times, contact phone + Instagram + uncheck "العقبة", Save, storefront asserts (hero text, no best-sellers link, `tel:` link, instagram link, checkout city options exclude العقبة, 375px no overflow); service items add up to 4 (button disabled at 4) and blank rows dropped; invalid `http://` social link shows the server message and nothing is saved; zero governorates blocked client-side; hostile strings in every text field stay inert in the admin; title typed then visibility toggled keeps the title (regression for the legacy quirk); 375px layout. See it fail.
- [ ] **Step 2: Implement**; run `E2E_ONLY="Storefront" npm run test:e2e`; commit "feat(admin): storefront CMS page".

---

### Task 10: Nav wiring and phase verification

**Files:** modify `admin/src/app/nav.js` (all Phase 5 entries become `to:` routes; no `legacy:` links remain), `admin/src/app/Shell.jsx` (More sheet lists everything grouped; tab set unchanged).

- [ ] **Step 1: Wire and update selectors**; run the affected scenarios with `E2E_ONLY`.
- [ ] **Step 2: Full verification**: `npm test`, `npm run test:admin`, `npm run build:admin`, full `npm run test:e2e` (rerun once for the known "Header: hides on scroll down" flake), RTL grep over `admin/src`; commit "feat(admin): switch store content pages to in-app routes".

---

## Self-Review

**Spec coverage (spec section 8, Phase 5):** designers, categories, bulk tagging, pages (markup toolbar + live preview via `/api/pages/preview`), promotions (ads and codes), storefront content, settings (identity, colours with contrast checks, delivery, SEO, texts) → Tasks 3-9; reorder controls kept → Tasks 4, 6, 7, 9; the admin-configurable-storefront rule preserved.

**Consistency:** helper names (`slugify`, `validLink`, `isImageUrl`, `moveItem`, `renumber`, `reorderRequests`, `runSequential`, `ammanLocalToIso`, `isoToAmmanLocal`, `formatAmman`, `contrastReport`, `deriveTokens`, `GOVERNORATES`, `useSettings`) and components (`CrudDialog`, `ReorderButtons`, `ActiveSwitch`, `DeleteConfirm`, `BannerUpload`) are defined in Tasks 1-2 and used identically later; e2e tokens per task: Designers, Categories, Catalogue tagging, Content pages, Promotions, Settings, Storefront.

**Review Focus coverage:** partial PUT / disabled-until-loaded → Tasks 8-9; default fallback → Task 9; theme rules → Task 8; legacy data-loss traps → Tasks 3-7; reorder → Tasks 1, 4, 6, 7, 9; preview safety → Task 6; XSS → each e2e; immutable fields → Tasks 4, 7; delete guards → Tasks 3, 4, 6, 7.
