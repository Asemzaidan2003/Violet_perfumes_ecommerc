// Storefront rendering of promotion placements (Task 4). Split from store-pages.test.js (500-line rule).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./helpers.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Product from "../backend/models/product.model.js";
import Placement from "../backend/models/placement.model.js";
import { invalidateCatalog } from "../backend/store/catalog.js";
import { invalidatePlacements } from "../backend/services/placements.service.js";

let t;
const ids = {};
before(async () => {
  t = await startTestApp();
  await Oil.create({ id: "OIL1", oil_name: "Oud", oil_cost: 1, oil_quantity: 100 });
  await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 5 });
  const base = { p_image: ".", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80 };
  ids.amber = String((await Product.create({ ...base, p_name: "عنبر الشرق", p_category: "Men", families: ["amber"], size_list: [{ size: "30", price: 35 }] }))._id);
  await Product.create({ ...base, p_name: "خشب الصندل", p_category: "Men", size_list: [{ size: "30", price: 15 }] });
  await Product.create({ ...base, p_name: "عود الليل", p_category: "Men", size_list: [{ size: "30", price: 20 }] });
  await Product.create({ ...base, p_name: "مسك الورد", p_category: "Women", size_list: [{ size: "30", price: 30 }] });
  invalidateCatalog();
});
after(() => t.close());

const page = async (path) => {
  const res = await fetch(`${t.url}${path}`);
  return { status: res.status, body: await res.text() };
};
const gridNames = (body) => (body.split("data-grid")[1] || "").split("</ul>")[0].split('<li class="grid-item"').slice(1)
  .filter((li) => !/^[^>]* hidden>/.test(li))
  .map((li) => li.match(/class="card-link" href="\/p\/[^"]+">([^<]*)</)[1]);

// --- Promotion placements (Task 4). Each test seeds its own rows and removes them afterwards.
const IMG = "/img/aaaaaaaaaaaaaaaaaaaaaaaa.webp";
async function withPlacements(docs, fn) {
  await Placement.create(docs);
  invalidatePlacements();
  try { await fn(); } finally {
    await Placement.deleteMany({});
    invalidatePlacements();
  }
}

test("an announcement renders escaped above the header on every page, with a dismiss button", async () => {
  const XSS_T = "<script>alert(1)</script>";
  await withPlacements([{ slot: "announcement", title: XSS_T }], async () => {
    for (const path of ["/", `/p/${ids.amber}`]) {
      const { body } = await page(path);
      assert.ok(!body.includes(XSS_T), `raw script on ${path}`);
      assert.ok(body.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), `escaped title on ${path}`);
      assert.match(body, /<div class="announce[^"]*" role="region" aria-label="إعلانات"/);
      assert.ok(body.indexOf('class="announce') < body.indexOf('class="site-header"'), "bar sits above the header");
      assert.match(body, /aria-label="إغلاق الإعلان"/);
      assert.ok(body.includes("/assets/css/promo.css?v=") && body.includes("/assets/js/promo.js?v="));
    }
  });
});

test("pages without live placements load no promo assets and keep the plain hero", async () => {
  invalidatePlacements();
  const { body } = await page("/");
  assert.ok(!body.includes("promo.css") && !body.includes("promo.js"));
  assert.ok(!body.includes("data-hero-slider") && !body.includes("hero-slide"));
});

