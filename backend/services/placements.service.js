import Placement, { validLink } from "../models/placement.model.js";

export { validLink };

const CACHE_TTL_MS = 60_000;
let cache = null; // { at, rows } — rows are the currently-active lean rows, re-fetched every 60s

// Live = active, and now is inside [starts_at, ends_at) when those bounds are set.
export function isLive(placement, now = new Date()) {
  if (!placement.active) return false;
  if (placement.starts_at && now < placement.starts_at) return false;
  if (placement.ends_at && !(now < placement.ends_at)) return false;
  return true;
}

// Cached 60s at the "active" level; isLive() re-checked per call so a window edge inside
// that 60s window is still respected without needing a fresh DB round trip.
export async function getLivePlacements() {
  if (!cache || Date.now() - cache.at >= CACHE_TTL_MS) {
    const rows = await Placement.find({ active: true }).sort({ sort: 1, createdAt: 1 }).lean();
    cache = { at: Date.now(), rows };
  }
  return cache.rows.filter((p) => isLive(p));
}

export function invalidatePlacements() {
  cache = null;
}

// Placements for one slot; collection_banner/grid_tile are further filtered by target. An empty
// target matches every page. A set target matches when ANY of its set fields equals the page's
// value (OR): { category: "men", family: "oud" } shows on /c/men and on /family/oud.
export function forSlot(placements, slot, target = {}) {
  const targeted = slot === "collection_banner" || slot === "grid_tile";
  return placements.filter((p) => {
    if (p.slot !== slot) return false;
    if (!targeted) return true;
    const t = p.target || {};
    if (!t.category && !t.family) return true;
    return Boolean((t.category && t.category === target.category) || (t.family && t.family === target.family));
  });
}
