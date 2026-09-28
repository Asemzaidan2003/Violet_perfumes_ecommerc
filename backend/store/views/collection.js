// One view for every aisle: /c/:category, /family/:key, /offers, /new, /best-sellers, /search.
// The server renders the whole aisle filtered and sorted from the query string (shared URLs and
// no-JS work); filtered-out cards are rendered `hidden` so collection.js can re-filter instantly.
import { html } from "../html.js";
import { productCard, familyCounts, slot, icon } from "./components.js";
import { gridTile } from "./promo.js";
import { forSlot } from "../../services/placements.service.js";
import { CATEGORIES } from "../../../storefront/js/shared/vocab.js";
import { perfumeCount, sizeLabel } from "../../../storefront/js/shared/format.js";
import { normalize } from "../../../storefront/js/shared/search.js";

export const SORTS = {
  relevance: "الأنسب",
  best: "الأكثر مبيعًا",
  new: "الأحدث",
  price_asc: "السعر: الأقل أولًا",
  price_desc: "السعر: الأعلى أولًا",
};

const minPrice = (p) => Math.min(...p.sizes.map((s) => s.final));
const time = (p) => new Date(p.created).getTime() || 0;
// Items are { p, best (catalog position), rel (search position) }.
const COMPARE = {
  relevance: (a, b) => a.rel - b.rel,
  best: (a, b) => a.best - b.best,
  new: (a, b) => time(b.p) - time(a.p) || a.best - b.best,
  price_asc: (a, b) => minPrice(a.p) - minPrice(b.p) || a.best - b.best,
  price_desc: (a, b) => minPrice(b.p) - minPrice(a.p) || a.best - b.best,
};

// All notes of a product (top/heart/base), normalized (search.js's normalize), deduplicated.
export function productNotes(p) {
  const all = [...(p.notes?.top || []), ...(p.notes?.heart || []), ...(p.notes?.base || [])];
  return [...new Set(all.map(normalize).filter(Boolean))];
}

// Same rules as collection.js: any selected family, any selected size, any selected designer, any
// selected note, and "in stock" means a selected size (or any size when none is selected) is in stock.
export function matches(p, { f, s, stock, b = [], n = [] }) {
  if (f.length && !p.families.some((k) => f.includes(k))) return false;
  if (s.length && !p.sizes.some((x) => s.includes(x.size))) return false;
  if (b.length && !(p.brand && b.includes(p.brand.slug))) return false;
  if (n.length && !productNotes(p).some((x) => n.includes(x))) return false;
  if (stock && !p.sizes.some((x) => x.in_stock && (!s.length || s.includes(x.size)))) return false;
  return true;
}

const toggle = (name, value, checked, label) => html`<label class="toggle">
  <input class="sr-only" type="checkbox" name="${name}" value="${value}"${checked ? html` checked` : ""}>
  <span class="toggle-face">${label}</span>
</label>`;

