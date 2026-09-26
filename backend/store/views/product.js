// Product page /p/:id: gallery, sizes, quantity, actions, notes, related shelf, interest dialog.
// product.js wires the interactions; Task 6's cart module takes over the cart buttons.
import { html, json } from "../html.js";
import { icon, price, shelf, PLACEHOLDER_IMG } from "./components.js";
import { CATEGORIES, FAMILIES } from "../../../storefront/js/shared/vocab.js";
import { money, num, sizeLabel } from "../../../storefront/js/shared/format.js";

const CATEGORY = new Map(CATEGORIES.map((c) => [c.key, c]));
const FAMILY = new Map(FAMILIES.map((f) => [f.key, f]));
const OOS_NOTE = "نحضّره لك عند الطلب وقد يستغرق وقتًا أطول";
const TIERS = [["top", "المقدمة"], ["heart", "القلب"], ["base", "القاعدة"]];

const cheapest = (sizes) => sizes.reduce((a, b) => (b.final < a.final ? b : a), sizes[0]);
// Preselect the cheapest in-stock size, else the cheapest.
const defaultSize = (p) => cheapest(p.sizes.filter((s) => s.in_stock).length ? p.sizes.filter((s) => s.in_stock) : p.sizes);

function gallery(p) {
  const images = [...new Set([p.image, ...p.images].filter(Boolean))];
  const slides = images.length ? images : [null];
  return html`<div class="gallery" data-gallery>
  <ul class="gallery-track" role="list"${slides.length > 1 ? html` tabindex="0" aria-label="صور ${p.name}"` : ""}>
    ${slides.map((src, i) => {
      const upload = src && /^\/img\//.test(src);
      const thumb = upload ? src.replace(/\.(webp|jpg|png)$/, "-480.$1") : src;
      return html`<li class="plinth gallery-slide"><img src="${src || PLACEHOLDER_IMG}"${upload ? html` srcset="${thumb} 480w, ${src} 960w" sizes="(min-width: 900px) 560px, 100vw"` : ""}
        alt="${i ? `${p.name} — صورة ${i + 1}` : p.name}" width="800" height="1000" referrerpolicy="no-referrer"${
        i ? html` loading="lazy" decoding="async"` : html` fetchpriority="high"`}${src ? "" : html` class="is-placeholder"`}></li>`;
    })}
  </ul>
  ${slides.length > 1 ? html`<ul class="gallery-thumbs" role="list">${slides.map((src, i) => html`<li><button class="gallery-thumb" type="button" data-thumb="${i}"
    aria-label="الصورة ${i + 1} من ${slides.length}"${i ? "" : html` aria-current="true"`}><img src="${src}" alt="" width="64" height="80" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button></li>`)}</ul>` : ""}
</div>`;
}

function sizes(p, selected) {
  return html`<fieldset class="sizes">
  <legend class="field-label">الحجم</legend>
  <div class="size-list">${p.sizes.map((s) => html`<label class="size-opt">
    <input class="sr-only" type="radio" name="size" value="${s.size}" data-final="${s.final}" data-list="${s.list}" data-stock="${s.in_stock ? 1 : 0}"${s === selected ? html` checked` : ""}>
    <span class="size-face"><bdi class="size-ml">${sizeLabel(s.size)}</bdi><bdi class="size-price">${money(s.final)}</bdi>${
      s.in_stock ? "" : html`<span class="size-oos">غير متوفر حاليًا</span>`}</span>
  </label>`)}</div>
</fieldset>`;
}

