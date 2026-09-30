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

const go = (p) => fetch(`${t.url}${p}`, { redirect: "manual" });
const dest = async (p) => { const r = await go(p); assert.equal(r.status, 302, p); return r.headers.get("location"); };

test("legacy /admin/html pages redirect to the matching SPA route", async () => {
  const cases = {
    "/admin/html/index.html": "/admin/", "/admin/html/login.html": "/admin/login", "/admin/html/dashboard.html": "/admin/dashboard",
    "/admin/html/orders.html": "/admin/orders", "/admin/html/interests.html": "/admin/interests", "/admin/html/reports.html": "/admin/reports",
    "/admin/html/all_products.html": "/admin/products", "/admin/html/add_product.html": "/admin/products/new",
    "/admin/html/all_oils.html": "/admin/oils", "/admin/html/add_oil.html": "/admin/oils/new",
    "/admin/html/all_bottles.html": "/admin/bottles", "/admin/html/add_bottle.html": "/admin/bottles/new",
    "/admin/html/brands.html": "/admin/brands", "/admin/html/categories.html": "/admin/categories", "/admin/html/catalog.html": "/admin/catalog",
    "/admin/html/pages.html": "/admin/pages", "/admin/html/promotions.html": "/admin/promotions", "/admin/html/settings.html": "/admin/settings",
    "/admin/html/storefront.html": "/admin/storefront",
  };
  for (const [from, to] of Object.entries(cases)) assert.equal(await dest(from), to, from);
});

test("legacy pages that took ?id= redirect to the edit/detail route, and fall back to the list without one", async () => {
  assert.equal(await dest("/admin/html/edit_product.html?id=64b0c0ffee0000000000abcd"), "/admin/products/64b0c0ffee0000000000abcd/edit");
  assert.equal(await dest("/admin/html/order-details.html?id=abc123"), "/admin/orders/abc123");
  assert.equal(await dest("/admin/html/update_oil.html?id=OIL%2F1"), "/admin/oils/OIL%2F1/edit");
  assert.equal(await dest("/admin/html/update_bottle.html?id=b1"), "/admin/bottles/b1/edit");
  assert.equal(await dest("/admin/html/edit_product.html"), "/admin/products");
  assert.equal(await dest("/admin/html/update_oil.html?id="), "/admin/oils");
  assert.equal(await dest("/admin/html/orders.html?filter=unconfirmed"), "/admin/orders?filter=unconfirmed");
});

test("an id in a legacy URL cannot smuggle a path or a scheme into the redirect", async () => {
  assert.equal(await dest("/admin/html/edit_product.html?id=..%2F..%2Fapi%2Fx"), "/admin/products/..%2F..%2Fapi%2Fx/edit");
  assert.equal(await dest("/admin/html/edit_product.html?id[]=a"), "/admin/products");
});

test("unknown legacy pages and old asset folders are 404, not the shell", async () => {
  for (const p of ["/admin/html/nope.html", "/admin/js/navbar.js", "/admin/css/admin.css"]) assert.equal((await go(p)).status, 404, p);
});

test("the shell carries the app's security headers", async () => {
  const res = await fetch(`${t.url}/admin/pos`);
  assert.ok(res.headers.get("content-security-policy"));
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});
