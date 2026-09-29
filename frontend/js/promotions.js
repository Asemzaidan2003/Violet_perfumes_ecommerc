// Logic for promotions.html: admin CRUD for placements (ads) and discount codes.
import { FAMILIES } from "/assets/js/shared/vocab.js";
import { uploadImage } from "/admin/js/upload.js";

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const opt = (value, text) => el("option", { value, textContent: text });

// Slot order/labels and which slots need an image — mirrors backend/models/placement.model.js.
const SLOTS = [
  { key: "announcement", label: "الشريط الإعلاني", image: false },
  { key: "hero", label: "الشريحة الرئيسية", image: true },
  { key: "home_mid", label: "منتصف الصفحة الرئيسية", image: true },
  { key: "home_bottom", label: "أسفل الصفحة الرئيسية", image: true },
  { key: "collection_banner", label: "بانر صفحة التصنيف", image: true },
  { key: "grid_tile", label: "بطاقة ضمن شبكة المنتجات", image: true },
  { key: "product_promo", label: "شريط صفحة المنتج", image: false },
  { key: "cart_upsell", label: "بطاقة سلة التسوق", image: false },
];
const IMAGE_SLOTS = new Set(SLOTS.filter((s) => s.image).map((s) => s.key));
const TARGET_SLOTS = new Set(["collection_banner", "grid_tile"]);
const THEMES = [{ key: "dark", label: "داكن" }, { key: "light", label: "فاتح" }, { key: "gold", label: "ذهبي" }];

const fmtAmman = (d) => d
  ? new Intl.DateTimeFormat("ar-JO-u-nu-latn", { timeZone: "Asia/Amman", dateStyle: "medium", timeStyle: "short" }).format(new Date(d))
  : "";
// datetime-local <-> ISO, in the browser's own local time (same convention as add_product.html).
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toISO = (local) => (local ? new Date(local).toISOString() : null);
const scheduleText = (starts_at, ends_at) => ([starts_at, ends_at].some(Boolean)
  ? `${fmtAmman(starts_at) || "—"} → ${fmtAmman(ends_at) || "—"}` : "بلا جدولة");

function liveStatus(p) {
  const now = new Date();
  if (!p.active) return { label: "متوقف", cls: "badge-discontinued" };
  if (p.starts_at && new Date(p.starts_at) > now) return { label: "مجدول", cls: "badge-pending" };
  if (p.ends_at && now >= new Date(p.ends_at)) return { label: "منتهي", cls: "badge-out" };
  return { label: "مباشر", cls: "badge-available" };
}
const viewLink = (p) => {
  if (p.slot === "product_promo") return "/offers"; // no single product to link to
  if (TARGET_SLOTS.has(p.slot)) {
    if (p.target?.category) return `/c/${p.target.category}`;
    if (p.target?.family) return `/family/${p.target.family}`;
    return "/c/men";
  }
  return "/";
};

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "حدث خطأ غير متوقع");
  return data.data;
}

// ---------------------------------------------------------------- Tabs
const tabButtons = [...document.querySelectorAll(".tab-btn")];
function activateTab(tab) {
  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
    btn.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
}
tabButtons.forEach((btn, i) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  btn.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabButtons.length - 1
      : e.key === "ArrowLeft" ? (i + 1) % tabButtons.length : (i - 1 + tabButtons.length) % tabButtons.length;
    tabButtons[next].focus();
    activateTab(tabButtons[next].dataset.tab);
  });
});

// ---------------------------------------------------------------- Placements
const pfSlot = document.getElementById("pf-slot");
const pfTheme = document.getElementById("pf-theme");
const pfCategory = document.getElementById("pf-target-category");
const pfFamily = document.getElementById("pf-target-family");
SLOTS.forEach((s) => pfSlot.append(opt(s.key, s.label)));
THEMES.forEach((t) => pfTheme.append(opt(t.key, t.label)));
pfCategory.append(opt("", "— الكل —"));
fetch("/api/categories").then((r) => r.json()).then(({ data }) => {
  pfCategory.append(...(data || []).map((c) => opt(c.slug, c.name_ar)));
}).catch((err) => console.error(err));
pfFamily.append(opt("", "— الكل —"), ...FAMILIES.map((f) => opt(f.key, f.ar)));

