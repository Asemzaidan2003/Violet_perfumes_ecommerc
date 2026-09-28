import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { startTestApp } from "./helpers.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Product from "../backend/models/product.model.js";
import { invalidateCatalog } from "../backend/store/catalog.js";
import { money, sizeLabel } from "../storefront/js/shared/format.js";
import { saveSettings } from "../backend/services/settings.service.js";
import { GOVERNORATES } from "../backend/store/validate.js";
import { priceCart } from "../storefront/js/shared/cart-store.js";

const XSS = "<img src=x onerror=alert(1)>";
const SCRIPT_XSS = "</script><img src=x onerror=alert(1)>";
let t;
const ids = {};

before(async () => {
  t = await startTestApp();
  await Oil.create({ id: "OIL1", oil_name: "Oud", oil_cost: 1, oil_quantity: 100 });
  await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 5 });
  const base = { p_image: ".", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80 };
  await Product.create({ ...base, p_name: "عود الليل", p_category: "Men", families: ["oud"], size_list: [{ size: "30", price: 20 }] });
  await Product.create({ ...base, p_name: "مسك الورد", p_category: "Women", p_offer_percentage: 10,
    p_image: "https://fimgs.net/mdimg/perfume/375x500.1.jpg", size_list: [{ size: "30", price: 30 }] });
  await Product.create({ ...base, p_name: XSS, p_category: "Unisex", size_list: [{ size: "30", price: 10 }] });
  // Collection / product fixtures. No bottle of 50 ml, so that size is out of stock.
  ids.amber = String((await Product.create({ ...base, p_name: "عنبر الشرق", p_category: "Men", families: ["amber", "oud"],
    keywords: "Amber Oriental", description: "دافئ\nوعميق", notes: { top: ["برغموت"], heart: [], base: ["عنبر"] },
    size_list: [{ size: "30", price: 35 }, { size: "50", price: 50 }] }))._id);
  ids.sandal = String((await Product.create({ ...base, p_name: "خشب الصندل", p_category: "Men", families: ["woody"],
    status: "out of stock", size_list: [{ size: "30", price: 15 }] }))._id);
  ids.car = String((await Product.create({ ...base, p_name: "نسمة السيارة", p_category: "Car", size_list: [{ size: "30", price: 5 }] }))._id);
  ids.gone = String((await Product.create({ ...base, p_name: "عطر متوقف", p_category: "Men", status: "discontinued",
    size_list: [{ size: "30", price: 5 }] }))._id);
  ids.script = String((await Product.create({ ...base, p_name: SCRIPT_XSS, p_category: "Unisex",
    description: SCRIPT_XSS, size_list: [{ size: "30", price: 10 }] }))._id);
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
  assert.ok(!body.includes(SCRIPT_XSS), "script-breaking name never appears raw");
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

