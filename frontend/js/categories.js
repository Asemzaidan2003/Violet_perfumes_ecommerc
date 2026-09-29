// Logic for categories.html: admin CRUD for storefront categories (الأقسام).
import { uploadImage } from "/admin/js/upload.js";

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
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

let categories = [];
let editingId = null;

document.getElementById("cf-image-file").addEventListener("change", async (e) => {
  const [file] = e.target.files;
  if (!file) return;
  const status = document.getElementById("cf-upload-status");
  status.textContent = "جارٍ رفع الصورة…";
  try {
    const saved = await uploadImage(file, { kind: "banner" });
    document.getElementById("cf-image").value = saved.url;
    const preview = document.getElementById("cf-image-preview");
    preview.src = saved.url;
    preview.style.display = "block";
    status.textContent = "تم رفع الصورة ✓";
  } catch (err) {
    status.textContent = err.message || "تعذر رفع الصورة";
  }
});

function openModal(c = null) {
  editingId = c?._id ?? null;
  document.getElementById("categoryModalTitle").textContent = c ? "تعديل قسم" : "إضافة قسم";
  const keyInput = document.getElementById("cf-key");
  keyInput.value = c?.key ?? "";
  keyInput.disabled = Boolean(c); // immutable after creation
  document.getElementById("cf-slug").value = c?.slug ?? "";
  document.getElementById("cf-name-ar").value = c?.name_ar ?? "";
  document.getElementById("cf-name-en").value = c?.name_en ?? "";
  document.getElementById("cf-icon").value = c?.icon ?? "";
  document.getElementById("cf-image").value = c?.image ?? "";
  const preview = document.getElementById("cf-image-preview");
  preview.src = c?.image ?? "";
  preview.style.display = c?.image ? "block" : "none";
  document.getElementById("cf-upload-status").textContent = "";
  document.getElementById("cf-visible").checked = c ? Boolean(c.visible) : true;
  document.getElementById("categoryError").hidden = true;
  document.getElementById("categoryModal").classList.add("open");
  (c ? document.getElementById("cf-slug") : keyInput).focus();
}
function closeModal() { document.getElementById("categoryModal").classList.remove("open"); }
document.getElementById("addCategoryBtn").addEventListener("click", () => openModal());
document.getElementById("categoryClose").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.getElementById("categoryModal").classList.contains("open")) closeModal();
});

document.getElementById("categoryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("categoryError");
  errorEl.hidden = true;
  const body = {
    slug: document.getElementById("cf-slug").value.trim(),
    name_ar: document.getElementById("cf-name-ar").value.trim(),
    name_en: document.getElementById("cf-name-en").value.trim(),
    icon: document.getElementById("cf-icon").value || undefined,
    image: document.getElementById("cf-image").value.trim(),
    visible: document.getElementById("cf-visible").checked,
  };
  if (!editingId) body.key = document.getElementById("cf-key").value.trim();
  const saveBtn = document.getElementById("categorySave");
  saveBtn.disabled = true;
  try {
    if (editingId) await api("PUT", `/api/categories/${editingId}`, body);
    else await api("POST", "/api/categories", body);
    closeModal();
    await load();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
});

async function toggleVisible(c) {
  try { await api("PUT", `/api/categories/${c._id}`, { visible: !c.visible }); await load(); }
  catch (err) { alert(err.message); }
}
async function remove(c) {
  if (!confirm(`حذف "${c.name_ar}"؟`)) return;
  try { await api("DELETE", `/api/categories/${c._id}`); await load(); }
  catch (err) { alert(err.message); }
}
// Same renumber approach as promotions.js/pages.js: swap locally, then write 0..n-1 sort values.
async function move(index, dir) {
  const j = index + dir;
  if (j < 0 || j >= categories.length) return;
  const reordered = categories.slice();
  [reordered[index], reordered[j]] = [reordered[j], reordered[index]];
  try {
    for (const [i, c] of reordered.entries()) {
      if (c.sort !== i) await api("PUT", `/api/categories/${c._id}`, { sort: i });
    }
    await load();
  } catch (err) { alert(err.message); }
}

function row(c, index) {
  const toggle = el("input", { type: "checkbox", checked: c.visible, ariaLabel: `إظهار ${c.name_ar}` });
  toggle.addEventListener("change", () => toggleVisible(c));
  const upBtn = el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "▲", disabled: index === 0 });
  upBtn.addEventListener("click", () => move(index, -1));
  const downBtn = el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "▼", disabled: index === categories.length - 1 });
  downBtn.addEventListener("click", () => move(index, 1));
  const viewBtn = el("a", { className: "btn btn-secondary btn-sm", textContent: "عرض", href: `/c/${c.slug}`, target: "_blank", rel: "noopener" });
  const editBtn = el("button", { type: "button", className: "btn btn-secondary btn-sm", textContent: "تعديل" });
  editBtn.addEventListener("click", () => openModal(c));
  const delBtn = el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "حذف" });
  delBtn.addEventListener("click", () => remove(c));

  return el("tr", {},
    el("td", { className: "cell-strong", textContent: c.name_ar }),
    el("td", { textContent: `/c/${c.slug}` }),
    el("td", { className: "num", textContent: String(c.productCount ?? 0) }),
    el("td", {}, upBtn, downBtn),
    el("td", {}, toggle),
    el("td", {}, viewBtn, editBtn, delBtn));
}

function render() {
  const tbody = document.getElementById("categoriesBody");
  tbody.replaceChildren(...(categories.length ? categories.map(row)
    : [el("tr", {}, el("td", { colSpan: 6 }, el("div", { className: "empty-state", textContent: "لا توجد أقسام بعد" })))]));
}

async function load() {
  categories = await api("GET", "/api/categories");
  render();
}

load();
