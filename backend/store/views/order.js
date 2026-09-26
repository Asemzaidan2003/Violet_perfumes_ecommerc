// /order/:ref: thank-you page. Rendered from publicOrder() only, so it can never show the
// delivery snapshot (name, phone, address), costs or ids.
import { html } from "../html.js";
import { icon } from "./components.js";
import { money, num, sizeLabel } from "../../../storefront/js/shared/format.js";

export function orderConfirmation({ order, settings }) {
  const ref = `NS-${order.ref}`;
  const wa = settings.whatsapp
    ? `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`مرحبًا نسمات، أرسلت طلبًا من الموقع رقمه ${ref}`)}`
    : "";
  return html`<div class="container order-page">
  <section class="order-hero">
    <span class="done-mark" aria-hidden="true"></span>
    <h1 class="checkout-title">شكرًا لك، وصلنا طلبك</h1>
    <p class="order-ref">رقم الطلب <bdi dir="ltr">${ref}</bdi></p>
    <p class="muted">سنتواصل معك قريبًا لتأكيد طلبك وموعد التوصيل. الدفع نقدًا عند الاستلام.</p>
  </section>
  <section class="order-box" aria-labelledby="order-items-title">
    <h2 id="order-items-title" class="co-summary-title">تفاصيل الطلب</h2>
    <ul class="co-lines" role="list">
      ${order.items.map((i) => html`<li class="co-line">
        <span class="co-info"><span class="co-name">${i.name}</span><span class="co-meta"><bdi>${sizeLabel(i.size)}</bdi> × <bdi>${num(i.quantity)}</bdi> · <bdi>${money(i.price)}</bdi></span></span>
        <bdi class="co-line-total">${money(i.line_total)}</bdi>
      </li>`)}
    </ul>
    <dl class="totals">
      <div><dt>المجموع الفرعي</dt><dd><bdi>${money(order.subtotal)}</bdi></dd></div>
      ${order.discount ? html`<div><dt>الخصم</dt><dd><bdi>−${money(order.discount)}</bdi></dd></div>` : ""}
      <div><dt>التوصيل</dt><dd><bdi>${order.delivery_fee ? money(order.delivery_fee) : "مجاني"}</bdi></dd></div>
      <div class="totals-grand"><dt>الإجمالي عند الاستلام</dt><dd><bdi>${money(order.total)}</bdi></dd></div>
    </dl>
  </section>
  <div class="order-actions">
    ${wa ? html`<a class="btn btn-primary" href="${wa}" target="_blank" rel="noopener">${icon("whatsapp")} تابع طلبك عبر واتساب</a>` : ""}
    <a class="btn btn-secondary" href="/">متابعة التسوق</a>
  </div>
</div>`;
}
