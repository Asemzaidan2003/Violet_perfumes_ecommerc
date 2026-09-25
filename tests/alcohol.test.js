import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";

let t, cookie;
before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
});
after(() => t.close());

const api = (path, init = {}) => fetch(`${t.url}/api${path}`, {
  ...init, headers: { cookie, "Content-Type": "application/json", ...init.headers },
});

test("PUT /api/alcohols/:id updates the quantity", async () => {
  const create = await api("/alcohols", {
    method: "POST",
    body: JSON.stringify({ name: "Ethanol", type: "perfume-grade", quantity: 100, cost: 2 }),
  });
  assert.equal(create.status, 201);
  const alcohol = await create.json();

  const upd = await api(`/alcohols/${alcohol._id}`, {
    method: "PUT", body: JSON.stringify({ quantity: 75 }),
  });
  assert.equal(upd.status, 200);
  const updated = await upd.json();
  assert.equal(updated.quantity, 75);
});
