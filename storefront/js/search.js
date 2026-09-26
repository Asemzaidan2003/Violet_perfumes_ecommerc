// Search overlay (every page). Entry module, no exports. Fetches the compact catalogue once, then
// filters it on every keystroke with the same shared search the /search page uses — no request
// per keystroke. Results are cloned from a <template> and filled with textContent only.
import { searchProducts } from "./shared/search.js";
import { money, perfumeCount } from "./shared/format.js";
import { CATEGORIES, FAMILIES } from "./shared/vocab.js";
import { loadCatalog } from "./shared/catalog-client.js";

const MAX_RESULTS = 8;
const PLACEHOLDER = "/assets/img/placeholder-bottle.svg" + new URL(import.meta.url).search;
const CATEGORY_AR = new Map(CATEGORIES.map((c) => [c.key, c.ar]));
const FAMILY_AR = new Map(FAMILIES.map((f) => [f.key, f.ar]));

const dialog = document.getElementById("search-overlay");
const input = dialog?.querySelector("#so-q");
const list = dialog?.querySelector("#so-results");
const status = dialog?.querySelector("[data-so-status]");
const all = dialog?.querySelector("[data-so-all]");
const suggest = dialog?.querySelector("[data-so-suggest]");
const itemTpl = dialog?.querySelector("template[data-so-item]");
const headerInput = document.querySelector(".header-row .search-field input");

let catalog = null; // compact index, fetched once per page view
let active = -1;
const nodes = new Map(); // product id -> <li>, reused so thumbnails don't flicker while typing

function load() {
  loadCatalog()
    .then((data) => { if (!catalog) { catalog = data; render(); } })
    .catch((err) => { console.warn(err); if (dialog.open && input.value.trim()) say("تعذّر تحميل البحث الفوري — اضغط Enter للبحث"); });
}

const say = (text) => { status.textContent = text; };

function nodeFor(p) {
  let li = nodes.get(p.id);
  if (li) return li;
  li = itemTpl.content.firstElementChild.cloneNode(true);
  const a = li.querySelector("a");
  a.href = `/p/${encodeURIComponent(p.id)}`;
  a.id = `so-opt-${p.id}`;
  const img = li.querySelector("img");
  img.src = p.thumb || p.image || PLACEHOLDER;
  if (!p.image) img.classList.add("is-placeholder");
  li.querySelector(".so-name").textContent = p.name;
  const inStock = p.sizes.some((s) => s.in_stock);
  li.querySelector(".so-meta").textContent = [CATEGORY_AR.get(p.category), FAMILY_AR.get(p.families[0]), inStock ? "" : "غير متوفر حاليًا"]
    .filter(Boolean).join(" · ");
  const cheapest = Math.min(...p.sizes.map((s) => s.final));
  if (p.sizes.length) li.querySelector(".so-price").textContent = `${p.sizes.length > 1 ? "من " : ""}${money(cheapest)}`;
  nodes.set(p.id, li);
  return li;
}

function setActive(i) {
  const options = [...list.querySelectorAll("[role=option]")];
  const m = options.length + 1; // -1 (back in the field) .. last option, wrapping
  active = (((i + 1) % m) + m) % m - 1;
  options.forEach((o, n) => o.setAttribute("aria-selected", String(n === active)));
  const current = options[active];
  if (current) {
    input.setAttribute("aria-activedescendant", current.id);
    current.scrollIntoView({ block: "nearest" });
  } else input.removeAttribute("aria-activedescendant");
}

function render() {
  const q = input.value.trim();
  all.href = `/search?q=${encodeURIComponent(q)}`;
  if (!q) {
    list.replaceChildren();
    all.hidden = true;
    suggest.hidden = false;
    input.setAttribute("aria-expanded", "false");
    setActive(-1);
    return say("");
  }
  if (!catalog) { load(); return say("جارٍ البحث…"); }
  const results = searchProducts(catalog, q);
  list.replaceChildren(...results.slice(0, MAX_RESULTS).map(nodeFor));
  input.setAttribute("aria-expanded", String(results.length > 0));
  all.hidden = results.length === 0;
  suggest.hidden = results.length > 0;
  setActive(-1);
  say(results.length ? perfumeCount(results.length) : `لا نتائج لـ «${q}» — جرّب عائلة عطرية أو قسمًا`);
}

function open(value) {
  if (!dialog || dialog.open) return;
  if (typeof value === "string") input.value = value;
  dialog.showModal();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  load();
  render();
}

const close = () => dialog.close();

if (dialog) {
  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(active + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      list.querySelectorAll("[role=option]")[active]?.click();
    } else if (e.key === "Escape") {
      e.preventDefault(); // one Esc closes (a search input would otherwise first clear itself)
      close();
    }
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-close-search]")) close();
  });
  dialog.addEventListener("close", () => { if (headerInput) headerInput.value = input.value; });

  // Openers: the header field (typing or clicking in it), icons/links, and "/" on a keyboard.
  // Focus alone doesn't open it, so tabbing through the header never traps anyone in a modal.
  headerInput?.addEventListener("input", () => open(headerInput.value));
  headerInput?.addEventListener("click", () => open(headerInput.value));
  headerInput?.addEventListener("focus", load, { once: true }); // warm the catalogue early
  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-open-search]");
    if (!opener || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    open();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || dialog.open) return;
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || document.querySelector("dialog[open]")) return;
    e.preventDefault();
    open();
  });
}
