// Extra catalogue fields shared by add_product.html and edit_product.html.
// Classic script (the product pages' inline scripts are classic too), but uses
// dynamic import() to load the ES modules it depends on.
// Usage: const pf = await window.productFields.ready; pf.fill(product); const extras = pf.read();
const productFieldsReady = Promise.all([
  import("/assets/js/shared/vocab.js"),
  import("/admin/js/upload.js"),
  fetch("/api/categories").then((r) => r.json()).then((j) => (j.data ?? []).map((c) => ({ key: c.key, ar: c.name_ar }))),
]).then(([vocab, upload, categories]) => buildProductFields({ ...vocab, CATEGORIES: categories }, upload));

// Surface a load failure (e.g. a network hiccup on the dynamic import) in the page
// itself instead of leaving #productExtras blank forever. This runs on a separate
// branch off the promise, so `ready` below keeps rejecting — every `await
// window.productFields.ready` still hits its own catch; the error isn't swallowed.
productFieldsReady.catch((err) => {
  console.error(err);
  const root = document.getElementById("productExtras");
  if (root) root.textContent = "تعذر تحميل حقول المنتج — أعد تحميل الصفحة";
});

window.productFields = { ready: productFieldsReady };

function buildProductFields({ CATEGORIES, FAMILIES }, { uploadImage }) {
  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };
  const images = []; // extra gallery images (URLs)

  // Category <select> already exists in the page markup; fill its options.
  const categorySelect = document.getElementById("p_category");
  categorySelect.replaceChildren(el("option", { value: "", textContent: "— اختر الفئة —" }),
    ...CATEGORIES.map((c) => el("option", { value: c.key, textContent: c.ar })));

  const root = document.getElementById("productExtras");

  // Primary image upload (fills the page's existing #p_image URL input + #imagePreview).
  const status = el("p", { className: "upload-status", role: "status" });
  const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", id: "p_image_file" });
  const drop = el("label", { className: "drop-zone", htmlFor: "p_image_file", textContent: "اسحب صورة المنتج هنا أو اضغط للاختيار" });
  const setPrimary = (url) => {
    document.getElementById("p_image").value = url;
    const preview = document.getElementById("imagePreview");
    preview.src = url;
    preview.style.display = "block";
  };
  async function handleFiles(files, onDone) {
    for (const file of files) {
      status.textContent = "جارٍ رفع الصورة…";
      try { onDone(await uploadImage(file)); status.textContent = "تم رفع الصورة ✓"; }
      catch (err) { status.textContent = err.message; }
    }
  }
  fileInput.addEventListener("change", () => handleFiles(fileInput.files, (saved) => setPrimary(saved.url)));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); drop.classList.remove("is-over");
    handleFiles(e.dataTransfer.files, (saved) => setPrimary(saved.url));
  });

  // Gallery.
  const galleryList = el("ul", { className: "gallery-list" });
  const galleryInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, id: "gallery_file" });
  function renderGallery() {
    galleryList.replaceChildren(...images.map((url, i) => {
      const move = (d) => () => { const j = i + d; if (j < 0 || j >= images.length) return; [images[i], images[j]] = [images[j], images[i]]; renderGallery(); };
      return el("li", {},
        el("img", { src: url, alt: "", className: "row-thumb" }),
        el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "↑", onclick: move(-1), ariaLabel: "تحريك للأعلى" }),
        el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "↓", onclick: move(1), ariaLabel: "تحريك للأسفل" }),
        el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "جعلها الرئيسية", onclick: () => setPrimary(url) }),
        el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "حذف", onclick: () => { images.splice(i, 1); renderGallery(); } }));
    }));
  }
  galleryInput.addEventListener("change", () => handleFiles(galleryInput.files, (saved) => { images.push(saved.url); renderGallery(); }));

  // Families, notes, description, keywords, brand.
  const familyBox = el("div", { className: "chip-group" }, ...FAMILIES.map((f) => el("label", { className: "chip-check" },
    el("input", { type: "checkbox", name: "families", value: f.key }),
    el("span", { className: "swatch", style: `background:${f.swatch}` }),
    f.ar)));
  const text = (id, label, props = {}) => el("div", { className: "field" }, el("label", { htmlFor: id, textContent: label }), el(props.rows ? "textarea" : "input", { id, ...props }));

  const brandSelect = el("select", { id: "p_brand" }, el("option", { value: "", textContent: "بدون" }));
  fetch("/api/brands").then((r) => r.json()).then(({ data }) => {
    for (const b of (data || []).filter((b) => b.active)) brandSelect.append(el("option", { value: b._id, textContent: `${b.name_ar} / ${b.name_en}` }));
  }).catch((err) => console.error(err));

  root.append(
    el("div", { className: "field" }, el("label", { textContent: "رفع صورة المنتج" }), drop, fileInput, status),
    el("div", { className: "field" }, el("label", { htmlFor: "gallery_file", textContent: "صور إضافية" }), galleryInput, galleryList),
    el("div", { className: "field" }, el("span", { className: "field-label", textContent: "العائلات العطرية" }), familyBox),
    el("div", { className: "field" }, el("label", { htmlFor: "p_brand", textContent: "المصمم" }), brandSelect),
    text("notes_top", "النوتات العليا (افصل بفواصل)"),
    text("notes_heart", "نوتات القلب (افصل بفواصل)"),
    text("notes_base", "النوتات الأساسية (افصل بفواصل)"),
    text("description", "الوصف", { rows: 4, maxLength: 2000 }),
    text("keywords", "كلمات بحث إضافية (مثل الاسم بالإنجليزية)", { maxLength: 300 }),
  );

  const list = (id) => document.getElementById(id).value.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
  return {
    read: () => ({
      families: [...root.querySelectorAll("input[name=families]:checked")].map((i) => i.value),
      notes: { top: list("notes_top"), heart: list("notes_heart"), base: list("notes_base") },
      description: document.getElementById("description").value.trim(),
      keywords: document.getElementById("keywords").value.trim(),
      brand: brandSelect.value || null,
      images: [...images],
    }),
    fill: (p) => {
      categorySelect.value = p.p_category ?? "";
      for (const box of root.querySelectorAll("input[name=families]")) box.checked = (p.families ?? []).includes(box.value);
      document.getElementById("notes_top").value = (p.notes?.top ?? []).join("، ");
      document.getElementById("notes_heart").value = (p.notes?.heart ?? []).join("، ");
      document.getElementById("notes_base").value = (p.notes?.base ?? []).join("، ");
      document.getElementById("description").value = p.description ?? "";
      document.getElementById("keywords").value = p.keywords ?? "";
      brandSelect.value = p.brand ?? "";
      images.splice(0, images.length, ...(p.images ?? []));
      renderGallery();
    },
  };
}
