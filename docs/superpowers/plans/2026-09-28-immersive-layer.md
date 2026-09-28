# Immersive Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add signature motion and 3D to the storefront without ever delaying reading, searching, adding to cart or checking out:
- a capability gate
- scroll reveals and micro-interactions
- tester mist
- view transitions with a product-image morph
- an add-to-cart flight
- the "doors of light" entrance
- a procedural Three.js glass bottle: a 360° viewer on product pages, and a desktop-only home hero

**Architecture:**
- **Progressive enhancement throughout.**
  - `storefront/js/fx.js` computes the capability flags once and adds `fx-motion` to `<html>`.
  - CSS hides reveal content **only** under `.fx-motion`.
  - Everything else is additive JS that no-ops when a flag is false.
- **Three.js loads lazily.**
  - It is served from `node_modules/three` at `/vendor/three@<version>/`.
  - An import map (the first script in `<head>`, allowed by its sha256 in the storefront CSP) maps `three` and `three/addons/`.
  - `bottle3d.js` builds the procedural bottle.
  - `viewer360.js` and `hero3d.js` are dynamically imported only when a scene actually starts.

**Tech Stack:**
- Node 24 ESM, Express 5, Mongoose 8.24, local MongoDB replica set `rs0`
- `node:test`, and Playwright with the installed Edge (`npm run test:e2e`)
- **New dependency: `three`** (exact pinned version; the controller adds it)

**Spec:** `docs/superpowers/specs/2026-09-25-immersive-layer-design.md` (the source of truth; read it in full). Design system and page rules: `docs/superpowers/specs/2026-09-25-storefront-core-design.md`.

## Global Constraints

- **Rule: this layer may delight, it may never delay.** Every page must be complete and usable with JS off, with reduced motion, and without WebGL.
- **Capability flags** (`fx.js`, computed once per page, exported):
  - `motion` = `!matchMedia("(prefers-reduced-motion: reduce)").matches`
  - `rich3d` = `motion && WebGL2 available && !navigator.connection?.saveData && (navigator.deviceMemory ?? 4) >= 4 && (navigator.hardwareConcurrency ?? 4) >= 4`
  - `homeHero3d` = `rich3d && matchMedia("(pointer: fine) and (min-width: 1024px)").matches`
- **Reveal styles only hide content under `html.fx-motion`.** Never apply them to the hero image or the h1 (LCP).
- **Performance budget:**
  - No new render-blocking resources.
  - `three` is requested only when a 3D scene starts.
  - LCP is unchanged.
  - Long tasks caused by this layer stay under 50 ms during load, scroll and input. The one-time import and shader compile after an explicit 360° click are exempt.
  - If the average frame time exceeds 50 ms over 2 s, the scene stops animating and keeps its last frame.
- **One `WebGLRenderer` per page.**
  - Create it with `powerPreference: "low-power"` and a pixel ratio of at most 2.
  - Dispose of it on close and on `pagehide`.
  - The canvas has `role="img"` and an Arabic `aria-label`.
  - Mouse and touch both work.
- **Security:**
  - The storefront CSP stays strict (`script-src 'self'` plus exactly one `'sha256-…'` for the import map). Nothing inline other than the import map.
  - Client JS never uses `innerHTML` with data.
- **Fonts on canvas:**
  - Draw only after `document.fonts.load('700 48px "El Messiri"')`.
  - Set `ctx.direction = "rtl"`.
- **Housekeeping:**
  - Use local MongoDB only; never `nsamat_dev`, never `.env*`.
  - No attribution trailer.
  - Keep files under 500 lines.
  - Put new CSS in `storefront/css/fx.css` (store.css is ~440 lines).
  - Put new e2e scenarios in `tests/e2e/fx.mjs`, registered like `promotions.mjs`.
  - Paste real output.
  - If a permission is denied, stop and report BLOCKED.
- **Test gates:** `npm test` and `npm run test:e2e` stay fully green after every task.

## Review Focus

1. **Reduced motion or no WebGL:**
   - all content is visible (nothing stuck at opacity 0);
   - no `three` request;
   - add-to-cart still updates the count.
   - Pin in Task 4 (e2e).
2. **Phone at 375 px with touch:**
   - no home canvas and no `three` request on `/`;
   - the 360° viewer still opens on click and rotates with touch drag.
   - Pin in Task 4.
3. **Rapid interaction:**
   - opening and closing the viewer 5 times leaves exactly 0 or 1 live renderer (no leaked WebGL contexts; Chrome caps them at about 16);
   - navigating away mid-entrance leaves no overlay blocking clicks.
   - Pin in Tasks 3 and 4.
