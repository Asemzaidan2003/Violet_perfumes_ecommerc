import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./helpers.js";
import { clientKey, createLimiter } from "../backend/middleware/rateLimit.js";

let t;
before(async () => { t = await startTestApp(); });
after(() => t.close());

test("clientKey groups IPv6 by /64 and keeps IPv4", () => {
  assert.equal(clientKey("203.0.113.5"), "203.0.113.5");
  assert.equal(clientKey("::ffff:203.0.113.5"), "203.0.113.5");
  assert.equal(clientKey("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64");
  assert.equal(clientKey("2001:db8:1:2:bbbb:cccc:dddd:eeee"), "2001:db8:1:2::/64");
  assert.equal(clientKey("2001:db8::1"), "2001:db8:0:0::/64");
});

test("limiter counts synchronously and expires buckets", async () => {
  const l = createLimiter({ windowMs: 50, max: 2 });
  const req = { ip: "1.2.3.4" };
  assert.equal(l.hit(req).ok, true);
  assert.equal(l.hit(req).ok, true);
  assert.equal(l.hit(req).ok, false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(l.hit(req).ok, true, "a new window starts after expiry");
});

test("assets are versioned-immutable and admin redirects", async () => {
  const v = await fetch(`${t.url}/assets/js/shared/vocab.js?v=1`);
  assert.match(v.headers.get("cache-control"), /immutable/);
  const nv = await fetch(`${t.url}/assets/js/shared/vocab.js`);
  assert.equal(nv.headers.get("cache-control"), "no-cache");
  const r = await fetch(`${t.url}/admin`, { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/admin/html/index.html");
});

test("responses are compressed when the client accepts gzip", async () => {
  const res = await fetch(`${t.url}/assets/js/shared/vocab.js`, { headers: { "accept-encoding": "gzip" } });
  assert.equal(res.headers.get("content-encoding"), "gzip");
});

test("self-hosted fonts are served", async () => {
  const res = await fetch(`${t.url}/vendor/fonts/el-messiri/el-messiri-arabic-700-normal.woff2`);
  assert.equal(res.status, 200);
});