function syncPlacementFormToSlot() {
  const slot = pfSlot.value;
  document.getElementById("pf-target-wrap").hidden = !TARGET_SLOTS.has(slot);
  document.getElementById("pf-image-hint").hidden = !IMAGE_SLOTS.has(slot);
}
pfSlot.addEventListener("change", syncPlacementFormToSlot);

document.getElementById("pf-image-file").addEventListener("change", async (e) => {
  const [file] = e.target.files;
  if (!file) return;
  const status = document.getElementById("pf-upload-status");
  status.textContent = "جارٍ رفع الصورة…";
  try {
    const saved = await uploadImage(file, { kind: "banner" });
    document.getElementById("pf-image").value = saved.url;
    status.textContent = "تم رفع الصورة ✓";
  } catch (err) {
    status.textContent = err.message || "تعذر رفع الصورة";
  }
});

let placements = [];
let editingPlacementId = null;

function openPlacementModal(p = null) {
  editingPlacementId = p?._id ?? null;
  document.getElementById("placementModalTitle").textContent = p ? "تعديل موضع" : "إضافة موضع";
  pfSlot.value = p?.slot ?? SLOTS[0].key;
  document.getElementById("pf-title").value = p?.title ?? "";
  document.getElementById("pf-subtitle").value = p?.subtitle ?? "";
  document.getElementById("pf-image").value = p?.image ?? "";
  document.getElementById("pf-link").value = p?.link ?? "";
  document.getElementById("pf-cta").value = p?.cta ?? "";
  pfTheme.value = p?.theme ?? "dark";
  pfCategory.value = p?.target?.category ?? "";
  pfFamily.value = p?.target?.family ?? "";
  document.getElementById("pf-starts").value = toLocalInput(p?.starts_at);
  document.getElementById("pf-ends").value = toLocalInput(p?.ends_at);
  document.getElementById("pf-sort").value = p?.sort ?? 0;
  document.getElementById("pf-active").checked = p ? !!p.active : true;
  document.getElementById("pf-upload-status").textContent = "";
  document.getElementById("placementError").hidden = true;
  syncPlacementFormToSlot();
  document.getElementById("placementModal").classList.add("open");
  document.getElementById("pf-title").focus();
}
function closePlacementModal() {
  document.getElementById("placementModal").classList.remove("open");
}
document.getElementById("addPlacementBtn").addEventListener("click", () => openPlacementModal());
document.getElementById("placementClose").addEventListener("click", closePlacementModal);

// Esc closes whichever modal is open.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (document.getElementById("placementModal").classList.contains("open")) closePlacementModal();
  if (document.getElementById("couponModal").classList.contains("open")) closeCouponModal();
});

document.getElementById("placementForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("placementError");
  errorEl.hidden = true;
  const body = {
    slot: pfSlot.value,
    title: document.getElementById("pf-title").value.trim(),
    subtitle: document.getElementById("pf-subtitle").value.trim(),
    image: document.getElementById("pf-image").value.trim(),
    link: document.getElementById("pf-link").value.trim(),
    cta: document.getElementById("pf-cta").value.trim(),
    theme: pfTheme.value,
    target: TARGET_SLOTS.has(pfSlot.value)
      ? { category: pfCategory.value || undefined, family: pfFamily.value || undefined } : undefined,
    starts_at: toISO(document.getElementById("pf-starts").value),
    ends_at: toISO(document.getElementById("pf-ends").value),
    sort: Number(document.getElementById("pf-sort").value) || 0,
    active: document.getElementById("pf-active").checked,
  };
  const saveBtn = document.getElementById("placementSave");
  saveBtn.disabled = true;
  try {
    if (editingPlacementId) await api("PUT", `/api/placements/${editingPlacementId}`, body);
    else await api("POST", "/api/placements", body);
    closePlacementModal();
    await loadPlacements();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
});

