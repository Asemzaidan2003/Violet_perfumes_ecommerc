import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Alcohol from "../backend/models/alcohol.model.js";
import Product from "../backend/models/product.model.js";
import Order from "../backend/models/order.model.js";

let t, cookie, ids;

before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);

  await Alcohol.create({ name: "Ethanol", type: "perfumer", quantity: 1000, cost: 0.02 });
  await Oil.create({ id: "OIL_OK", oil_name: "Oud", oil_cost: 1, oil_quantity: 100 });
  await Oil.create({ id: "OIL_SHORT", oil_name: "Musk", oil_cost: 1, oil_quantity: 1 });
  const bottle30 = await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 5 });
  // Deliberately no bottle for capacity 50.

  const inStock = await Product.create({
    p_name: "In Stock Oud", p_image: ".", p_category: "Men", oil_id: "OIL_OK",
    size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
  });
  const oilShort = await Product.create({
    p_name: "Oil Short Musk", p_image: ".", p_category: "Men", oil_id: "OIL_SHORT",
    size_list: [{ size: "30", price: 10 }], oil_percentage: 50, alcohol_percentage: 80,
  });
  const noBottle = await Product.create({
    p_name: "No Bottle Scent", p_image: ".", p_category: "Women", oil_id: "OIL_OK",
    size_list: [{ size: "50", price: 10 }], oil_percentage: 10, alcohol_percentage: 80,
  });
  const manualOut = await Product.create({
    p_name: "Manual Out", p_image: ".", p_category: "Women", oil_id: "OIL_OK",
    size_list: [{ size: "30", price: 10 }], oil_percentage: 10, alcohol_percentage: 80,
    status: "out of stock",
  });
  await Product.create({
    p_name: "Discontinued Scent", p_image: ".", p_category: "Women", oil_id: "OIL_OK",
    size_list: [{ size: "30", price: 10 }], oil_percentage: 10, alcohol_percentage: 80,
    status: "discontinued",
  });
  const offer = await Product.create({
    p_name: "Offer Scent", p_image: ".", p_category: "Unisex", oil_id: "OIL_OK",
    size_list: [{ size: "30", price: 100 }], oil_percentage: 5, alcohol_percentage: 80,
    p_offer_percentage: 10,
  });
  const xss = await Product.create({
    p_name: "<img src=x onerror=alert(1)>", p_image: ".", p_category: "Unisex", oil_id: "OIL_OK",
    size_list: [{ size: "30", price: 10 }], oil_percentage: 10, alcohol_percentage: 80,
  });

  // Two completed orders in the last 90 days -> best-seller ranks.
  await Order.create({
    products: [{
      product_id: inStock._id, p_name: inStock.p_name, product_size: "30", quantity: 5,
      selling_price: 20, total_revenue: 100,
    }],
    status: "completed", source: "pos", payment_method: "Cash",
    total_items: 5, total_revenue: 100, total_cost: 0, total_profit: 100, final_total: 100,
    stock_deducted: true,
  });
  await Order.create({
    products: [{
      product_id: offer._id, p_name: offer.p_name, product_size: "30", quantity: 2,
      selling_price: 90, total_revenue: 180,
    }],
    status: "completed", source: "pos", payment_method: "Cash",
    total_items: 2, total_revenue: 180, total_cost: 0, total_profit: 180, final_total: 180,
    stock_deducted: true,
  });

  ids = {
    inStock: String(inStock._id), oilShort: String(oilShort._id), noBottle: String(noBottle._id),
    manualOut: String(manualOut._id), offer: String(offer._id), xss: String(xss._id),
    bottle30: String(bottle30._id),
  };
});

after(() => t.close());

const FORBIDDEN_KEYS = ["oil_id", "oil_percentage", "alcohol_percentage", "cost", "quantity"];

function assertNoSecretKeys(value) {
  if (Array.isArray(value)) { value.forEach(assertNoSecretKeys); return; }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      assert.ok(!FORBIDDEN_KEYS.includes(key), `unexpected secret key "${key}" in catalog response`);
      assertNoSecretKeys(value[key]);
    }
  }
}

