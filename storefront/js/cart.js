// Cart drawer (every page) and the card quick-add buttons. Entry module, no exports: the cart
// itself lives in ./shared/cart-store.js. Lines are cloned from the layout's <template> and
// filled with textContent; prices come from the public catalogue, never from localStorage.
import { CART_KEY, readCart, add, setQty, remove, priceCart, shopSettings, announce, MAX_QTY, PRICE_NOTE_KEY } from "./shared/cart-store.js";
import { loadCatalog } from "./shared/catalog-client.js";
import { money, num, sizeLabel } from "./shared/format.js";
import { flyToCart } from "./fx-flight.js";

const PLACEHOLDER = "/assets/img/placeholder-bottle.svg" + new URL(import.meta.url).search;
const drawer = document.getElementById("cart-drawer");
const $ = (sel) => drawer.querySelector(sel);
const settings = shopSettings();

// Note under a line: vanished products can't be ordered; out-of-stock sizes are made to order.
const note = (r) => (!r.product ? "لم يعد متوفرًا — أزِله من السلة" : r.size.in_stock ? "" : "يُحضَّر عند الطلب");

function lineNode(r, tpl) {
  const { id, size } = r.line;
  const li = tpl.content.firstElementChild.cloneNode(true);
  li.dataset.id = id;
  li.dataset.size = size;
  const name = r.product?.name ?? "عطر غير متوفر";
  const href = r.product ? `/p/${encodeURIComponent(id)}` : "";
  const img = li.querySelector("img");
  img.src = r.product?.thumb || r.product?.image || PLACEHOLDER;
  if (!r.product?.image) img.classList.add("is-placeholder");
  for (const a of li.querySelectorAll("a")) if (href) a.href = href; else a.removeAttribute("href");
  li.querySelector(".cl-name").textContent = name;
  li.querySelector(".cl-meta").textContent = r.product ? `${sizeLabel(size)} · ${money(r.size.final)}` : sizeLabel(size);
  const n = li.querySelector(".cl-note");
  n.textContent = note(r);
  n.hidden = !n.textContent;
  li.querySelector(".cl-total").textContent = r.product ? money(r.total) : "";
  li.querySelector(".cl-qty").textContent = num(r.qty);
  li.querySelector(".cl-stepper").setAttribute("aria-label", `كمية ${name}`);
  const [minus, plus] = li.querySelectorAll("[data-cart-step]");
  minus.setAttribute("aria-label", `إنقاص كمية ${name}`);
  plus.setAttribute("aria-label", `زيادة كمية ${name}`);
  minus.disabled = !r.product || r.qty <= 1;
  plus.disabled = !r.product || r.qty >= MAX_QTY;
  li.querySelector("[data-cart-remove]").setAttribute("aria-label", `إزالة ${name} من السلة`);
  if (!r.product) li.classList.add("is-unavailable");
  return li;
}

function freeProgress({ subtotal, freeOver, fee }) {
  const box = $("[data-free]");
  box.hidden = !(freeOver > 0 && fee > 0);
  if (box.hidden) return;
  const left = freeOver - subtotal;
  $("[data-free-text]").textContent = left > 0 ? `باقي ${money(left)} للتوصيل المجاني` : "توصيلك مجاني";
  $("[data-free-bar]").value = Math.min(1, subtotal / freeOver);
  box.classList.toggle("is-free", left <= 0);
}

