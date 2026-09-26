// /checkout: one screen, four required fields, cash on delivery. checkout.js validates (mirroring
// backend/store/validate.js), fills the summary from the cart and posts to /api/store/orders.
import { html } from "../html.js";
import { icon } from "./components.js";
import { GOVERNORATES } from "../validate.js";
import { CATEGORIES } from "../../../storefront/js/shared/vocab.js";

function field({ id, label, hint = "", input }) {
  return html`<div class="field">
  <label for="${id}">${label}${hint ? html` <span class="muted">${hint}</span>` : ""}</label>
  ${input}
  <p class="field-error" id="${id}-err" hidden></p>
</div>`;
}

function summary() {
  return html`<aside class="co-summary" aria-labelledby="co-summary-title">
  <details class="co-details" data-co-details>
    <summary class="co-summary-head">
      <span id="co-summary-title" class="co-summary-title">ملخص الطلب <bdi class="muted" data-co-count></bdi></span>
      <bdi class="co-summary-total" data-co-total-head></bdi>
    </summary>
    <p class="muted" data-co-status role="status"></p>
    <ul class="co-lines" role="list" data-co-lines></ul>
    <dl class="totals">
      <div><dt>المجموع الفرعي</dt><dd><bdi data-co-subtotal></bdi></dd></div>
      <div><dt>التوصيل</dt><dd><bdi data-co-delivery></bdi></dd></div>
      <div class="totals-grand"><dt>الإجمالي</dt><dd><bdi data-co-total></bdi></dd></div>
    </dl>
    <p class="muted co-free" data-co-free hidden></p>
    <a class="link-btn" href="/cart" data-open-cart><span>تعديل السلة</span></a>
  </details>
  <template data-co-line><li class="co-line">
    <span class="co-thumb"><img alt="" width="48" height="60" decoding="async" referrerpolicy="no-referrer"></span>
    <span class="co-info"><span class="co-name"></span><span class="co-meta"></span><span class="cl-note" hidden></span></span>
    <bdi class="co-line-total"></bdi>
  </li></template>
</aside>`;
}

export function checkout() {
  return html`<div class="container checkout">
  <h1 class="checkout-title">إتمام الطلب</h1>
  <p class="muted checkout-sub">أربع خانات فقط، ونتصل بك لتأكيد الطلب. الدفع نقدًا عند الاستلام.</p>
  <noscript><p class="form-error">يحتاج إتمام الطلب إلى تفعيل JavaScript في المتصفح، أو راسلنا على واتساب.</p></noscript>
  <div class="empty" data-co-empty hidden>
    <p class="empty-title">سلتك فارغة</p>
    <p class="muted">أضف عطرًا إلى السلة ثم عُد إلى هنا لإتمام الطلب.</p>
    <div class="empty-links">${CATEGORIES.slice(0, 3).map((c) => html`<a class="chip chip-link" href="/c/${c.slug}">${c.ar}</a>`)}</div>
  </div>
  <div class="co-grid" data-co-main>
    ${summary()}
    <form class="co-form" action="/api/store/orders" method="post" novalidate data-checkout>
      <div class="form-error co-errors" role="alert" tabindex="-1" data-co-errors hidden>
        <p><strong>يرجى تصحيح ما يلي:</strong></p>
        <ul data-co-error-list></ul>
      </div>
      <fieldset class="co-fields">
        <legend class="co-legend">معلومات التوصيل</legend>
        ${field({ id: "co-name", label: "الاسم", input: html`<input id="co-name" name="name" autocomplete="name" required minlength="2" maxlength="80" enterkeyhint="next" aria-describedby="co-name-err">` })}
        ${field({ id: "co-phone", label: "رقم الهاتف", input: html`<input id="co-phone" name="phone" type="tel" inputmode="numeric" dir="ltr" autocomplete="tel" required placeholder="07XXXXXXXX" enterkeyhint="next" aria-describedby="co-phone-err">` })}
        ${field({ id: "co-city", label: "المحافظة", input: html`<select id="co-city" name="city" required aria-describedby="co-city-err">
          <option value="">اختر المحافظة</option>
          ${GOVERNORATES.map((g) => html`<option value="${g}">${g}</option>`)}
        </select>` })}
        ${field({ id: "co-address", label: "العنوان بالتفصيل", input: html`<textarea id="co-address" name="address" autocomplete="street-address" required minlength="5" maxlength="300" rows="2" placeholder="المنطقة، الشارع، رقم العمارة" aria-describedby="co-address-err"></textarea>` })}
        ${field({ id: "co-notes", label: "ملاحظات", hint: "(اختياري)", input: html`<textarea id="co-notes" name="notes" maxlength="500" rows="2" placeholder="مثال: الاتصال قبل الوصول" aria-describedby="co-notes-err"></textarea>` })}
      </fieldset>
      <div class="co-pay">${icon("wallet")}<span><strong>الدفع عند الاستلام</strong><span class="muted">تدفع نقدًا عند وصول طلبك، دون أي دفع مسبق.</span></span></div>
      <label class="co-remember"><input type="checkbox" name="remember" checked> تذكّر معلوماتي على هذا الجهاز</label>
      <div class="hp" aria-hidden="true"><label for="co-website">اتركه فارغًا</label><input id="co-website" name="website" tabindex="-1" autocomplete="off"></div>
      <p class="muted co-privacy">نستخدم بياناتك لتوصيل طلبك فقط، ولا نشاركها مع أي جهة.</p>
      <p class="form-error" role="alert" data-co-error hidden></p>
      <a class="btn btn-secondary btn-block" href="" target="_blank" rel="noopener" data-co-wa hidden>${icon("whatsapp")} أرسل طلبك عبر واتساب</a>
      <div class="co-bar">
        <p class="co-grand"><span>الإجمالي عند الاستلام</span> <bdi data-co-total-foot></bdi></p>
        <button class="btn btn-primary btn-block" type="submit" data-co-send>تأكيد الطلب</button>
      </div>
    </form>
  </div>
</div>`;
}

// /cart: the normal layout; cart.js opens the drawer on load. The button reopens it after a close.
export const cartPage = () => html`<div class="container error-page">
  <h1>سلة التسوق</h1>
  <p class="muted">راجع عطورك وأكمل طلبك في أقل من دقيقة.</p>
  <div class="error-links">
    <a class="btn btn-primary" href="/cart" data-open-cart>${icon("cart")} افتح السلة</a>
    <a class="btn btn-secondary" href="/">متابعة التسوق</a>
  </div>
</div>`;
