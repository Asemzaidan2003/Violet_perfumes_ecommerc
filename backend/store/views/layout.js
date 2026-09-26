// Page shell for every storefront page: head (SEO, Open Graph), header, bottom bar, footer.
import { html } from "../html.js";
import { icon } from "./components.js";
import { CATEGORIES } from "../../../storefront/js/shared/vocab.js";
import { num } from "../../../storefront/js/shared/format.js";
import { asset } from "../assets.js";

const LOGO = asset("img/logo.svg");

const NAV = [
  { href: "/c/men", label: "رجالي" },
  { href: "/c/women", label: "نسائي" },
  { href: "/c/unisex", label: "للجنسين" },
  { href: "/c/home", label: "معطرات" },
];

const current = (href, path) => (href === path ? html` aria-current="page"` : "");

function searchForm(id) {
  return html`<form class="search-field" action="/search" method="get" role="search">
  <label class="sr-only" for="${id}">ابحث عن عطر</label>
  <input id="${id}" name="q" type="search" placeholder="ابحث عن عطر أو نوتة" autocomplete="off" enterkeyhint="search">
  <button class="btn-icon" type="submit" aria-label="بحث">${icon("search")}</button>
</form>`;
}

function familiesMenu(families) {
  if (!families.length) return "";
  return html`<li><details class="nav-families" data-dismissable>
  <summary>العائلات العطرية</summary>
  <div class="families-panel"><ul class="container" role="list">
    ${families.map((f) => html`<li><a href="/family/${f.key}"><span class="swatch" style="--swatch: ${f.swatch}"></span>${f.ar} <span class="muted"><bdi>${num(f.count)}</bdi></span></a></li>`)}
  </ul></div>
</details></li>`;
}

function header(path, families) {
  return html`<header class="site-header" data-header>
  <div class="container header-row">
    <a class="brand" href="/" aria-label="نسمات، الصفحة الرئيسية">
      <img class="brand-mark" src="${LOGO}" width="24" height="36" alt="">
      <span class="wordmark">نسمات</span>
    </a>
    ${searchForm("q")}
    <div class="header-actions">
      <a class="btn-icon search-link" href="/search" data-open-search aria-label="بحث">${icon("search")}</a>
      <a class="btn-icon cart-link" href="/cart" data-open-cart>${icon("cart")}<span class="sr-only">السلة</span><span class="count" data-cart-count hidden></span></a>
    </div>
  </div>
  <nav class="main-nav" aria-label="الأقسام">
    <ul class="container nav-list" role="list">
      ${NAV.map((n) => html`<li><a href="${n.href}"${current(n.href, path)}>${n.label}</a></li>`)}
      ${familiesMenu(families)}
      <li><a href="/offers"${current("/offers", path)}>العروض</a></li>
    </ul>
  </nav>
</header>`;
}

// Search overlay shell, filled by search.js. Family and category suggestions are server-rendered.
function searchOverlay(families) {
  return html`<dialog class="search-overlay" id="search-overlay" aria-label="البحث في المتجر">
  <div class="so-panel">
    <form class="search-field so-form" action="/search" method="get" role="search">
      ${icon("search")}
      <label class="sr-only" for="so-q">ابحث عن عطر</label>
      <input id="so-q" name="q" type="search" placeholder="اسم العطر أو نوتة أو عائلة" autocomplete="off" enterkeyhint="search"
        spellcheck="false" role="combobox" aria-expanded="false" aria-controls="so-results" aria-autocomplete="list">
      <button class="btn-icon" type="button" data-close-search aria-label="إغلاق البحث">${icon("close")}</button>
    </form>
    <p class="so-status" data-so-status role="status" aria-live="polite"></p>
    <ul class="so-results" id="so-results" role="listbox" aria-label="نتائج البحث"></ul>
    <a class="so-all" href="/search" data-so-all hidden>عرض كل النتائج ${icon("chevron")}</a>
    <div class="so-suggest" data-so-suggest>
      ${families.length ? html`<h2 class="so-title">تصفّح حسب العائلة</h2>
      <ul class="so-chips" role="list">${families.map((f) => html`<li><a class="chip chip-link" href="/family/${f.key}"><span class="swatch" style="--swatch: ${f.swatch}"></span>${f.ar}</a></li>`)}</ul>` : ""}
      <h2 class="so-title">الأقسام</h2>
      <ul class="so-chips" role="list">
        ${CATEGORIES.map((c) => html`<li><a class="chip chip-link" href="/c/${c.slug}">${c.ar}</a></li>`)}
        <li><a class="chip chip-link" href="/offers">العروض</a></li>
      </ul>
    </div>
  </div>
  <template data-so-item><li role="presentation"><a class="so-item" role="option" aria-selected="false" href="">
    <span class="so-thumb"><img alt="" width="48" height="60" decoding="async" referrerpolicy="no-referrer"></span>
    <span class="so-text"><span class="so-name"></span><span class="so-meta"></span></span>
    <bdi class="so-price"></bdi>
  </a></li></template>
</dialog>`;
}

