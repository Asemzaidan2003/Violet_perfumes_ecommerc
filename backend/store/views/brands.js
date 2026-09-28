// /brands: index of every active brand with at least one visible product.
import { html } from "../html.js";
import { num } from "../../../storefront/js/shared/format.js";

export function brandsIndex(rows) {
  return html`<div class="container section">
  <div class="section-head"><h1 class="section-title">المصممون</h1></div>
  <ul class="designer-tiles" role="list">
    ${rows.map(({ brand, count }) => html`<li><a class="designer-tile" href="/brand/${brand.slug}">${
      brand.logo ? html`<img src="${brand.logo}" alt="${brand.name_ar}" width="64" height="64" loading="lazy">`
        : html`<span class="designer-name-fallback">${brand.name_ar}</span>`
    }<span class="designer-label">${brand.name_ar}</span><span class="muted"><bdi>${num(count)}</bdi> منتج</span></a></li>`)}
  </ul>
</div>`;
}
