// Logic for brands.html: admin CRUD for designer brands (Dior, Chanel, ...).
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

let brands = [];
let editingId = null;

document.getElementById("bf-logo-file").addEventListener("change", async (e) => {
  const [file] = e.target.files;
  if (!file) return;
  const status = document.getElementById("bf-upload-status");
  status.textContent = "جارٍ رفع الصورة…";
  try {
    const saved = await uploadImage(file, { kind: "banner" });
    document.getElementById("bf-logo").value = saved.url;
    const preview = document.getElementById("bf-logo-preview");
    preview.src = saved.url;
    preview.style.display = "block";
    status.textContent = "تم رفع الصورة ✓";
  } catch (err) {
    status.textContent = err.message || "تعذر رفع الصورة";
  }
});

function openModal(b = null) {
  editingId = b?._id ?? null;
  document.getElementById("brandModalTitle").textContent = b ? "تعديل مصمم" : "إضافة مصمم";
  document.getElementById("bf-name-ar").value = b?.name_ar ?? "";
  document.getElementById("bf-name-en").value = b?.name_en ?? "";
  document.getElementById("bf-slug").value = b?.slug ?? "";
  document.getElementById("bf-logo").value = b?.logo ?? "";
  const preview = document.getElementById("bf-logo-preview");
  preview.src = b?.logo ?? "";
  preview.style.display = b?.logo ? "block" : "none";
  document.getElementById("bf-upload-status").textContent = "";
  document.getElementById("bf-active").checked = b ? !!b.active : true;
  document.getElementById("brandError").hidden = true;
  document.getElementById("brandModal").classList.add("open");
  document.getElementById("bf-name-ar").focus();
}
function closeModal() { document.getElementById("brandModal").classList.remove("open"); }
document.getElementById("addBrandBtn").addEventListener("click", () => openModal());
document.getElementById("brandClose").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.getElementById("brandModal").classList.contains("open")) closeModal();
});

document.getElementById("brandForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("brandError");
  errorEl.hidden = true;
  const body = {
    name_ar: document.getElementById("bf-name-ar").value.trim(),
    name_en: document.getElementById("bf-name-en").value.trim(),
    slug: document.getElementById("bf-slug").value.trim(),
    logo: document.getElementById("bf-logo").value.trim(),
    active: document.getElementById("bf-active").checked,
  };
  const saveBtn = document.getElementById("brandSave");
  saveBtn.disabled = true;
  try {
    if (editingId) await api("PUT", `/api/brands/${editingId}`, body);
    else await api("POST", "/api/brands", body);
    closeModal();
    await load();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
});

async function toggleActive(b) {
  try { await api("PUT", `/api/brands/${b._id}`, { active: !b.active }); await load(); }
  catch (err) { alert(err.message); }
}
async function remove(b) {
  if (!confirm(`حذف "${b.name_ar}"؟`)) return;
  try { await api("DELETE", `/api/brands/${b._id}`); await load(); }
  catch (err) { alert(err.message); }
}

function row(b) {
  const thumb = b.logo ? el("img", { className: "row-thumb", src: b.logo, alt: "" }) : el("div", { className: "row-thumb" });
  const toggle = el("input", { type: "checkbox", checked: b.active, ariaLabel: `تفعيل ${b.name_ar}` });
  toggle.addEventListener("change", () => toggleActive(b));
  const editBtn = el("button", { type: "button", className: "btn btn-secondary btn-sm", textContent: "تعديل" });
  editBtn.addEventListener("click", () => openModal(b));
  const delBtn = el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "حذف" });
  delBtn.addEventListener("click", () => remove(b));

  return el("tr", {},
    el("td", {}, thumb),
    el("td", { className: "cell-strong", textContent: b.name_ar }),
    el("td", { textContent: b.name_en }),
    el("td", { className: "num", textContent: String(b.productCount ?? 0) }),
    el("td", {}, toggle),
    el("td", {}, editBtn, delBtn));
}

function render() {
  const tbody = document.getElementById("brandsBody");
  tbody.replaceChildren(...(brands.length ? brands.map(row)
    : [el("tr", {}, el("td", { colSpan: 6 }, el("div", { className: "empty-state", textContent: "لا يوجد مصممون بعد" })))]));
}

async function load() {
  brands = await api("GET", "/api/brands");
  render();
}

load();
