import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import Product from "../backend/models/product.model.js";
import Customer from "../backend/models/customer.model.js";
import { normalizePhone, isJordanMobile } from "../storefront/js/shared/phone.js";

let t, cookie;
before(async () => { t = await startTestApp(); cookie = await loginAs(t.url); await Product.init(); });
after(() => t.close());

const api = (path, method = "GET", body) => fetch(`${t.url}/api${path}`, {
  method, headers: { cookie, "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const base = (extra = {}) => ({
  p_name: `P ${Math.random()}`, p_image: ".", p_category: "Men", oil_id: "OIL1",
  size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80, ...extra,
});

test("normalizePhone handles Arabic digits and country codes", () => {
  for (const input of ["٠٧٩١٢٣٤٥٦٧", "+962 79 123 4567", "962791234567", "791234567", "00962791234567", "079-123-4567"]) {
    assert.equal(normalizePhone(input), "0791234567", input);
  }
  assert.equal(isJordanMobile("0791234567"), true);
  assert.equal(isJordanMobile("0761234567"), false);
  assert.equal(isJordanMobile(normalizePhone("12345")), false);
});

test("POST /api/products persists the new catalogue fields", async () => {
  const res = await api("/products", "POST", base({
    description: "عطر خشبي دافئ", families: ["oud", "amber"],
    notes: { top: ["برغموت"], heart: ["ورد"], base: ["عود", "عنبر"] },
    images: ["/img/64b7f0000000000000000001.webp"], keywords: "sauvage elixir",
  }));
  assert.equal(res.status, 201);
  const p = await Product.findById((await res.json()).data._id).lean();
  assert.deepEqual(p.families, ["oud", "amber"]);
  assert.deepEqual(p.notes.base, ["عود", "عنبر"]);
  assert.equal(p.description, "عطر خشبي دافئ");
  assert.deepEqual(p.images, ["/img/64b7f0000000000000000001.webp"]);
  assert.equal(p.keywords, "sauvage elixir");
});

test("invalid catalogue values are rejected with 400", async () => {
  for (const bad of [
    base({ p_category: "test" }),
    base({ families: ["not-a-family"] }),
    base({ notes: { top: ["x".repeat(41)] } }),
    base({ size_list: [{ size: "abc", price: 10 }] }),
    base({ images: ["javascript:alert(1)"] }),
    base({ images: ['https://x.com/a"onerror=alert(1)'] }),
  ]) {
    assert.equal((await api("/products", "POST", bad)).status, 400, JSON.stringify(bad));
  }
});

test("invalid category yields an Arabic error message", async () => {
  const res = await api("/products", "POST", base({ p_category: "test" }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.message, /فئة غير صالحة/);
});

test("PUT with a blank p_category is rejected with the Arabic required message", async () => {
  const created = await (await api("/products", "POST", base())).json();
  const res = await api(`/products/${created.data._id}`, "PUT", { p_category: "" });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.message, /الفئة مطلوبة/);
});

test("PUT /api/products/:id normalizes size_list on update", async () => {
  const created = await (await api("/products", "POST", base())).json();
  const res = await api(`/products/${created.data._id}`, "PUT", { size_list: [{ size: "30ml", price: 10 }] });
  assert.equal(res.status, 200);
  const p = await Product.findById(created.data._id).lean();
  assert.equal(p.size_list[0].size, "30");
});

test("size '30ml' is stored as '30'", async () => {
  const res = await api("/products", "POST", base({ size_list: [{ size: "30ml", price: 10 }, { size: " 50 مل ", price: 15 }] }));
  const p = await Product.findById((await res.json()).data._id).lean();
  assert.deepEqual(p.size_list.map((s) => s.size), ["30", "50"]);
});

test("partial update (bulk tagging) changes only the sent fields", async () => {
  const created = await (await api("/products", "POST", base())).json();
  const res = await api(`/products/${created.data._id}`, "PUT", { p_category: "Women", families: ["floral"] });
  assert.equal(res.status, 200);
  const p = await Product.findById(created.data._id).lean();
  assert.equal(p.p_category, "Women");
  assert.deepEqual(p.families, ["floral"]);
  assert.equal(p.size_list[0].price, 20);
});

test("customer phone lookup normalises the input", async () => {
  await Customer.create({ name: "Sara", phone: "0791234567" });
  const res = await api(`/customers/phone/${encodeURIComponent("+962 79 123 4567")}`);
  assert.equal((await res.json()).customer.name, "Sara");
});

test("/assets serves the shared modules", async () => {
  const res = await fetch(`${t.url}/assets/js/shared/vocab.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /javascript/);
});
