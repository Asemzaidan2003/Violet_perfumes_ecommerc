// Cart storage and screen-reader announcements shared by the storefront scripts.
// No side effects on import: import it (unversioned, "./shared/cart-store.js") from any entry module
// and every importer gets the same instance. Never import store.js — it is an entry file.
export const CART_KEY = "nsamat_cart_v1";

// [{ id, size, qty }]; anything malformed (bad JSON, non-array, non-object lines) is dropped.
export function readCart() {
  try {
    const lines = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(lines) ? lines.filter((l) => l && typeof l === "object") : [];
  } catch { return []; }
}

export const cartCount = (lines = readCart()) => lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);

// Announce through the layout's #live-region (role="status").
export function announce(message) {
  const el = document.getElementById("live-region");
  if (!el) return;
  el.textContent = "";
  requestAnimationFrame(() => { el.textContent = message; });
}