let renderId = 0;
async function render() {
  const lines = readCart();
  const id = ++renderId;
  $("[data-cart-empty]").hidden = lines.length > 0;
  if (!lines.length) {
    $("[data-cart-heading]").textContent = "";
    $("[data-cart-lines]").replaceChildren();
    $("[data-cart-foot]").hidden = true;
    $("[data-cart-status]").textContent = "";
    return;
  }
  let catalog;
  try {
    if (!$("[data-cart-lines]").children.length) $("[data-cart-status]").textContent = "جارٍ تحميل الأسعار…";
    catalog = await loadCatalog();
  } catch {
    $("[data-cart-status]").textContent = "تعذّر تحميل الأسعار — تحقق من الاتصال وافتح السلة مجددًا";
    return;
  }
  if (id !== renderId) return; // a newer render started while the catalogue loaded
  const priced = priceCart(lines, catalog, settings);
  const tpl = drawer.querySelector("template[data-cart-line]");
  // Keep keyboard focus on the same stepper button across the re-render.
  const focused = document.activeElement?.closest?.(".cart-line [data-cart-step]");
  const keep = focused && { li: focused.closest(".cart-line").dataset, step: focused.dataset.cartStep };
  $("[data-cart-lines]").replaceChildren(...priced.rows.map((r) => lineNode(r, tpl)));
  if (keep) {
    const li = [...drawer.querySelectorAll(".cart-line")].find((x) => x.dataset.id === keep.li.id && x.dataset.size === keep.li.size);
    const btn = li?.querySelector(`[data-cart-step="${keep.step}"]`);
    (btn && !btn.disabled ? btn : li?.querySelector("[data-cart-remove]"))?.focus();
  }
  $("[data-cart-status]").textContent = "";
  const orderableCount = priced.rows.reduce((n, r) => n + (r.product ? r.qty : 0), 0);
  $("[data-cart-heading]").textContent = orderableCount ? `(${num(orderableCount)})` : "";
  $("[data-cart-subtotal]").textContent = money(priced.subtotal);
  $("[data-cart-delivery]").textContent = priced.delivery ? money(priced.delivery) : "مجاني";
  $("[data-cart-total]").textContent = money(priced.total);
  freeProgress(priced);
  const orderable = priced.rows.some((r) => r.product);
  $("[data-cart-foot]").hidden = false;
  const go = $("[data-checkout-link]");
  if (orderable) go.removeAttribute("aria-disabled"); else go.setAttribute("aria-disabled", "true");
}

function open() {
  if (!drawer.open) drawer.showModal();
  render().catch((err) => console.error(err));
}

// Card quick-add: one bottle of the card's size, then the drawer shows it with the checkout button.
function quickAdd(btn) {
  const { id, size, name } = btn.dataset;
  if (!add(id, size, 1)) return;
  announce(`أُضيف ${name} إلى السلة`);
  btn.classList.add("is-added");
  setTimeout(() => btn.classList.remove("is-added"), 1200);
  const img = btn.closest(".card")?.querySelector("[data-vt-img]");
  flyToCart(img).then(open);
}

document.addEventListener("click", (e) => {
  const addBtn = e.target.closest("[data-add-to-cart]");
  if (addBtn) return quickAdd(addBtn);
  if (e.target.closest("[data-open-cart]")) {
    e.preventDefault();
    return open();
  }
});

drawer.addEventListener("click", (e) => {
  if (e.target === drawer || e.target.closest("[data-close-cart]")) return drawer.close();
  const go = e.target.closest("[data-checkout-link]");
  if (go?.getAttribute("aria-disabled")) return e.preventDefault();
  const li = e.target.closest(".cart-line");
  if (!li) return;
  const { id, size } = li.dataset;
  const step = e.target.closest("[data-cart-step]");
  if (step) {
    const line = readCart().find((l) => l.id === id && l.size === size);
    if (line) setQty(id, size, (Number(line.qty) || 1) + Number(step.dataset.cartStep));
    announce(`الكمية ${num(readCart().find((l) => l.id === id && l.size === size)?.qty ?? 0)}`);
    return;
  }
  if (e.target.closest("[data-cart-remove]")) {
    remove(id, size);
    announce("أُزيل العطر من السلة");
    drawer.querySelector("[data-close-cart]").focus(); // the removed button is gone
  }
});

addEventListener("cart:change", () => { if (drawer.open) render(); });
addEventListener("cart:open", open);
addEventListener("storage", (e) => { if (drawer.open && e.key === CART_KEY) render(); });
// Warm the price list before the drawer opens.
document.addEventListener("pointerover", (e) => { if (e.target.closest?.("[data-open-cart]")) loadCatalog().catch(() => {}); });

if (location.pathname === "/cart") open();

// Confirmation page: checkout.js sets this flag when the server's total differed from the one
// shown at checkout (e.g. a price changed mid-checkout). cart.js runs on every page, so it's the
// one place that can read and clear it without a page-specific script.
if (location.pathname.startsWith("/order/")) {
  try {
    if (sessionStorage.getItem(PRICE_NOTE_KEY)) {
      sessionStorage.removeItem(PRICE_NOTE_KEY);
      document.querySelector("[data-price-note]")?.removeAttribute("hidden");
    }
  } catch { /* storage blocked */ }
}