4. **CSP:**
   - the import map hash must match byte for byte, or `three` silently fails;
   - a console CSP error fails e2e.
   - Pin in Task 3 with a unit test that recomputes the hash from the rendered `<script type="importmap">` body.
5. **The entrance never blocks input:**
   - the overlay is `pointer-events: none` from the first frame;
   - a click at 100 ms lands on the page underneath.
   - Pin in Task 2 (e2e).

---

### Task 1: Capability gate, reveals, micro-interactions, tester mist, view transitions

**Files:**
- Create:
  - `storefront/js/fx.js`: exports `motion`, `rich3d`, `homeHero3d`, adds `fx-motion`, runs the reveal fallback and the view-transition naming.
  - `storefront/css/fx.css`
- Modify:
  - `backend/store/views/layout.js`: load `fx.css` and `fx.js` (module) on every page.
  - The views that need `data-reveal` / `--i` hooks: `home.js`, `collection.js`, `components.js`, `product.js`.
- Test:
  - `tests/store-pages.test.js`: markup hooks present; `fx.js` is loaded as a module and not render-blocking.
  - `tests/e2e/fx.mjs` (new): scenario "Motion basics".

**Interfaces:**
- **Produces:**
  - `import { motion, rich3d, homeHero3d } from "./fx.js"` for later tasks.
  - Views mark revealable blocks with `data-reveal`, and shelf items with `style="--i: n"`.
  - Product card images carry `data-vt-img`.
  - The product page main image has `view-transition-name: product-hero` in CSS.
- **Reveal:**
  - Inside `@supports (animation-timeline: view())`, `.fx-motion [data-reveal]` animates `opacity` / `translate` with `animation-timeline: view(); animation-range: entry 0% cover 30%`, staggered by `--i`.
  - Otherwise an IntersectionObserver toggles `.is-in`.
  - Without `.fx-motion`, nothing is hidden.
- **Spotlight parallax:** only the hero background layer moves, via a CSS variable updated in `requestAnimationFrame` on scroll (passive listener). Never the text.
- **Micro-interactions:**
  - `:active { scale: .97 }` on buttons, chips and cards;
  - the chip/tab selection pill slides;
  - drawers slide with the page dimming (the existing `<dialog>` gets `@starting-style` transitions);
  - exits are faster than entrances;
  - all of it sits under `@media (prefers-reduced-motion: no-preference)`.
- **Tester mist:** on hover/focus of family blotters (`#families .blotter`), a CSS radial gradient in `--swatch` rises and fades using transform and opacity only. No canvas.
- **View transitions:**
  - `@view-transition { navigation: auto; }` with ≤ 300 ms cross-fades.
  - On a card click, or in `pageswap`, set `style.viewTransitionName = "product-hero"` on that card's image only.
  - Unsupported browsers simply navigate.

- [ ] **Step 1: Write failing tests.**
  - **Unit:** the home HTML contains a `data-reveal` block, shelf items carry `--i`, the `fx.js` script tag is `type="module"`, and cards carry `data-vt-img`.
  - **e2e "Motion basics"** at 1440 with motion allowed:
    - `/` loads with no console or CSP errors;
    - `html` has class `fx-motion`;
    - after scrolling to the bottom, every `[data-reveal]` has computed opacity 1 within 2 s;
    - a card click navigates to `/p/:id`.
  - **Then with `page.emulateMedia({ reducedMotion: "reduce" })` and a reload:**
    - `html` lacks `fx-motion`;
    - every `[data-reveal]` has opacity 1 immediately, without scrolling.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test` and `npm run test:e2e`.** Expected: all green.
- [ ] **Step 5: Commit.** `feat: motion layer — capability gate, reveals, micro-interactions, view transitions`

---

### Task 2: Add-to-cart flight and the "doors of light" entrance

**Files:**
- Create: `storefront/js/fx-flight.js`, `storefront/js/fx-entrance.js`
- Modify:
  - `storefront/js/cart.js` and `storefront/js/product.js`: after a successful `add()`, call `flyToCart(imgEl)` when `motion`.
  - `backend/store/views/home.js`: the entrance overlay element, `aria-hidden="true"`, rendered on `/` only.
  - `storefront/css/fx.css`
- Test: `tests/e2e/fx.mjs`

**Interfaces:**
- **Consumes:** `motion` from `fx.js`.
- **Produces:**
  - `flyToCart(sourceImg: HTMLImageElement) → Promise<void>`
    - A clone of the image flies about 550 ms along an arc to the visible cart button (header or bottom bar), using Web Animations, RTL-aware.
    - The cart button then bumps with a spring ease, and the clone is removed.
    - `navigator.vibrate?.(10)`.
    - Without `motion`, it resolves immediately.
    - The live-region announcement stays in `cart.js` (already "أُضيف … إلى السلة").
  - **Entrance** on `/`:
    - Two **dark** panels part from the centre while a gold light sweep crosses the window, within 800 ms.
    - The overlay is `pointer-events: none` from the first frame.
    - Any pointerdown, keydown or scroll cancels it at once.
    - It plays only when `motion` is set and localStorage `nsamat_entrance` has no stamp newer than 30 days (try/catch). The stamp is written at the start of the entrance.
    - The overlay is hidden in CSS unless `.fx-motion.fx-entrance` is set, so no-JS visitors never see it.
    - It is removed from the DOM after it finishes.

- [ ] **Step 1: Write the failing e2e tests.**
  - **Entrance:**
    - With a fresh context, `/` shows the overlay.
    - A `page.mouse.click` on a product card link 100 ms after `domcontentloaded` navigates. This proves clicks go through.
    - A reload in the same context shows no overlay (the stamp).
    - Under reduced motion there is no overlay.
  - **Flight:** a quick-add on a card creates a transient `.fx-flight` element that is gone within 1 s, and the cart count increments.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test` and `npm run test:e2e`.** Expected: all green.
