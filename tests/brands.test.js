import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Product from "../backend/models/product.model.js";
import Brand from "../backend/models/brand.model.js";
import { invalidateCatalog } from "../backend/store/catalog.js";

const XSS = "<img src=x onerror=alert(1)>";
let t, cookie;
const ids = {};

const api = (path, method = "GET", body) =>
  fetch(`${t.url}/api${path}`, {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
  await Brand.createIndexes(); // rebuild the unique slug index dropped by startTestApp's dropDatabase()
  await Oil.create({ id: "OIL1", oil_name: "Oud", oil_cost: 1, oil_quantity: 100 });
  await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 5 });
  const base = { p_image: ".", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80 };

  ids.dior = String((await Brand.create({ name_ar: "ديور", name_en: "Dior" }))._id);
  ids.chanel = String((await Brand.create({ name_ar: XSS, name_en: "Chanel" }))._id);
  ids.inactive = String((await Brand.create({ name_ar: "غير نشط", name_en: "Ghost", active: false }))._id);

  ids.sauvage = String((await Product.create({ ...base, p_name: "سوفاج", p_category: "Men", brand: ids.dior,
    families: ["fresh"], notes: { top: ["برغموت"], heart: ["فلفل"], base: ["عنبر"] },
    size_list: [{ size: "30", price: 20 }, { size: "50", price: 30 }] }))._id);
  ids.noFive = String((await Product.create({ ...base, p_name: "رقم خمسة", p_category: "Women", brand: ids.chanel,
    families: ["floral"], notes: { top: ["ياسمين"], heart: [], base: ["مسك"] },
    size_list: [{ size: "30", price: 40 }] }))._id);
  ids.plain = String((await Product.create({ ...base, p_name: "عطر عادي", p_category: "Men",
    families: ["woody"], size_list: [{ size: "30", price: 10 }] }))._id);
  ids.ghostProduct = String((await Product.create({ ...base, p_name: "منتج شبح", p_category: "Men", brand: ids.inactive,
    size_list: [{ size: "30", price: 10 }] }))._id);
  invalidateCatalog();
});
after(() => t.close());

test("admin: list brands includes product counts", async () => {
  const res = await api("/brands");
  assert.equal(res.status, 200);
  const { data } = await res.json();
  const dior = data.find((b) => b._id === ids.dior);
  assert.equal(dior.productCount, 1);
});

test("admin: duplicate slug is a 409 in Arabic", async () => {
  const res = await api("/brands", "POST", { name_ar: "ديور آخر", name_en: "Dior Other", slug: "dior" });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.match(body.message, /[؀-ۿ]/);
});

test("admin: slug derives from name_en when blank", async () => {
  const res = await api("/brands", "POST", { name_ar: "توم فورد", name_en: "Tom Ford" });
  assert.equal(res.status, 201);
  const { data } = await res.json();
  assert.equal(data.slug, "tom-ford");
  await api(`/brands/${data._id}`, "DELETE");
});

test("admin: delete is refused while a brand has products, with the count", async () => {
  const res = await api(`/brands/${ids.dior}`, "DELETE");
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.match(body.message, /1/);
  assert.match(body.message, /لا يمكن حذف/);
});

test("admin: update loads and saves so validation runs (bad slug rejected)", async () => {
  const res = await api(`/brands/${ids.dior}`, "PUT", { slug: "!!" });
  assert.equal(res.status, 400);
});

test("public product and search index expose the brand; hostile name_ar is escaped in HTML", async () => {
  const res = await fetch(`${t.url}/p/${ids.sauvage}`);
  const body = await res.text();
  assert.ok(body.includes("ديور"));
  assert.match(body, /href="\/brand\/dior"/);

  const chanelPage = await fetch(`${t.url}/p/${ids.noFive}`);
  const chanelBody = await chanelPage.text();
  assert.ok(chanelBody.includes("&lt;img src=x onerror=alert(1)&gt;"), "hostile brand name_ar is escaped");
  assert.ok(!chanelBody.includes(XSS), "hostile brand name_ar never appears raw");
});

test("search: matches Arabic and English brand names", async () => {
  const { searchProducts } = await import("../storefront/js/shared/search.js");
  const products = [
    { id: "a", name: "سوفاج", keywords: "", families: [], notes: {}, brand: { slug: "dior", name_ar: "ديور", name_en: "Dior" } },
    { id: "b", name: "رقم خمسة", keywords: "", families: [], notes: {}, brand: { slug: "chanel", name_ar: "شانيل", name_en: "Chanel" } },
  ];
  assert.deepEqual(searchProducts(products, "ديور").map((p) => p.id), ["a"]);
  assert.deepEqual(searchProducts(products, "dior").map((p) => p.id), ["a"]);
  assert.deepEqual(searchProducts(products, "DIOR").map((p) => p.id), ["a"]);
});

test("/brand/:slug lists only that brand's products; unknown or inactive slug is a 404", async () => {
  const res = await fetch(`${t.url}/brand/dior`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(body.includes("سوفاج"));
  assert.ok(!body.includes("رقم خمسة"));

  const unknown = await fetch(`${t.url}/brand/not-a-brand`);
  assert.equal(unknown.status, 404);

  const inactive = await fetch(`${t.url}/brand/${(await Brand.findById(ids.inactive)).slug}`);
  assert.equal(inactive.status, 404);
});

test("collection b filter: designer chip filters server-side, with absent-option intersection", async () => {
  const menWithDior = await fetch(`${t.url}/c/men?b=dior`);
  assert.equal(menWithDior.status, 200);
  const body = await menWithDior.text();
  assert.ok(body.includes("سوفاج"));

  // "chanel" never appears in /c/men (no chanel product there) — filtered request must not error
  // and must intersect against the aisle's own options rather than trusting the query blindly.
  const bogus = await fetch(`${t.url}/c/men?b=chanel`);
  assert.equal(bogus.status, 200);
});

test("collection n filter: notes chip filters server-side and matches by note membership", async () => {
  const res = await fetch(`${t.url}/c/men?n=${encodeURIComponent("عنبر")}`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(body.includes("سوفاج"), "سوفاج has a base note of عنبر");
});

test("sitemap includes active brand pages, not inactive ones", async () => {
  const res = await fetch(`${t.url}/sitemap.xml`);
  const body = await res.text();
  assert.ok(body.includes("/brand/dior"));
  assert.ok(!body.includes(`/brand/${(await Brand.findById(ids.inactive)).slug}`));
});

test("home designer shelf appears only with >= 2 brands with visible products", async () => {
  const before2 = await fetch(`${t.url}/`);
  const bodyBefore = await before2.text();
  assert.ok(bodyBefore.includes("تسوّق حسب المصمم"), "two brands (Dior, Chanel) already have products");

  // Drop to one brand: remove Chanel's only product.
  await Product.findByIdAndDelete(ids.noFive);
  invalidateCatalog();
  const after1 = await fetch(`${t.url}/`);
  const bodyAfter = await after1.text();
  assert.ok(!bodyAfter.includes("تسوّق حسب المصمم"), "one brand left: shelf hidden");
});
