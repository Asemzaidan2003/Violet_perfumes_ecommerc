// Styled 404 / 500 page bodies (wrapped by the layout in the storefront router).
import { html } from "../html.js";
import { icon } from "./components.js";
import { CATEGORIES } from "../../../storefront/js/shared/vocab.js";

const links = html`<ul class="error-links" role="list">
  ${CATEGORIES.map((c) => html`<li><a class="chip chip-link" href="/c/${c.slug}">${c.ar}</a></li>`)}
  <li><a class="chip chip-link" href="/offers">العروض</a></li>
</ul>`;

export const notFound = () => html`<section class="container error-page" aria-labelledby="error-title">
  <p class="error-code" aria-hidden="true"><bdi>404</bdi></p>
  <h1 id="error-title">لم نجد هذه الصفحة</h1>
  <p class="muted">ربما تغيّر الرابط أو لم يعد هذا العطر على الرفوف. جرّب البحث أو تجوّل في الأقسام.</p>
  <form class="search-field" action="/search" method="get" role="search">
    <label class="sr-only" for="q-404">ابحث عن عطر</label>
    <input id="q-404" name="q" type="search" placeholder="ابحث عن عطر أو نوتة" autocomplete="off" enterkeyhint="search">
    <button class="btn-icon" type="submit" aria-label="بحث">${icon("search")}</button>
  </form>
  ${links}
  <a class="btn btn-primary" href="/">العودة إلى الرئيسية</a>
</section>`;

export const serverError = (settings = {}) => html`<section class="container error-page" aria-labelledby="error-title">
  <p class="error-code" aria-hidden="true"><bdi>500</bdi></p>
  <h1 id="error-title">حدث خلل مؤقت</h1>
  <p class="muted">نعتذر، لم نتمكن من عرض هذه الصفحة الآن. حاول مجددًا بعد لحظات.</p>
  ${links}
  <div class="hero-cta">
    <a class="btn btn-primary" href="/">العودة إلى الرئيسية</a>
    ${settings.whatsapp ? html`<a class="btn btn-secondary" href="https://wa.me/${settings.whatsapp}" target="_blank" rel="noopener">${icon("whatsapp")} اطلب عبر واتساب</a>` : ""}
  </div>
</section>`;
