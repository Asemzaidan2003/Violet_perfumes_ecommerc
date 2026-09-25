# Immersive Layer — Design Spec

Status: approved to proceed autonomously by the user, 2026-09-25
Scope: storefront sub-project 4 of 4. Adds 3D and signature motion on top of the working store (2, 3).

## Intent

"I won't say no to animations and some 3D if this will be an unforgettable experience" — while the
owner also requires a **fast** order flow and **smooth** navigation. Rule for this layer: it may
delight, it may never delay. Nothing here blocks reading, searching, adding to cart or checking out.

## Capability gate

`storefront/js/fx.js` decides once per page:
- `motion` = not `prefers-reduced-motion: reduce`.
- `rich3d` = motion && WebGL2 available && not `navigator.connection.saveData` &&
  (`navigator.deviceMemory` unknown or ≥ 4) && (`hardwareConcurrency` unknown or ≥ 4).
Everything below checks these flags; when off, the static design (already complete) is what users see.

## Signature moments

1. **Entrance (home, first visit per session)** — a ≤ 1.2 s "doors of light" reveal: two cream
   panels part from the centre while a gold light sweep crosses the window display, then the page is
   interactive. Pure CSS/Web Animations; never blocks input (pointer-events pass through after
   300 ms; any key/click/scroll skips it); skipped when `!motion`; `sessionStorage` flag so it plays
   once.
2. **The 3D signature bottle** (Three.js, lazily imported):
   - Procedural, no model files: glass body from `LatheGeometry` with `MeshPhysicalMaterial`
     (transmission, roughness ~0.05, IOR 1.5), inner liquid mesh tinted by the product's first family
     swatch (default gold), metallic gold cap, label from a `CanvasTexture` with the product name.
   - **Home hero**: one slowly turning bottle beside the headline that tilts gently toward the
     pointer/gyro; loads after the page is idle (`requestIdleCallback`/timeout) and only when
     `rich3d`; pauses when off-screen (IntersectionObserver) or the tab is hidden.
   - **Product page**: a "عرض 360°" button in the gallery swaps in the viewer (drag / touch to rotate,
     auto-rotate until touched, reset button, Esc returns to photos). Loaded only on click.
   - One `WebGLRenderer` per page, `powerPreference: "low-power"`, pixel ratio capped at 2, dispose on
     leave; canvas has `role="img"` and an `aria-label`; mouse and touch both supported.
   - Vendoring: add dependency `three`; serve `node_modules/three/build` and
     `node_modules/three/examples/jsm` under `/vendor/three/`; an import map maps `three` and
     `three/addons/`.
3. **Page transitions** — cross-document View Transitions (`@view-transition { navigation: auto; }`):
   the product image morphs from the card into the product page (`view-transition-name` per product
   id), other content cross-fades (≤ 300 ms). Browsers without support navigate normally.
4. **Shelf & reveal motion** — sections and shelf items rise/fade in as they enter the viewport via CSS
   scroll-driven animations (`animation-timeline: view()`) inside `@supports`, with an
   IntersectionObserver fallback that toggles `.is-in`. Stagger with a `--i` custom property. Subtle
   spotlight parallax on the hero background only (never on text).
5. **Add-to-cart flight** — the product image flies (Web Animations, ~550 ms arc) to the cart button,
   which bumps (spring ease) and updates its live count (`aria-live="polite"` announces "تمت الإضافة
   إلى السلة"); `navigator.vibrate(10)` where supported. Reduced motion → instant count update only.
6. **Tester mist** — family cards in the tester bar release a soft animated mist in their swatch
   colour on hover/focus (CSS gradients + transform; no canvas).
7. **Micro-interactions** — pressed states scale 0.97, chips/tabs animate the selection pill,
   drawers slide with the page dimming behind; exits faster than entrances.

## Performance budget (must hold with the layer on)

- No new render-blocking resources; `three` (~150 KB gzip) only when 3D actually starts.
- LCP unchanged (the hero image is the LCP; the 3D canvas appears after it).
- Main-thread long tasks from this layer < 50 ms; animations on transform/opacity only.
- 3D targets 60 fps desktop / 30 fps mid-range phone; if the measured frame time exceeds 50 ms for
  2 s, the scene stops animating and stays on its last frame.

## Testing

- Browser smoke (Playwright + installed Edge): with motion enabled, home loads with no console/CSP
  errors, the entrance ends and the page is clickable within 1.5 s, the 3D canvas appears on the home
  hero, the product-page 360° viewer opens and closes, add-to-cart updates the count.
- With `prefers-reduced-motion: reduce` emulated: no entrance, no auto-rotation, no 3D on home,
  add-to-cart still updates the count.
- Static checks: `three` is not requested on pages where 3D never starts (network log).
