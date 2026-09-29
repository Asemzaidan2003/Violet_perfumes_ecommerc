import Category from "../models/category.model.js";
import { CATEGORIES as DEFAULT_CATEGORIES } from "../../storefront/js/shared/vocab.js";

const CACHE_TTL_MS = 30_000; // catalog-style TTL
let cache = null; // { at, rows }

// Same shape as a Category doc, for the tests-that-don't-seed / empty-DB fallback.
const FALLBACK = DEFAULT_CATEGORIES.map((c, i) => ({
  _id: c.key, key: c.key, slug: c.slug, name_ar: c.ar, name_en: "", icon: null, image: null, sort: i, visible: true,
}));

export function invalidateCategories() {
  cache = null;
}

// All categories, sorted; falls back to the vocab.js defaults when the collection is empty
// (e.g. tests that don't call seedDefaultCategories).
export async function getCategories() {
  if (!cache || Date.now() - cache.at >= CACHE_TTL_MS) {
    const rows = await Category.find({}).sort({ sort: 1, createdAt: 1 }).lean();
    cache = { at: Date.now(), rows: rows.length ? rows : FALLBACK };
  }
  return cache.rows;
}

export async function getVisibleCategories() {
  return (await getCategories()).filter((c) => c.visible !== false);
}

// Idempotent: only runs when the collection is empty. Called from the real app's startup path
// only (never from tests) — see backend/server.js.
export async function seedDefaultCategories() {
  if (await Category.exists({})) return;
  const rows = DEFAULT_CATEGORIES.map((c, i) => ({ key: c.key, slug: c.slug, name_ar: c.ar, sort: i }));
  await Category.insertMany(rows, { ordered: false }).catch((err) => {
    // Duplicate-key races between concurrent startups are fine to ignore; anything else rethrows.
    if (err?.code !== 11000 && !err?.writeErrors?.every((w) => w.code === 11000)) throw err;
  });
}
