import Product from "../models/product.model.js";
import Oil from "../models/oil.model.js";
import Bottle from "../models/bottle.model.js";
import Order from "../models/order.model.js";
import { effectivePrice, liveOffer } from "../catalog/pricing.js";

const CATALOG_TTL_MS = 30_000;
const RANKS_TTL_MS = 10 * 60_000;
const BEST_SELLER_WINDOW_MS = 90 * 24 * 60 * 60_000;

let catalogCache = null; // { at, data }
let ranksCache = null; // { at, ranks }

export function invalidateCatalog() {
  catalogCache = null;
}

// Display only — ordering is never blocked. Returns { [size]: boolean } for the product's sizes.
export function computeAvailability(product, oilsById, bottlesByCapacity) {
  const availability = {};
  const closed = product.status === "discontinued" || product.status === "out of stock";
  for (const entry of product.size_list) {
    if (closed) {
      availability[entry.size] = false;
      continue;
    }
    const ml = parseFloat(entry.size);
    const oil = oilsById.get(product.oil_id);
    const hasOil = Boolean(oil) && oil.oil_quantity >= (product.oil_percentage / 100) * ml;
    const bottles = bottlesByCapacity.get(ml);
    const hasBottle = Array.isArray(bottles) && bottles.some((b) => b.quantity >= 1);
    availability[entry.size] = hasOil && hasBottle;
  }
  return availability;
}

export function toPublic(product, availability, rank, now = new Date()) {
  const sizes = product.size_list.map((entry) => ({
    size: entry.size,
    list: entry.price,
    final: effectivePrice(product, entry, now),
    in_stock: Boolean(availability[entry.size]),
  }));
  const image = product.p_image === "." ? null : product.p_image;
  const thumb = image && /^\/img\//.test(image) ? image.replace(/\.(webp|jpg|png)$/, "-480.$1") : image;
  const offer = liveOffer(product, now);
  return {
    id: String(product._id),
    name: product.p_name,
    image,
    thumb,
    images: product.images || [],
    category: product.p_category,
    families: product.families || [],
    notes: product.notes,
    description: product.description,
    keywords: product.keywords,
    offer,
    // ponytail: null unless the offer is live and has an end, so the countdown chip never
    // shows for an expired or open-ended offer. The 30 s catalogue cache may keep an
    // expired offer visible up to 30 s longer — acceptable, because placeOrder charges
    // from the DB product via effectivePrice, not from this cached projection.
    offer_ends_at: offer > 0 && product.offer_ends_at ? new Date(product.offer_ends_at).toISOString() : null,
    sizes,
    in_stock: sizes.some((s) => s.in_stock),
    rank: rank ?? null,
    created: product.createdAt,
  };
}

// Best-selling products from completed orders in the last 90 days -> Map(product_id -> rank 1..n).
export async function getBestSellerRanks() {
  if (ranksCache && Date.now() - ranksCache.at < RANKS_TTL_MS) return ranksCache.ranks;
  const since = new Date(Date.now() - BEST_SELLER_WINDOW_MS);
  const rows = await Order.aggregate([
    { $match: { status: "completed", createdAt: { $gte: since } } },
    { $unwind: "$products" },
    { $group: { _id: "$products.product_id", qty: { $sum: "$products.quantity" } } },
    { $sort: { qty: -1 } },
  ]);
  const ranks = new Map(rows.map((r, i) => [String(r._id), i + 1]));
  ranksCache = { at: Date.now(), ranks };
  return ranks;
}

function sortByRankThenNewest(a, b) {
  if (a.rank != null && b.rank != null) return a.rank - b.rank;
  if (a.rank != null) return -1;
  if (b.rank != null) return 1;
  return new Date(b.created) - new Date(a.created);
}

// Loads products/oils/bottles, builds public projections, sorts by rank then newest. Cached ≤ 30s.
export async function getCatalog() {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.data;

  const [products, oils, bottles, ranks] = await Promise.all([
    Product.find({ status: { $ne: "discontinued" } }).lean(),
    Oil.find({}).lean(),
    Bottle.find({}).lean(),
    getBestSellerRanks(),
  ]);

  const oilsById = new Map(oils.map((o) => [o.id, o]));
  const bottlesByCapacity = new Map();
  for (const b of bottles) {
    const list = bottlesByCapacity.get(b.capacity) || [];
    list.push(b);
    bottlesByCapacity.set(b.capacity, list);
  }

  const now = new Date();
  const publicProducts = products
    .map((p) => toPublic(p, computeAvailability(p, oilsById, bottlesByCapacity), ranks.get(String(p._id)) ?? null, now))
    .sort(sortByRankThenNewest);

  const byId = new Map(publicProducts.map((p) => [p.id, p]));
  catalogCache = { at: Date.now(), data: { products: publicProducts, byId } };
  return catalogCache.data;
}

export function compactIndex(products) {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    image: p.image,
    thumb: p.thumb,
    category: p.category,
    families: p.families,
    keywords: p.keywords,
    notes: p.notes, // searched by the overlay exactly as by the server-rendered /search
    offer: p.offer,
    offer_ends_at: p.offer_ends_at,
    sizes: p.sizes.map((s) => ({ size: s.size, final: s.final, list: s.list, in_stock: s.in_stock })),
    rank: p.rank,
    created: p.created,
  }));
}
