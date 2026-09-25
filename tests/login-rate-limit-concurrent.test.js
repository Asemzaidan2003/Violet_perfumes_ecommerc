import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";

// Own file → own process → fresh limiter, so this doesn't interact with the
// sequential 429 test in login-rate-limit.test.js.
let t;
before(async () => { t = await startTestApp(); await loginAs(t.url); });
after(() => t.close());

test("10 concurrent bad logins still cap at 5 failures (at least one 429)", async () => {
  const bad = () => fetch(`${t.url}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "wrong" }),
  });
  const results = await Promise.all(Array.from({ length: 10 }, bad));
  const statuses = results.map((r) => r.status);
  assert.ok(statuses.includes(429), `expected at least one 429, got: ${statuses.join(",")}`);
});