async function togglePlacementActive(p) {
  try { await api("PUT", `/api/placements/${p._id}`, { active: !p.active }); await loadPlacements(); }
  catch (err) { alert(err.message); }
}
// Swaps locally, then renumbers the whole group to its new positions (0, 1, 2, …): swapping raw
// sort values is a no-op when two items tie (the common case, since the form defaults sort to 0).
async function movePlacement(group, index, dir) {
  const j = index + dir;
  if (j < 0 || j >= group.length) return;
  const reordered = group.slice();
  [reordered[index], reordered[j]] = [reordered[j], reordered[index]];
  try {
    // Sequential, not Promise.all: only ever a couple of requests, and it keeps the writes simple.
    for (const [i, p] of reordered.entries()) {
      if (p.sort !== i) await api("PUT", `/api/placements/${p._id}`, { sort: i });
    }
    await loadPlacements();
  } catch (err) { alert(err.message); }
}
async function deletePlacement(p) {
  if (!confirm(`حذف "${p.title}"؟`)) return;
  try { await api("DELETE", `/api/placements/${p._id}`); await loadPlacements(); }
  catch (err) { alert(err.message); }
}

function placementRow(p, group, index) {
  const status = liveStatus(p);
  const thumb = p.image
    ? el("img", { className: "row-thumb", src: p.image, alt: "" })
    : el("div", { className: "row-thumb" });

  const toggle = el("input", { type: "checkbox", className: "pf-active-toggle", checked: p.active });
  toggle.addEventListener("change", () => togglePlacementActive(p));

  const upBtn = el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "↑", ariaLabel: `رفع ${p.title}` });
  upBtn.disabled = index === 0;
  upBtn.addEventListener("click", () => movePlacement(group, index, -1));
  const downBtn = el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "↓", ariaLabel: `خفض ${p.title}` });
  downBtn.disabled = index === group.length - 1;
  downBtn.addEventListener("click", () => movePlacement(group, index, 1));

  const editBtn = el("button", { type: "button", className: "btn btn-secondary btn-sm", textContent: "تعديل" });
  editBtn.addEventListener("click", () => openPlacementModal(p));
  const delBtn = el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "حذف" });
  delBtn.addEventListener("click", () => deletePlacement(p));

  return el("div", { className: "promo-row" },
    thumb,
    el("div", { className: "promo-row-info" },
      el("div", { className: "promo-title", textContent: p.title }),
      el("div", { className: "promo-meta" },
        el("span", { className: `badge ${status.cls}`, textContent: status.label }),
        ` ${scheduleText(p.starts_at, p.ends_at)}`)),
    el("div", { className: "promo-actions" },
      el("label", { className: "promo-active-label" }, toggle, "نشط"),
      upBtn, downBtn, editBtn, delBtn,
      el("a", { className: "btn btn-ghost btn-sm", href: viewLink(p), target: "_blank", rel: "noopener", textContent: "عرض في المتجر" })));
}

function renderPlacements() {
  const root = document.getElementById("placementGroups");
  root.replaceChildren();
  const bySlot = new Map(SLOTS.map((s) => [s.key, []]));
  for (const p of placements) bySlot.get(p.slot)?.push(p);
  let any = false;
  for (const s of SLOTS) {
    const group = (bySlot.get(s.key) || []).slice().sort((a, b) => (a.sort - b.sort) || (new Date(a.createdAt) - new Date(b.createdAt)));
    if (!group.length) continue;
    any = true;
    root.append(el("div", { className: "promo-group" },
      el("h3", { textContent: s.label }),
      ...group.map((p, i) => placementRow(p, group, i))));
  }
  if (!any) root.append(el("div", { className: "empty-state" }, el("div", { className: "title", textContent: "لا توجد مواضع بعد" })));
}

async function loadPlacements() {
  placements = await api("GET", "/api/placements");
  renderPlacements();
}

// ---------------------------------------------------------------- Coupons
let coupons = [];
let editingCouponId = null;

document.getElementById("cf-code").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase();
});

