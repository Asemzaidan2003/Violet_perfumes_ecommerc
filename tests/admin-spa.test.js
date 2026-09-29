import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTestApp } from "./helpers.js";

let t;
let dist;

before(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), "admin-dist-"));
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>spa-shell</title>");
  fs.writeFileSync(path.join(dist, "assets", "app-abc123.js"), "console.log(1)");
  t = await startTestApp({ adminDist: dist });
});
after(async () => {
  await t.close();
  fs.rmSync(dist, { recursive: true, force: true });
});

test("/admin and client routes return the SPA shell, never cached", async () => {
  for (const p of ["/admin", "/admin/", "/admin/pos", "/admin/login"]) {
    const res = await fetch(`${t.url}${p}`);
    assert.equal(res.status, 200, p);
    assert.match(await res.text(), /spa-shell/, p);
    assert.match(res.headers.get("cache-control"), /no-cache/, p);
  }
});

test("hashed assets are served and cached immutably", async () => {
  const res = await fetch(`${t.url}/admin/assets/app-abc123.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control"), /immutable/);
});

test("a missing file with an extension is a 404, not the shell", async () => {
  const res = await fetch(`${t.url}/admin/assets/nope.js`);
  assert.equal(res.status, 404);
});

test("legacy admin pages still load beside the SPA", async () => {
  const res = await fetch(`${t.url}/admin/html/login.html`);
  assert.equal(res.status, 200);
});

test("the shell carries the app's security headers", async () => {
  const res = await fetch(`${t.url}/admin/pos`);
  assert.ok(res.headers.get("content-security-policy"));
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});
