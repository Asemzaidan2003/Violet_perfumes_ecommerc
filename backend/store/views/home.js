// Home "/": walking into the boutique — spec sections 1–10 (the footer, 11, is in the layout).
import { html, raw } from "../html.js";
import { icon, shelf, slot, familyCounts } from "./components.js";
import { heroSlider } from "./promo.js";
import { money, perfumeCount } from "../../../storefront/js/shared/format.js";

const SHELF_SIZE = 12;

// Window display artwork: a bottle on a cream plinth under a spotlight. Our own markup.
const HERO_ART = raw(`<svg class="hero-art" viewBox="0 0 400 480" aria-hidden="true" focusable="false">
<defs>
  <linearGradient id="hx-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2D27A" stop-opacity=".38"/><stop offset="1" stop-color="#F2D27A" stop-opacity="0"/></linearGradient>
  <linearGradient id="hx-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5A3C16"/><stop offset=".38" stop-color="#C99A2E"/><stop offset=".55" stop-color="#E6C46A"/><stop offset=".72" stop-color="#B8862A"/><stop offset="1" stop-color="#4A3012"/></linearGradient>
  <linearGradient id="hx-liquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1206" stop-opacity="0"/><stop offset="1" stop-color="#1A1206" stop-opacity=".35"/></linearGradient>
  <linearGradient id="hx-cap" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2A1D0B"/><stop offset=".5" stop-color="#8A6A22"/><stop offset="1" stop-color="#1A1206"/></linearGradient>
  <linearGradient id="hx-plinth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7F1E7"/><stop offset="1" stop-color="#BFAE93"/></linearGradient>
  <radialGradient id="hx-floor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#D4AF37" stop-opacity=".35"/><stop offset="1" stop-color="#D4AF37" stop-opacity="0"/></radialGradient>
</defs>
<path class="hero-beam" d="M168 0h64l120 430H48z" fill="url(#hx-beam)"/>
<ellipse cx="200" cy="452" rx="190" ry="26" fill="url(#hx-floor)"/>
<path d="M92 392h216v62a8 8 0 0 1-8 8H100a8 8 0 0 1-8-8z" fill="url(#hx-plinth)"/>
<ellipse cx="200" cy="392" rx="108" ry="12" fill="#FFFDF8"/>
<ellipse cx="200" cy="390" rx="70" ry="7" fill="#1A1206" opacity=".18"/>
<rect x="186" y="170" width="28" height="30" rx="4" fill="#9C7A2A"/>
<path d="M170 104h60l-5 70h-50z" fill="url(#hx-cap)"/>
<path d="M186 110h6l-2 58h-4z" fill="#F7F1E7" opacity=".28"/>
<rect x="128" y="196" width="144" height="194" rx="28" fill="url(#hx-glass)"/>
<rect x="128" y="196" width="144" height="194" rx="28" fill="url(#hx-liquid)"/>
<rect x="144" y="214" width="10" height="156" rx="5" fill="#FFFDF8" opacity=".32"/>
<rect x="156" y="276" width="88" height="54" rx="6" fill="#1A1206" opacity=".62"/>
<rect x="161" y="281" width="78" height="44" rx="4" fill="none" stroke="#E6C46A" stroke-width="1"/>
<text x="200" y="311" text-anchor="middle" font-family="El Messiri, serif" font-weight="700" font-size="20" fill="#E6C46A">نسمات</text>
<g class="hero-glints" fill="#F2D27A"><circle cx="96" cy="150" r="2"/><circle cx="318" cy="112" r="1.6"/><circle cx="300" cy="236" r="2.2"/><circle cx="84" cy="276" r="1.4"/></g>
</svg>`);

// Window display (spec §2): slide 1 is always this brand welcome; live admin hero slides follow
// (promo.js). With none, the hero is exactly the brand welcome and no slider markup is rendered.
function hero(placements) {
  const brand = html`<div class="container hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">بوتيك العطور في الأردن</p>
      <h1 id="hero-title" class="hero-title">نسمات — عطرك يحكي عنك</h1>
      <p class="hero-sub">تركيبات فاخرة بزيوت عطرية مختارة، تُحضَّر لك بعناية وتصلك إلى باب بيتك في كل محافظات الأردن.</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="/c/men">تسوّق الرجالي</a>
        <a class="btn btn-secondary" href="/c/women">تسوّق النسائي</a>
      </div>
    </div>
    <div class="hero-display">${HERO_ART}</div>
  </div>`;
  const { slider, body } = heroSlider(brand, placements);
  return html`<section class="hero${slider ? " is-slider" : ""}" aria-labelledby="hero-title"${slider ? html` aria-roledescription="عرض شرائح" data-hero-slider` : ""}>
  ${body}
</section>`;
}