function openCouponModal(c = null) {
  editingCouponId = c?._id ?? null;
  document.getElementById("couponModalTitle").textContent = c ? "تعديل كود" : "إضافة كود خصم";
  const codeInput = document.getElementById("cf-code");
  codeInput.value = c?.code ?? "";
  codeInput.disabled = !!c; // code can't change after creation
  document.getElementById("cf-type").value = c?.type ?? "percent";
  document.getElementById("cf-value").value = c?.value ?? "";
  document.getElementById("cf-min").value = c?.min_subtotal ?? 0;
  document.getElementById("cf-starts").value = toLocalInput(c?.starts_at);
  document.getElementById("cf-ends").value = toLocalInput(c?.ends_at);
  document.getElementById("cf-max").value = c?.max_uses ?? 0;
  document.getElementById("cf-active").checked = c ? !!c.active : true;
  document.getElementById("couponError").hidden = true;
  document.getElementById("couponModal").classList.add("open");
  (codeInput.disabled ? document.getElementById("cf-value") : codeInput).focus();
}
function closeCouponModal() { document.getElementById("couponModal").classList.remove("open"); }
document.getElementById("addCouponBtn").addEventListener("click", () => openCouponModal());
document.getElementById("couponClose").addEventListener("click", closeCouponModal);

document.getElementById("couponForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("couponError");
  errorEl.hidden = true;
  const body = {
    code: document.getElementById("cf-code").value.trim(),
    type: document.getElementById("cf-type").value,
    value: Number(document.getElementById("cf-value").value),
    min_subtotal: Number(document.getElementById("cf-min").value) || 0,
    starts_at: toISO(document.getElementById("cf-starts").value),
    ends_at: toISO(document.getElementById("cf-ends").value),
    max_uses: Number(document.getElementById("cf-max").value) || 0,
    active: document.getElementById("cf-active").checked,
  };
  const saveBtn = document.getElementById("couponSave");
  saveBtn.disabled = true;
  try {
    if (editingCouponId) await api("PUT", `/api/coupons/${editingCouponId}`, body);
    else await api("POST", "/api/coupons", body);
    closeCouponModal();
    await loadCoupons();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
});

async function toggleCouponActive(c) {
  try { await api("PUT", `/api/coupons/${c._id}`, { active: !c.active }); await loadCoupons(); }
  catch (err) { alert(err.message); }
}
async function deleteCoupon(c) {
  if (!confirm(`حذف الكود "${c.code}"؟`)) return;
  try { await api("DELETE", `/api/coupons/${c._id}`); await loadCoupons(); }
  catch (err) { alert(err.message); }
}

function couponRow(c) {
  const toggle = el("input", { type: "checkbox", checked: c.active, ariaLabel: `تفعيل الكود ${c.code}` });
  toggle.addEventListener("change", () => toggleCouponActive(c));
  const editBtn = el("button", { type: "button", className: "btn btn-secondary btn-sm", textContent: "تعديل" });
  editBtn.addEventListener("click", () => openCouponModal(c));
  const delBtn = el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "حذف" });
  delBtn.addEventListener("click", () => deleteCoupon(c));
  const valueText = c.type === "percent" ? `نسبة ${c.value}%` : `قيمة ${Number(c.value).toFixed(2)}`;

  return el("tr", {},
    el("td", { className: "cell-strong", textContent: c.code }),
    el("td", { textContent: valueText }),
    el("td", { textContent: scheduleText(c.starts_at, c.ends_at) }),
    el("td", { className: "num", textContent: `${c.used}/${c.max_uses === 0 ? "∞" : c.max_uses}` }),
    el("td", {}, toggle),
    el("td", {}, editBtn, delBtn));
}

function renderCoupons() {
  const tbody = document.getElementById("couponsBody");
  tbody.replaceChildren(...(coupons.length ? coupons.map(couponRow)
    : [el("tr", {}, el("td", { colSpan: 6 }, el("div", { className: "empty-state", textContent: "لا توجد أكواد بعد" })))]));
}

async function loadCoupons() {
  coupons = await api("GET", "/api/coupons");
  renderCoupons();
}

activateTab("placements");
loadPlacements();
loadCoupons();
