import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";

import Product from "../backend/models/product.model.js";

let t, cookie;
before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
  await Product.init(); // build the unique p_name index before the duplicate test
});
after(() => t.close());

const api = (path, init = {}) => fetch(`${t.url}/api${path}`, {
  ...init, headers: { cookie, "Content-Type": "application/json", ...init.headers },
});

test("bad ObjectId is 400 Invalid id", async () => {
  for (const path of ["/products/xyz", "/orders/xyz", "/customers/xyz", "/bottles/xyz"]) {
    const res = await api(path);
    assert.equal(res.status, 400, path);
    assert.deepEqual(await res.json(), { success: false, message: "Invalid id" });
  }
});

test("missing record is 404", async () => {
  const res = await api("/products/64b7f0000000000000000000");
  assert.equal(res.status, 404);
});

test("negative stock (owed) is allowed, but negative cost/capacity is still rejected", async () => {
  // quantity has no min: it may go negative to represent stock the shop owes.
  const create = await api("/bottles", {
    method: "POST", body: JSON.stringify({ name: "B", capacity: 30, cost: 1, quantity: -1 }),
  });
  assert.equal(create.status, 201);
  const id = (await create.json()).data._id;
  const upd = await api(`/bottles/${id}`, { method: "PUT", body: JSON.stringify({ quantity: -3 }) });
  assert.equal(upd.status, 200);
  assert.equal((await upd.json()).data.quantity, -3);

  // cost and capacity keep their min: 0
  const badCost = await api("/bottles", {
    method: "POST", body: JSON.stringify({ name: "B2", capacity: 30, cost: -1, quantity: 5 }),
  });
  assert.equal(badCost.status, 400);
  const badCapacity = await api("/bottles", {
    method: "POST", body: JSON.stringify({ name: "B3", capacity: -30, cost: 1, quantity: 5 }),
  });
  assert.equal(badCapacity.status, 400);
});

test("500s never leak error details", async () => {
  // duplicate product name → 409 via central handler, not a raw Mongo error
  const body = JSON.stringify({ p_name: "Dup", p_image: ".", p_category: "Men", oil_id: "o1",
    size_list: [{ size: "30ml", price: 10 }], oil_percentage: 20, alcohol_percentage: 80 });
  await api("/products", { method: "POST", body });
  const res = await api("/products", { method: "POST", body });
  assert.equal(res.status, 409);
  assert.deepEqual(Object.keys(await res.json()).sort(), ["message", "success"]);
});
