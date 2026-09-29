// Logic for storefront.html: admin editor for the home page, footer/contact, store texts,
// delivery areas and SEO. Mirrors settings.js's load-then-enable / esc-everything patterns.
import { SECTION_LABELS, renderSections, readSections } from "./storefront-sections.js";

const form = document.getElementById("sfForm");
const errorEl = document.getElementById("sfError");
const successEl = document.getElementById("sfSuccess");
const saveBtn = document.getElementById("sfSave");

const GOVERNORATES = [
  "عمّان", "الزرقاء", "إربد", "البلقاء", "المفرق", "جرش",
  "عجلون", "مادبا", "الكرك", "الطفيلة", "معان", "العقبة",
];

let sections = [];
let serviceItems = [];

function rerenderSections() {
  renderSections(document.getElementById("sectionsBody"), sections, rerenderSections);
}

function renderServiceItems() {
  const wrap = document.getElementById("serviceItemsBody");
  wrap.replaceChildren();
  serviceItems.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "field-row";
    const title = document.createElement("input");
    title.value = item.title || "";
    title.placeholder = "العنوان";
    title.maxLength = 40;
    title.addEventListener("input", () => { serviceItems[i] = { ...serviceItems[i], title: title.value }; });
    const text = document.createElement("input");
    text.value = item.text || "";
    text.placeholder = "النص";
    text.maxLength = 80;
    text.addEventListener("input", () => { serviceItems[i] = { ...serviceItems[i], text: text.value }; });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-ghost btn-sm";
    remove.textContent = "حذف";
    remove.addEventListener("click", () => { serviceItems.splice(i, 1); renderServiceItems(); });
    row.append(title, text, remove);
    wrap.append(row);
  });
  document.getElementById("addServiceItem").disabled = serviceItems.length >= 4;
}
document.getElementById("addServiceItem").addEventListener("click", () => {
  if (serviceItems.length >= 4) return;
  serviceItems.push({ title: "", text: "" });
  renderServiceItems();
});

function renderGovernorates(enabled) {
  const wrap = document.getElementById("governoratesBody");
  wrap.replaceChildren();
  for (const g of GOVERNORATES) {
    const label = document.createElement("label");
    label.className = "field-inline";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = g;
    input.checked = enabled.includes(g);
    input.dataset.gov = g;
    label.append(input, document.createTextNode(` ${g}`));
    wrap.append(label);
  }
}

async function load() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) throw new Error("تعذر تحميل الإعدادات");
    const { data } = await res.json();
    const home = data.home || {};
    form.hero_title.value = home.hero_title || "";
    form.hero_subtitle.value = home.hero_subtitle || "";
    document.getElementById("cta_primary_label").value = home.cta_primary?.label || "";
    document.getElementById("cta_primary_link").value = home.cta_primary?.link || "";
    document.getElementById("cta_secondary_label").value = home.cta_secondary?.label || "";
    document.getElementById("cta_secondary_link").value = home.cta_secondary?.link || "";
    sections = (home.sections || []).map((s) => ({ ...s }));
    rerenderSections();
    serviceItems = (home.service_items || []).map((s) => ({ ...s }));
    renderServiceItems();

    const c = data.contact || {};
    document.getElementById("contact_phone").value = c.phone || "";
    document.getElementById("contact_email").value = c.email || "";
    document.getElementById("contact_address").value = c.address || "";
    document.getElementById("contact_map_url").value = c.map_url || "";
    document.getElementById("contact_hours").value = c.hours || "";
    const s = data.social || {};
    document.getElementById("social_instagram").value = s.instagram || "";
    document.getElementById("social_tiktok").value = s.tiktok || "";
    document.getElementById("social_facebook").value = s.facebook || "";
    document.getElementById("social_snapchat").value = s.snapchat || "";
    const f = data.footer || {};
    document.getElementById("footer_about").value = f.about_text || "";
    document.getElementById("footer_copyright").value = f.copyright || "";

    const tx = data.texts || {};
    document.getElementById("texts_oos").value = tx.oos_note || "";
    document.getElementById("texts_checkout").value = tx.checkout_note || "";
    document.getElementById("texts_thanks").value = tx.order_thanks || "";

    renderGovernorates(data.delivery?.governorates || GOVERNORATES);

    const seo = data.seo || {};
    document.getElementById("seo_title").value = seo.home_title || "";
    document.getElementById("seo_desc").value = seo.home_description || "";

    saveBtn.disabled = false;
  } catch (err) {
    console.error("Error loading storefront settings:", err);
    errorEl.textContent = "تعذر تحميل الإعدادات — أعد تحميل الصفحة";
    errorEl.hidden = false;
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  successEl.hidden = true;

  const governorates = [...document.querySelectorAll("#governoratesBody input:checked")].map((i) => i.value);
  const body = {
    home: {
      hero_title: form.hero_title.value.trim(),
      hero_subtitle: form.hero_subtitle.value.trim(),
      cta_primary: { label: document.getElementById("cta_primary_label").value.trim(), link: document.getElementById("cta_primary_link").value.trim() },
      cta_secondary: { label: document.getElementById("cta_secondary_label").value.trim(), link: document.getElementById("cta_secondary_link").value.trim() },
      sections: readSections(sections),
      service_items: serviceItems.filter((i) => i.title.trim() || i.text.trim()),
    },
    contact: {
      phone: document.getElementById("contact_phone").value.trim(),
      email: document.getElementById("contact_email").value.trim(),
      address: document.getElementById("contact_address").value.trim(),
      map_url: document.getElementById("contact_map_url").value.trim(),
      hours: document.getElementById("contact_hours").value.trim(),
    },
    social: {
      instagram: document.getElementById("social_instagram").value.trim(),
      tiktok: document.getElementById("social_tiktok").value.trim(),
      facebook: document.getElementById("social_facebook").value.trim(),
      snapchat: document.getElementById("social_snapchat").value.trim(),
    },
    footer: {
      about_text: document.getElementById("footer_about").value.trim(),
      copyright: document.getElementById("footer_copyright").value.trim(),
    },
    texts: {
      oos_note: document.getElementById("texts_oos").value.trim(),
      checkout_note: document.getElementById("texts_checkout").value.trim(),
      order_thanks: document.getElementById("texts_thanks").value.trim(),
    },
    delivery: { governorates },
    seo: {
      home_title: document.getElementById("seo_title").value.trim(),
      home_description: document.getElementById("seo_desc").value.trim(),
    },
  };

  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    errorEl.textContent = data.message || "تعذر الحفظ";
    errorEl.hidden = false;
    return;
  }
  successEl.textContent = "تم الحفظ ✓";
  successEl.hidden = false;
});

load();
