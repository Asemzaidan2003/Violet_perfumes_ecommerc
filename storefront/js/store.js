// Storefront entry module (every page). No inline handlers: everything is delegated from here.
import { num } from "./shared/format.js";

export const CART_KEY = "nsamat_cart_v1";
const PLACEHOLDER = "/assets/img/placeholder-bottle.svg";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Screen-reader announcements through the layout's live region.
export function announce(message) {
  const el = document.getElementById("live-region");
  if (!el) return;
  el.textContent = "";
  requestAnimationFrame(() => { el.textContent = message; });
}

// --- Image fallback: hotlinked photos can vanish; show the branded bottle instead.
function useFallback(img) {
  if (img.src.endsWith(PLACEHOLDER)) return;
  img.removeAttribute("srcset");
  img.src = PLACEHOLDER;
  img.classList.add("is-placeholder");
}
document.addEventListener("error", (e) => { if (e.target instanceof HTMLImageElement) useFallback(e.target); }, true);
// Images may have failed before this module ran (lazy ones not yet requested have no currentSrc).
for (const img of document.images) if (img.complete && img.currentSrc && !img.naturalWidth) useFallback(img);

// --- Header compaction on scroll.
const header = document.querySelector("[data-header]");
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    header?.classList.toggle("is-compact", scrollY > 16);
    ticking = false;
  });
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();

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
for (const track of document.querySelectorAll(".shelf-track")) {
  track.addEventListener("scroll", () => updateShelfNav(track), { passive: true });
  updateShelfNav(track);
}
addEventListener("resize", () => document.querySelectorAll(".shelf-track").forEach(updateShelfNav));

function scrollShelf(btn) {
  const track = btn.closest(".shelf").querySelector(".shelf-track");
  const forward = btn.hasAttribute("data-shelf-next") ? 1 : -1;
  const rtl = getComputedStyle(track).direction === "rtl";
  const step = track.clientWidth * 0.85 * forward * (rtl ? -1 : 1);
  track.scrollBy({ left: step, behavior: reducedMotion.matches ? "auto" : "smooth" });
}

// --- Cart count badge (the cart itself lives in localStorage; the drawer arrives with cart.js).
export function readCart() {
  try {
    const lines = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(lines) ? lines : [];
  } catch { return []; }
}
function updateCartCount() {
  const n = readCart().reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
  for (const el of document.querySelectorAll("[data-cart-count]")) {
    el.textContent = num(n);
    el.hidden = n === 0;
  }
}
addEventListener("storage", (e) => { if (e.key === CART_KEY) updateCartCount(); });
addEventListener("cart:change", updateCartCount);
updateCartCount();

// ponytail: minimal quick-add until cart.js (Task 6) takes over the cart and its drawer.
function quickAdd(btn) {
  const { id, size, name } = btn.dataset;
  const cart = readCart();
  const line = cart.find((l) => l.id === id && l.size === size);
  if (line) line.qty = Math.min(20, (Number(line.qty) || 0) + 1);
  else cart.push({ id, size, qty: 1 });
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { return announce("تعذّر حفظ السلة على هذا الجهاز"); }
  dispatchEvent(new Event("cart:change"));
  announce(`أُضيف ${name} إلى السلة`);
  btn.classList.add("is-added");
  setTimeout(() => btn.classList.remove("is-added"), 1200);
}

document.addEventListener("click", (e) => {
  const shelfBtn = e.target.closest("[data-shelf-prev], [data-shelf-next]");
  if (shelfBtn) return scrollShelf(shelfBtn);
  const addBtn = e.target.closest("[data-add-to-cart]");
  if (addBtn && !e.defaultPrevented) return quickAdd(addBtn);
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
