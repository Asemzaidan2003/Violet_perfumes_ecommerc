// Checkout: summary from the cart, validation that mirrors backend/store/validate.js, remembered
// details, and an idempotent submit (client_key per cart contents, kept across retries).
// Entry module, no exports. Rendering uses <template> + textContent only.
import { readCart, clear, priceCart, shopSettings, announce, MAX_LINES, PRICE_NOTE_KEY } from "./shared/cart-store.js";
import { loadCatalog } from "./shared/catalog-client.js";
import { money, num, sizeLabel } from "./shared/format.js";
import { normalizePhone, isJordanMobile } from "./shared/phone.js";

const DETAILS_KEY = "nsamat_customer_v1";
const CLIENT_KEY = "nsamat_client_key_v1";
const PLACEHOLDER = "/assets/img/placeholder-bottle.svg" + new URL(import.meta.url).search;
const REMEMBERED = ["name", "phone", "city", "address"];

const form = document.querySelector("[data-checkout]");
const $ = (sel) => document.querySelector(sel);
const settings = shopSettings();
const send = form.querySelector("[data-co-send]");
const errorsBox = form.querySelector("[data-co-errors]");
const serverError = form.querySelector("[data-co-error]");
const waLink = form.querySelector("[data-co-wa]");
const GOVERNORATES = [...form.elements.city.options].map((o) => o.value).filter(Boolean);
let priced = null;
let busy = false;
let done = false;

// --- Validation: the same rules and limits as the server (which also strips < and >).
const clean = (v) => String(v ?? "").trim().replace(/[<>]/g, "");
const length = (v, min, max) => clean(v).length >= min && clean(v).length <= max;
const checks = {
  name: (v) => (length(v, 2, 80) ? "" : "اكتب اسمك (حرفان على الأقل)"),
  phone: (v) => (isJordanMobile(normalizePhone(v)) ? "" : "رقم الهاتف غير صالح — مثال: 0791234567"),
  city: (v) => (GOVERNORATES.includes(v) ? "" : "اختر المحافظة"),
  address: (v) => (length(v, 5, 300) ? "" : "اكتب العنوان بالتفصيل: المنطقة والشارع (5 أحرف على الأقل)"),
  notes: (v) => (clean(v).length <= 500 ? "" : "الملاحظات أطول من 500 حرف"),
};
const errorsNow = () => Object.keys(checks).map((k) => [form.elements[k], checks[k](form.elements[k].value)]).filter(([, m]) => m);

function fieldError(input, message) {
  const el = document.getElementById(`${input.id}-err`);
  el.textContent = message;
  el.hidden = !message;
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

function showSummary(errors) {
  errorsBox.hidden = !errors.length;
  form.querySelector("[data-co-error-list]").replaceChildren(...errors.map(([input, message]) => {
    const a = document.createElement("a");
    a.href = `#${input.id}`;
    a.textContent = message;
    a.addEventListener("click", (e) => { e.preventDefault(); input.focus(); });
    const li = document.createElement("li");
    li.append(a);
    return li;
  }));
}

for (const name of Object.keys(checks)) {
  const input = form.elements[name];
  const recheck = () => {
    fieldError(input, checks[name](input.value));
    if (!errorsBox.hidden) showSummary(errorsNow());
  };
  input.addEventListener("blur", () => { if (input.value) recheck(); });
  input.addEventListener(name === "city" ? "change" : "input", () => { if (input.hasAttribute("aria-invalid")) recheck(); });
}

// --- Summary.
function lineNode(r, tpl) {
  const li = tpl.content.firstElementChild.cloneNode(true);
  const img = li.querySelector("img");
  img.src = r.product?.thumb || r.product?.image || PLACEHOLDER;
  if (!r.product?.image) img.classList.add("is-placeholder");
  li.querySelector(".co-name").textContent = r.product?.name ?? "عطر لم يعد متوفرًا";
  li.querySelector(".co-meta").textContent = `${sizeLabel(r.line.size)} × ${num(r.qty)}`;
  const note = li.querySelector(".cl-note");
  note.textContent = !r.product ? "لن يُضاف إلى الطلب" : r.size.in_stock ? "" : "يُحضَّر عند الطلب";
  note.hidden = !note.textContent;
  li.querySelector(".co-line-total").textContent = r.product ? money(r.total) : "";
  return li;
}

async function render() {
  if (done) return;
  const lines = readCart();
  const status = $("[data-co-status]");
  const empty = (on) => { $("[data-co-empty]").hidden = !on; $("[data-co-main]").hidden = on; };
  if (!lines.length) return empty(true);
  empty(false);
  try {
    if (!priced) status.textContent = "جارٍ تحميل الأسعار…";
    priced = priceCart(lines, await loadCatalog(), settings);
  } catch {
    priced = null;
    status.textContent = "تعذّر تحميل الأسعار — تحقق من الاتصال ثم حدّث الصفحة";
    return;
  }
  if (!priced.rows.some((r) => r.product)) return empty(true);
  status.textContent = "";
  const tpl = $("template[data-co-line]");
  $("[data-co-lines]").replaceChildren(...priced.rows.map((r) => lineNode(r, tpl)));
  const count = priced.rows.reduce((n, r) => n + (r.product ? r.qty : 0), 0);
  $("[data-co-count]").textContent = `(${num(count)})`;
  $("[data-co-subtotal]").textContent = money(priced.subtotal);
  $("[data-co-delivery]").textContent = priced.delivery ? money(priced.delivery) : "مجاني";
  for (const el of document.querySelectorAll("[data-co-total], [data-co-total-head], [data-co-total-foot]")) el.textContent = money(priced.total);
  const free = $("[data-co-free]");
  const left = priced.freeOver - priced.subtotal;
  free.hidden = !(priced.freeOver > 0 && priced.fee > 0 && left > 0);
  free.textContent = free.hidden ? "" : `أضف ${money(left)} للحصول على توصيل مجاني`;
}

// --- Submit.
const orderItems = () => (priced?.rows ?? []).filter((r) => r.product).map((r) => ({ product_id: r.line.id, size: r.line.size, quantity: r.qty }));

// RFC 4122 v4; getRandomValues also works where randomUUID doesn't (plain-http LAN previews).
const uuid = () => crypto.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));