function bottomBar(path, wa) {
  return html`<nav class="bottom-bar" aria-label="التنقل السريع">
  <ul role="list">
    <li><a href="/"${current("/", path)}>${icon("home")}<span>الرئيسية</span></a></li>
    <li><a href="/#aisles">${icon("grid")}<span>الأقسام</span></a></li>
    <li><a href="/search" data-open-search>${icon("search")}<span>بحث</span></a></li>
    <li><a href="/cart" data-open-cart>${icon("cart")}<span>السلة</span><span class="count" data-cart-count hidden></span></a></li>
    ${wa ? html`<li><a href="${wa}" target="_blank" rel="noopener">${icon("whatsapp")}<span>واتساب</span></a></li>` : ""}
  </ul>
</nav>`;
}

function footer(settings, wa) {
  return html`<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand" href="/"><img class="brand-mark" src="${LOGO}" width="24" height="36" alt=""><span class="wordmark">نسمات</span></a>
      <p>عطور مختارة بعناية، تُحضَّر لك في عمّان وتصلك إلى أي مكان في الأردن.</p>
    </div>
    <nav aria-labelledby="footer-aisles">
      <h2 class="footer-title" id="footer-aisles">الأقسام</h2>
      <ul role="list">
        ${CATEGORIES.map((c) => html`<li><a href="/c/${c.slug}">${c.ar}</a></li>`)}
        <li><a href="/offers">العروض</a></li>
      </ul>
    </nav>
    <div>
      <h2 class="footer-title">تواصل معنا</h2>
      <ul role="list">
        ${wa ? html`<li><a href="${wa}" target="_blank" rel="noopener">${icon("whatsapp")} واتساب <bdi dir="ltr">+${settings.whatsapp}</bdi></a></li>` : ""}
        ${settings.instagram ? html`<li><a href="${settings.instagram}" target="_blank" rel="noopener">انستغرام</a></li>` : ""}
        <li>الدفع نقدًا عند الاستلام</li>
      </ul>
    </div>
  </div>
  <p class="container copyright">© <bdi>${new Date().getFullYear()}</bdi> نسمات. جميع الحقوق محفوظة.</p>
</footer>`;
}

// Absolute site origin for canonical, Open Graph, share and JSON-LD URLs: PUBLIC_URL, else the request's.
export const siteBase = (origin = "") => (process.env.PUBLIC_URL || origin).replace(/\/+$/, "");

export function layout({
  title, description, canonicalPath, ogImage, body, bodyClass = "", hideBottomBar = false, noindex = false,
  settings = {}, assetV = "", origin = "", families = [], styles = [], scripts = [],
}) {
  const base = siteBase(origin);
  const abs = (p) => (/^https?:/.test(p) ? p : base + p);
  const wa = settings.whatsapp ? `https://wa.me/${settings.whatsapp}` : "";
  const path = canonicalPath ?? "";
  return html`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${noindex ? html`<meta name="robots" content="noindex">` : ""}
${description ? html`<meta name="description" content="${description}">
<meta property="og:description" content="${description}">` : ""}
${canonicalPath != null ? html`<link rel="canonical" href="${abs(canonicalPath)}">
<meta property="og:url" content="${abs(canonicalPath)}">` : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="نسمات">
<meta property="og:locale" content="ar_JO">
<meta property="og:title" content="${title}">
${ogImage ? html`<meta property="og:image" content="${abs(ogImage)}">` : ""}
<meta name="theme-color" content="#0E0C0A">
<link rel="icon" href="${LOGO}" type="image/svg+xml">
<link rel="preload" href="/vendor/fonts/plex-arabic/ibm-plex-sans-arabic-arabic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/store.css?v=${assetV}">
${styles.map((f) => html`<link rel="stylesheet" href="/assets/css/${f}?v=${assetV}">`)}
<script type="module" src="/assets/js/store.js?v=${assetV}"></script>
<script type="module" src="/assets/js/search.js?v=${assetV}"></script>
${scripts.map((f) => html`<script type="module" src="/assets/js/${f}?v=${assetV}"></script>`)}
</head>
<body class="${[bodyClass, hideBottomBar ? "no-bottom-bar" : ""].filter(Boolean).join(" ")}">
<a class="skip-link" href="#main">تخطَّ إلى المحتوى</a>
${header(path, families)}
<main id="main" tabindex="-1">
${body}
</main>
${footer(settings, wa)}
${hideBottomBar ? "" : bottomBar(path, wa)}
${searchOverlay(families)}
<dialog id="cart-drawer" class="drawer" aria-label="سلة التسوق"></dialog>
<div id="live-region" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
</body>
</html>`;
}
