// Cart storage, pricing and screen-reader announcements shared by the storefront scripts.
// No side effects on import: import it (unversioned, "./shared/cart-store.js") from any entry module
// and every importer gets the same instance. Never import store.js — it is an entry file.
export const CART_KEY = "nsamat_cart_v1";
export const MAX_QTY = 20;
// Mirrors the server's MAX_ITEMS (backend/store/validate.js): the most distinct product/size
// lines one order can hold. Enforced here too so the client never lets a customer build a cart
// the server will then reject at checkout.
export const MAX_LINES = 20;
export const PRICE_NOTE_KEY = "nsamat_price_note_v1";

const clampQty = (n) => Math.min(MAX_QTY, Math.max(1, Math.round(Number(n) || 1)));

// [{ id, size, qty }]; anything malformed (bad JSON, non-array, non-object lines, or a line whose
// id/size aren't strings) is dropped.
export function readCart() {
  try {
    const lines = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(lines)
      ? lines.filter((l) => l && typeof l === "object" && typeof l.id === "string" && typeof l.size === "string")
      : [];
  } catch { return []; }
}

export const cartCount = (lines = readCart()) => lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);

// Saves and fires `cart:change` (store.js updates the badge, cart.js/checkout.js re-render).
// false when storage is unavailable (private mode, quota).
function writeCart(lines) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch {
    announce("تعذّر حفظ السلة على هذا الجهاز");
    return false;
  }
  dispatchEvent(new Event("cart:change"));
  return true;
}

const same = (id, size) => (l) => l.id === id && l.size === size;

// Refuses a new distinct line once the cart already holds MAX_LINES of them (an existing line can
// still have its quantity topped up). Announces the reason itself, so every caller — the card
// quick-add, the product page's add and buy-now — gets the message for free.
export function add(id, size, qty = 1) {
  const cart = readCart();
  const line = cart.find(same(id, size));
  if (line) line.qty = clampQty((Number(line.qty) || 0) + qty);
  else if (cart.length < MAX_LINES) cart.push({ id, size, qty: clampQty(qty) });
  else {
    announce(`الحد ${MAX_LINES} منتجًا في الطلب`);
    return false;
  }
  return writeCart(cart);
}

export function setQty(id, size, qty) {
  const cart = readCart();
  const line = cart.find(same(id, size));
  if (line) line.qty = clampQty(qty);
  return writeCart(cart);
}

export const remove = (id, size) => writeCart(readCart().filter((l) => !same(id, size)(l)));
export const clear = () => writeCart([]);

// Shop settings the layout embeds as JSON: { delivery_fee, free_delivery_over, whatsapp }.
export function shopSettings() {
  try { return JSON.parse(document.getElementById("shop-settings").textContent); } catch { return {}; }
}

// Prices cart lines against the public catalogue. Lines whose product or size vanished come back
// with `product: null` and are left out of the subtotal. Free delivery uses the server's rule
// (subtotal ≥ free_over > 0), so the drawer, the checkout and the order agree. `discount` is
// display-only (the server re-validates and claims the code at order time): it reduces the total
// but never the pre-discount subtotal the free-delivery threshold is judged against.
export function priceCart(lines, catalog, settings = {}, { discount = 0 } = {}) {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const rows = lines.map((line) => {
    const product = byId.get(line.id);
    const size = product?.sizes.find((s) => s.size === line.size);
    const qty = clampQty(line.qty);
    return size ? { line, product, size, qty, total: size.final * qty } : { line, product: null, qty };
  });
  const subtotal = Math.round(rows.reduce((sum, r) => sum + (r.total || 0), 0) * 100) / 100;
  const fee = Number(settings.delivery_fee) || 0;
  const freeOver = Number(settings.free_delivery_over) || 0;
  const delivery = freeOver > 0 && subtotal >= freeOver ? 0 : fee;
  const disc = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = Math.round((subtotal - disc + delivery) * 100) / 100;
  return { rows, subtotal, delivery, total, freeOver, fee, discount: disc };
}

// Announce through the layout's #live-region (role="status").
export function announce(message) {
  const el = document.getElementById("live-region");
  if (!el) return;
  el.textContent = "";
  requestAnimationFrame(() => { el.textContent = message; });
}
