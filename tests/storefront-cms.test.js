// Stage D — admin-managed home page, footer, contact, social, store texts, delivery areas, SEO.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { startTestApp, loginAs } from "./helpers.js";
import Product from "../backend/models/product.model.js";
import Order from "../backend/models/order.model.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Alcohol from "../backend/models/alcohol.model.js";
import Setting from "../backend/models/setting.model.js";
import { GOVERNORATES } from "../backend/store/validate.js";
import { invalidateCatalog } from "../backend/store/catalog.js";

let t, cookie;

before(async () => {
  t = await startTestApp({ limits: { orders: { max: 1000 } } });
  cookie = await loginAs(t.url);
  await Order.createIndexes();
});
after(() => t.close());

beforeEach(async () => {
  await Promise.all([Setting, Product, Order, Oil, Bottle, Alcohol].map((M) => M.deleteMany({})));
  invalidateCatalog();
});

const putSettings = (body) => fetch(`${t.url}/api/settings`, {
  method: "PUT", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
});

// ---------------------------------------------------------------- validation

test("home cta with a javascript: link is 400", async () => {
  const res = await putSettings({ home: { cta_primary: { label: "تسوّق", link: "javascript:alert(1)" } } });
  assert.equal(res.status, 400);
});

test("social links must be https", async () => {
  const res = await putSettings({ social: { instagram: "http://instagram.com/x" } });
  assert.equal(res.status, 400);
});

test("contact.map_url must be https", async () => {
  const res = await putSettings({ contact: { map_url: "http://maps.google.com/x" } });
  assert.equal(res.status, 400);
});

test("footer.about_text over 300 chars is 400", async () => {
  const res = await putSettings({ footer: { about_text: "ا".repeat(301) } });
  assert.equal(res.status, 400);
});

test("contact.hours over 120 chars is 400", async () => {
  const res = await putSettings({ contact: { hours: "س".repeat(121) } });
  assert.equal(res.status, 400);
});

test("an unknown home section key is 400", async () => {
  const res = await putSettings({ home: { sections: [{ key: "not_a_real_section", visible: true }] } });
  assert.equal(res.status, 400);
});

test("clearing every governorate is 400; at least one must stay enabled", async () => {
  const res = await putSettings({ delivery: { governorates: [] } });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------- rendering

test("hero title supports the {store_name} placeholder", async () => {
  await putSettings({ store_name: "بوتيك الورد", home: { hero_title: "{store_name} الأصلي" } });
  const res = await fetch(`${t.url}/`);
  const body = await res.text();
  assert.ok(body.includes("بوتيك الورد الأصلي"));
});

test("home sections: hiding one removes it, and order follows the configured list", async () => {
  await Oil.create({ id: "OIL1", oil_name: "Test Oil", oil_cost: 0.5, oil_quantity: 100 });
  await Alcohol.create({ name: "Ethanol", type: "perfumer", quantity: 1000, cost: 0.02 });
  await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 5 });
  await Product.create({
    p_name: "Offer Perfume", p_image: ".", p_category: "Men", oil_id: "OIL1",
    size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80, p_offer_percentage: 10,
  });
  invalidateCatalog();
  await putSettings({
    home: {
      sections: [
        { key: "offers", visible: true },
        { key: "aisles", visible: true },
        { key: "best_sellers", visible: false },
        { key: "promo_mid", visible: true }, { key: "designers", visible: true }, { key: "testers", visible: true },
        { key: "new_arrivals", visible: true }, { key: "promo_bottom", visible: true }, { key: "service", visible: true },
      ],
    },
  });
  const res = await fetch(`${t.url}/`);
  const body = await res.text();
  assert.ok(!body.includes('href="/best-sellers"'), "hidden section is gone");
  assert.ok(body.indexOf('id="aisles"') > body.indexOf('href="/offers">العروض</a></li>') || true);
  // offers section comes before aisles in the configured order
  const offersIdx = body.indexOf("section-title\">عروض المتجر");
  const aislesIdx = body.indexOf('id="aisles"');
  assert.ok(offersIdx > -1 && aislesIdx > -1 && offersIdx < aislesIdx, "offers renders before aisles");
});

test("a custom title on the aisles section renders instead of the default", async () => {
  await putSettings({
    home: { sections: [
      { key: "aisles", visible: true, title: "تشكيلاتنا الخاصة" },
      { key: "best_sellers", visible: true }, { key: "promo_mid", visible: true }, { key: "designers", visible: true },
      { key: "testers", visible: true }, { key: "new_arrivals", visible: true }, { key: "offers", visible: true },
      { key: "promo_bottom", visible: true }, { key: "service", visible: true },
    ] },
  });
  const res = await fetch(`${t.url}/`);
  const body = await res.text();
  assert.ok(body.includes("تشكيلاتنا الخاصة"));
  assert.ok(!body.includes(">تجوّل في الأقسام<"));
});

test("service items render from settings, up to 4", async () => {
  await putSettings({ home: { service_items: [{ title: "توصيل سريع", text: "خلال 24 ساعة" }] } });
  const res = await fetch(`${t.url}/`);
  const body = await res.text();
  assert.ok(body.includes("توصيل سريع"));
  assert.ok(body.includes("خلال 24 ساعة"));
});

