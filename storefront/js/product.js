// Product page: size/price/stock state, quantity stepper, cart buttons, gallery thumbnails,
// share, the "notify me" interest dialog and recently viewed. Entry module, no exports.
import { CART_KEY, readCart, announce } from "./shared/cart-store.js";
import { money, sizeLabel } from "./shared/format.js";
import { normalizePhone, isJordanMobile } from "./shared/phone.js";
import { loadCatalog } from "./shared/catalog-client.js";

const MAX_QTY = 20;
const RECENT_KEY = "nsamat_recent_v1";
const RECENT_MAX = 12;
const PLACEHOLDER = "/assets/img/placeholder-bottle.svg" + new URL(import.meta.url).search;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const root = document.querySelector("[data-product]");
const qty = root?.querySelector("#qty");
const selected = () => root.querySelector("input[name=size]:checked");

function safely(fn) {
  try { fn(); } catch (err) { console.error(err); }
}

// Brief visual confirmation on a button, then back to its label.
function flash(btn, text) {
  const label = btn.querySelector("span") || btn;
  const original = btn.dataset.label ??= label.textContent;
  label.textContent = text;
  btn.classList.add("is-done");
  clearTimeout(btn.flashTimer);
  btn.flashTimer = setTimeout(() => { label.textContent = original; btn.classList.remove("is-done"); }, 1600);
}

// --- Size: price and the out-of-stock note follow the selected size.
function onSize() {
  const r = selected();
  if (!r) return;
  const priceBox = root.querySelector("[data-price]");
  const final = priceBox.querySelector(".price-final");
  if (final) final.textContent = money(r.dataset.final);
  const list = priceBox.querySelector(".price-list bdi");
  if (list) list.textContent = money(r.dataset.list);
  const oos = root.querySelector("[data-oos]");
  if (oos) oos.hidden = r.dataset.stock === "1";
}

function clampQty() {
  const v = Math.min(MAX_QTY, Math.max(1, Math.round(Number(qty.value) || 1)));
  qty.value = v;
  root.querySelector('[data-step="-1"]').disabled = v <= 1;
  root.querySelector('[data-step="1"]').disabled = v >= MAX_QTY;
  return v;
}

// ponytail: until Task 6's cart module takes over [data-pdp-add] / [data-buy-now], the buttons
// write the cart line here and fire cart:change so store.js updates the badge.
function addToCart() {
  const r = selected();
  if (!r) return false;
  const { id, name } = root.dataset;
  const n = clampQty();
  const cart = readCart();
  const line = cart.find((l) => l.id === id && l.size === r.value);
  if (line) line.qty = Math.min(MAX_QTY, (Number(line.qty) || 0) + n);
  else cart.push({ id, size: r.value, qty: n });
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {
    announce("تعذّر حفظ السلة على هذا الجهاز");
    return false;
  }
  dispatchEvent(new Event("cart:change"));
  announce(`أُضيف ${name} بحجم ${sizeLabel(r.value)} إلى السلة`);
  return true;
}

async function share(btn) {
  const { title, url } = btn.dataset;
  if (navigator.share) {
    try { await navigator.share({ title, url }); } catch { /* dismissed */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    flash(btn, "نُسخ الرابط");
    announce("نُسخ رابط العطر");
  } catch {
    announce("تعذّر نسخ الرابط");
  }
}

function initGallery() {
  const track = root.querySelector(".gallery-track");
  const thumbs = [...root.querySelectorAll("[data-thumb]")];
  if (!thumbs.length) return;
  const mark = (i) => thumbs.forEach((b, n) => (n === i ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current")));
  for (const b of thumbs) {
    b.addEventListener("click", () => {
      track.children[b.dataset.thumb].scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "nearest", inline: "start" });
      mark(Number(b.dataset.thumb));
    });
  }
  let ticking = false;
  track.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { mark(Math.round(Math.abs(track.scrollLeft) / track.clientWidth)); ticking = false; });
  }, { passive: true });
}