const page = async (path) => {
  const res = await fetch(`${t.url}${path}`);
  return { status: res.status, body: await res.text() };
};
// Visible product names in grid order. The server renders every card of the aisle and hides the
// filtered-out ones, so client-side filtering can bring them back instantly.
const gridNames = (body) => (body.split("data-grid")[1] || "").split("</ul>")[0].split('<li class="grid-item"').slice(1)
  .filter((li) => !/^[^>]* hidden>/.test(li))
  .map((li) => li.match(/class="card-link" href="\/p\/[^"]+">([^<]*)</)[1]);
const jsonLd = (body) => JSON.parse(body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

test("collection /c/:category lists that category only, with an aisle header", async () => {
  const { status, body } = await page("/c/men");
  assert.equal(status, 200);
  assert.equal(body.match(/<h1[\s>]/g)?.length, 1);
  assert.match(body, /<h1[^>]*>رجالي<\/h1>/);
  assert.deepEqual(gridNames(body).sort(), ["خشب الصندل", "عنبر الشرق", "عود الليل"].sort());
  assert.ok(!body.includes("عطر متوقف"), "discontinued products are hidden");
  assert.match(body, /data-families="amber oud"/, "cards carry data-* for client filtering");
  assert.match(body, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/c\/men">/);
  assert.ok(body.includes("/assets/js/collection.js?v="));
});

test("collection filters and sort come from the query string", async () => {
  assert.deepEqual(gridNames((await page("/c/men?f=oud")).body).sort(), ["عنبر الشرق", "عود الليل"].sort());
  assert.deepEqual(gridNames((await page("/c/men?f=woody,amber")).body).sort(), ["خشب الصندل", "عنبر الشرق"].sort());
  assert.deepEqual(gridNames((await page("/c/men?f=woody&f=amber")).body).sort(), ["خشب الصندل", "عنبر الشرق"].sort(),
    "repeated params (the no-JS form) work too");
  assert.deepEqual(gridNames((await page("/c/men?s=50")).body), ["عنبر الشرق"]);
  assert.deepEqual(gridNames((await page("/c/men?stock=1")).body).sort(), ["عنبر الشرق", "عود الليل"].sort());
  assert.deepEqual(gridNames((await page("/c/men?s=50&stock=1")).body), [], "the selected size itself must be in stock");
  assert.deepEqual(gridNames((await page("/c/men?sort=price_asc")).body), ["خشب الصندل", "عود الليل", "عنبر الشرق"]);
  assert.deepEqual(gridNames((await page("/c/men?sort=price_desc")).body), ["عنبر الشرق", "عود الليل", "خشب الصندل"]);
  const checked = (await page("/c/men?f=oud&sort=price_asc")).body;
  assert.match(checked, /value="oud" checked/, "active filters are pre-checked");
  assert.match(checked, /<option value="price_asc" selected>/);
  const junk = await page("/c/men?f=%3Cx%3E&s=abc&sort=nope&stock=yes");
  assert.equal(junk.status, 200, "unknown filter values are ignored");
  assert.equal(gridNames(junk.body).length, 3);
  assert.ok(!junk.body.includes("<x>"));
});

test("inherited object keys in ?sort= fall back to the default sort", async () => {
  for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    const { status, body } = await page(`/c/men?sort=${key}`);
    assert.equal(status, 200, `sort=${key}`);
    assert.match(body, /<option value="best" selected>/, `sort=${key} uses the default`);
  }
});

test("filters the page doesn't offer are ignored, so server and client agree", async () => {
  // /family/oud offers no "oud" chip (every card has it), and /c/car offers no size chips (one size).
  assert.deepEqual(gridNames((await page("/family/oud?f=oud")).body).sort(), ["عنبر الشرق", "عود الليل"].sort());
  assert.deepEqual(gridNames((await page("/family/oud?f=citrus")).body).sort(), ["عنبر الشرق", "عود الليل"].sort());
  assert.deepEqual(gridNames((await page("/c/car?s=50")).body), ["نسمة السيارة"]);
  assert.deepEqual(gridNames((await page("/c/men?f=citrus")).body).length, 3);
});

test("/search is noindex with a canonical that drops the query", async () => {
  const { body } = await page(`/search?q=${encodeURIComponent("عنبر")}`);
  assert.match(body, /<meta name="robots" content="noindex">/);
  assert.match(body, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/search">/);
  assert.ok(!(await page("/c/men")).body.includes('name="robots"'), "aisles stay indexable");
});

test("empty collections show suggestions, never a blank grid", async () => {
  const { status, body } = await page("/c/men?f=woody&s=50");
  assert.equal(status, 200);
  assert.deepEqual(gridNames(body), []);
  assert.match(body, /<div class="empty" data-empty>/, "empty state is visible");
  assert.match(body.split("data-empty")[1], /href="\/c\/women"/, "with suggestions");
  assert.match((await page("/c/men")).body, /<div class="empty" data-empty hidden>/, "hidden when there are results");
});

test("unknown category and family are 404; family, offers, new, best-sellers render", async () => {
  assert.equal((await page("/c/nope")).status, 404);
  assert.equal((await page("/family/nope")).status, 404);
  const fam = await page("/family/oud");
  assert.equal(fam.status, 200);
  assert.deepEqual(gridNames(fam.body).sort(), ["عنبر الشرق", "عود الليل"].sort());
  assert.deepEqual(gridNames((await page("/offers")).body), ["مسك الورد"]);
  assert.equal((await page("/new")).status, 200);
  assert.equal((await page("/best-sellers")).status, 200);
});

test("/c/home and /c/car link to each other", async () => {
  assert.match((await page("/c/home")).body, /href="\/c\/car"/);
  const car = await page("/c/car");
  assert.match(car.body, /href="\/c\/home"/);
  assert.deepEqual(gridNames(car.body), ["نسمة السيارة"]);
});

test("/search uses the shared Arabic search and escapes the query", async () => {
  const { status, body } = await page(`/search?q=${encodeURIComponent("العَنبر")}`);
  assert.equal(status, 200);
  assert.equal(gridNames(body)[0], "عنبر الشرق");
  const hostile = await page(`/search?q=${encodeURIComponent(XSS)}`);
  assert.equal(hostile.status, 200);
  assert.ok(!hostile.body.includes(XSS));
  assert.equal((await page("/search")).status, 200, "an empty query still renders");
});

test("/p/:id is 404 for a malformed, unknown or discontinued id", async () => {
  assert.equal((await page("/p/not-an-id")).status, 404);
  assert.equal((await page("/p/64b000000000000000000000")).status, 404);
  assert.equal((await page(`/p/${ids.gone}`)).status, 404);
});

test("product page: sizes with stock state, notes, related shelf, no bottom bar", async () => {
  const { status, body } = await page(`/p/${ids.amber}`);
  assert.equal(status, 200);
  assert.equal(body.match(/<h1[\s>]/g)?.length, 1);
  assert.match(body, /<h1[^>]*>عنبر الشرق<\/h1>/);
  assert.match(body, /name="size" value="30"[^>]*checked/, "the in-stock size is preselected");
  assert.match(body, /name="size" value="50"[^>]*data-stock="0"/);
  assert.ok(body.includes("غير متوفر حاليًا"));
  assert.ok(body.includes("نحضّره لك عند الطلب وقد يستغرق وقتًا أطول"));
  assert.ok(body.includes("أعلمني عند التوفر"));
  assert.ok(body.includes('action="/api/store/interest"'));
  assert.ok(body.includes("برغموت"), "notes pyramid");
  assert.match(body, /class="section shelf"/, "related shelf");
  assert.ok(body.split('class="section shelf"')[1].includes("عود الليل"), "related by family");
  assert.ok(!body.includes('class="bottom-bar"'), "product pages have their own action bar");
  assert.ok(body.includes('fetchpriority="high"'), "main image is the LCP");
  assert.ok(!body.includes("wa.me"), "no WhatsApp link without a number");
  assert.match(body, /<input id="i-name"[^>]* autofocus/, "the interest dialog focuses the name field");
  assert.match(body, /<ul class="shelf-track" role="list" tabindex="0" aria-label="[^"]+" data-recent-list>/);
  assert.ok(body.includes("/assets/js/product.js?v="));
});

test("product page: JSON-LD is inert and marks out-of-stock sizes MadeToOrder", async () => {
  const { status, body } = await page(`/p/${ids.script}`);
  assert.equal(status, 200);
  assert.ok(!body.includes(SCRIPT_XSS), "hostile name/description never appear raw");
  const ld = body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.ok(!ld.includes("<") && !ld.includes(">"), "no raw < or > in JSON-LD");
  const data = JSON.parse(ld);
  assert.equal(data["@type"], "Product");
  assert.equal(data.name, SCRIPT_XSS);
  assert.equal(data.offers[0].priceCurrency, "JOD");
  assert.equal(data.offers[0].availability, "https://schema.org/InStock");
  const amber = jsonLd((await page(`/p/${ids.amber}`)).body);
  assert.deepEqual(amber.offers.map((o) => o.availability), ["https://schema.org/InStock", "https://schema.org/MadeToOrder"]);
});

test("product page: Open Graph image and WhatsApp inquiry when a number is set", async () => {
  const rose = await Product.findOne({ p_name: "مسك الورد" });
  assert.match((await page(`/p/${rose._id}`)).body, /<meta property="og:image" content="https:\/\/fimgs\.net\/mdimg\/perfume\/375x500\.1\.jpg">/);
  await saveSettings({ whatsapp: "962791234567" });
  try {
    assert.match((await page(`/p/${ids.amber}`)).body, /href="https:\/\/wa\.me\/962791234567\?text=[^"]+"/);
  } finally {
    await saveSettings({ whatsapp: "" });
  }
});

// --- Task 6: cart, checkout, order confirmation.
test("every page embeds the shop settings as inert JSON and the cart drawer template", async () => {
  await saveSettings({ delivery_fee: 2, free_delivery_over: 30 });
  try {
    const { body } = await page("/");
    const raw = body.match(/<script type="application\/json" id="shop-settings">([\s\S]*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(raw), { delivery_fee: 2, free_delivery_over: 30, whatsapp: "" });
    assert.match(body, /<dialog id="cart-drawer"[^>]*aria-labelledby="cart-title"/);
    assert.match(body, /<template data-cart-line>/);
    assert.ok(body.includes("/assets/js/cart.js?v="));
  } finally {
    await saveSettings({ delivery_fee: 0, free_delivery_over: 0 });
  }
});

test("store.js no longer handles quick-add (cart.js owns [data-add-to-cart])", async () => {
  const src = await (await fetch(`${t.url}/assets/js/store.js`)).text();
  assert.doesNotMatch(src, /quickAdd|data-add-to-cart/);
});

test("/cart renders the layout (the drawer opens on load) and is not indexed", async () => {
  const { status, body } = await page("/cart");
  assert.equal(status, 200);
  assert.equal(body.match(/<h1[\s>]/g)?.length, 1);
  assert.match(body, /<meta name="robots" content="noindex">/);
});

test("/checkout: one-screen form with the governorate list, no bottom bar", async () => {
  const { status, body } = await page("/checkout");
  assert.equal(status, 200);
  assert.match(body, /<meta name="robots" content="noindex">/);
  assert.ok(!body.includes('class="bottom-bar"'));
  const options = [...body.match(/<select id="co-city"[\s\S]*?<\/select>/)[0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(options, ["", ...GOVERNORATES], "a placeholder, then Amman first");
  assert.match(body, /<input id="co-name"[^>]*autocomplete="name"/);
  assert.match(body, /<input id="co-phone"[^>]*type="tel"[^>]*inputmode="tel"[^>]*dir="ltr"[^>]*autocomplete="tel"/);
  assert.match(body, /<select id="co-city"[^>]*autocomplete="address-level1"/);
  assert.match(body, /<textarea id="co-address"[^>]*autocomplete="street-address"/);
  assert.match(body, /name="website"[^>]*tabindex="-1"[^>]*autocomplete="off"/, "honeypot");
  assert.match(body, /name="remember"[^>]*checked/, "remember my details is on by default");
  assert.ok(body.includes("الدفع عند الاستلام"));
  assert.ok(body.includes("/assets/js/checkout.js?v="));
});

test("/order/:ref: unknown or malformed refs are 404", async () => {
  assert.equal((await page("/order/ABCDEFGHJK")).status, 404);
  assert.equal((await page("/order/nope")).status, 404);
});

test("/order/:ref shows the ref, items and totals, never the delivery details", async () => {
  await saveSettings({ whatsapp: "962791234567", delivery_fee: 3, free_delivery_over: 0 });
  try {
    const res = await fetch(`${t.url}/api/store/orders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ product_id: ids.amber, size: "30", quantity: 2 }],
        customer: { name: "سارة المصري", phone: "٠٧٩١٢٣٤٥٦٧", city: "إربد", address: "شارع الجامعة، عمارة 7", notes: "بعد العصر" },
        client_key: crypto.randomUUID(),
      }),
    });
    assert.equal(res.status, 201);
    const { ref } = (await res.json()).data;
    const r = await fetch(`${t.url}/order/${ref}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("cache-control"), /no-store/);
    const body = await r.text();
    assert.match(body, /<meta name="robots" content="noindex">/);
    assert.ok(body.includes(`<bdi dir="ltr">NS-${ref}</bdi>`));
    assert.ok(body.includes("عنبر الشرق"));
    assert.ok(body.includes(money(70)) && body.includes(money(3)) && body.includes(money(73)));
    for (const secret of ["سارة المصري", "0791234567", "٠٧٩١٢٣٤٥٦٧", "شارع الجامعة", "بعد العصر"]) {
      assert.ok(!body.includes(secret), `confirmation leaks ${secret}`);
    }
    const wa = body.match(/href="https:\/\/wa\.me\/962791234567\?text=([^"]+)"/);
    assert.ok(wa, "WhatsApp button when a number is set");
    assert.ok(decodeURIComponent(wa[1]).includes(`NS-${ref}`));
  } finally {
    await saveSettings({ whatsapp: "", delivery_fee: 0, free_delivery_over: 0 });
  }
});

test("priceCart: vanished lines are excluded; free delivery at or above the threshold", () => {
  const catalog = [{ id: "a", sizes: [{ size: "30", final: 10.1 }] }];
  const lines = [{ id: "a", size: "30", qty: 3 }, { id: "a", size: "99", qty: 1 }, { id: "gone", size: "30", qty: 1 }];
  const r = priceCart(lines, catalog, { delivery_fee: 2, free_delivery_over: 30.3 });
  assert.equal(r.subtotal, 30.3);
  assert.equal(r.delivery, 0);
  assert.deepEqual(r.rows.map((x) => x.product && x.total), [30.299999999999997, null, null]);
  assert.equal(priceCart(lines, catalog, { delivery_fee: 2, free_delivery_over: 31 }).total, 32.3);
  assert.equal(priceCart(lines, catalog, { delivery_fee: 2, free_delivery_over: 0 }).delivery, 2, "0 turns free delivery off");
  assert.equal(priceCart([{ id: "a", size: "30", qty: 99 }], catalog).rows[0].qty, 20, "quantities are clamped to 20");
});