// Line drawings for the aisle tiles (our own markup).
const AISLE_ART = {
  men: '<rect x="18" y="22" width="28" height="34" rx="3"/><path d="M26 22v-6h12v6M24 16h16"/>',
  women: '<path d="M32 24c-10 0-15 8-15 17s6 15 15 15 15-6 15-15-5-17-15-17z"/><path d="M28 24v-6h8v6M26 18h12"/>',
  unisex: '<rect x="12" y="28" width="20" height="28" rx="3"/><path d="M18 28v-5h8v5"/><path d="M42 30c-6 0-9 5-9 11s4 15 9 15 9-9 9-15-3-11-9-11z"/><path d="M40 30v-4h4v4"/>',
  home: '<path d="M22 36h20l-2 20H24z"/><path d="M28 36 24 12M32 36V10M36 36l4-24"/>',
};
const AISLES = [
  { slug: "men", label: "رجالي", keys: ["Men"], glow: "var(--glow-men)" },
  { slug: "women", label: "نسائي", keys: ["Women"], glow: "var(--glow-women)" },
  { slug: "unisex", label: "للجنسين", keys: ["Unisex"], glow: "var(--gold)" },
  { slug: "home", label: "معطرات", keys: ["Home", "Car"], glow: "var(--glow-home)" },
];

function aisles(products) {
  return html`<section class="section" id="aisles" aria-labelledby="aisles-title">
  <div class="container">
    <div class="section-head"><h2 id="aisles-title" class="section-title">تجوّل في الأقسام</h2></div>
    <ul class="aisles" role="list">
      ${AISLES.map((a, i) => {
        const count = products.filter((p) => a.keys.includes(p.category)).length;
        return html`<li data-reveal style="--i: ${i}"><a class="aisle" href="/c/${a.slug}" style="--glow: ${a.glow}">
          <svg class="aisle-art" viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" aria-hidden="true" focusable="false">${raw(AISLE_ART[a.slug])}</svg>
          <span class="aisle-name">${a.label}</span>
          <span class="aisle-count">${count ? perfumeCount(count) : "قريبًا"}</span>
          <span class="aisle-go">${icon("chevron")}</span>
        </a></li>`;
      })}
    </ul>
  </div>
</section>`;
}

function testerBar(families) {
  if (!families.length) return "";
  return html`<section class="section testers" id="families" aria-labelledby="testers-title" data-reveal>
  <div class="container">
    <div class="section-head">
      <h2 id="testers-title" class="section-title">ركن التجربة</h2>
      <p class="section-sub">اختر عائلتك العطرية المفضلة واكتشف عطورها</p>
    </div>
    <ul class="blotters" role="list" tabindex="0" aria-label="العائلات العطرية">
      ${families.map((f) => html`<li><a class="blotter" href="/family/${f.key}" style="--swatch: ${f.swatch}">
        <span class="blotter-strip" aria-hidden="true"></span>
        <span class="blotter-name">${f.ar}</span>
        <span class="blotter-count">${perfumeCount(f.count)}</span>
      </a></li>`)}
    </ul>
  </div>
</section>`;
}

function serviceStrip(settings) {
  const wa = settings.whatsapp ? `https://wa.me/${settings.whatsapp}` : "";
  const delivery = settings.free_delivery_over > 0
    ? html`توصيل مجاني للطلبات من <bdi>${money(settings.free_delivery_over)}</bdi>`
    : "إلى باب بيتك في كل المحافظات";
  const items = [
    { icon: "truck", title: "توصيل لكل الأردن", sub: delivery },
    { icon: "wallet", title: "الدفع عند الاستلام", sub: "ادفع نقدًا عند وصول طلبك" },
    { icon: "whatsapp", title: "خدمة واتساب", sub: wa ? html`<a href="${wa}" target="_blank" rel="noopener">راسلنا الآن</a>` : "نرد على استفساراتك بسرعة" },
  ];
  return html`<section class="section services" aria-label="خدماتنا" data-reveal>
  <ul class="container service-list" role="list">
    ${items.map((i) => html`<li class="service"><span class="service-icon">${icon(i.icon)}</span><span><strong>${i.title}</strong><span class="muted">${i.sub}</span></span></li>`)}
  </ul>
</section>`;
}

// "Doors of light" entrance overlay: two dark panels + a gold sweep. pointer-events: none from
// the first frame (fx.css), hidden unless html.fx-motion.fx-entrance (fx-entrance.js opts in).
const ENTRANCE = raw(`<div class="fx-entrance-overlay" data-fx-entrance aria-hidden="true">
  <span class="fx-entrance-panel fx-entrance-panel-l"></span>
  <span class="fx-entrance-panel fx-entrance-panel-r"></span>
  <span class="fx-entrance-sweep"></span>
</div>`);

export function home({ products, settings, placements = [] }) {
  // getCatalog() order is best-seller rank, then newest — exactly the best-sellers fallback rule.
  const best = products.slice(0, SHELF_SIZE);
  const newest = [...products].sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, SHELF_SIZE);
  const offers = products.filter((p) => p.offer > 0).slice(0, SHELF_SIZE);
  return html`${ENTRANCE}
${hero(placements)}
${aisles(products)}
${shelf({ title: "الأكثر مبيعًا", href: "/best-sellers", products: best })}
${slot("home_mid", placements)}
${testerBar(familyCounts(products))}
${shelf({ title: "وصل حديثًا", href: "/new", products: newest })}
${shelf({ title: "عروض المتجر", href: "/offers", products: offers })}
${slot("home_bottom", placements)}
${serviceStrip(settings)}`;
}