// Brands present in the aisle, most common first (ties broken alphabetically).
function brandOptions(base) {
  const counts = new Map(); // slug -> { label, count }
  for (const p of base) {
    if (!p.brand) continue;
    const cur = counts.get(p.brand.slug);
    if (cur) cur.count++; else counts.set(p.brand.slug, { label: p.brand.name_ar, count: 1 });
  }
  return [...counts.entries()].map(([slug, v]) => ({ slug, ...v })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ar"));
}

// Top 12 most common notes in the aisle (across top/heart/base, normalized), most common first.
function noteOptions(base) {
  const counts = new Map(); // normalized -> { label, count }
  for (const p of base) {
    const all = [...(p.notes?.top || []), ...(p.notes?.heart || []), ...(p.notes?.base || [])];
    const seen = new Set();
    for (const raw of all) {
      const key = normalize(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const cur = counts.get(key);
      if (cur) cur.count++; else counts.set(key, { label: raw, count: 1 });
    }
  }
  return [...counts.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ar")).slice(0, 12);
}

// The chips a page renders: families present in the aisle (minus the aisle's own family), sizes
// when there are at least two, brands present, and the aisle's top notes. Filters for anything
// else are dropped, so server and client agree.
function options(base, hideFamily) {
  const families = familyCounts(base).filter((f) => f.key !== hideFamily);
  const sizes = [...new Set(base.flatMap((p) => p.sizes.map((s) => s.size)))].sort((a, b) => a - b);
  return { families, sizes: sizes.length > 1 ? sizes : [], brands: brandOptions(base), notes: noteOptions(base) };
}

function filters({ path, q, filter, sort, sorts, defaultSort, families, sizes, brands, notes }) {
  return html`<form class="filters" action="${path}" method="get" data-filters data-default-sort="${defaultSort}" aria-label="تصفية وترتيب">
  ${q ? html`<input type="hidden" name="q" value="${q}">` : ""}
  ${families.length ? html`<fieldset class="filter-group">
    <legend class="filter-label">العائلة</legend>
    <div class="filter-chips">${families.map((f) => toggle("f", f.key, filter.f.includes(f.key),
      html`<span class="swatch" style="--swatch: ${f.swatch}"></span>${f.ar}`))}</div>
  </fieldset>` : ""}
  ${sizes.length ? html`<fieldset class="filter-group">
    <legend class="filter-label">الحجم</legend>
    <div class="filter-chips">${sizes.map((s) => toggle("s", s, filter.s.includes(s), html`<bdi>${sizeLabel(s)}</bdi>`))}</div>
  </fieldset>` : ""}
  ${brands.length ? html`<fieldset class="filter-group">
    <legend class="filter-label">المصمم</legend>
    <div class="filter-chips">${brands.map((b) => toggle("b", b.slug, filter.b.includes(b.slug), b.label))}</div>
  </fieldset>` : ""}
  ${notes.length ? html`<fieldset class="filter-group">
    <legend class="filter-label">النوتات</legend>
    <div class="filter-chips">${notes.map((nt) => toggle("n", nt.key, filter.n.includes(nt.key), nt.label))}</div>
  </fieldset>` : ""}
  <div class="filter-bar">
    ${toggle("stock", "1", filter.stock, "المتوفر فقط")}
    <label class="sort">
      <span class="filter-label">الترتيب</span>
      <select name="sort">${sorts.map((k) => html`<option value="${k}"${k === sort ? html` selected` : ""}>${SORTS[k]}</option>`)}</select>
    </label>
    <button class="btn btn-secondary filters-apply" type="submit">تطبيق</button>
  </div>
</form>`;
}

function emptyState({ path, q, hidden, filtered, suggest }) {
  const clear = q ? `${path}?q=${encodeURIComponent(q)}` : path;
  const title = q ? html`لم نجد عطورًا تطابق «${q}»`
    : path === "/search" ? "اكتب اسم عطر أو نوتة أو عائلة للبحث" : "لا توجد عطور تطابق هذا الاختيار";
  return html`<div class="empty" data-empty${hidden ? html` hidden` : ""}>
  <p class="empty-title">${title}</p>
  <p class="muted">${filtered ? "جرّب إزالة بعض التصفية، أو تجوّل في هذه الاقتراحات." : "أو تجوّل في هذه الاقتراحات."}</p>
  <a class="btn btn-secondary" href="${clear}" data-clear${filtered ? "" : html` hidden`}>إزالة التصفية</a>
  <ul class="empty-links" role="list">
    ${CATEGORIES.map((c) => html`<li><a class="chip chip-link" href="/c/${c.slug}">${c.ar}</a></li>`)}
    ${suggest.slice(0, 8).map((f) => html`<li><a class="chip chip-link" href="/family/${f.key}"><span class="swatch" style="--swatch: ${f.swatch}"></span>${f.ar}</a></li>`)}
  </ul>
</div>`;
}

const gridItem = ({ p, best, rel }, shown, i) => html`<li class="grid-item" data-id="${p.id}" data-families="${p.families.join(" ")}"
  data-sizes="${p.sizes.map((s) => s.size).join(" ")}" data-stock="${p.sizes.filter((s) => s.in_stock).map((s) => s.size).join(" ")}"
  data-brand="${p.brand ? p.brand.slug : ""}" data-notes="${productNotes(p).join("|")}"
  data-price="${minPrice(p)}" data-created="${time(p)}" data-best="${best}" data-rel="${rel}" data-reveal style="--i: ${i % 8}"${shown ? "" : html` hidden`}>${productCard(p, { priority: i < 2 })}</li>`;

// Promo tiles go after visible items 4, 12, 20, … cycling through the aisle's tiles. There is one
// tile element per position the whole aisle could fill; those past the visible count are appended
// hidden, so collection.js can re-place them when filtering changes the count (same rule).
const TILE_FIRST = 4;
const TILE_EVERY = 8;
function gridWithTiles(items, filter, tiles) {
  const slots = tiles.length && items.length >= TILE_FIRST ? Math.floor((items.length - TILE_FIRST) / TILE_EVERY) + 1 : 0;
  const tileAt = (k, hidden) => gridTile(tiles[k % tiles.length], hidden);
  const out = [];
  let visible = 0;
  let placed = 0;
  for (const it of items) {
    const shown = matches(it.p, filter);
    out.push(gridItem(it, shown, shown ? visible++ : 99));
    if (shown && placed < slots && visible === TILE_FIRST + placed * TILE_EVERY) out.push(tileAt(placed++));
  }
  for (; placed < slots; placed++) out.push(tileAt(placed, true));
  return out;
}

// page: { path, eyebrow, title, intro, switcher, q, base, catalog, filter, sort, defaultSort, hideFamily, target, placements }
export function collection(page) {
  const { path, eyebrow, title, intro, switcher, q, base, catalog, defaultSort, hideFamily, target = {}, placements = [] } = page;
  const { families, sizes, brands, notes } = options(base, hideFamily);
  const filter = {
    f: page.filter.f.filter((k) => families.some((f) => f.key === k)),
    s: page.filter.s.filter((x) => sizes.includes(x)),
    b: (page.filter.b || []).filter((x) => brands.some((br) => br.slug === x)),
    n: (page.filter.n || []).filter((x) => notes.some((nt) => nt.key === x)),
    stock: page.filter.stock,
  };
  const sort = Object.hasOwn(COMPARE, page.sort) ? page.sort : "best";
  const bestIndex = new Map(catalog.map((p, i) => [p.id, i]));
  const items = base.map((p, rel) => ({ p, rel, best: bestIndex.get(p.id) }));
  items.sort(COMPARE[sort]);
  const shownCount = items.filter((it) => matches(it.p, filter)).length;
  const sorts = Object.keys(SORTS).filter((k) => k !== "relevance" || q);
  return html`<section class="aisle-head" aria-labelledby="aisle-title">
  <div class="container">
    <nav class="crumbs" aria-label="مسار التنقل"><ol role="list"><li><a href="/">الرئيسية</a></li><li aria-current="page">${title}</li></ol></nav>
    ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ""}
    <h1 id="aisle-title" class="aisle-title">${page.brandLogo ? html`<img class="brand-logo" src="${page.brandLogo}" alt="" width="40" height="40">` : ""}${title}</h1>
    ${intro ? html`<p class="aisle-intro muted">${intro}</p>` : ""}
    ${path === "/search" ? html`<form class="search-field aisle-search" action="/search" method="get" role="search">
      <label class="sr-only" for="q-page">ابحث عن عطر</label>
      <input id="q-page" name="q" type="search" value="${q}" placeholder="ابحث عن عطر أو نوتة" autocomplete="off" enterkeyhint="search">
      <button class="btn-icon" type="submit" aria-label="بحث">${icon("search")}</button>
    </form>` : ""}
    ${switcher ? html`<ul class="aisle-switch" role="list">${switcher.map((s) => html`<li><a class="chip chip-link" href="${s.href}"${s.current ? html` aria-current="page"` : ""}>${s.label}</a></li>`)}</ul>` : ""}
    <p class="aisle-count" data-count aria-live="polite">${perfumeCount(shownCount)}</p>
    ${slot("collection_banner", placements, target)}
  </div>
</section>
<div class="container aisle-body">
  ${base.length ? filters({ path, q, filter, sort, sorts, defaultSort, families, sizes, brands, notes }) : ""}
  <ul class="grid" role="list" data-grid>${gridWithTiles(items, filter, forSlot(placements, "grid_tile", target))}</ul>
  ${emptyState({ path, q, hidden: shownCount > 0, filtered: Boolean(filter.f.length || filter.s.length || filter.b.length || filter.n.length || filter.stock), suggest: familyCounts(catalog) })}
</div>`;
}
