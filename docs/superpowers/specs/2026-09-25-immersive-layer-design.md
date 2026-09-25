# Immersive Layer — Design Spec

Status: approved to proceed autonomously by the user, 2026-09-25. Revised after an independent
design review (same day).
Scope: storefront sub-project 4 of 4. Adds 3D and signature motion on top of the working store (2, 3).

## Intent

"I won't say no to animations and some 3D if this will be an unforgettable experience" — while the
owner also requires a **fast** order flow and **smooth** navigation. Rule: this layer may delight, it
may never delay. Nothing here blocks reading, searching, adding to cart or checking out, and every
page is complete without it.

## Capability gate

`storefront/js/fx.js` sets, once per page:
- `motion` = not `prefers-reduced-motion: reduce`.
- `rich3d` = motion && WebGL2 && not `navigator.connection?.saveData` && (`deviceMemory` unknown or
  ≥ 4) && (`hardwareConcurrency` unknown or ≥ 4).
- `homeHero3d` = `rich3d && matchMedia("(pointer: fine) and (min-width: 1024px)").matches` —
  desktop-class devices only. Phones get the static hero with the CSS light sweep, and keep 3D via
  the click-to-open product viewer.
- It adds `fx-motion` to `<html>` when `motion` — **reveal styles only hide content under that
  class**, so no-JS and reduced-motion users always see everything.

## Signature moments

1. **Entrance** (home) — an ≤ 800 ms "doors of light" reveal: two **dark** panels part from the
   centre while a gold light sweep crosses the window display. The overlay has `pointer-events: none`
   from the first frame (clicks go straight through; any input also cancels it). Plays when
   `motion` and no `nsamat_entrance` stamp newer than 30 days in localStorage (links opened from
   Instagram/WhatsApp start new sessions, so sessionStorage would replay it constantly).
2. **The 3D signature bottle** (Three.js, lazily imported):
   - Procedural, no model files: glass body from `LatheGeometry` with `MeshPhysicalMaterial`
     (transmission, roughness ≈ 0.05, IOR 1.5, thickness), lit by an environment map
     (`PMREMGenerator` + `RoomEnvironment`) so the glass isn't flat or dark; an inner liquid mesh
     tinted by the product's first family swatch (default gold); a metallic gold cap; a label from a
     `CanvasTexture` drawn after `document.fonts.load()` with `ctx.direction = "rtl"`.
   - **Home**: on the built-in welcome slide only, when `homeHero3d`; loads after the page is idle
     (`requestIdleCallback`, 2 s timeout fallback); tilts gently toward the pointer; pauses when
     off-screen (IntersectionObserver) or the tab is hidden; shaders compiled with
     `renderer.compileAsync()` before the first frame.
   - **Product page**: a "عرض 360°" button in the gallery (any capable device, `rich3d`) swaps in the
     viewer: drag/touch to rotate (OrbitControls, zoom/pan disabled), auto-rotate until touched,
     reset button, Esc/close returns to photos. Loaded only on click.
   - One `WebGLRenderer` per page (`powerPreference: "low-power"`, pixel ratio ≤ 2), disposed on
     close/`pagehide`; the canvas has `role="img"` and an `aria-label`; mouse and touch both work.
   - Serving: dependency `three`; `node_modules/three/build` and `examples/jsm` mounted at
     `/vendor/three@<version>/`; an import map (the **first** script in `<head>`, allowed by its
     sha256 in the storefront CSP) maps `three` and `three/addons/`.
3. **Page transitions** — cross-document View Transitions (`@view-transition { navigation: auto; }`)
   with a ≤ 300 ms cross-fade. The product image morph: on card click (or `pageswap`), set
   `style.viewTransitionName = "product-hero"` on **that** card's image only; the product page's main
   image has `view-transition-name: product-hero`. (Names are assigned at navigation time: ObjectIds
   aren't valid CSS identifiers and the same product appears on several shelves.) Unsupported
   browsers navigate normally.
4. **Shelf & reveal motion** — sections and shelf items rise/fade in via CSS scroll-driven animations
   (`animation-timeline: view()` inside `@supports`, under `.fx-motion`), with an IntersectionObserver
   fallback toggling `.is-in`; stagger via a `--i` custom property. Never applied to the hero image
   (the LCP element). Subtle spotlight parallax on the hero background only (never text).
5. **Add-to-cart flight** — the product image flies (Web Animations, ~550 ms arc; RTL-aware) to the
   cart button, which bumps (spring ease); the live region announces "تمت الإضافة إلى السلة";
   `navigator.vibrate(10)` where supported. Without `motion`: instant count update only.
6. **Tester mist** — family cards release a soft mist in their swatch colour on hover/focus (CSS
   gradients + transform; no canvas).
7. **Micro-interactions** — pressed states scale 0.97; chip/tab selection pill slides; drawers slide
   with the page dimming; exits faster than entrances.

## Performance budget (must hold with the layer on)

- No new render-blocking resources; `three` requested only when a 3D scene actually starts.
- LCP unchanged (the hero image stays the LCP; the canvas appears after it).
- During page load, scrolling and input, long tasks caused by this layer < 50 ms. The one-time
  module import and shader compile after the user **explicitly clicks** the 360° viewer are exempt.
- 3D targets 60 fps desktop / 30 fps mid-range phone; if the average frame time exceeds 50 ms over
  2 s, the scene stops animating and keeps its last frame.

## Testing

- Browser smoke (Playwright + installed Edge), motion enabled, desktop viewport: home loads with no
  console/CSP errors; the entrance finishes and the page is clickable within 1 s; the home 3D canvas
  appears; the product 360° viewer opens and closes; add-to-cart updates the count; a product-card
  click navigates to the product page.
- Mobile viewport (375 px, touch): no home 3D canvas and no `three` request; the 360° viewer still
  opens on click.
- `prefers-reduced-motion: reduce` emulated: no entrance, no auto-rotation, no home 3D; all content
  visible; add-to-cart still updates the count.
