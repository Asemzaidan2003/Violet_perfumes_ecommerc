// Reusable storefront markup. Everything goes through `html` (escape by default);
// `raw()` is used only for the icon paths below, which are our own constants.
import { html, raw } from "../html.js";
import { FAMILIES } from "../../../storefront/js/shared/vocab.js";
import { money, num } from "../../../storefront/js/shared/format.js";
import { asset } from "../assets.js";
import { placementMarkup } from "./promo.js";

export const PLACEHOLDER_IMG = asset("img/placeholder-bottle.svg");
const NEW_FOR_MS = 30 * 24 * 60 * 60_000;
const FAMILY_BY_KEY = new Map(FAMILIES.map((f) => [f.key, f]));

// 24px, stroke 1.75, currentColor. The chevron points to the inline end ("forward");
// CSS mirrors it in RTL and `.flip` reverses it for "back" buttons.
const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  cart: '<path d="M5.5 8h13l-1.1 12.1a1 1 0 0 1-1 .9H7.6a1 1 0 0 1-1-.9z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  whatsapp: '<path d="M3.6 20.4 5 16.3a8.5 8.5 0 1 1 3 3z"/><path d="M9.2 8.6c-.3 2.9 3.3 6.5 6.2 6.2l.9-1.4-1.9-1-.9.8a4.4 4.4 0 0 1-2.6-2.6l.8-.9-1-1.9z"/>',
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11.5h13V9"/><path d="M10 20.5v-5.5h4v5.5"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
  truck: '<path d="M2.5 6.5h11v10h-11z"/><path d="M13.5 9.5h4l3 3.5v3.5h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M15.5 14.5h2"/><path d="M6 6 15.5 3.5l1 2.5"/>',
};

// Decorative by default (aria-hidden); the button or link that holds it carries the label.
export const icon = (name) =>
  raw(`<svg class="icon i-${name}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`);

const cheapest = (sizes) => sizes.reduce((a, b) => (b.final < a.final ? b : a), sizes[0]);
// Cheapest in-stock size, else the cheapest — what quick-add puts in the cart.
const quickSize = (p) => {
  const inStock = p.sizes.filter((s) => s.in_stock);
  return cheapest(inStock.length ? inStock : p.sizes);
};

export function price(p, size) {
  const s = size ? p.sizes.find((x) => x.size === size) : p.sizes.length && cheapest(p.sizes);
  if (!s) return "";
  const from = !size && p.sizes.length > 1;
  return html`<p class="price">${from ? html`<span class="price-from">من</span> ` : ""}<bdi class="price-final">${money(s.final)}</bdi>${
    s.list > s.final ? html` <del class="price-list"><span class="sr-only">بدلًا من </span><bdi>${money(s.list)}</bdi></del>` : ""
  }</p>`;
}

export function badges(p) {
  const out = [];
  if (p.offer > 0) out.push(html`<span class="badge badge-offer"><bdi>−${num(p.offer)}%</bdi></span>`);
  if (p.created && Date.now() - new Date(p.created) <= NEW_FOR_MS) out.push(html`<span class="badge badge-new">جديد</span>`);
  if (p.rank != null && p.rank <= 10) out.push(html`<span class="badge badge-best">الأكثر مبيعًا</span>`);
  if (!p.in_stock) out.push(html`<span class="badge badge-out">غير متوفر حاليًا</span>`);
  return out.length ? html`<div class="badges">${out}</div>` : "";
}

const OFFER_CHIP_WINDOW_MS = 7 * 24 * 60 * 60_000;
const RTF_AR = new Intl.RelativeTimeFormat("ar", { numeric: "always" });

// A countdown chip for an offer ending within 7 days, else "". Days while ≥ 1 day remains,
// hours otherwise. The server renders the text; no client JS is required.
export function offerChip(p, now = new Date()) {
  if (!p.offer_ends_at) return "";
  const end = new Date(p.offer_ends_at);
  const ms = end - now;
  if (ms <= 0 || ms > OFFER_CHIP_WINDOW_MS) return "";
  const days = Math.floor(ms / (24 * 60 * 60_000));
  const text = days >= 1 ? RTF_AR.format(days, "day") : RTF_AR.format(Math.max(1, Math.ceil(ms / (60 * 60_000))), "hour");
  return html`<span class="chip-countdown" data-ends-at="${end.toISOString()}">ينتهي ${text}</span>`;
}

export function familyChip(key) {
  const f = FAMILY_BY_KEY.get(key);
  return f ? html`<span class="chip"><span class="swatch" style="--swatch: ${f.swatch}"></span>${f.ar}</span>` : "";
}

// Families that have at least one product, in vocabulary order: [{ key, ar, swatch, count }].
export function familyCounts(products) {
  const counts = new Map();
  for (const p of products) for (const k of p.families) counts.set(k, (counts.get(k) || 0) + 1);
  return FAMILIES.filter((f) => counts.has(f.key)).map((f) => ({ ...f, count: counts.get(f.key) }));
}

function productImage(p, priority) {
  const src = p.thumb || p.image || PLACEHOLDER_IMG;
  const srcset = p.image && p.thumb && p.thumb !== p.image ? `${p.thumb} 480w, ${p.image} 960w` : null;
  return html`<img src="${src}"${srcset ? html` srcset="${srcset}" sizes="(min-width: 900px) 240px, 46vw"` : ""} alt="${p.name}" width="400" height="500"${
    priority ? raw(' fetchpriority="high"') : raw(' loading="lazy"')} decoding="async" referrerpolicy="no-referrer"${p.image ? "" : raw(' class="is-placeholder"')}>`;
}

export function productCard(p, { priority = false } = {}) {
  const add = quickSize(p);
  return html`<article class="card">
  <div class="plinth">${productImage(p, priority)}${badges(p)}</div>
  <div class="card-body">
    <h3 class="card-name"><a class="card-link" href="/p/${p.id}">${p.name}</a></h3>
    ${p.families.length ? html`<div class="chips">${p.families.slice(0, 2).map(familyChip)}</div>` : ""}
    <div class="card-foot">
      ${price(p)}
      ${add ? html`<button class="btn-icon card-add" type="button" data-add-to-cart data-id="${p.id}" data-size="${add.size}" data-name="${p.name}" aria-label="أضف ${p.name} إلى السلة">${icon("plus")}</button>` : ""}
    </div>
    ${offerChip(p)}
  </div>
</article>`;
}

export function shelf({ title, href, products }) {
  if (!products.length) return "";
  const id = `shelf-${href.replace(/[^a-z0-9]/gi, "")}`;
  return html`<section class="section shelf" aria-labelledby="${id}">
  <div class="container">
    <div class="section-head">
      <h2 id="${id}" class="section-title">${title}</h2>
      <div class="shelf-nav">
        <button class="btn-icon flip" type="button" data-shelf-prev aria-label="السابق" disabled>${icon("chevron")}</button>
        <button class="btn-icon" type="button" data-shelf-next aria-label="التالي">${icon("chevron")}</button>
      </div>
      <a class="link-more" href="${href}">عرض الكل ${icon("chevron")}</a>
    </div>
    <ul class="shelf-track" role="list" tabindex="0" aria-label="${title}">
      ${products.map((p) => html`<li>${productCard(p)}</li>`)}
    </ul>
  </div>
</section>`;
}

// A placement slot: the live placements for `name` (targeted by { category, family }), or "".
export const slot = (name, placements = [], target = {}) => placementMarkup(name, placements, target);
