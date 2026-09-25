import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";

let t;
before(async () => { t = await startTestApp(); await loginAs(t.url); });
after(() => t.close());

test("6th failed login within 15 min is 429", async () => {
  const bad = () => fetch(`${t.url}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "wrong" }),
  });
  for (let i = 0; i < 5; i++) assert.equal((await bad()).status, 401);
  assert.equal((await bad()).status, 429);
});