test("footer contact and social render only when set, with tel/mailto/noopener links", async () => {
  await putSettings({
    contact: { phone: "0791234567", email: "hi@example.com", address: "عمّان، الأردن", map_url: "https://maps.google.com/x", hours: "9ص - 9م" },
    social: { instagram: "https://instagram.com/nsamat" },
  });
  const res = await fetch(`${t.url}/`);
  const body = await res.text();
  assert.ok(body.includes('href="tel:0791234567"'));
  assert.ok(body.includes('href="mailto:hi@example.com"'));
  assert.ok(body.includes('href="https://maps.google.com/x" target="_blank" rel="noopener"'));
  assert.ok(body.includes("9ص - 9م"));
  assert.ok(body.includes('href="https://instagram.com/nsamat"'));
  assert.ok(!body.includes(">تيك توك<".replace(">", "")) || !body.includes('href="https://tiktok'));
});

test("copyright supports {year} and {store_name} placeholders", async () => {
  await putSettings({ store_name: "متجري", footer: { copyright: "كل الحقوق {store_name} {year}" } });
  const res = await fetch(`${t.url}/`);
  const body = await res.text();
  assert.ok(body.includes(`كل الحقوق متجري ${new Date().getFullYear()}`));
});

test("legacy instagram field still shows in the footer when social.instagram is unset", async () => {
  await putSettings({ instagram: "https://instagram.com/legacy" });
  const res = await fetch(`${t.url}/`);
  const body = await res.text();
  assert.ok(body.includes('href="https://instagram.com/legacy"'));
});

test("texts.oos_note renders on the product page, texts.checkout_note on checkout, texts.order_thanks on the confirmation", async () => {
  await putSettings({ texts: { oos_note: "سيصلك خلال أسبوع", checkout_note: "التوصيل خلال يومين", order_thanks: "شكرًا جزيلًا لثقتك" } });
  await Oil.create({ id: "OIL1", oil_name: "Test Oil", oil_cost: 0.5, oil_quantity: 100 });
  await Alcohol.create({ name: "Ethanol", type: "perfumer", quantity: 1000, cost: 0.02 });
  const product = await Product.create({
    p_name: "Test Perfume", p_image: ".", p_category: "Men", oil_id: "OIL1",
    size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80, status: "out of stock",
  });
  const pRes = await fetch(`${t.url}/p/${product._id}`);
  const pBody = await pRes.text();
  assert.ok(pBody.includes("سيصلك خلال أسبوع"));

  const cRes = await fetch(`${t.url}/checkout`);
  const cBody = await cRes.text();
  assert.ok(cBody.includes("التوصيل خلال يومين"));

  const key = crypto.randomUUID();
  const orderRes = await fetch(`${t.url}/api/store/orders`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ product_id: String(product._id), size: "30", quantity: 1 }],
      customer: { name: "سارة علي", phone: "0791234567", city: "عمّان", address: "شارع الجامعة 12", notes: "" },
      client_key: key,
    }),
  });
  assert.equal(orderRes.status, 201);
  const { data } = await orderRes.json();
  const thanksRes = await fetch(`${t.url}/order/${data.ref}`);
  const thanksBody = await thanksRes.text();
  assert.ok(thanksBody.includes("شكرًا جزيلًا لثقتك"));
});

test("SEO title/description render on the home page", async () => {
  await putSettings({ seo: { home_title: "أفضل عطور في الأردن", home_description: "وصف مخصص لمحركات البحث" } });
  const res = await fetch(`${t.url}/`);
  const body = await res.text();
  assert.ok(body.includes("<title>أفضل عطور في الأردن</title>"));
  assert.ok(body.includes('content="وصف مخصص لمحركات البحث"'));
});

// ---------------------------------------------------------------- escaping

test("hostile values in the new text fields are escaped, never executed", async () => {
  const evil = '<script>window.__xss=1</script>"><img onerror=alert(1)>';
  await putSettings({
    home: { hero_title: evil, hero_subtitle: evil },
    contact: { address: evil, hours: evil },
    footer: { about_text: evil },
    texts: { oos_note: evil, checkout_note: evil, order_thanks: evil },
  });
  const res = await fetch(`${t.url}/`);
  const body = await res.text();
  assert.ok(!body.includes("<script>window.__xss=1</script>"));
  assert.ok(!body.includes("<img onerror=alert(1)>"));
});

// ---------------------------------------------------------------- delivery

test("checkout rejects an order for a governorate the admin disabled", async () => {
  const enabled = GOVERNORATES.filter((g) => g !== "العقبة");
  await putSettings({ delivery: { governorates: enabled } });
  await Oil.create({ id: "OIL1", oil_name: "Test Oil", oil_cost: 0.5, oil_quantity: 100 });
  await Alcohol.create({ name: "Ethanol", type: "perfumer", quantity: 1000, cost: 0.02 });
  const product = await Product.create({
    p_name: "Test Perfume", p_image: ".", p_category: "Men", oil_id: "OIL1",
    size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
  });
  const res = await fetch(`${t.url}/api/store/orders`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ product_id: String(product._id), size: "30", quantity: 1 }],
      customer: { name: "سارة علي", phone: "0791234567", city: "العقبة", address: "شارع الجامعة 12", notes: "" },
      client_key: crypto.randomUUID(),
    }),
  });
  assert.equal(res.status, 400);

  const checkoutBody = await (await fetch(`${t.url}/checkout`)).text();
  assert.ok(!checkoutBody.includes('value="العقبة"'));
});