// --- "أعلمني عند التوفر": native <dialog>, inline errors, success state.
function initInterest() {
  const dialog = document.querySelector("[data-interest-dialog]");
  if (!dialog) return;
  const form = dialog.querySelector("[data-interest-form]");
  const done = dialog.querySelector("[data-interest-done]");
  const formError = form.querySelector("[data-form-error]");
  const submit = form.querySelector("[type=submit]");
  let busy = false;

  const fieldError = (input, message) => {
    const el = document.getElementById(input.getAttribute("aria-describedby"));
    el.textContent = message || "";
    el.hidden = !message;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    return Boolean(message);
  };
  const checks = {
    name: (v) => (v.trim().length >= 2 ? "" : "اكتب اسمك (حرفان على الأقل)"),
    phone: (v) => (isJordanMobile(normalizePhone(v)) ? "" : "رقم الهاتف غير صالح — مثال: 0791234567"),
  };

  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-open-interest]")) return;
    const r = selected();
    form.elements.size.value = r.value;
    form.querySelector("[data-interest-size]").textContent = sizeLabel(r.value);
    form.hidden = false;
    done.hidden = true;
    formError.hidden = true;
    dialog.showModal();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
  });
  for (const name of Object.keys(checks)) {
    const input = form.elements[name];
    input.addEventListener("blur", () => { if (input.value) fieldError(input, checks[name](input.value)); });
    input.addEventListener("input", () => { if (input.hasAttribute("aria-invalid")) fieldError(input, checks[name](input.value)); });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const invalid = Object.keys(checks).map((k) => form.elements[k]).filter((input) => fieldError(input, checks[input.name](input.value)));
    if (invalid.length) return invalid[0].focus();

    busy = true;
    formError.hidden = true;
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = "جارٍ الإرسال…";
    const el = form.elements;
    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: el.product_id.value, size: el.size.value, name: el.name.value.trim(),
          phone: normalizePhone(el.phone.value), note: el.note.value.trim(), website: el.website.value,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "تعذّر إرسال الطلب، حاول مجددًا");
      form.hidden = true;
      done.hidden = false;
      done.querySelector("[tabindex='-1']").focus();
      announce("وصلنا طلبك، سنتواصل معك فور توفر العطر");
    } catch (err) {
      formError.textContent = err instanceof TypeError ? "تعذّر الاتصال — تحقق من الإنترنت وحاول مجددًا" : err.message;
      formError.hidden = false;
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = label;
    }
  });
}

// --- Recently viewed (localStorage ids; cards filled from the public catalogue with textContent).
function readRecent() {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && /^[a-f0-9]{24}$/.test(x)) : [];
  } catch { return []; }
}

async function initRecent() {
  const id = root.dataset.id;
  const others = readRecent().filter((x) => x !== id);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...others].slice(0, RECENT_MAX))); } catch { /* private mode */ }
  if (!others.length) return;
  const byId = new Map((await loadCatalog()).map((p) => [p.id, p]));
  const products = others.map((x) => byId.get(x)).filter(Boolean).slice(0, 8);
  const section = document.querySelector("[data-recent]");
  if (!products.length || !section) return;
  const tpl = section.querySelector("template[data-recent-card]");
  section.querySelector("[data-recent-list]").replaceChildren(...products.map((p) => {
    const li = tpl.content.firstElementChild.cloneNode(true);
    const img = li.querySelector("img");
    img.src = p.thumb || p.image || PLACEHOLDER;
    img.alt = p.name;
    if (!p.image) img.classList.add("is-placeholder");
    const a = li.querySelector(".card-link");
    a.href = `/p/${encodeURIComponent(p.id)}`;
    a.textContent = p.name;
    const from = Math.min(...p.sizes.map((s) => s.final));
    li.querySelector(".price-final").textContent = p.sizes.length ? `${p.sizes.length > 1 ? "من " : ""}${money(from)}` : "";
    return li;
  }));
  section.hidden = false;
}

if (root) {
  root.addEventListener("change", (e) => {
    if (e.target.name === "size") onSize();
    else if (e.target === qty) clampQty();
  });
  root.addEventListener("click", (e) => {
    const step = e.target.closest("[data-step]");
    if (step) {
      qty.value = clampQty() + Number(step.dataset.step);
      return clampQty();
    }
    const add = e.target.closest("[data-pdp-add]");
    if (add) return addToCart() && flash(add, "أُضيف إلى السلة");
    if (e.target.closest("[data-buy-now]")) return addToCart() && location.assign("/checkout");
    const shareBtn = e.target.closest("[data-share]");
    if (shareBtn) share(shareBtn);
  });
  safely(onSize);
  safely(clampQty);
  safely(initGallery);
  safely(initInterest);
  initRecent().catch((err) => console.warn(err));
}