function interestDialog(p, size) {
  return html`<dialog class="modal" id="interest-dialog" aria-labelledby="interest-title" data-interest-dialog>
  <div class="modal-head">
    <h2 id="interest-title" class="modal-title">أعلمني عند التوفر</h2>
    <button class="btn-icon" type="button" data-close aria-label="إغلاق">${icon("close")}</button>
  </div>
  <form class="interest-form" action="/api/store/interest" method="post" novalidate data-interest-form>
    <p class="muted">نتواصل معك فور توفر <strong>${p.name}</strong> بحجم <bdi data-interest-size>${sizeLabel(size.size)}</bdi>.</p>
    <input type="hidden" name="product_id" value="${p.id}">
    <input type="hidden" name="size" value="${size.size}">
    <div class="field">
      <label for="i-name">الاسم</label>
      <input id="i-name" name="name" autocomplete="name" required minlength="2" maxlength="80" aria-describedby="i-name-err">
      <p class="field-error" id="i-name-err" hidden></p>
    </div>
    <div class="field">
      <label for="i-phone">رقم الهاتف</label>
      <input id="i-phone" name="phone" type="tel" inputmode="numeric" dir="ltr" autocomplete="tel" required placeholder="07XXXXXXXX" aria-describedby="i-phone-err">
      <p class="field-error" id="i-phone-err" hidden></p>
    </div>
    <div class="field">
      <label for="i-note">ملاحظة <span class="muted">(اختياري)</span></label>
      <textarea id="i-note" name="note" rows="2" maxlength="300"></textarea>
    </div>
    <div class="hp" aria-hidden="true"><label for="i-website">اتركه فارغًا</label><input id="i-website" name="website" tabindex="-1" autocomplete="off"></div>
    <p class="form-error" role="alert" data-form-error hidden></p>
    <button class="btn btn-primary btn-block" type="submit">أرسل الطلب</button>
  </form>
  <div class="interest-done" data-interest-done hidden>
    <span class="done-mark" aria-hidden="true"></span>
    <p class="modal-title" tabindex="-1">وصلنا طلبك</p>
    <p class="muted">سنتواصل معك فور توفر العطر. شكرًا لثقتك بنسمات.</p>
    <button class="btn btn-secondary btn-block" type="button" data-close>تم</button>
  </div>
</dialog>`;
}

function notesPyramid(notes = {}) {
  const tiers = TIERS.filter(([k]) => notes[k]?.length);
  if (!tiers.length) return "";
  return html`<section class="pdp-block" aria-labelledby="notes-title">
  <h2 id="notes-title" class="section-title">الهرم العطري</h2>
  <ol class="pyramid" role="list">${tiers.map(([k, label]) => html`<li class="tier tier-${k}"><span class="tier-name">${label}</span><span class="tier-notes">${notes[k].join(" · ")}</span></li>`)}</ol>
</section>`;
}

function recentlyViewed() {
  return html`<section class="section recent" data-recent hidden aria-labelledby="recent-title">
  <div class="container">
    <div class="section-head"><h2 id="recent-title" class="section-title">شاهدتها مؤخرًا</h2></div>
    <ul class="shelf-track" role="list" data-recent-list></ul>
  </div>
  <template data-recent-card><li><article class="card">
    <div class="plinth"><img alt="" width="400" height="500" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>
    <div class="card-body"><h3 class="card-name"><a class="card-link" href=""></a></h3><div class="card-foot"><p class="price"><bdi class="price-final"></bdi></p></div></div>
  </article></li></template>
</section>`;
}

function jsonLd(p, url, abs) {
  const images = [p.image, ...p.images].filter(Boolean).map(abs);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.id,
    ...(images.length ? { image: images } : {}),
    ...(p.description ? { description: p.description } : {}),
    category: CATEGORY.get(p.category)?.ar,
    offers: p.sizes.map((s) => ({
      "@type": "Offer",
      name: sizeLabel(s.size),
      price: s.final.toFixed(2),
      priceCurrency: "JOD",
      availability: s.in_stock ? "https://schema.org/InStock" : "https://schema.org/MadeToOrder",
      url,
    })),
  };
}

