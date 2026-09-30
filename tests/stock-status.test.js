import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import Oil from "../backend/models/oil.model.js";
import Product from "../backend/models/product.model.js";
import { syncStockStatus } from "../backend/services/stockStatus.js";

let t, cookie;
before(async () => { t = await startTestApp(); cookie = await loginAs(t.url); await Oil.init(); });
after(() => t.close());

const api = (path, method = "GET", body) => fetch(`${t.url}/api${path}`, {
  method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const uid = () => `SS${Math.random().toString(36).slice(2, 8)}`;
const mkOil = (over = {}) => Oil.create({ id: uid(), oil_name: "زيت", oil_cost: 1, oil_quantity: 10, ...over });
const mkProduct = (oil_id, over = {}) => Product.create({
  p_name: `P ${uid()}`, p_image: ".", p_category: "Men", oil_id, oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 20 }], ...over,
});
const cleanup = async (oils, products) => { await Oil.deleteMany({ _id: { $in: oils.map((o) => o._id) } }); await Product.deleteMany({ _id: { $in: products.map((p) => p._id) } }); };

test("an oil at zero or below becomes out of stock, and available again after a restock; its products follow", async () => {
  const oil = await mkOil({ oil_quantity: 5 });
  const product = await mkProduct(oil.id);
  try {
    let res = await api(`/oils/${oil.id}`, "PUT", { oil_quantity: 0 });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.status, "out of stock", "the response already shows the synced status");
    assert.equal((await Product.findById(product._id)).status, "out of stock");

    res = await api(`/oils/${oil.id}`, "PUT", { add_quantity: 25 });
    assert.equal((await res.json()).data.status, "available");
    assert.equal((await Product.findById(product._id)).status, "available");

    await api(`/oils/${oil.id}`, "PUT", { oil_quantity: -3 });
    assert.equal((await Oil.findById(oil._id)).status, "out of stock", "owed (negative) stock counts as out");
  } finally { await cleanup([oil], [product]); }
});

test("discontinued oils and products are never touched", async () => {
  const oil = await mkOil({ oil_quantity: 0, status: "discontinued" });
  const product = await mkProduct(oil.id, { status: "discontinued" });
  try {
    await syncStockStatus();
    assert.equal((await Oil.findById(oil._id)).status, "discontinued");
    assert.equal((await Product.findById(product._id)).status, "discontinued");
  } finally { await cleanup([oil], [product]); }
});

test("creating an oil with no stock is stored as out of stock", async () => {
  const id = uid();
  const res = await api("/oils", "POST", { id, oil_name: "فارغ", oil_cost: 0, oil_quantity: 0 });
  assert.equal(res.status, 200);
  try { assert.equal((await Oil.findOne({ id })).status, "out of stock"); } finally { await Oil.deleteOne({ id }); }
});

test("a product whose oil does not exist counts as out of stock", async () => {
  const product = await mkProduct(`MISSING-${uid()}`);
  try {
    await syncStockStatus();
    assert.equal((await Product.findById(product._id)).status, "out of stock");
  } finally { await cleanup([], [product]); }
});

test("dry run reports what would change and writes nothing", async () => {
  const oil = await mkOil({ oil_quantity: 0 }); // status defaults to "available" while empty
  const product = await mkProduct(oil.id);
  try {
    const r = await syncStockStatus({ dryRun: true });
    assert.ok(r.oilsOut >= 1 && r.productsOut >= 1);
    assert.equal((await Oil.findById(oil._id)).status, "available", "dry run did not write");
    await syncStockStatus();
    assert.equal((await Oil.findById(oil._id)).status, "out of stock");
  } finally { await cleanup([oil], [product]); }
});
