import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Alcohol from "../backend/models/alcohol.model.js";
import Product from "../backend/models/product.model.js";

let t, cookie, hidden, visible, noField, bottleId;

before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);

  await Alcohol.create({ name: "Ethanol", type: "perfumer", quantity: 1000, cost: 0.02 });
  await Oil.create({ id: "OIL_OK", oil_name: "Oud", oil_cost: 1, oil_quantity: 100 });
  bottleId = String((await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 5 }))._id);

  hidden = await Product.create({
    p_name: "Hidden Musk", p_image: ".", p_category: "Men", oil_id: "OIL_OK",
    size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
    visible: false,
  });
  visible = await Product.create({
    p_name: "Visible Amber", p_image: ".", p_category: "Men", oil_id: "OIL_OK",
    size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
    visible: true,
  });
  noField = await Product.create({
    p_name: "Legacy Rose", p_image: ".", p_category: "Women", oil_id: "OIL_OK",
    size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
  });
});

after(() => t.close());

test("hidden product is absent from home, category, search, catalog api and sitemap; a legacy product with no visible field still shows", async () => {
  const home = await (await fetch(`${t.url}/`)).text();
  assert.ok(!home.includes("Hidden Musk"));
  assert.ok(home.includes("Visible Amber"));
  assert.ok(home.includes("Legacy Rose"));

  const aisle = await (await fetch(`${t.url}/c/men`)).text();
  assert.ok(!aisle.includes("Hidden Musk"));
  assert.ok(aisle.includes("Visible Amber"));

  const search = await (await fetch(`${t.url}/search?q=Musk`)).text();
  assert.ok(!search.includes("Hidden Musk"));

  const api = await (await fetch(`${t.url}/api/store/catalog`)).json();
  const ids = api.data.map((p) => p.id);
  assert.ok(!ids.includes(String(hidden._id)));
  assert.ok(ids.includes(String(visible._id)));
  assert.ok(ids.includes(String(noField._id)));

  const sitemap = await (await fetch(`${t.url}/sitemap.xml`)).text();
  assert.ok(!sitemap.includes(`/p/${hidden._id}`));
  assert.ok(sitemap.includes(`/p/${visible._id}`));
});

test("GET /p/:id 404s for a hidden product", async () => {
  const res = await fetch(`${t.url}/p/${hidden._id}`);
  assert.equal(res.status, 404);
});

test("public online order for a hidden product 404s", async () => {
  const res = await fetch(`${t.url}/api/store/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ product_id: String(hidden._id), size: "30", quantity: 1 }],
      customer: { name: "Test Customer", phone: "0791234567", city: "عمّان", address: "شارع الملكة رانيا 1" },
      client_key: "11111111-1111-4111-8111-111111111111",
    }),
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.message, "المنتج غير متوفر");
});

test("public store-interest request for a hidden product 404s", async () => {
  const res = await fetch(`${t.url}/api/store/interest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: String(hidden._id), name: "Test", phone: "0790000000" }),
  });
  assert.equal(res.status, 404);
});

test("POS order for a hidden product still succeeds", async () => {
  const res = await fetch(`${t.url}/api/orders`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      products: [{ product_id: String(hidden._id), size: "30", quantity: 1, bottle_id: bottleId }],
      payment_method: "Cash",
    }),
  });
  // Availability/stock rules are unrelated to visibility — just confirm it isn't blocked as 404 "unavailable".
  assert.notEqual(res.status, 404);
});

test("PUT /api/products/:id toggling visible invalidates the catalog cache immediately", async () => {
  const put = await fetch(`${t.url}/api/products/${visible._id}`, {
    method: "PUT",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ visible: false }),
  });
  assert.equal(put.status, 200);

  const api = await (await fetch(`${t.url}/api/store/catalog`)).json();
  const ids = api.data.map((p) => p.id);
  assert.ok(!ids.includes(String(visible._id)));
});
