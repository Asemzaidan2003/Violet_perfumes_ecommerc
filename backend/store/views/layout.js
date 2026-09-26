// Page shell for every storefront page: head (SEO, Open Graph), header, bottom bar, footer.
import { html } from "../html.js";
import { icon } from "./components.js";
import { CATEGORIES } from "../../../storefront/js/shared/vocab.js";
import { num } from "../../../storefront/js/shared/format.js";

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
      <img class="brand-mark" src="/assets/img/logo.svg" width="24" height="36" alt="">
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
      <a class="brand" href="/"><img class="brand-mark" src="/assets/img/logo.svg" width="24" height="36" alt=""><span class="wordmark">نسمات</span></a>
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

export function layout({
  title, description = "", canonicalPath, ogImage, body, bodyClass = "", hideBottomBar = false,
  settings = {}, assetV = "", origin = "", families = [],
}) {
  const base = (process.env.PUBLIC_URL || origin).replace(/\/+$/, "");
  const abs = (p) => (/^https?:/.test(p) ? p : base + p);
  const wa = settings.whatsapp ? `https://wa.me/${settings.whatsapp}` : "";
  const path = canonicalPath ?? "";
  return html`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
${canonicalPath != null ? html`<link rel="canonical" href="${abs(canonicalPath)}">
<meta property="og:url" content="${abs(canonicalPath)}">` : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="نسمات">
<meta property="og:locale" content="ar_JO">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
${ogImage ? html`<meta property="og:image" content="${abs(ogImage)}">` : ""}
<meta name="theme-color" content="#0E0C0A">
<link rel="icon" href="/assets/img/logo.svg?v=${assetV}" type="image/svg+xml">
<link rel="preload" href="/vendor/fonts/plex-arabic/ibm-plex-sans-arabic-arabic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/store.css?v=${assetV}">
<script type="module" src="/assets/js/store.js?v=${assetV}"></script>
</head>
<body class="${[bodyClass, hideBottomBar ? "no-bottom-bar" : ""].filter(Boolean).join(" ")}">
<a class="skip-link" href="#main">تخطَّ إلى المحتوى</a>
${header(path, families)}
<main id="main" tabindex="-1">
${body}
</main>
${footer(settings, wa)}
${hideBottomBar ? "" : bottomBar(path, wa)}
<dialog id="cart-drawer" class="drawer" aria-label="سلة التسوق"></dialog>
<div id="live-region" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
</body>
</html>`;
}
