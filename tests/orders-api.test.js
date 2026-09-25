import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import { placeOrder } from "../backend/services/order.service.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Alcohol from "../backend/models/alcohol.model.js";
import Product from "../backend/models/product.model.js";

let t, cookie, ids;
before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
  await Oil.create({ id: "OIL1", oil_name: "Test Oil", oil_cost: 0.5, oil_quantity: 100 });
  await Alcohol.create({ name: "Ethanol", type: "perfumer", quantity: 1000, cost: 0.02 });
  const bottle = await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 10 });
  const product = await Product.create({
    p_name: "Test Perfume", p_image: "x", p_category: "Men", oil_id: "OIL1",
    size_list: [{ size: "30ml", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
  });
  ids = { bottle: bottle._id.toString(), product: product._id.toString() };
});
after(() => t.close());

const api = (path, method = "GET", body) => fetch(`${t.url}/api${path}`, {
  method, headers: { cookie, "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test("POST /api/orders creates a confirmed POS order and reports shortages", async () => {
  const res = await api("/orders", "POST", {
    products: [{ product_id: ids.product, size: "30", quantity: 1, price: 20, bottle_id: ids.bottle }],
    payment_method: "Cash",
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.data.stock_deducted, true);
  assert.deepEqual(body.shortages, []);
  assert.equal((await Oil.findOne({ id: "OIL1" })).oil_quantity, 94);
});

test("status rules and confirm endpoint over HTTP", async () => {
  const { order } = await placeOrder({ products: [{ product_id: ids.product, size: "30", quantity: 1 }] }, "online");
  const blocked = await api(`/orders/${order._id}`, "PUT", { status: "completed" });
  assert.equal(blocked.status, 409);
  assert.deepEqual(Object.keys(await blocked.json()).sort(), ["message", "success"]);

  const confirmed = await api(`/orders/${order._id}/confirm`, "POST", { lines: [{ bottle_id: ids.bottle }] });
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).data.stock_deducted, true);

  assert.equal((await api(`/orders/${order._id}`, "PUT", { status: "completed" })).status, 200);
  assert.equal((await api(`/orders/${order._id}`, "DELETE")).status, 200);
  assert.equal((await api(`/orders/${order._id}`)).status, 404);
});

test("missing status is 400", async () => {
  const { order } = await placeOrder({ products: [{ product_id: ids.product, size: "30", quantity: 1, bottle_id: ids.bottle }] }, "pos");
  assert.equal((await api(`/orders/${order._id}`, "PUT", {})).status, 400);
});
