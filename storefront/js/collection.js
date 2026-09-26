// Collection pages: filter and sort the server-rendered grid instantly (cards carry data-*), and
// keep the URL deep-linkable with history.replaceState. Same rules as backend/store/views/collection.js.
import { perfumeCount } from "./shared/format.js";

const form = document.querySelector("[data-filters]");
const grid = document.querySelector("[data-grid]");

const words = (el, key) => (el.dataset[key] || "").split(" ").filter(Boolean);
const n = (el, key) => Number(el.dataset[key]);
const COMPARE = {
  relevance: (a, b) => n(a, "rel") - n(b, "rel"),
  best: (a, b) => n(a, "best") - n(b, "best"),
  new: (a, b) => n(b, "created") - n(a, "created") || n(a, "best") - n(b, "best"),
  price_asc: (a, b) => n(a, "price") - n(b, "price") || n(a, "best") - n(b, "best"),
  price_desc: (a, b) => n(b, "price") - n(a, "price") || n(a, "best") - n(b, "best"),
};

function matches(li, { f, s, stock }) {
  if (f.length && !words(li, "families").some((k) => f.includes(k))) return false;
  if (s.length && !words(li, "sizes").some((x) => s.includes(x))) return false;
  if (stock && !words(li, "stock").some((x) => !s.length || s.includes(x))) return false;
  return true;
}

if (form && grid) {
  const items = [...grid.children];
  const count = document.querySelector("[data-count]");
  const empty = document.querySelector("[data-empty]");
  const clear = empty?.querySelector("[data-clear]");
  const defaultSort = form.dataset.defaultSort;
  form.classList.add("is-live"); // hides the no-JS "apply" button

  const apply = () => {
    const data = new FormData(form);
    const filter = { f: data.getAll("f"), s: data.getAll("s"), stock: data.has("stock") };
    const sort = data.get("sort") || defaultSort;
    let shown = 0;
    for (const li of items) {
      li.hidden = !matches(li, filter);
      if (!li.hidden) shown++;
    }
    grid.append(...items.sort(Object.hasOwn(COMPARE, sort) ? COMPARE[sort] : COMPARE.best));
    count.textContent = perfumeCount(shown);
    empty.hidden = shown > 0;
    if (clear) clear.hidden = !(filter.f.length || filter.s.length || filter.stock);

    const params = [];
    const q = data.get("q");
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    if (filter.f.length) params.push(`f=${filter.f.map(encodeURIComponent).join(",")}`);
    if (filter.s.length) params.push(`s=${filter.s.map(encodeURIComponent).join(",")}`);
    if (filter.stock) params.push("stock=1");
    if (sort !== defaultSort) params.push(`sort=${encodeURIComponent(sort)}`);
    history.replaceState(history.state, "", `${location.pathname}${params.length ? `?${params.join("&")}` : ""}`);
  };

  form.addEventListener("change", apply);
  form.addEventListener("submit", (e) => { e.preventDefault(); apply(); });
  clear?.addEventListener("click", (e) => {
    e.preventDefault();
    for (const box of form.querySelectorAll("input[type=checkbox]")) box.checked = false;
    apply();
  });
  // Restored from the back/forward cache or autofilled: make the grid match the controls.
  addEventListener("pageshow", (e) => { if (e.persisted) apply(); });
}