// Same cart contents → same key, so a retry after a timeout can never create a second order.
let memoKey = null;
function clientKey(items) {
  const sig = JSON.stringify(items);
  try { memoKey = JSON.parse(sessionStorage.getItem(CLIENT_KEY)) ?? memoKey; } catch { /* storage blocked */ }
  if (memoKey?.sig !== sig) memoKey = { key: uuid(), sig };
  try { sessionStorage.setItem(CLIENT_KEY, JSON.stringify(memoKey)); } catch { /* in-memory only */ }
  return memoKey.key;
}

function setBusy(on, label = "تأكيد الطلب") {
  busy = on;
  send.disabled = on;
  send.setAttribute("aria-busy", String(on));
  send.textContent = on ? "جارٍ إرسال الطلب…" : label;
}

function showServerError(message, whatsapp = false) {
  serverError.textContent = message;
  serverError.hidden = !message;
  waLink.hidden = !(whatsapp && settings.whatsapp);
  if (waLink.hidden) return;
  const el = form.elements;
  const lines = priced.rows.filter((r) => r.product).map((r) => `- ${r.product.name} ${sizeLabel(r.line.size)} × ${r.qty}`);
  const text = ["مرحبًا نسمات، أودّ طلب:", ...lines, `الاسم: ${clean(el.name.value)}`, `المحافظة: ${el.city.value}`, `العنوان: ${clean(el.address.value)}`].join("\n");
  waLink.href = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(text)}`;
}

function rememberDetails() {
  try {
    if (!form.elements.remember.checked) return localStorage.removeItem(DETAILS_KEY);
    localStorage.setItem(DETAILS_KEY, JSON.stringify(Object.fromEntries(REMEMBERED.map((k) => [k, form.elements[k].value.trim()]))));
  } catch { /* private mode */ }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy || done) return;
  showServerError("");
  const errors = errorsNow();
  for (const k of Object.keys(checks)) fieldError(form.elements[k], checks[k](form.elements[k].value));
  showSummary(errors);
  if (errors.length) return errors[0][0].focus();
  if (!priced) {
    showServerError("تعذّر تحميل الأسعار — تحقق من الاتصال ثم حدّث الصفحة");
    return render();
  }
  const items = orderItems();
  if (!items.length) return render();
  if (items.length > MAX_LINES) return showServerError(`الحد ${MAX_LINES} منتجًا في الطلب`);

  setBusy(true);
  const el = form.elements;
  const body = {
    items,
    customer: { name: clean(el.name.value), phone: normalizePhone(el.phone.value), city: el.city.value, address: clean(el.address.value), notes: clean(el.notes.value) },
    client_key: clientKey(items),
    website: el.website.value,
  };
  let res, data;
  try {
    res = await fetch(form.action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    data = await res.json().catch(() => ({}));
  } catch {
    setBusy(false, "أعد المحاولة");
    return showServerError("تعذّر الاتصال — تحقق من الإنترنت ثم اضغط «أعد المحاولة». لن يتكرر طلبك.");
  }
  if (res.ok && data.data?.ref) {
    done = true;
    rememberDetails();
    try { sessionStorage.removeItem(CLIENT_KEY); } catch { /* storage blocked */ }
    // The server prices independently (a listed price may have changed mid-checkout); flag it for
    // the confirmation page when its total doesn't match what was shown here.
    if (Math.abs((Number(data.data.total) || 0) - priced.total) > 0.005) {
      try { sessionStorage.setItem(PRICE_NOTE_KEY, "1"); } catch { /* storage blocked */ }
    }
    clear();
    announce("تم إرسال طلبك");
    return location.assign(`/order/${encodeURIComponent(data.data.ref)}`);
  }
  setBusy(false, res.status >= 500 ? "أعد المحاولة" : "تأكيد الطلب");
  showServerError(res.status === 429 ? "طلبات كثيرة من هذا الجهاز — أرسل طلبك عبر واتساب:" : (data.message || "تعذّر إرسال الطلب، حاول مجددًا"), res.status === 429);
});

// The checkout page can be restored from bfcache after a successful order (browser back from the
// confirmation page); its cart is now empty and `done` is stale, so reload for a clean state.
addEventListener("pageshow", (e) => { if (e.persisted && done) location.reload(); });

// --- Start: remembered details, summary open on desktop, live cart updates.
try {
  const saved = JSON.parse(localStorage.getItem(DETAILS_KEY));
  for (const k of REMEMBERED) if (typeof saved?.[k] === "string" && !form.elements[k].value) form.elements[k].value = saved[k];
} catch { /* nothing remembered */ }
if (matchMedia("(min-width: 900px)").matches) $("[data-co-details]").open = true;
// Unchecking "تذكّر معلوماتي" drops the saved details right away, not only on the next order.
form.elements.remember.addEventListener("change", (e) => {
  if (e.target.checked) return;
  try { localStorage.removeItem(DETAILS_KEY); } catch { /* private mode */ }
});
addEventListener("cart:change", () => render());
addEventListener("storage", () => render());
render();