- [ ] **Step 5: Commit.** `feat: add-to-cart flight and the doors-of-light entrance`

---

### Task 3: Three.js serving, the procedural bottle, and the product 360° viewer

**Controller pre-step:** `npm install three@<latest 0.x> --save-exact` (the integration owner edits `package.json` and the lockfile). Then `npm audit --omit=dev` must stay clean.

**Files:**
- Create:
  - `backend/store/importmap.js`: exports `IMPORT_MAP_JSON` (the exact string) and `IMPORT_MAP_HASH` (`'sha256-<base64>'`, computed with `node:crypto` at import).
  - `storefront/js/bottle3d.js`
  - `storefront/js/viewer360.js`
- Modify:
  - `backend/app.js`: mount `node_modules/three/build` and `node_modules/three/examples/jsm` at `/vendor/three@<version>/build` and `/vendor/three@<version>/examples/jsm`, immutable for 1 year. Read `<version>` from `three/package.json`.
  - `backend/routes/storefront.Routs.js`: add `IMPORT_MAP_HASH` to `script-src`.
  - `backend/store/views/layout.js`: render `<script type="importmap">${raw(IMPORT_MAP_JSON)}</script>` as the **first** element in `<head>` after `<meta charset>`, byte-identical to the hashed string.
  - `backend/store/views/product.js`: a "عرض 360°" button in the gallery, rendered `hidden` and revealed by JS only when `rich3d`.
  - `storefront/js/product.js`: on click, `import("./viewer360.js")`.
- Test:
  - `tests/fx-importmap.test.js` (new): GET a product page; the rendered import-map body's sha256 equals the hash in the CSP header; `/vendor/three@<v>/build/three.module.js` returns 200 with an immutable cache header.
  - `tests/e2e/fx.mjs`

**Interfaces:**
- **Produces:**
  - `createBottle(THREE, { tint = "#D4AF37", label = "نسمات" }) → Promise<THREE.Group>`
    - Glass body from `LatheGeometry`, with `MeshPhysicalMaterial` (`transmission: 1`, `roughness: 0.05`, `ior: 1.5`, `thickness: 0.5`).
    - An inner liquid mesh tinted with `tint`.
    - A metallic gold cap.
    - A label `CanvasTexture`, drawn after `document.fonts.load`, with `ctx.direction = "rtl"`.
  - `createStage(THREE, canvas) → { renderer, scene, camera, render(), dispose() }`
    - Uses `PMREMGenerator` with `RoomEnvironment` (from `three/addons/environments/RoomEnvironment.js`) for the environment map.
    - Calls `renderer.compileAsync(scene, camera)` before the first frame.
    - Runs the frame-time guard (average > 50 ms over 2 s → stop the loop and keep the last frame).
    - Pauses when off-screen (IntersectionObserver) or when `document.hidden`.
  - `openViewer360(galleryEl, { tint, label }) → { close() }`
    - Swaps the gallery photo for a canvas with `role="img"` and `aria-label="عرض ثلاثي الأبعاد لـ <name>"`.
    - OrbitControls (`three/addons/controls/OrbitControls.js`) with zoom and pan disabled.
    - Auto-rotates until the first pointerdown.
    - Has a reset button, and a close button (`aria-label="إغلاق العرض ثلاثي الأبعاد"`). Esc and close return to the photos and call `dispose()`.
    - `pagehide` also disposes.
  - **Tint:** the product's first family swatch (from `vocab.js` `FAMILIES`), passed in via a `data-tint` attribute on the button. The default is gold.