// base: absolute site origin (PUBLIC_URL or the request's), for the share URL and JSON-LD.
export function product({ p, related, relatedHref, settings, base }) {
  const cat = CATEGORY.get(p.category);
  const selected = defaultSize(p);
  const url = `${base}/p/${p.id}`;
  const abs = (u) => (/^https?:/.test(u) ? u : base + u);
  const anyOut = p.sizes.some((s) => !s.in_stock);
  const wa = settings.whatsapp
    ? `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`مرحبًا، أودّ الاستفسار عن عطر ${p.name}\n${url}`)}`
    : "";
  return html`<div class="container">
  <nav class="crumbs" aria-label="مسار التنقل"><ol role="list">
    <li><a href="/">الرئيسية</a></li>
    ${cat ? html`<li><a href="/c/${cat.slug}">${cat.ar}</a></li>` : ""}
    <li aria-current="page">${p.name}</li>
  </ol></nav>
  <div class="pdp" data-product data-id="${p.id}" data-name="${p.name}">
    ${gallery(p)}
    <div class="pdp-info">
      ${cat ? html`<a class="eyebrow pdp-cat" href="/c/${cat.slug}">${cat.ar}</a>` : ""}
      <h1 class="pdp-title">${p.name}</h1>
      ${p.families.length ? html`<ul class="pdp-families" role="list">${p.families.filter((k) => FAMILY.has(k)).map((k) => html`<li><a class="chip chip-link" href="/family/${k}"><span class="swatch" style="--swatch: ${FAMILY.get(k).swatch}"></span>${FAMILY.get(k).ar}</a></li>`)}</ul>` : ""}
      <div class="pdp-price" data-price>${selected ? price(p, selected.size) : ""}${p.offer > 0 ? html`<span class="badge badge-offer"><bdi>−${num(p.offer)}%</bdi></span>` : ""}</div>
      ${p.sizes.length ? sizes(p, selected) : ""}
      ${anyOut ? html`<div class="oos" data-oos${selected?.in_stock ? html` hidden` : ""}>
        <p class="oos-note"><strong>غير متوفر حاليًا</strong> — ${OOS_NOTE}</p>
        <button class="btn btn-secondary" type="button" data-open-interest>أعلمني عند التوفر</button>
      </div>` : ""}
      <div class="qty">
        <span class="field-label" id="qty-label">الكمية</span>
        <div class="stepper" role="group" aria-labelledby="qty-label">
          <button class="btn-icon" type="button" data-step="-1" aria-label="إنقاص الكمية">${icon("minus")}</button>
          <input id="qty" type="number" inputmode="numeric" min="1" max="20" value="1" aria-labelledby="qty-label">
          <button class="btn-icon" type="button" data-step="1" aria-label="زيادة الكمية">${icon("plus")}</button>
        </div>
      </div>
      <div class="pdp-links">
        <button class="link-btn" type="button" data-share data-title="${p.name}" data-url="${url}">${icon("share")}<span>مشاركة</span></button>
        ${wa ? html`<a class="link-btn" href="${wa}" target="_blank" rel="noopener">${icon("whatsapp")}<span>استفسر عبر واتساب</span></a>` : ""}
      </div>
      <div class="pdp-actions">
        <button class="btn btn-primary" type="button" data-pdp-add data-id="${p.id}" data-name="${p.name}">${icon("cart")}<span>أضف إلى السلة</span></button>
        <button class="btn btn-secondary" type="button" data-buy-now data-id="${p.id}" data-name="${p.name}">اطلب الآن</button>
      </div>
    </div>
  </div>
  ${p.description || Object.values(p.notes || {}).some((n) => n?.length) ? html`<div class="pdp-details">
    ${notesPyramid(p.notes)}
    ${p.description ? html`<section class="pdp-block" aria-labelledby="desc-title">
      <h2 id="desc-title" class="section-title">عن العطر</h2>
      <p class="prose">${p.description}</p>
    </section>` : ""}
  </div>` : ""}
</div>
${shelf({ title: "قد يعجبك أيضًا", href: relatedHref, products: related })}
${recentlyViewed()}
${anyOut && selected ? interestDialog(p, selected) : ""}
<script type="application/ld+json">${json(jsonLd(p, url, abs))}</script>`;
}
