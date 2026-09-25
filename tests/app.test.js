import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./helpers.js";

let t;
before(async () => { t = await startTestApp(); });
after(() => t.close());

test("health reports db connected", async () => {
  const res = await fetch(`${t.url}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, db: true });
});

test("unknown api route is JSON 404", async () => {
  const res = await fetch(`${t.url}/api/nope`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).success, false);
});

test("malformed JSON is 400 without internals", async () => {
  const res = await fetch(`${t.url}/api/health`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad",
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { success: false, message: "Invalid JSON" });
});

test("admin UI served at /admin with security headers", async () => {
  const res = await fetch(`${t.url}/admin/html/index.html`);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("content-security-policy"));
  assert.equal(res.headers.get("x-powered-by"), null);
});
