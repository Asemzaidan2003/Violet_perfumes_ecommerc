// Arabic-aware product search — one pure module for the server-rendered /search page and the
// browser overlay, so both return identical results. Works on compact-index items.
import { FAMILIES } from "./vocab.js";

const FAMILY_LABELS = new Map(FAMILIES.map((f) => [f.key, `${f.ar} ${f.key}`]));
const PREFIXES = ["وال", "بال", "ال", "لل"];

export function normalize(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "") // harakat, dagger alef, tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىئ]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0)
    .toLowerCase();
}

const stripPrefix = (t) => {
  if (t.length <= 3) return t;
  const p = PREFIXES.find((x) => t.startsWith(x) && t.length - x.length >= 2);
  return p ? t.slice(p.length) : t;
};

export const tokens = (s) => normalize(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stripPrefix);

// Field tokens per product, computed once per object (the overlay searches on every keystroke).
const fieldCache = new WeakMap();
function fields(p) {
  let f = fieldCache.get(p);
  if (!f) {
    const notes = p.notes ? [p.notes.top, p.notes.heart, p.notes.base].flat().filter(Boolean).join(" ") : "";
    f = {
      name: tokens(p.name),
      keywords: tokens(p.keywords),
      other: tokens(`${(p.families || []).map((k) => FAMILY_LABELS.get(k) || "").join(" ")} ${notes}`),
    };
    fieldCache.set(p, f);
  }
  return f;
}

const hit = (list, q) => list.some((t) => t.startsWith(q));
const byRank = (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9);

// Every query token must prefix-match a token of the name, keywords, family labels or notes.
// Tier: 0 name-prefix, 1 name, 2 keywords, 3 families/notes (a product takes its weakest token's tier).
export function searchProducts(products, query) {
  const q = tokens(query);
  if (!q.length) return [];
  const scored = [];
  for (const p of products) {
    const f = fields(p);
    let tier = 0;
    for (const t of q) {
      const best = hit(f.name, t) ? 1 : hit(f.keywords, t) ? 2 : hit(f.other, t) ? 3 : 0;
      if (!best) { tier = -1; break; }
      tier = Math.max(tier, best);
    }
    if (tier < 0) continue;
    const namePrefix = q.every((t, i) => f.name[i]?.startsWith(t));
    scored.push({ p, tier: namePrefix ? 0 : tier });
  }
  return scored.sort((a, b) => a.tier - b.tier || byRank(a.p, b.p)).map((s) => s.p);
}
