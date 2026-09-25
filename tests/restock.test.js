import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Alcohol from "../backend/models/alcohol.model.js";
import Product from "../backend/models/product.model.js";

let t, cookie, ids;
before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
  await Oil.create({ id: "OIL1", oil_name: "Test Oil", oil_cost: 0.5, oil_quantity: 5 });
  const alcohol = await Alcohol.create({ name: "Ethanol", type: "perfumer", quantity: 1000, cost: 0.02 });
  const bottle = await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 10 });
  const product = await Product.create({
    p_name: "Test Perfume", p_image: "x", p_category: "c", oil_id: "OIL1",
    size_list: [{ size: "30ml", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
  });
  ids = { bottle: bottle._id.toString(), alcohol: alcohol._id.toString(), product: product._id.toString() };
});
after(() => t.close());

const api = (path, method = "GET", body) => fetch(`${t.url}/api${path}`, {
  method, headers: { cookie, "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test("owed oil stock is covered by an additive restock", async () => {
  const sale = await api("/orders", "POST", {
    products: [{ product_id: ids.product, size: "30ml", quantity: 2, price: 20, bottle_id: ids.bottle }],
    payment_method: "Cash",
  });
  assert.equal(sale.status, 201);
  assert.equal((await Oil.findOne({ id: "OIL1" })).oil_quantity, -7);

  const restock = await api("/oils/OIL1", "PUT", { add_quantity: 20 });
  assert.equal(restock.status, 200);
  assert.equal((await Oil.findOne({ id: "OIL1" })).oil_quantity, 13);
});

test("bottle add_quantity adds; negative or non-numeric is rejected", async () => {
  const before = (await Bottle.findById(ids.bottle)).quantity;
  const ok = await api(`/bottles/${ids.bottle}`, "PUT", { add_quantity: 3 });
  assert.equal(ok.status, 200);
  assert.equal((await Bottle.findById(ids.bottle)).quantity, before + 3);

  assert.equal((await api(`/bottles/${ids.bottle}`, "PUT", { add_quantity: -1 })).status, 400);
  assert.equal((await api(`/bottles/${ids.bottle}`, "PUT", { add_quantity: "abc" })).status, 400);
});

test("alcohol add_quantity adds", async () => {
  const before = (await Alcohol.findById(ids.alcohol)).quantity;
  const res = await api(`/alcohols/${ids.alcohol}`, "PUT", { add_quantity: 100 });
  assert.equal(res.status, 200);
  assert.equal((await Alcohol.findById(ids.alcohol)).quantity, before + 100);
});

test("plain edit still works: renaming an oil leaves its quantity untouched", async () => {
  const before = (await Oil.findOne({ id: "OIL1" })).oil_quantity;
  const res = await api("/oils/OIL1", "PUT", { oil_name: "Renamed" });
  assert.equal(res.status, 200);
  const oil = await Oil.findOne({ id: "OIL1" });
  assert.equal(oil.oil_name, "Renamed");
  assert.equal(oil.oil_quantity, before);
});

test("inventory report never counts negative (owed) stock as capital", async () => {
  await Oil.create({ id: "OIL2", oil_name: "Owed Oil", oil_cost: 0.5, oil_quantity: -7 });
  const res = await api("/reports/inventory");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.data.totals.oil_capital >= 0);
  const oilRow = body.data.oils.find((o) => o.id === "OIL2");
  assert.ok(oilRow.quantity < 0);
});
