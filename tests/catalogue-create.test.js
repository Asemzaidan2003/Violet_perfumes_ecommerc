import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import Product from "../backend/models/product.model.js";
import Brand from "../backend/models/brand.model.js";
import Oil from "../backend/models/oil.model.js";

let t, cookie;
before(async () => { t = await startTestApp(); cookie = await loginAs(t.url); await Product.init(); await Oil.init(); });
after(() => t.close());

const api = (path, method = "GET", body, headers = { cookie }) => fetch(`${t.url}/api${path}`, {
  method, headers: { ...headers, "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const base = (extra = {}) => ({
  p_name: `P ${Math.random()}`, p_image: ".", p_category: "Men", oil_id: "OIL1",
  size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80, ...extra,
});
const REQ_AR = "يرجى تعبئة جميع الحقول المطلوبة";
const SIZE_AR = "صيغة الأحجام غير صحيحة — لكل حجم مقاس وسعر";
const OIL_AR = "يرجى تعبئة رقم الزيت واسمه وتكلفته وكميته";
const oilBody = (extra = {}) => ({ id: `O${Math.random()}`, oil_name: "عود", oil_cost: 5, oil_quantity: 10, ...extra });

test("product create persists brand and offer_ends_at", async () => {
  const brand = await Brand.create({ name_ar: "ديور", name_en: `Dior ${Date.now()}` });
  try {
    const res = await api("/products", "POST", base({ brand: String(brand._id), offer_ends_at: "2030-01-01T00:00:00.000Z" }));
    assert.equal(res.status, 201);
    const id = (await res.json()).data._id;
    const got = (await (await api(`/products/${id}`)).json()).data;
    assert.equal(String(got.brand), String(brand._id));
    assert.equal(new Date(got.offer_ends_at).toISOString(), "2030-01-01T00:00:00.000Z");
  } finally { await Brand.deleteOne({ _id: brand._id }); }
});

test("product create accepts zero percentages and zero size price", async () => {
  const res = await api("/products", "POST", base({ oil_percentage: 0, alcohol_percentage: 100, size_list: [{ size: "30ml", price: 0 }] }));
  assert.equal(res.status, 201);
  const p = await Product.findById((await res.json()).data._id).lean();
  assert.equal(p.oil_percentage, 0);
  assert.equal(p.alcohol_percentage, 100);
  assert.equal(p.size_list[0].size, "30");
  assert.equal(p.size_list[0].price, 0);
});

test("product create still rejects bad input with Arabic messages", async () => {
  const { p_name, ...noName } = base();
  for (const body of [noName, base({ oil_percentage: null }), base({ alcohol_percentage: "" }), base({ oil_percentage: "abc" })]) {
    const res = await api("/products", "POST", body);
    assert.equal(res.status, 400);
    const j = await res.json();
    assert.equal(j.success, false);
    assert.equal(j.message, REQ_AR);
  }
  for (const size_list of [[{}], [{ size: "30" }], [{ size: "30", price: null }], [{ size: "30", price: "x" }], "nope", {}]) {
    const res = await api("/products", "POST", base({ size_list }));
    assert.equal(res.status, 400, JSON.stringify(size_list));
    const j = await res.json();
    assert.equal(j.success, false);
    assert.equal(j.message, SIZE_AR);
  }
  const neg = await api("/products", "POST", base({ size_list: [{ size: "30", price: -1 }] }));
  assert.equal(neg.status, 400);
  assert.equal((await neg.json()).success, false);
});

test("oil create persists status and accepts zero cost and quantity", async () => {
  const body = oilBody({ status: "out of stock", oil_cost: 0, oil_quantity: 0 });
  const res = await api("/oils", "POST", body);
  assert.equal(res.status, 200);
  const o = await Oil.findOne({ id: body.id }).lean();
  assert.equal(o.status, "out of stock");
  assert.equal(o.oil_cost, 0);
  assert.equal(o.oil_quantity, 0);
});

test("oil create rejects blank id, duplicate id, invalid status", async () => {
  for (const bad of [oilBody({ id: "  " }), oilBody({ oil_name: "" }), oilBody({ oil_cost: null }), oilBody({ oil_quantity: "" })]) {
    const res = await api("/oils", "POST", bad);
    assert.equal(res.status, 400);
    const j = await res.json();
    assert.equal(j.success, false);
    assert.equal(j.message, OIL_AR);
  }
  const body = oilBody();
  assert.equal((await api("/oils", "POST", body)).status, 200);
  const dup = await api("/oils", "POST", body);
  assert.equal(dup.status, 409);
  assert.equal((await dup.json()).message, "Duplicate value");
  assert.equal((await api("/oils", "POST", oilBody({ status: "bogus" }))).status, 400);
});

test("unauthenticated create is 401", async () => {
  assert.equal((await api("/products", "POST", base(), {})).status, 401);
  assert.equal((await api("/oils", "POST", oilBody(), {})).status, 401);
});