test("GET /api/store/catalog needs no cookie and applies availability/pricing/ranking rules", async () => {
  const res = await fetch(`${t.url}/api/store/catalog`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") || "", /max-age=30/);
  const body = await res.json();
  assert.equal(body.success, true);
  const items = body.data;
  assertNoSecretKeys(items);

  const byId = new Map(items.map((p) => [p.id, p]));
  assert.equal(byId.has(ids.inStock), true);
  assert.equal(byId.get(ids.inStock).sizes[0].in_stock, true);

  assert.equal(byId.get(ids.oilShort).sizes[0].in_stock, false);
  assert.equal(byId.get(ids.noBottle).sizes[0].in_stock, false);
  assert.equal(byId.get(ids.manualOut).sizes[0].in_stock, false);

  // Discontinued products never appear.
  assert.ok(![...byId.values()].some((p) => p.name === "Discontinued Scent"));

  // 10% offer -> final = 0.9 x list.
  const offerItem = byId.get(ids.offer);
  assert.equal(offerItem.sizes[0].list, 100);
  assert.equal(offerItem.sizes[0].final, 90);

  // A product named with an HTML/JS payload round-trips as plain JSON text.
  const xssItem = byId.get(ids.xss);
  assert.equal(xssItem.name, "<img src=x onerror=alert(1)>");

  // Best-seller ranking: inStock sold 5, offer sold 2 -> rank 1 then rank 2, before any unranked item.
  assert.equal(byId.get(ids.inStock).rank, 1);
  assert.equal(offerItem.rank, 2);
  const rankIndex = items.findIndex((p) => p.id === ids.inStock);
  const offerIndex = items.findIndex((p) => p.id === ids.offer);
  assert.ok(rankIndex < offerIndex);
  const unrankedIndex = items.findIndex((p) => p.id === ids.oilShort);
  assert.ok(offerIndex < unrankedIndex);
  assert.equal(byId.get(ids.oilShort).rank, null);
});

test("POS order still charges the offer price via effectivePrice", async () => {
  const res = await fetch(`${t.url}/api/orders`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      products: [{ product_id: ids.offer, size: "30", quantity: 1, bottle_id: ids.bottle30 }],
      payment_method: "Cash",
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.data.products[0].selling_price, 90);
});

test("PUT /api/settings rejects a bad whatsapp number with an Arabic message", async () => {
  const res = await fetch(`${t.url}/api/settings`, {
    method: "PUT",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ whatsapp: "abc" }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.match(body.message, /[؀-ۿ]/);
});

test("PUT /api/settings then GET round-trips valid values", async () => {
  const put = await fetch(`${t.url}/api/settings`, {
    method: "PUT",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      whatsapp: "962791234567", instagram: "https://instagram.com/nsamat",
      delivery_fee: 2, free_delivery_over: 50,
    }),
  });
  assert.equal(put.status, 200);
  const putBody = await put.json();
  assert.equal(putBody.data.whatsapp, "962791234567");
  assert.equal(putBody.data.delivery_fee, 2);

  const get = await fetch(`${t.url}/api/settings`, { headers: { cookie } });
  assert.equal(get.status, 200);
  const getBody = await get.json();
  // Stage D added home/contact/social/footer/texts/delivery/seo — checked in their own tests;
  // this test only round-trips the fields it itself wrote, plus their untouched defaults.
  assert.deepEqual(
    {
      store_name: getBody.data.store_name, tagline: getBody.data.tagline,
      logo_light: getBody.data.logo_light, logo_dark: getBody.data.logo_dark,
      favicon: getBody.data.favicon, share_image: getBody.data.share_image,
      whatsapp: getBody.data.whatsapp, instagram: getBody.data.instagram,
      delivery_fee: getBody.data.delivery_fee, free_delivery_over: getBody.data.free_delivery_over,
      theme: getBody.data.theme,
    },
    {
      store_name: "نسمات", tagline: "بوتيك العطور في الأردن",
      logo_light: "", logo_dark: "", favicon: "", share_image: "",
      whatsapp: "962791234567", instagram: "https://instagram.com/nsamat",
      delivery_fee: 2, free_delivery_over: 50,
      theme: { bg: "#0E0C0A", surface: "#17130F", text: "#F4EDE3", accent: "#D4AF37", overrides: {} },
    }
  );
  assert.equal(getBody.data.social.instagram, "https://instagram.com/nsamat", "legacy instagram folded into social.instagram");
  assert.equal(getBody.data.delivery.governorates.length, 12);
});