test("a hero slide shows real text after the brand slide; the brand h1 stays the only h1", async () => {
  await withPlacements([
    { slot: "hero", title: "مجموعة الشتاء", subtitle: "دفء العود", image: IMG, link: "/c/men", cta: "تسوّق الآن" },
    ...[2, 3, 4].map((n) => ({ slot: "hero", title: `موسم ${n}`, image: IMG, sort: n })),
  ], async () => {
    const { body } = await page("/");
    assert.equal(body.match(/<h1[\s>]/g)?.length, 1);
    assert.ok(body.indexOf('id="hero-title"') < body.indexOf("مجموعة الشتاء"), "brand slide first");
    assert.match(body, /<article class="hero-slide[^"]*"[^>]*>[\s\S]*?<h2[^>]*>مجموعة الشتاء<\/h2>/);
    assert.match(body, /<img[^>]*alt="مجموعة الشتاء"[^>]*loading="lazy"/);
    assert.match(body, /<a class="btn[^"]*" href="\/c\/men">تسوّق الآن<\/a>/);
    assert.equal(body.match(/<article class="hero-slide/g).length, 3, "at most 3 admin slides");
    assert.ok(!body.includes("موسم 4"));
    assert.match(body, /aria-label="الشريحة 1"[^>]*aria-current="true"/);
  });
});

test("a collection banner targeted to men shows on /c/men only", async () => {
  await withPlacements([{ slot: "collection_banner", title: "عطور الرجال", image: IMG, target: { category: "men" } }], async () => {
    assert.ok((await page("/c/men")).body.includes("عطور الرجال"));
    assert.ok(!(await page("/c/women")).body.includes("عطور الرجال"));
  });
});

test("grid tiles sit after collection items 4 and 12, and never break the product grid", async () => {
  const base = { p_image: ".", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80, p_category: "Men" };
  const extra = await Product.insertMany(Array.from({ length: 10 }, (_, i) => ({ ...base, p_name: `رجالي ${i}`, size_list: [{ size: "30", price: 10 + i }] })));
  invalidateCatalog();
  try {
    await withPlacements([1, 2, 3, 4, 5].map((n) => ({ slot: "grid_tile", title: `بطاقة ${n}`, image: IMG, sort: n })), async () => {
      const { body } = await page("/c/men");
      const grid = body.split("data-grid")[1].split("</ul>")[0];
      const order = [...grid.matchAll(/<li class="(grid-item|grid-promo)"/g)].map((m) => m[1]);
      assert.equal(order.length >= 15, true);
      assert.equal(order[4], "grid-promo", "a tile after item 4");
      assert.equal(order[13], "grid-promo", "a tile after item 12");
      assert.equal(order.filter((x) => x === "grid-item").length, 13);
      assert.ok(grid.indexOf("بطاقة 1") < grid.indexOf("بطاقة 2"), "tiles cycle in order");
      assert.match(grid, /<li class="grid-promo" data-promo/);
      assert.equal(gridNames(body).length, 13, "product parsing unaffected");
    });
  } finally {
    await Product.deleteMany({ _id: { $in: extra.map((p) => p._id) } });
    invalidateCatalog();
  }
});

test("a product promo sits under the price; a cart upsell sits in the drawer", async () => {
  await withPlacements([
    { slot: "product_promo", title: "شحن مجاني هذا الأسبوع" },
    { slot: "cart_upsell", title: "أضف مسك الورد", link: "/c/women", cta: "اكتشف" },
  ], async () => {
    const { body } = await page(`/p/${ids.amber}`);
    assert.ok(body.indexOf("شحن مجاني هذا الأسبوع") > body.indexOf('class="pdp-price"'));
    assert.match(body, /class="promo-strip/);
    const drawer = body.split('<dialog id="cart-drawer"')[1].split("</dialog>")[0];
    assert.ok(drawer.includes("أضف مسك الورد"), "upsell inside the drawer");
    assert.ok((await page("/")).body.split('<dialog id="cart-drawer"')[1].includes("أضف مسك الورد"));
  });
});

test("an expired or inactive placement appears nowhere", async () => {
  const past = new Date(Date.now() - 60_000);
  await withPlacements([
    { slot: "announcement", title: "انتهى العرض", starts_at: new Date(Date.now() - 120_000), ends_at: past },
    { slot: "hero", title: "انتهى العرض", image: IMG, ends_at: past },
    { slot: "product_promo", title: "انتهى العرض", ends_at: past },
    { slot: "announcement", title: "انتهى العرض", active: false },
  ], async () => {
    for (const path of ["/", "/c/men", `/p/${ids.amber}`]) assert.ok(!(await page(path)).body.includes("انتهى العرض"), path);
  });
});

test("external https links open with rel=noopener; internal links have no target", async () => {
  await withPlacements([
    { slot: "announcement", title: "تابعنا", link: "https://example.com/x" },
    { slot: "announcement", title: "داخلي", link: "/offers", sort: 1 },
  ], async () => {
    const { body } = await page("/");
    assert.match(body, /<a[^>]*href="https:\/\/example\.com\/x" target="_blank" rel="noopener"/);
    assert.match(body, /<a[^>]*href="\/offers">داخلي/);
  });
});
