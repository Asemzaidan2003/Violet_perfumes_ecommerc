import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import Interest from "../models/interest.model.js";
import { getCatalog, compactIndex, invalidateCatalog } from "../store/catalog.js";
import { getSettings, getCachedSettings } from "../services/settings.service.js";
import { placeOrder, publicOrder } from "../services/order.service.js";
import { validateOrderBody, validateInterestBody } from "../store/validate.js";
import { fail } from "../utils/fail.js";

// GET /api/store/catalog — public compact index for the search overlay and cart pricing.
export const getPublicCatalog = async (req, res) => {
  const { products } = await getCatalog();
  res.set("Cache-Control", "public, max-age=30").status(200).json({ success: true, data: compactIndex(products) });
};

// Rate-limit message for `limit()`: includes the shop's WhatsApp link when one is set, from the
// last-loaded settings cache (the limiter middleware itself must stay synchronous).
export const waLimitMessage = (base) => () => {
  const { whatsapp } = getCachedSettings();
  return whatsapp ? `${base} — تواصل معنا على واتساب: https://wa.me/${whatsapp}` : base;
};

// Runs before `limit(...)` on every public store route, so the settings cache behind
// `waLimitMessage` is always fresh by the time the limiter can fire — including for the very
// request that gets blocked, and even if the shop has never placed an order.
export const warmSettings = async (req, res, next) => {
  try {
    req.settings = await getSettings();
    next();
  } catch (err) {
    next(err);
  }
};

// POST /api/store/orders — place an online order (public, no auth).
export const createStoreOrder = async (req, res) => {
  const { items, customer, client_key } = validateOrderBody(req.body);
  const settings = req.settings ?? await getSettings();
  try {
    const { order, replay } = await placeOrder({
      products: items,
      client_key,
      delivery: customer,
      delivery_policy: { fee: settings.delivery_fee, free_over: settings.free_delivery_over },
    }, "online");
    invalidateCatalog();
    res.status(replay ? 200 : 201).json({ success: true, data: publicOrder(order) });
  } catch (err) {
    if (err?.code === 11000 && err.keyPattern?.client_key) {
      const existing = await Order.findOne({ client_key });
      return res.status(200).json({ success: true, data: publicOrder(existing) });
    }
    throw err;
  }
};

// POST /api/store/interest — "I'm interested" request; dedupes while the request stays "new".
export const createStoreInterest = async (req, res) => {
  const { product_id, size, name, phone, note } = validateInterestBody(req.body);
  const product = await Product.findById(product_id);
  if (!product || product.status === "discontinued") throw fail(404, "المنتج غير متوفر");
  if (size && !product.size_list.some((s) => s.size === size)) throw fail(400, "الحجم غير متوفر لهذا العطر");

  await Interest.findOneAndUpdate(
    { phone, product_id, size: size ?? null, status: "new" },
    { $set: { name, note, product_name: product.p_name } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.status(201).json({ success: true });
};
