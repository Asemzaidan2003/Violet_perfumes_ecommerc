// Logic for pages.html: admin CRUD for storefront content pages (terms, privacy, about, ...).
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

const slugify = (s) => String(s ?? "").trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const GROUP_LABEL = { info: "معلومات", help: "مساعدة", none: "بدون" };

let pages = [];
let editingId = null;
let slugTouched = false;
let previewTimer = null;

const titleEl = document.getElementById("pf-title");
const slugEl = document.getElementById("pf-slug");
const bodyEl = document.getElementById("pf-body");
const previewEl = document.getElementById("pf-preview");

titleEl.addEventListener("input", () => {
  if (!slugTouched) slugEl.value = slugify(titleEl.value);
});
slugEl.addEventListener("input", () => { slugTouched = true; });

async function updatePreview() {
  try {
    const { html } = await api("POST", "/api/pages/preview", { body: bodyEl.value });
    previewEl.innerHTML = html;
  } catch {
    // Preview is best-effort; a failed call just leaves the last preview in place.
  }
}
bodyEl.addEventListener("input", () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 300);
});

const TOOLBAR_INSERT = {
  h: { before: "## ", after: "" },
  b: { before: "**", after: "**" },
  list: { before: "- ", after: "" },
  link: { before: "[", after: "](/page/slug)" },
};
document.querySelectorAll("[data-md]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const { before, after } = TOOLBAR_INSERT[btn.dataset.md];
    const [start, end] = [bodyEl.selectionStart, bodyEl.selectionEnd];
    const selected = bodyEl.value.slice(start, end);
    bodyEl.value = bodyEl.value.slice(0, start) + before + selected + after + bodyEl.value.slice(end);
    bodyEl.focus();
    bodyEl.setSelectionRange(start + before.length, start + before.length + selected.length);
    updatePreview();
  });
});

function openModal(p = null) {
  editingId = p?._id ?? null;
  slugTouched = Boolean(p);
  document.getElementById("pageModalTitle").textContent = p ? "تعديل صفحة" : "إضافة صفحة";
  titleEl.value = p?.title ?? "";
  slugEl.value = p?.slug ?? "";
  bodyEl.value = p?.body ?? "";
  document.getElementById("pf-meta").value = p?.meta_description ?? "";
  document.getElementById("pf-group").value = p?.footer_group ?? "info";
  document.getElementById("pf-published").checked = p ? Boolean(p.published) : true;
  document.getElementById("pageError").hidden = true;
  updatePreview();
  document.getElementById("pageModal").classList.add("open");
  titleEl.focus();
}
function closeModal() { document.getElementById("pageModal").classList.remove("open"); }
document.getElementById("addPageBtn").addEventListener("click", () => openModal());
document.getElementById("pageClose").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.getElementById("pageModal").classList.contains("open")) closeModal();
});

document.getElementById("pageForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("pageError");
  errorEl.hidden = true;
  const body = {
    title: titleEl.value.trim(),
    slug: slugEl.value.trim(),
    body: bodyEl.value,
    meta_description: document.getElementById("pf-meta").value.trim(),
    footer_group: document.getElementById("pf-group").value,
    published: document.getElementById("pf-published").checked,
  };
  const saveBtn = document.getElementById("pageSave");
  saveBtn.disabled = true;
  try {
    if (editingId) await api("PUT", `/api/pages/${editingId}`, body);
    else await api("POST", "/api/pages", body);
    closeModal();
    await load();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
});

async function togglePublished(p) {
  try { await api("PUT", `/api/pages/${p._id}`, { published: !p.published }); await load(); }
  catch (err) { alert(err.message); }
}
async function remove(p) {
  if (!confirm(`حذف "${p.title}"؟`)) return;
  try { await api("DELETE", `/api/pages/${p._id}`); await load(); }
  catch (err) { alert(err.message); }
}
// Same renumber-the-group approach as promotions.js: swap locally, then write 0..n-1 sort values.
async function move(group, index, dir) {
  const j = index + dir;
  if (j < 0 || j >= group.length) return;
  const reordered = group.slice();
  [reordered[index], reordered[j]] = [reordered[j], reordered[index]];
  try {
    for (const [i, p] of reordered.entries()) {
      if (p.sort !== i) await api("PUT", `/api/pages/${p._id}`, { sort: i });
    }
    await load();
  } catch (err) { alert(err.message); }
}

function row(p, group, index) {
  const toggle = el("input", { type: "checkbox", checked: p.published, ariaLabel: `نشر ${p.title}` });
  toggle.addEventListener("change", () => togglePublished(p));
  const upBtn = el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "▲", disabled: index === 0 });
  upBtn.addEventListener("click", () => move(group, index, -1));
  const downBtn = el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "▼", disabled: index === group.length - 1 });
  downBtn.addEventListener("click", () => move(group, index, 1));
  const viewBtn = el("a", { className: "btn btn-secondary btn-sm", textContent: "عرض", href: `/page/${p.slug}`, target: "_blank", rel: "noopener" });
  const editBtn = el("button", { type: "button", className: "btn btn-secondary btn-sm", textContent: "تعديل" });
  editBtn.addEventListener("click", () => openModal(p));
  const delBtn = el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "حذف" });
  delBtn.addEventListener("click", () => remove(p));

  return el("tr", {},
    el("td", { className: "cell-strong", textContent: p.title }),
    el("td", { textContent: `/page/${p.slug}` }),
    el("td", { textContent: GROUP_LABEL[p.footer_group] ?? p.footer_group }),
    el("td", {}, upBtn, downBtn),
    el("td", {}, toggle),
    el("td", {}, viewBtn, editBtn, delBtn));
}

function render() {
  const tbody = document.getElementById("pagesBody");
  if (!pages.length) {
    tbody.replaceChildren(el("tr", {}, el("td", { colSpan: 6 }, el("div", { className: "empty-state", textContent: "لا توجد صفحات بعد" }))));
    return;
  }
  const byGroup = new Map();
  for (const p of pages) {
    if (!byGroup.has(p.footer_group)) byGroup.set(p.footer_group, []);
    byGroup.get(p.footer_group).push(p);
  }
  const rows = [];
  for (const group of byGroup.values()) group.forEach((p, i) => rows.push(row(p, group, i)));
  tbody.replaceChildren(...rows);
}

async function load() {
  pages = await api("GET", "/api/pages");
  render();
}

load();
