import Oil from "../models/oil.model.js";
import Product from "../models/product.model.js";
import { invalidateCatalog } from "../store/catalog.js";

// Keeps the stored `status` in step with stock. Oils: quantity <= 0 -> "out of stock", > 0 -> "available".
// Products follow their oil: out when the oil is out (or missing/empty), back to "available" once it is restocked.
// "discontinued" is a manual decision and is never touched. Ordering is never blocked by this (see order.service.js).
// dryRun only counts what would change.
export async function syncStockStatus({ dryRun = false } = {}) {
  const run = (Model, filter, status) => (dryRun ? Model.countDocuments(filter) : Model.updateMany(filter, { $set: { status } }).then((r) => r.modifiedCount));
  const oilsOut = await run(Oil, { status: "available", oil_quantity: { $lte: 0 } }, "out of stock");
  const oilsBack = await run(Oil, { status: "out of stock", oil_quantity: { $gt: 0 } }, "available");
  // Computed after the oil update so products see the new oil statuses (in a dry run, from the quantities directly).
  const inStock = (await Oil.find({ oil_quantity: { $gt: 0 }, status: { $ne: "discontinued" } }).distinct("id")).map(String);
  const productsOut = await run(Product, { status: "available", oil_id: { $nin: inStock } }, "out of stock");
  const productsBack = await run(Product, { status: "out of stock", oil_id: { $in: inStock } }, "available");
  if (!dryRun) invalidateCatalog();
  return { oilsOut, oilsBack, productsOut, productsBack };
}

// For request paths: a failure here must never fail the stock change that already committed.
export async function syncStockStatusSafe() {
  try {
    return await syncStockStatus();
  } catch (err) {
    console.error("stock status sync failed:", err.message);
    return null;
  }
}
