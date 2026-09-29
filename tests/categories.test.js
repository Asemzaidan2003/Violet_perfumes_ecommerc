import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { startTestApp, loginAs } from "./helpers.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Product from "../backend/models/product.model.js";
import Category from "../backend/models/category.model.js";
import { seedDefaultCategories, invalidateCategories, getCategories } from "../backend/services/categories.service.js";
import { invalidateCatalog } from "../backend/store/catalog.js";

const XSS = "<img src=x onerror=alert(1)>";
let t, cookie;

const api = (path, method = "GET", body) =>
  fetch(`${t.url}/api${path}`, {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
  await Category.createIndexes(); // rebuild the unique key/slug indexes dropped by startTestApp's dropDatabase()
  await Oil.create({ id: "OIL1", oil_name: "Oud", oil_cost: 1, oil_quantity: 100 });
  await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 5 });
});
after(() => t.close());

beforeEach(async () => {
  await Category.deleteMany({});
  await Product.deleteMany({});
  invalidateCategories();
  invalidateCatalog();
});

const base = { p_image: ".", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80 };

test("seedDefaultCategories is idempotent and matches vocab.js's 5 defaults", async () => {
  await seedDefaultCategories();
  const rows = await Category.find({}).sort({ sort: 1 });
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.key), ["Men", "Women", "Unisex", "Home", "Car"]);
  await seedDefaultCategories(); // second call: no duplicates
  assert.equal(await Category.countDocuments({}), 5);
});

test("getCategories falls back to vocab.js defaults when the collection is empty", async () => {
  invalidateCategories();
  const cats = await getCategories();
  assert.equal(cats.length, 5);
  assert.equal(cats[0].key, "Men");
});

test("admin: create, duplicate slug/key, key immutability, delete guard", async () => {
  const res = await api("/categories", "POST", { key: "Oud", slug: "oud-perfumes", name_ar: "عطور العود" });
  assert.equal(res.status, 201);
  const { data: created } = await res.json();
  assert.equal(created.key, "Oud");

  const dup = await api("/categories", "POST", { key: "Oud2", slug: "oud-perfumes", name_ar: "قسم آخر" });
  assert.equal(dup.status, 409);

  const dupKey = await api("/categories", "POST", { key: "Oud", slug: "other-slug", name_ar: "قسم آخر" });
  assert.equal(dupKey.status, 409);

  const changeKey = await api(`/categories/${created._id}`, "PUT", { key: "Changed" });
  assert.equal(changeKey.status, 400);
  const changeBody = await changeKey.json();
  assert.match(changeBody.message, /لا يمكن تغيير المفتاح/);

  await Product.create({ ...base, p_name: "عود الليل", p_category: "Oud", size_list: [{ size: "30", price: 20 }] });
  const blocked = await api(`/categories/${created._id}`, "DELETE");
  assert.equal(blocked.status, 409);
  const blockedBody = await blocked.json();
  assert.match(blockedBody.message, /لا يمكن حذف قسم مرتبط بمنتجات \(1\)/);

  await Product.deleteMany({ p_category: "Oud" });
  const ok = await api(`/categories/${created._id}`, "DELETE");
  assert.equal(ok.status, 200);
});

test("product validation: a new category key works; an unknown key is 400 in Arabic", async () => {
  const created = await Category.create({ key: "Kids", slug: "kids", name_ar: "أطفال", sort: 0 });
  invalidateCategories();
  const ok = await Product.create({ ...base, p_name: "عطر الأطفال", p_category: "Kids", size_list: [{ size: "30", price: 5 }] });
  assert.equal(ok.p_category, "Kids");

  await assert.rejects(
    Product.create({ ...base, p_name: "عطر مجهول", p_category: "Ghost", size_list: [{ size: "30", price: 5 }] }),
    (err) => {
      assert.match(err.errors.p_category.message, /فئة غير صالحة/);
      return true;
    }
  );
  await Category.findByIdAndDelete(created._id);
});

test("storefront: a new category appears in the nav and at /c/<slug> with its products", async () => {
  await Category.create({ key: "Oud", slug: "oud-perfumes", name_ar: "عطور العود", sort: 0 });
  invalidateCategories();
  await Product.create({ ...base, p_name: "دهن العود", p_category: "Oud", size_list: [{ size: "30", price: 20 }] });
  invalidateCatalog();

  const home = await (await fetch(`${t.url}/`)).text();
  assert.match(home, /href="\/c\/oud-perfumes"/);
  assert.ok(home.includes("عطور العود"));

  const aisle = await fetch(`${t.url}/c/oud-perfumes`);
  assert.equal(aisle.status, 200);
  const aisleBody = await aisle.text();
  assert.ok(aisleBody.includes("دهن العود"));
});

test("storefront: a hidden category is gone from the nav, its /c/ is 404, product page still works", async () => {
  await Category.create({ key: "Oud", slug: "oud-perfumes", name_ar: "عطور العود", sort: 0, visible: false });
  invalidateCategories();
  const p = await Product.create({ ...base, p_name: "دهن العود", p_category: "Oud", size_list: [{ size: "30", price: 20 }] });
  invalidateCatalog();

  const home = await (await fetch(`${t.url}/`)).text();
  assert.ok(!home.includes("عطور العود"));

  const aisle = await fetch(`${t.url}/c/oud-perfumes`);
  assert.equal(aisle.status, 404);

  const product = await fetch(`${t.url}/p/${p._id}`);
  assert.equal(product.status, 200);
  assert.ok((await product.text()).includes("دهن العود"));
});

test("a renamed name_ar shows up everywhere; a hostile name_ar is escaped", async () => {
  const c = await Category.create({ key: "Oud", slug: "oud-perfumes", name_ar: XSS, sort: 0 });
  invalidateCategories();
  const home = await (await fetch(`${t.url}/`)).text();
  assert.ok(home.includes("&lt;img src=x onerror=alert(1)&gt;"), "hostile name_ar is escaped");
  assert.ok(!home.includes(XSS), "hostile name_ar never appears raw");

  await api(`/categories/${c._id}`, "PUT", { name_ar: "اسم جديد" });
  invalidateCategories();
  const renamed = await (await fetch(`${t.url}/`)).text();
  assert.ok(renamed.includes("اسم جديد"));
});

test("sitemap lists visible categories, not hidden ones", async () => {
  await Category.create({ key: "Oud", slug: "oud-perfumes", name_ar: "عطور العود", sort: 0 });
  await Category.create({ key: "Ghost", slug: "ghost-cat", name_ar: "قسم مخفي", sort: 1, visible: false });
  invalidateCategories();
  const body = await (await fetch(`${t.url}/sitemap.xml`)).text();
  assert.ok(body.includes("/c/oud-perfumes"));
  assert.ok(!body.includes("/c/ghost-cat"));
});
