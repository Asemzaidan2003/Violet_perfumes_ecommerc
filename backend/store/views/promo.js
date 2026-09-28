// Promotion placements, one renderer per slot (spec "Rendering per slot"). All placement text goes
// through `html` (escaped); links are already validated by the model (internal path or https:).
import { html } from "../html.js";
import { forSlot } from "../../services/placements.service.js";
import { icon } from "./components.js";

const MAX_HERO_SLIDES = 3;
const external = (link) => /^https:/i.test(link);
// External links open in a new tab without handing it our window; internal links stay plain.
const href = (link) => (external(link) ? html` href="${link}" target="_blank" rel="noopener"` : html` href="${link}"`);
const theme = (p) => `theme-${p.theme || "dark"}`;
const cta = (p, cls = "btn btn-primary") => (p.link ? html`<a class="${cls} promo-cta"${href(p.link)}>${p.cta || "اكتشف المزيد"}</a>` : "");
// Uploads (/img/<id>.webp) have a 480 px sibling (-480); hotlinked https images have one size.
const image = (p, w, h, sizes) => {
  const upload = /^\/img\/[a-f0-9]{24}\.(webp|jpg|png)$/.test(p.image);
  const srcset = upload ? html` srcset="${p.image.replace(/\.(webp|jpg|png)$/, "-480.$1")} 480w, ${p.image} 960w" sizes="${sizes}"` : "";
  return html`<img class="promo-img" src="${p.image}"${srcset} alt="${p.title}" width="${w}" height="${h}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
};

function announcement(items) {
  return html`<div class="announce ${theme(items[0])}" role="region" aria-label="إعلانات" data-announce>
  <div class="container announce-row">
    <div class="announce-track">${items.map((p, i) => html`<p class="announce-item" data-theme="${theme(p)}"${i ? html` hidden` : ""}>${
      p.link ? html`<a${href(p.link)}>${p.title}</a>` : p.title}${p.subtitle ? html` <span class="announce-sub">${p.subtitle}</span>` : ""}</p>`)}</div>
    <button class="btn-icon announce-close" type="button" data-announce-close aria-label="إغلاق الإعلان">${icon("close")}</button>
  </div>
</div>`;
}

// Admin slides only; home.js wraps them after the brand welcome slide (heroSlider below).
const heroSlide = (p, i, total) => html`<article class="hero-slide ${theme(p)}" aria-roledescription="شريحة" aria-label="${i + 2} من ${total}" data-slide>
  ${image(p, 1600, 900, "100vw")}
  <div class="container hero-slide-copy">
    <h2 class="hero-slide-title">${p.title}</h2>
    ${p.subtitle ? html`<p class="hero-slide-sub">${p.subtitle}</p>` : ""}
    ${cta(p)}
  </div>
</article>`;

// The hero section's contents: the brand slide alone (exactly today's hero), or a slider when
// admin slides are live. Returns { slider, body }.
export function heroSlider(brand, placements = []) {
  const slides = forSlot(placements, "hero").slice(0, MAX_HERO_SLIDES);
  if (!slides.length) return { slider: false, body: brand };
  const total = slides.length + 1;
  return {
    slider: true,
    body: html`<div class="hero-track" data-hero-track>
  <div class="hero-slide hero-slide-brand is-active" aria-roledescription="شريحة" aria-label="1 من ${total}" data-slide>${brand}</div>
  ${slides.map((p, i) => heroSlide(p, i, total))}
</div>
<div class="container hero-controls" data-hero-controls>
  <button class="btn-icon hero-pause" type="button" data-hero-pause aria-pressed="false" aria-label="إيقاف العرض التلقائي">${icon("pause")}${icon("play")}</button>
  <button class="btn-icon flip" type="button" data-hero-prev aria-label="الشريحة السابقة">${icon("chevron")}</button>
  <div class="hero-dots">${Array.from({ length: total }, (_, i) => html`<button class="hero-dot" type="button" data-hero-dot="${i}" aria-label="الشريحة ${i + 1}"${i ? "" : html` aria-current="true"`}></button>`)}</div>
  <button class="btn-icon" type="button" data-hero-next aria-label="الشريحة التالية">${icon("chevron")}</button>
</div>`,
  };
}

const banner = (p, cls = "") => html`<article class="promo-banner ${theme(p)}${cls}">
  ${image(p, 1200, 500, "(min-width: 1240px) 1200px, 100vw")}
  <div class="promo-copy">
    <h2 class="promo-title">${p.title}</h2>
    ${p.subtitle ? html`<p class="promo-sub">${p.subtitle}</p>` : ""}
    ${cta(p)}
  </div>
</article>`;

// ponytail: at most two home banners per slot (the spec's "two side by side"); a third waits its turn by sort.
const homeBanners = (items) => html`<section class="section promo-band" aria-label="عروض نسمات">
  <div class="container promo-banners${items.length > 1 ? " is-pair" : ""}">${items.slice(0, 2).map((p) => banner(p))}</div>
</section>`;

// A grid cell like a product card; data-promo keeps collection.js from filtering or sorting it.
export const gridTile = (p, hidden = false) => html`<li class="grid-promo" data-promo${hidden ? html` hidden` : ""}><article class="promo-tile ${theme(p)}">
  ${image(p, 400, 500, "(min-width: 900px) 240px, 46vw")}
  <div class="promo-copy">
    <h3 class="promo-title">${p.title}</h3>
    ${p.subtitle ? html`<p class="promo-sub">${p.subtitle}</p>` : ""}
    ${cta(p, "btn btn-primary btn-sm")}
  </div>
</article></li>`;

const strip = (p) => html`<aside class="promo-strip ${theme(p)}" aria-label="عرض">
  <p><strong>${p.title}</strong>${p.subtitle ? html` <span>${p.subtitle}</span>` : ""}</p>
  ${p.link ? html`<a class="promo-strip-link"${href(p.link)}>${p.cta || "التفاصيل"} ${icon("chevron")}</a>` : ""}
</aside>`;

const upsell = (p) => html`<aside class="promo-upsell ${theme(p)}" aria-label="اقتراح">
  ${p.image ? image(p, 96, 120, "64px") : ""}
  <div class="promo-copy">
    <p class="promo-title">${p.title}</p>
    ${p.subtitle ? html`<p class="promo-sub">${p.subtitle}</p>` : ""}
    ${cta(p, "link-more")}
  </div>
</aside>`;

// placementMarkup(slot, livePlacements, { category?, family? }) → the slot's markup, or "" when empty.
// grid_tile is placed per grid position by collection.js (view); the hero by heroSlider.
export function placementMarkup(slot, placements = [], target = {}) {
  const items = forSlot(placements, slot, target);
  if (!items.length) return "";
  switch (slot) {
    case "announcement": return announcement(items);
    case "home_mid":
    case "home_bottom": return homeBanners(items);
    case "collection_banner": return banner(items[0], " promo-banner-aisle");
    case "product_promo": return strip(items[0]);
    case "cart_upsell": return upsell(items[0]);
    default: return "";
  }
}
