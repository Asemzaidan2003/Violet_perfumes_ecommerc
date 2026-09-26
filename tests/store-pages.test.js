import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { startTestApp } from "./helpers.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Product from "../backend/models/product.model.js";
import { invalidateCatalog } from "../backend/store/catalog.js";
import { money, sizeLabel } from "../storefront/js/shared/format.js";

const XSS = "<img src=x onerror=alert(1)>";
let t;

before(async () => {
  t = await startTestApp();
  await Oil.create({ id: "OIL1", oil_name: "Oud", oil_cost: 1, oil_quantity: 100 });
  await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 5 });
  const base = { p_image: ".", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80 };
  await Product.create({ ...base, p_name: "عود الليل", p_category: "Men", families: ["oud"], size_list: [{ size: "30", price: 20 }] });
  await Product.create({ ...base, p_name: "مسك الورد", p_category: "Women", p_offer_percentage: 10,
    p_image: "https://fimgs.net/mdimg/perfume/375x500.1.jpg", size_list: [{ size: "30", price: 30 }] });
  await Product.create({ ...base, p_name: XSS, p_category: "Unisex", size_list: [{ size: "30", price: 10 }] });
});
after(() => t.close());

test("format: money and sizeLabel", () => {
  assert.equal(money(20), "20.00 د.أ");
  assert.equal(money(7.5), "7.50 د.أ");
  assert.equal(sizeLabel("30"), "30 مل");
});

test("GET / renders the boutique home in Arabic RTL with real products", async () => {
  const res = await fetch(`${t.url}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const body = await res.text();
  assert.match(body, /<html lang="ar" dir="rtl">/);
  assert.equal(body.match(/<h1[\s>]/g)?.length, 1, "exactly one <h1>");
  assert.ok(body.includes("عود الليل"));
  assert.ok(body.includes("مسك الورد"));
  assert.ok(!body.includes("oil_percentage"));
  assert.ok(!body.includes("OIL1"));
  assert.ok(body.includes("&lt;img src=x onerror=alert(1)&gt;"), "hostile name is escaped");
  assert.ok(!body.includes(XSS), "hostile name never appears raw");
  assert.ok(body.includes("20.00 د.أ"));
  assert.ok(body.includes('href="/family/oud"'), "tester bar lists families that have products");
  assert.ok(!body.includes('href="/family/musk"'), "families without products are hidden");
});

test("storefront CSP forbids inline handlers", async () => {
  const csp = (await fetch(`${t.url}/`)).headers.get("content-security-policy");
  assert.match(csp, /script-src-attr 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/);
});

test("unknown storefront path is a styled 404 page", async () => {
  const res = await fetch(`${t.url}/nope`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const body = await res.text();
  assert.match(body, /dir="rtl"/);
  assert.match(body, /href="\/c\/men"/);
  assert.ok(!body.includes('name="description"'), "no empty description meta");
});

test("the 404 page does no database work", async () => {
  const queries = [];
  mongoose.set("debug", (collection, method) => queries.push(`${collection}.${method}`));
  try {
    assert.equal((await fetch(`${t.url}/nope-${Date.now()}`)).status, 404);
  } finally {
    mongoose.set("debug", false);
  }
  assert.deepEqual(queries, []);
});

test("a missing /assets file is never cached immutable", async () => {
  const res = await fetch(`${t.url}/assets/js/nope.js?v=1`);
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.headers.get("cache-control") || "", /immutable|max-age/);
  const hit = await fetch(`${t.url}/assets/js/store.js?v=1`);
  assert.equal(hit.status, 200);
  assert.match(hit.headers.get("cache-control"), /immutable/);
});

test("store.js is an entry file with no exports; shared modules are imported from ./shared", async () => {
  const src = await (await fetch(`${t.url}/assets/js/store.js`)).text();
  assert.doesNotMatch(src, /^\s*export\s/m);
  assert.match(src, /from "\.\/shared\/cart-store\.js"/);
});

test("unknown API paths stay JSON", async () => {
  const res = await fetch(`${t.url}/api/store/nope`);
  assert.ok(res.status >= 400);
  assert.match(res.headers.get("content-type"), /json/);
});

test("a failing page renders the styled 500 page, never JSON", async () => {
  // A product without size_list makes the catalogue build throw.
  const { insertedId } = await Product.collection.insertOne({ p_name: "broken", status: "available", p_image: "." });
  invalidateCatalog();
  const orig = console.error;
  console.error = () => {};
  try {
    const res = await fetch(`${t.url}/`);
    assert.equal(res.status, 500);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(await res.text(), /dir="rtl"/);
  } finally {
    console.error = orig;
    await Product.collection.deleteOne({ _id: insertedId });
    invalidateCatalog();
  }
});
