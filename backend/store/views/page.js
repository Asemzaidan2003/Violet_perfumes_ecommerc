// A single admin-authored content page (/page/:slug): title + the safe-markup body.
import { html, raw } from "../html.js";
import { renderMarkup } from "../markup.js";

export const pageView = (page) => html`<article class="container page-body" aria-labelledby="page-title">
  <h1 id="page-title">${page.title}</h1>
  <div class="page-content">${raw(renderMarkup(page.body))}</div>
</article>`;