- [ ] **Step 1: Write failing tests.**
  - **The unit test above.**
  - **e2e "360 viewer"** at 1440:
    - the product page has no `three` request before the click;
    - clicking "عرض 360°" shows a `canvas[role=img]` within 5 s, and a `three.module.js` request happens;
    - dragging on the canvas changes a `data-yaw` attribute (updated each frame, for testability);
    - Esc closes it (no canvas, photo visible);
    - opening and closing 5 times, then checking `window.__fxRenderers` (a debug counter incremented on create and decremented on dispose), gives ≤ 1;
    - no console or CSP errors.
  - **Headless Edge may lack WebGL2.** If `rich3d` is false there, the test launches Edge with `--use-angle=swiftshader --enable-unsafe-swiftshader`, set in `tests/e2e/run.mjs`'s launch args (controller-approved shared change: add only those args). If it's still unavailable, the scenario asserts that the button stays hidden and logs SKIP. Never a false pass: record which path ran in the report.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test` and `npm run test:e2e`.** Expected: all green.
- [ ] **Step 5: Commit.** `feat: procedural 3D bottle and product 360° viewer`

---

### Task 4: Home hero 3D (desktop only) and the capability matrix

**Files:**
- Create: `storefront/js/hero3d.js`
- Modify:
  - `backend/store/views/home.js`: a canvas slot inside the brand welcome slide, empty by default; the static SVG bottle stays as the fallback.
  - `storefront/js/fx.js` or a small loader: when `homeHero3d`, run `requestIdleCallback(() => import("./hero3d.js"), { timeout: 2000 })` (setTimeout 2 s fallback).
  - `storefront/css/fx.css`
- Test: `tests/e2e/fx.mjs`

**Interfaces:**
- **Consumes:** `createBottle`, `createStage` (Task 3); `homeHero3d` (Task 1).
- **Produces:** `startHero3d(slotEl)`.
  - The canvas fades in over the static SVG after the first frame renders. The SVG stays underneath until then, so the LCP is unchanged.
  - The bottle tilts gently towards the pointer (lerped, max 12°).
  - It pauses off-screen, on a hidden tab, and when the brand slide isn't the active hero slide (listen for the hero slider's slide change: check `storefront/js/promo.js` for an event, and dispatch `hero:change` there if none exists).
  - It uses the same one-renderer rule as the viewer: on `/` there is no viewer, so this is the one.

- [ ] **Step 1: Write the failing e2e capability matrix.**
  - **Desktop 1440 (mouse, motion):**
    - the home canvas appears within 5 s after load;
    - the h1 stays visible throughout;
    - no console or CSP errors.
    - With the SwiftShader flags from Task 3, or SKIP if WebGL2 is unavailable (reported).
  - **Mobile 375 (`openPage({ mobile: true })`):**
    - on `/`, no canvas and zero requests to `/vendor/three@`;
    - on a product page, the 360° button opens the viewer and touch-drag changes `data-yaw` (`page.touchscreen` / dispatched touch pointer events), subject to the same SwiftShader note.
  - **Reduced motion (desktop):**
    - no entrance, no home canvas and no `three` request on `/`;
    - on a product page, the 360° button is hidden;
    - every `[data-reveal]` is visible;
    - quick-add updates the count.
  - **Performance probe (desktop, `/`):**
    - a `PerformanceObserver({ type: "longtask", buffered: true })` installed via `addInitScript`;
    - during load and a 2 s scroll, no long task over 50 ms is attributed to fx/hero3d scripts before the hero3d import settles;
    - report the measured maximum.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test` and `npm run test:e2e`.** Expected: all green. Save screenshots `p4x-home-3d-1440.png` and `p4x-viewer-1440.png` to the session scratchpad.
- [ ] **Step 5: Commit.** `feat: desktop home hero 3D bottle with idle loading and pause guards`

---

### Task 5: Final checks (controller)

- [ ] `npm test` and `npm run test:e2e` green; `npm audit --omit=dev` clean.
- [ ] Final whole-branch review against the spec and this plan's Review Focus. Fix round.
- [ ] Merge to `main` (fast-forward; not pushed).
