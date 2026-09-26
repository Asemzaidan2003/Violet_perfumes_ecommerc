// Storefront entry module (every page). Entry file only: it has side effects and NO exports —
// shared helpers live in ./shared/*.js. No inline handlers: everything is delegated from here.
import { num } from "./shared/format.js";
import { CART_KEY, cartCount } from "./shared/cart-store.js";

const PLACEHOLDER_PATH = "/assets/img/placeholder-bottle.svg";
const PLACEHOLDER = PLACEHOLDER_PATH + new URL(import.meta.url).search; // same ?v= as this file
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// One broken feature must never stop the others from initialising.
function safely(fn) {
  try { fn(); } catch (err) { console.error(err); }
}

// --- Image fallback: hotlinked photos can vanish; show the branded bottle instead.
function useFallback(img) {
  if (img.src.includes(PLACEHOLDER_PATH)) return;
  img.removeAttribute("srcset");
  img.src = PLACEHOLDER;
  img.classList.add("is-placeholder");
}
document.addEventListener("error", (e) => { if (e.target instanceof HTMLImageElement) useFallback(e.target); }, true);

// --- Header compaction on scroll.
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    document.querySelector("[data-header]")?.classList.toggle("is-compact", scrollY > 16);
    ticking = false;
  });
}
addEventListener("scroll", onScroll, { passive: true });

// --- Shelves: arrow buttons scroll one "page"; RTL tracks scroll towards negative scrollLeft.
function updateShelfNav(track) {
  const nav = track.closest(".shelf")?.querySelector(".shelf-nav");
  if (!nav) return;
  const pos = Math.abs(track.scrollLeft);
  const max = track.scrollWidth - track.clientWidth;
  nav.hidden = max <= 4;
  nav.querySelector("[data-shelf-prev]").disabled = pos <= 4;
  nav.querySelector("[data-shelf-next]").disabled = pos >= max - 4;
}
addEventListener("resize", () => document.querySelectorAll(".shelf-track").forEach(updateShelfNav));

function scrollShelf(btn) {
  const track = btn.closest(".shelf").querySelector(".shelf-track");
  const forward = btn.hasAttribute("data-shelf-next") ? 1 : -1;
  const rtl = getComputedStyle(track).direction === "rtl";
  const step = track.clientWidth * 0.85 * forward * (rtl ? -1 : 1);
  track.scrollBy({ left: step, behavior: reducedMotion.matches ? "auto" : "smooth" });
}

// --- Cart count badge (the cart lives in localStorage via shared/cart-store.js).
function updateCartCount() {
  safely(() => {
    const n = cartCount();
    for (const el of document.querySelectorAll("[data-cart-count]")) {
      el.textContent = num(n);
      el.hidden = n === 0;
    }
  });
}
addEventListener("storage", (e) => { if (e.key === CART_KEY) updateCartCount(); });
addEventListener("cart:change", updateCartCount);

document.addEventListener("click", (e) => {
  const shelfBtn = e.target.closest("[data-shelf-prev], [data-shelf-next]");
  if (shelfBtn) return scrollShelf(shelfBtn);
  // Close open disclosure menus (families panel) when clicking elsewhere.
  for (const d of document.querySelectorAll("details[data-dismissable][open]")) if (!d.contains(e.target)) d.open = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  for (const d of document.querySelectorAll("details[data-dismissable][open]")) {
    d.open = false;
    d.querySelector("summary").focus();
  }
});

// --- Initial state, after every listener is registered.
// Images may have failed before this module ran (lazy ones not yet requested have no currentSrc).
safely(() => { for (const img of document.images) if (img.complete && img.currentSrc && !img.naturalWidth) useFallback(img); });
safely(onScroll);
safely(() => {
  for (const track of document.querySelectorAll(".shelf-track")) {
    track.addEventListener("scroll", () => updateShelfNav(track), { passive: true });
    updateShelfNav(track);
  }
});
updateCartCount();
