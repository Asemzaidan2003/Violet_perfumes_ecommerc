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

const words = (s) => normalize(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
export const tokens = (s) => words(s).map(stripPrefix);
// Each word in both spellings, raw and prefix-stripped: a half-typed "الع" is still raw (too short
// to strip) and must reach "العود", while a fully typed "الشانيل" must reach "شانيل".
const forms = (s) => words(s).map((w) => [...new Set([w, stripPrefix(w)])]);

// Field tokens per product, computed once per object (the overlay searches on every keystroke).
const fieldCache = new WeakMap();
function fields(p) {
  let f = fieldCache.get(p);
  if (!f) {
    const notes = p.notes ? [p.notes.top, p.notes.heart, p.notes.base].flat().filter(Boolean).join(" ") : "";
    const brandNames = p.brand ? `${p.brand.name_ar || ""} ${p.brand.name_en || ""}` : "";
    const nameWords = forms(p.name);
    f = {
      nameWords,
      name: nameWords.flat(),
      keywords: forms(p.keywords).flat(),
      other: forms(`${(p.families || []).map((k) => FAMILY_LABELS.get(k) || "").join(" ")} ${notes} ${brandNames}`).flat(),
    };
    fieldCache.set(p, f);
  }
  return f;
}

// `q` is one query word in its forms; it hits when any form prefixes any field token.
const hit = (list, q) => list.some((t) => q.some((x) => t.startsWith(x)));
const byRank = (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9);

// Every query token must prefix-match a token of the name, keywords, family labels or notes.
// Tier: 0 name-prefix, 1 name, 2 keywords, 3 families/notes (a product takes its weakest token's tier).
export function searchProducts(products, query) {
  const q = forms(query);
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
    const namePrefix = q.every((t, i) => f.nameWords[i] && hit(f.nameWords[i], t));
    scored.push({ p, tier: namePrefix ? 0 : tier });
  }
  return scored.sort((a, b) => a.tier - b.tier || byRank(a.p, b.p)).map((s) => s.p);
}
